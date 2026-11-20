import { receiveWebhook, createD1Inbox, moduleInfo } from '@mr-software/elevenlabs';

export const elevenLabsPath = '/api/webhooks/elevenlabs';
const scope = Object.freeze({ tenantId: 'mr-software', applicationId: 'mrsoftware-website', connectionId: 'elevenlabs-main' });

export function withElevenLabsWebhook(handler) {
  return async (request, env, context) => {
    const url = new URL(request.url);
    if (url.pathname !== elevenLabsPath) return handler(request, env, context);
    if (url.hostname !== 'mrsoftware.dk') return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return receiveWebhook(request, {
      enabled: env.ELEVENLABS_WEBHOOK_ENABLED === 'true',
      secret: env.ELEVENLABS_WEBHOOK_SECRET,
      scope,
      // This system connection belongs to MR Software. Deployment configuration grants this exact module version.
      // Product/customer connections must resolve their own current scoped authority instead.
      authorize: async (bound, module) => env.ELEVENLABS_MODULE_VERSION === moduleInfo.implementationVersion
        && module.moduleId === 'mr.elevenlabs' && bound.tenantId === scope.tenantId && bound.applicationId === scope.applicationId,
      inbox: env.ELEVENLABS_INBOX ? createD1Inbox(env.ELEVENLABS_INBOX) : undefined
    });
  };
}
