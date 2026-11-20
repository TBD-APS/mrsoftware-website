import policy from '../../.local/commercial-asset-policy.json' with { type: 'json' };

const protectedAssets = new Set(policy.protectedAssets);

// Asset behavior runs inside the application's host and Access checks. In
// particular a private-root redirect cannot happen before authentication.
export function wrapCommercialApplication(application) {
  return {
    fetch(request, env, context) {
      const assets = env.ASSETS;
      return application.fetch(request, { ...env, ASSETS: {
        async fetch(assetRequest) {
          const url = new URL(assetRequest.url);
          let pathname;
          try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Not found', { status: 404 }); }
          const privateHost = url.host === env.BACKOFFICE_HOST;
          if (privateHost && pathname === '/') {
            url.pathname = '/backoffice/';
            return new Response(null, { status: 307, headers: { Location: url.href } });
          }
          if (!privateHost && protectedAssets.has(pathname)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
          if (!assets) return new Response('Site assets are unavailable.', { status: 503 });
          return assets.fetch(assetRequest);
        },
      } }, context);
    },
  };
}
