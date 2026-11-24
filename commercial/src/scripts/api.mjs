export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
export async function apiJson(path, { method = 'GET', body, signal, timeoutMs = 15_000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'MRSoftware' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new ApiError('Could not connect. Please try again.'); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError('The server could not complete the request. Please try again.', response.status); }
  if (!response.ok) throw new ApiError(typeof result.error === 'string' ? result.error : 'Please try again.', response.status);
  return result;
}
