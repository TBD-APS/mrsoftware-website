const delays = [1000, 3000, 10000, 15000, 30000, 30000, 30000, 30000, 30000, 30000];
export const visibilityPause = ms => new Promise(resolve => setTimeout(resolve, ms));

// An upload can be listed before the version lookup used by Wrangler sees it.
// Wait with reads, then recheck release authorization before moving traffic.
export async function waitForWorkerVersion(env, worker, versionId, { request = fetch, pause = visibilityPause } = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await request(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${worker}/versions/${versionId}`, {
      method: 'GET', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (response.ok && body.success && body.result?.id === versionId) return;
    const invisible = response.status === 404 && body.success === false && Array.isArray(body.errors) && body.errors.length > 0 && body.errors.every(error => error.code === 100146);
    if (!invisible) throw Error(`Uploaded Worker version could not be verified (HTTP ${response.status})`);
    if (attempt >= delays.length) throw Error('Uploaded Worker version is not visible; no traffic change was requested');
    await pause(delays[attempt]);
  }
}

export async function confirmWorkerDeployment({ read, previousId, deploymentId, versionId, pause = visibilityPause }) {
  for (let attempt = 0; ; attempt++) {
    const current = (await read())[0];
    if (current?.id && (!deploymentId || current.id === deploymentId) && current.versions?.length === 1 && current.versions[0].version_id === versionId && current.versions[0].percentage === 100) return current;
    // An unrelated deployment or wrong/split version is a conflict, not lag.
    if (current?.id && (current.id !== previousId || current.id === deploymentId)) throw Error('The provider did not confirm the exact uploaded version: unexpected deployment or traffic split');
    if (attempt >= delays.length) throw Error('The provider did not confirm the exact uploaded version before the visibility window ended');
    await pause(delays[attempt]);
  }
}
