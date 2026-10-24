export const overviewOrigin = 'https://mr-software-development-overview-20261024.donornetwork-9279.chatgpt.site';

// Fresh browser contexts use local HTML at the real hostnames. No existing browser
// session, Access cookie or private Site credential is read or copied into tests.
export async function prepareContext(context, base, { signedIn = true } = {}) {
  const port = new URL(base).port;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['dashboard.mrsoftware.dk', 'mrsoftware.dk'].includes(url.hostname) && url.port === port) {
      const response = await context.request.get(`http://127.0.0.1:${port}${url.pathname}${url.search}`);
      return route.fulfill({ response });
    }
    if (url.origin === overviewOrigin) {
      const title = signedIn ? (url.searchParams.has('view') ? 'Code connections' : 'Task progress') : 'Sign in required';
      return route.fulfill({ status: signedIn ? 200 : 401, contentType: 'text/html', body: `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;padding:24px;font:16px system-ui;background:#f5f7f8;color:#10141a"><h1>${title}</h1><p>Local integration fixture. The published Site and its authentication are verified separately.</p></body></html>` });
    }
    return route.abort();
  });
}
