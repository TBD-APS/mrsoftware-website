import { HttpError, isEmail, readJson, recordId } from './validation.mjs';

const maxRecipients = 25;
const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (value, status = 200) => Response.json(value, { status, headers: noStore });
const abort = (status, message) => { throw new HttpError(status, message); };
const unavailable = () => abort(503, 'Newsletter sending is not connected. Drafts, previews and exports still work.');
const senderAddress = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const now = clock => clock().toISOString();
const parsed = row => row ? JSON.parse(row.document) : abort(404, 'Newsletter not found.');
const publicSubscriber = row => ({ id: row.id, email: row.email, consentAt: row.consent_at, consentReference: row.consent_reference, recordedAt: row.recorded_at, unsubscribedAt: row.unsubscribed_at });

function fields(input, expected) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== expected.length || !expected.every(key => Object.hasOwn(input, key))) abort(400, 'The request contains invalid fields.');
  return input;
}
function text(value, name, max, multiline = false) {
  const invalid = multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
  if (typeof value !== 'string' || !value.trim() || value.length > max || invalid.test(value)) abort(400, name + ' must contain no more than ' + max + ' characters.');
  return value.trim();
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) abort(400, 'A valid revision is required.');
  return value;
}
function settings(env) {
  const from = env.NEWSLETTER_FROM_EMAIL;
  const key = env.NEWSLETTER_RESEND_API_KEY;
  const host = env.DEMO_HOST;
  return env.NEWSLETTER_SEND_ENABLED === 'true' && typeof from === 'string' && from.length <= 254 && senderAddress(from)
    && typeof key === 'string' && /^re_[A-Za-z0-9_-]{5,200}$/.test(key) && typeof host === 'string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host)
    ? { from, key, host } : null;
}
export async function sendViaResend(messages, { key, id }, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.resend.com/emails/batch', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8500),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'Idempotency-Key': 'mrsoftware-newsletter/' + id },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw Error('Newsletter provider did not confirm acceptance.');
  const result = await response.json();
  if (!Array.isArray(result.data) || result.data.length !== messages.length || result.data.some(row => typeof row?.id !== 'string' || !/^[a-z0-9-]{6,80}$/i.test(row.id))) throw Error('Newsletter provider receipt is incomplete.');
  return result.data.map(item => item.id);
}
function messageFor(item, subscriber, config) {
  const link = 'https://' + config.host + '/newsletter/unsubscribe/' + subscriber.token;
  const footer = item.language === 'da' ? 'Afmeld MR Softwares nyhedsbrev: ' : 'Unsubscribe from MR Software newsletters: ';
  return { from: 'MR Software <' + config.from + '>', to: [subscriber.email], subject: item.subject,
    text: item.body + '\n\nMR Software\n' + footer + link,
    headers: { 'List-Unsubscribe': '<' + link + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}
async function audience(db) {
  const { results } = await db.prepare('SELECT id, email, token FROM newsletter_subscribers WHERE unsubscribed_at IS NULL ORDER BY id LIMIT ?').bind(maxRecipients + 1).all();
  if (!results.length || results.length > maxRecipients) abort(409, 'A send requires between 1 and ' + maxRecipients + ' active subscribers.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(results.map(item => item.id).join(',')));
  return { rows: results, hash: Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('') };
}
const getCampaign = async (db, id) => parsed(await db.prepare('SELECT document FROM newsletter_campaigns WHERE id = ?').bind(id).first());
async function updateCampaign(db, item, previous) {
  const row = await db.prepare('UPDATE newsletter_campaigns SET revision = ?, status = ?, updated_at = ?, document = ? WHERE id = ? AND revision = ? AND status = ? RETURNING document')
    .bind(item.revision, item.status, item.updatedAt, JSON.stringify(item), item.id, previous.revision, previous.status).first();
  if (!row) abort(409, 'This newsletter changed. Reload it before continuing.');
  return parsed(row);
}
function advance(item, clock, patch) { return { ...item, ...patch, revision: item.revision + 1, updatedAt: now(clock) }; }
const validToken = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function unsubscribe(db, request, token, clock) {
  const type = request.headers.get('Content-Type')?.split(';')[0]?.toLowerCase();
  const page = html => new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Unsubscribe | MR Software</title><main><h1>MR Software newsletter</h1>' + html + '</main></html>', {
    headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" },
  });
  if (request.method === 'GET') return page('<form method="post"><button name="List-Unsubscribe" value="One-Click" type="submit">Unsubscribe / Afmeld</button></form>');
  if (request.method !== 'POST') abort(405, 'This request method is not supported.');
  if (type !== 'application/x-www-form-urlencoded' && type !== 'multipart/form-data') abort(400, 'Invalid unsubscribe request.');
  // Only a single bounded form field. No state change on GET (link scanners).
  if (!request.body) abort(400, 'Invalid unsubscribe request.');
  let form;
  const chunks = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.length;
    if (size > 2048) abort(413, 'The unsubscribe request is too large.');
    chunks.push(chunk);
  }
  try { form = await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData(); }
  catch { abort(400, 'Invalid unsubscribe request.'); }
  if (form.get('List-Unsubscribe') !== 'One-Click' || [...form].length !== 1) abort(400, 'Invalid unsubscribe request.');
  await db.prepare('UPDATE newsletter_subscribers SET unsubscribed_at = ? WHERE token = ? AND unsubscribed_at IS NULL').bind(now(clock), token).run();
  return page('<p>Your unsubscribe request has been processed. Din afmelding er registreret.</p>');
}

export async function handleNewsletter({ request, path, env, actor, onDemoHost, requireWrite, clock, send = sendViaResend }) {
  const publicMatch = /^\/newsletter\/unsubscribe\/([^/]+)$/.exec(path);
  const privateMatch = /^\/api\/backoffice\/newsletter(?:\/(campaigns|subscribers)(?:\/([^/]+)(?:\/(approve|send|export|unsubscribe))?)?)?$/.exec(path);
  if (!privateMatch && !publicMatch) return null;
  if (publicMatch && (!onDemoHost || !validToken.test(publicMatch[1]))) abort(404, 'Page not found.');
  if (privateMatch && !actor) abort(404, 'Page not found.');
  const db = env.DB;
  if (!db || typeof db.prepare !== 'function') abort(503, 'Newsletter storage is unavailable.');
  if (publicMatch) return unsubscribe(db, request, publicMatch[1], clock);
  const [, kind, rawId, action] = privateMatch;
  const id = rawId ? recordId(rawId) : null;
  const method = request.method;
  const config = settings(env);

  if (!kind && method === 'GET') {
    const results = await db.batch([
      db.prepare('SELECT document FROM newsletter_campaigns ORDER BY updated_at DESC, id DESC LIMIT 100'),
      db.prepare('SELECT id, email, consent_at, consent_reference, recorded_at, unsubscribed_at FROM newsletter_subscribers ORDER BY recorded_at DESC, id DESC LIMIT 100'),
      db.prepare('SELECT count(*) AS number FROM newsletter_subscribers WHERE unsubscribed_at IS NULL'),
    ]);
    return json({ campaigns: results[0].results.map(parsed), subscribers: results[1].results.map(publicSubscriber), activeSubscribers: results[2].results[0].number, maxRecipients, sendingEnabled: Boolean(config) });
  }
  if (kind === 'campaigns' && id && action === 'export' && method === 'GET') {
    const item = await getCampaign(db, id);
    return new Response('Subject: ' + item.subject + '\nLanguage: ' + item.language + '\n\n' + item.body + '\n', { headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="mrsoftware-newsletter.txt"' } });
  }
  if (!['POST', 'PUT'].includes(method)) abort(405, 'This request method is not supported.');
  requireWrite();
  const raw = await readJson(request);
  if (kind === 'subscribers' && !id && !action && method === 'POST') {
    const input = fields(raw, ['email', 'consentAt', 'consentReference', 'confirmed']);
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!isEmail(email) || !senderAddress(email)) abort(400, 'Enter a valid email address.');
    const consentAt = input.consentAt;
    const day = typeof consentAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(consentAt) ? Date.parse(consentAt + 'T00:00:00Z') : NaN;
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== consentAt || consentAt > now(clock).slice(0, 10) || input.confirmed !== true) abort(400, 'Record documented permission and a valid consent date.');
    const reference = text(input.consentReference, 'Consent reference', 240);
    const item = await db.prepare('INSERT INTO newsletter_subscribers (id, email, token, consent_at, consent_reference, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING *')
      .bind(crypto.randomUUID(), email, crypto.randomUUID(), consentAt, reference, now(clock), actor.sub).first();
    if (!item) abort(409, 'This subscriber already exists or has opted out. Do not re-add a suppressed address.');
    return json({ subscriber: publicSubscriber(item) }, 201);
  }
  if (kind === 'subscribers' && id && action === 'unsubscribe' && method === 'POST') {
    fields(raw, []);
    const row = await db.prepare('UPDATE newsletter_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE id = ? RETURNING *').bind(now(clock), id).first();
    if (!row) abort(404, 'Subscriber not found.');
    return json({ subscriber: publicSubscriber(row) });
  }
  if (kind !== 'campaigns') abort(404, 'Page not found.');
  if (!action && ((!id && method === 'POST') || (id && method === 'PUT'))) {
    const input = fields(raw, ['subject', 'body', 'language', ...(id ? ['revision'] : [])]);
    const subject = text(input.subject, 'Subject', 140);
    const body = text(input.body, 'Message', 9000, true);
    const language = input.language;
    if (!['da', 'en'].includes(language)) abort(400, 'Select Danish or English.');
    const stamp = now(clock);
    if (!id) {
      const item = { id: crypto.randomUUID(), revision: 1, status: 'draft', subject, body, language, createdAt: stamp, updatedAt: stamp, updatedBy: actor.email };
      await db.prepare('INSERT INTO newsletter_campaigns (id, revision, status, updated_at, document) VALUES (?, ?, ?, ?, ?)').bind(item.id, 1, item.status, stamp, JSON.stringify(item)).run();
      return json({ item }, 201);
    }
    const current = await getCampaign(db, id);
    if (current.revision !== revision(input.revision) || !['draft', 'approved'].includes(current.status)) abort(409, 'This newsletter changed or can no longer be edited.');
    const updated = advance(current, clock, { subject, body, language, status: 'draft', approval: null, updatedBy: actor.email });
    return json({ item: await updateCampaign(db, updated, current) });
  }
  if (!id || method !== 'POST' || !['approve', 'send'].includes(action)) abort(405, 'This request method is not supported.');
  const input = fields(raw, ['revision', ...(action === 'send' ? ['confirm'] : [])]);
  const current = await getCampaign(db, id);
  if (current.revision !== revision(input.revision)) abort(409, 'This newsletter changed. Reload it before continuing.');
  if (action === 'approve') {
    if (current.status !== 'draft') abort(409, 'Only drafts can be approved.');
    // Approval is useful even before delivery is configured. The audience, if
    // any, is pinned and must remain unchanged when delivery is requested.
    let pinned = null;
    try { pinned = await audience(db); } catch (error) { if (!(error instanceof HttpError && error.status === 409)) throw error; }
    const item = advance(current, clock, { status: 'approved', approval: { at: now(clock), by: actor.email, audienceHash: pinned?.hash ?? null, count: pinned?.rows.length ?? 0 } });
    return json({ item: await updateCampaign(db, item, current) });
  }
  if (!config) unavailable();
  if (input.confirm !== true || current.status !== 'approved') abort(409, 'Approve the draft and confirm delivery before sending.');
  const pinned = await audience(db);
  if (current.approval.audienceHash !== pinned.hash) abort(409, 'The active subscriber list has changed. Save and approve the newsletter again.');
  const claim = await updateCampaign(db, advance(current, clock, { status: 'dispatching', delivery: { requestedAt: now(clock), by: actor.email } }), current);
  try {
    // Do not silently update the set bound to the approved version. A new read
    // immediately before sending gives suppression precedence where practical.
    const live = await audience(db);
    if (live.hash !== pinned.hash) throw Error('Audience changed after confirmation.');
    const providerIds = await send(live.rows.map(row => messageFor(claim, row, config)), { key: config.key, id: claim.id });
    const item = await updateCampaign(db, advance(claim, clock, { status: 'accepted', delivery: { ...claim.delivery, acceptedAt: now(clock), count: providerIds.length, providerIds } }), claim);
    return json({ item });
  } catch {
    // Unknown transport outcomes must not replay automatically, even if a
    // browser times out. A maintainer may reconcile via the provider.
    const item = await updateCampaign(db, advance(claim, clock, { status: 'uncertain', delivery: { ...claim.delivery, checkedAt: now(clock) } }), claim);
    return json({ item });
  }
}
