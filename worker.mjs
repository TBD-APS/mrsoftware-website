import snapshot from './.local/private-dashboard.json';
import { accessVerifier } from './dashboard/access.mjs';
import { createDashboardHandler } from './dashboard/handler.mjs';
import { withCommercialEntry } from './website-entry.mjs';
import { withElevenLabsWebhook } from './elevenlabs-webhook.mjs';

if (snapshot.kind !== 'private-snapshot') throw new Error('Prepare the private dashboard snapshot before deployment');
export default { fetch: withElevenLabsWebhook(withCommercialEntry(createDashboardHandler({ files: snapshot.files, verifyAccess: accessVerifier() }))) };
