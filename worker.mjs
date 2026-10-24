import snapshot from './.local/private-dashboard.json';
import { accessVerifier } from './dashboard/access.mjs';
import { createDashboardHandler } from './dashboard/handler.mjs';

if (snapshot.kind !== 'private-snapshot') throw new Error('Prepare the private dashboard snapshot before deployment');
export default { fetch: createDashboardHandler({ files: snapshot.files, verifyAccess: accessVerifier() }) };
