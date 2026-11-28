import { HttpError, readJson, recordId } from './validation.mjs';

const selections = Object.freeze({
  image: { model_id: 'gemini-2.5-flash-image', aspect_ratio: '16:9' },
  video: { model_id: 'veo-3.1-fast-generate-001', aspect_ratio: '16:9', duration_secs: 4, resolution: '720p', generate_audio: false },
});
const allowedMime = { image: 'image/png', video: 'video/mp4' };
const fileLimit = 24 * 1024 * 1024;
const providerId = /^[A-Za-z0-9_-]{1,100}$/;
const unavailable = () => new HttpError(503, 'Media generation is not connected yet.');
const missing = () => new HttpError(404, 'This YouTube draft or media job was not found.');

export function elevenCreative(env, request = fetch) {
  const key = env.ELEVEN_CREATIVE_API_KEY?.trim();
  if (!key) return null;
  const call = async (kind, id, input) => {
    const response = await request('https://api.elevenlabs.io/v1/flows/' + kind + (id ? '/' + id : ''), {
      method: input ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { 'xi-api-key': key, Accept: 'application/json', ...(input ? { 'Content-Type': 'application/json' } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const error = new HttpError(503, 'ElevenLabs could not process this media request.');
      // Only statuses that documentably reject a request before a job is started.
      error.rejected = [400, 401, 402, 403, 404, 410, 422, 429].includes(response.status);
      throw error;
    }
    // Bounded provider JSON; no raw response or provider details leave the Worker.
    const reader = response.body?.getReader();
    if (!reader) throw unavailable();
    const decoder = new TextDecoder();
    let length = 0;
    let body = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 32_768) { await reader.cancel(); throw unavailable(); }
        body += decoder.decode(value, { stream: true });
      }
      return JSON.parse(body + decoder.decode());
    } finally { reader.releaseLock(); }
  };
  return {
    async start(kind, prompt) {
      const result = await call(kind, null, { ...selections[kind], prompt });
      if (!providerId.test(result?.id ?? '') || result.status !== 'pending') throw unavailable();
      return result.id;
    },
    async download(kind, result) {
      const target = sourceUrl(kind, result);
      const response = await request(target, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25_000) });
      const declared = Number(response.headers.get('Content-Length'));
      if (!response.ok || !response.body || declared > fileLimit || response.headers.get('Content-Type')?.split(';')[0].toLowerCase() !== allowedMime[kind]) {
        await response.body?.cancel();
        throw unavailable();
      }
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > fileLimit) { await reader.cancel(); throw unavailable(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (!size) throw unavailable();
      return new Blob(chunks, { type: allowedMime[kind] });
    },
    async check(kind, id) {
      if (!providerId.test(id ?? '')) throw unavailable();
      const result = await call(kind, id);
      if (result?.id !== id || !['pending', 'generating', 'completed', 'failed'].includes(result.status)) throw unavailable();
      return result;
    },
  };
}

function publicJob(row) {
  return { id: row.id, kind: row.kind, state: row.state, prompt: row.prompt, createdAt: row.created_at };
}

function sourceUrl(kind, result) {
  let target;
  try { target = new URL(result.content_url); } catch { throw unavailable(); }
  if (result.status !== 'completed' || result.content_mime_type !== allowedMime[kind] ||
    target.protocol !== 'https:' || target.port || target.username || target.password || target.hostname !== 'storage.googleapis.com') throw unavailable();
  return target;
}

export async function youtubeMediaRoute({ request, url, path, env, actor, clock, providerFactory, json, requireJsonWrite, methodNotAllowed, protect }) {
  const match = /^\/api\/backoffice\/youtube\/([^/]+)\/media(?:\/([^/]+)(\/file)?)?$/.exec(path);
  if (!match || !actor) return null;
  let draftId, jobId;
  try { draftId = recordId(match[1]); if (match[2]) jobId = recordId(match[2]); } catch { throw missing(); }
  const provider = providerFactory(env);
  if (!provider || !env.YOUTUBE_MEDIA) {
    if (request.method === 'GET' && !jobId) return json({ available: false, jobs: [] });
    throw unavailable();
  }
  const db = env.DB;
  const draft = await db.prepare('SELECT id, revision FROM sales_youtube_drafts WHERE id = ?').bind(draftId).first();
  if (!draft) throw missing();
  const find = async id => db.prepare('SELECT * FROM sales_youtube_media WHERE draft_id = ? AND id = ?').bind(draftId, id).first();
  if (request.method === 'GET' && !jobId) {
    const { results } = await db.prepare('SELECT * FROM sales_youtube_media WHERE draft_id = ? ORDER BY created_at DESC, id DESC LIMIT 20').bind(draftId).all();
    return json({ available: true, jobs: results.map(publicJob) });
  }
  if (request.method === 'GET' && jobId) {
    const row = await find(jobId);
    if (!row) throw missing();
    if (match[3]) {
      if (row.state !== 'completed') throw new HttpError(409, 'This media file is not ready.');
      const asset = await env.YOUTUBE_MEDIA.get('youtube/' + draftId + '/' + jobId);
      if (!asset) throw unavailable();
      const extension = row.kind === 'image' ? 'png' : 'mp4';
      return protect(new Response(asset.body, { headers: {
        'Content-Type': allowedMime[row.kind], 'Content-Disposition': 'attachment; filename="youtube-' + row.kind + '.' + extension + '"',
      } }));
    }
    if (row.state === 'pending') {
      const result = await provider.check(row.kind, row.provider_id);
      if (result.status === 'completed') {
        const file = await provider.download(row.kind, result);
        await env.YOUTUBE_MEDIA.put('youtube/' + draftId + '/' + jobId, file, { httpMetadata: { contentType: allowedMime[row.kind] } });
      }
      if (['completed', 'failed'].includes(result.status)) {
        await db.prepare('UPDATE sales_youtube_media SET state = ? WHERE id = ? AND state = ?').bind(result.status, jobId, 'pending').run();
      }
    }
    return json({ job: publicJob(await find(jobId)) });
  }
  if (request.method !== 'POST' || jobId) return methodNotAllowed();
  requireJsonWrite(request, url);
  const input = await readJson(request);
  if (!input || typeof input !== 'object' || Object.keys(input).sort().join(',') !== 'kind,prompt,requestId,revision' ||
    !Object.hasOwn(selections, input.kind) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 1500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.prompt)) throw new HttpError(400, 'Choose an image or video and enter a prompt of up to 1,500 characters.');
  const id = recordId(input.requestId);
  const prompt = input.prompt.trim();
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new HttpError(400, 'Invalid draft revision.');
  const existing = await find(id);
  if (existing && existing.kind === input.kind && existing.prompt === prompt && existing.draft_revision === input.revision) return json({ job: publicJob(existing) });
  if (draft.revision !== input.revision) throw new HttpError(409, 'The saved draft changed. Reload before generating media.');
  const conflict = () => new HttpError(409, 'A media request is already in progress or needs review. No new generation was started.');
  const reservation = await db.prepare("INSERT INTO sales_youtube_media (id,draft_id,kind,draft_revision,prompt,actor,created_at,state) SELECT ?,id,?,revision,?,?,?,'submitting' FROM sales_youtube_drafts WHERE id = ? AND revision = ? ON CONFLICT DO NOTHING")
    .bind(id, input.kind, prompt, actor.sub, clock().toISOString(), draftId, input.revision).run();
  if (!reservation.meta.changes) {
    const existing = await find(id);
    if (!existing || existing.kind !== input.kind || existing.prompt !== prompt || existing.draft_revision !== input.revision) throw conflict();
    return json({ job: publicJob(existing) });
  }
  let generation;
  try {
    generation = await provider.start(input.kind, prompt);
  } catch (error) {
    await db.prepare('UPDATE sales_youtube_media SET state = ? WHERE id = ? AND state = ?')
      .bind(error?.rejected === true ? 'failed' : 'uncertain', id, 'submitting').run();
    return json({ job: publicJob(await find(id)) }, 202);
  }
  await db.prepare("UPDATE sales_youtube_media SET state = 'pending', provider_id = ? WHERE id = ? AND state = 'submitting'").bind(generation, id).run();
  return json({ job: publicJob(await find(id)) }, 202);
}
