import { HttpError, readJson, recordId } from './validation.mjs';

const invalid = message => { throw new HttpError(400, message); };
const missing = () => { throw new HttpError(404, 'This YouTube draft was not found.'); };
const changed = () => { throw new HttpError(409, 'This draft has changed. Reload the saved version before saving again.'); };
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const allowedProducts = new Set(['MR Software', 'Workslip', 'Tradey', 'Shippy', 'Saassy']);
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid('The request has invalid fields.');
  return value;
}

function boundedText(value, label, maximum, { required = false, singleLine = false } = {}) {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) || controlCharacters.test(value) || (singleLine && /[\r\n]/.test(value))) {
    invalid(`${label} must have ${required ? '1–' : 'no more than '}${maximum} characters.`);
  }
  return value.trim();
}

function validateDraft(value, editing) {
  const input = fields(value, editing ? ['title', 'description', 'tags', 'product', 'revision'] : ['title', 'description', 'tags', 'product']);
  if (!allowedProducts.has(input.product)) invalid('Choose an MR Software product.');
  if (editing) revision(input.revision);
  return {
    title: boundedText(input.title, 'Title', 100, { required: true, singleLine: true }),
    description: boundedText(input.description, 'Description', 5000),
    tags: boundedText(input.tags, 'Tags', 500, { singleLine: true }),
    product: input.product,
  };
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) invalid('Draft revision is invalid.');
  return value;
}

export const watchUrl = id => `https://www.youtube.com/watch?v=${id}`;

export function youtubeVideoId(value) {
  const raw = boundedText(value, 'YouTube link', 500, { required: true, singleLine: true });
  let target;
  try { target = new URL(raw); } catch { invalid('Enter a valid HTTPS YouTube video link.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.port) invalid('Enter a valid HTTPS YouTube video link.');
  let id;
  if (target.hostname === 'youtu.be') id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(target.pathname)?.[1];
  else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(target.hostname)) {
    if (target.pathname === '/watch' && target.searchParams.getAll('v').length === 1) id = target.searchParams.get('v');
    else id = /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(target.pathname)?.[1];
  }
  if (!id || !videoIdPattern.test(id)) invalid('Use a YouTube watch, Shorts, live or youtu.be video link.');
  return id;
}

async function boundedResponseJson(response) {
  if (!response.body || !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) throw new Error('Unexpected response format.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32_768) { await reader.cancel(); throw new Error('Unexpected response size.'); }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(body));
  } finally {
    reader.releaseLock();
  }
}

function providerText(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || controlCharacters.test(value)) throw new Error('Unusable YouTube metadata.');
  return value.trim();
}

// Fixed unauthenticated request to YouTube. oEmbed proves that YouTube returned
// metadata for this link at this time, not the video's visibility setting, owner,
// or playback restrictions. The HTML in the response is never used or stored.
export async function inspectYouTubeVideo(id, { request = fetch } = {}) {
  if (!videoIdPattern.test(id)) invalid('Invalid YouTube video ID.');
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.search = new URLSearchParams({ url: watchUrl(id), format: 'json' });
  try {
    const response = await request(endpoint, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(6_000), headers: { Accept: 'application/json' } });
    if ([401, 403, 404].includes(response.status)) throw new HttpError(422, 'YouTube did not return details for this video. Check the link and its visibility in Studio.');
    if (!response.ok) throw new Error('YouTube is unavailable.');
    const result = await boundedResponseJson(response);
    if (result?.type !== 'video' || result.provider_name !== 'YouTube') throw new Error('Unusable YouTube metadata.');
    return { title: providerText(result.title, 400), channel: providerText(result.author_name, 400) };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'YouTube could not check this link. Try again later.');
  }
}

function item(row) {
  if (!row) missing();
  return { ...JSON.parse(row.document), id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function youtubeRoute({ request, url, path, env, actor, clock, inspectYouTube, json, requireJsonWrite, methodNotAllowed }) {
  const match = /^\/api\/backoffice\/youtube(?:\/([^/]+)(\/check)?)?$/.exec(path);
  if (!match || !actor) return null;
  const [, rawId, check] = match;
  const db = env.DB;
  if (!db || typeof db.prepare !== 'function') throw new HttpError(503, 'YouTube draft storage is not available.');
  const fromTable = 'SELECT id, revision, created_at, updated_at, document FROM sales_youtube_drafts';
  let id;
  if (rawId) {
    try { id = recordId(rawId); } catch { missing(); }
  }
  const get = async () => item(await db.prepare(fromTable + ' WHERE id = ?').bind(id).first());
  if (request.method === 'GET' && !check) {
    if (id) return json({ item: await get() });
    const { results } = await db.prepare(fromTable + ' ORDER BY updated_at DESC, id DESC LIMIT 101').all();
    return json({ items: results.slice(0, 100).map(item), truncated: results.length > 100 });
  }
  const allowed = !id && request.method === 'POST' || id && check && request.method === 'POST' || id && !check && request.method === 'PUT';
  if (!allowed) return methodNotAllowed();
  requireJsonWrite(request, url);
  const input = await readJson(request);

  if (!id) {
    const draft = validateDraft(input, false);
    const now = clock().toISOString();
    id = crypto.randomUUID();
    const document = { ...draft, verification: null };
    await db.prepare('INSERT INTO sales_youtube_drafts (id, revision, created_at, updated_at, updated_by, document) VALUES (?, 1, ?, ?, ?, ?)').bind(id, now, now, actor.sub, JSON.stringify(document)).run();
    return json({ item: { ...document, id, revision: 1, createdAt: now, updatedAt: now } }, 201);
  }

  const saved = await get();
  if (input?.revision !== saved.revision) {
    revision(input?.revision);
    changed();
  }
  const { id: _id, revision: expected, createdAt, updatedAt: _updated, ...previous } = saved;
  let document;
  if (check) {
    fields(input, ['revision', 'videoUrl']);
    const videoId = youtubeVideoId(input.videoUrl);
    const evidence = await inspectYouTube(videoId);
    document = { ...previous, verification: { url: watchUrl(videoId), videoId, ...evidence, checkedAt: clock().toISOString() } };
  } else {
    document = { ...previous, ...validateDraft(input, true) };
  }
  const now = clock().toISOString();
  const result = await db.prepare('UPDATE sales_youtube_drafts SET revision = revision + 1, updated_at = ?, updated_by = ?, document = ? WHERE id = ? AND revision = ?')
    .bind(now, actor.sub, JSON.stringify(document), id, expected).run();
  if (result.meta.changes !== 1) changed();
  return json({ item: { ...document, id, revision: expected + 1, createdAt, updatedAt: now } });
}
