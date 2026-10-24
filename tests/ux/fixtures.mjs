// Isolated contexts use real dashboard code and synthetic Access credentials on
// loopback. Production credentials and ChatGPT sessions are never used.
export async function prepareContext(context, base, { signedIn = true } = {}) {
  const port = new URL(base).port;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['dashboard.mrsoftware.dk', 'mrsoftware.dk'].includes(url.hostname) && url.port === port) {
      const response = await context.request.get(`http://127.0.0.1:${port}${url.pathname}${url.search}`, { headers: { 'x-test-host': url.hostname, 'x-test-access': signedIn ? 'allow' : 'deny' } });
      return route.fulfill({ response });
    }
    return route.abort();
  });
}
