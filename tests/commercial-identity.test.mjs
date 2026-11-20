import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { accessVerifier } from '../commercial/server/identity.mjs';
import { createApplication } from '../commercial/server/application.mjs';
import { commercialSettings } from './helpers/commercial.mjs';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'synthetic-sales-key', alg: 'RS256' };
const verifyIdentity = accessVerifier(createLocalJWKSet({ keys: [jwk] }));
const app = createApplication({ verifyIdentity });
const token = (overrides = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: commercialSettings.ACCESS_ISSUER, aud: commercialSettings.ACCESS_AUDIENCE, sub: 'synthetic-william', email: 'william@example.test', iat: now, exp: now + 3600, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
};
const session = (jwt, env = {}) => app.fetch(new Request('https://backoffice.mrsoftware.dk/api/backoffice/session', { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), { ...commercialSettings, ...env });

test('Signed RS256 Access identity exposes only the allowed email', async () => {
  const response = await session(await token());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { email: 'william@example.test' });
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('Missing, forged, wrong issuer/audience and expired Access tokens fail closed', async () => {
  const valid = await token();
  const parts = valid.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  for (const jwt of [null, 'forged', parts.join('.'), await token({ aud: 'other-application' }), await token({ iss: 'https://other.cloudflareaccess.com' }), await token({ exp: 1 }), await token({ nbf: Math.floor(Date.now() / 1000) + 3600 }), await token({ sub: '' }), await token({ sub: undefined }), await token({ email: undefined }), await token({ email: 'invalid' }), await token({ exp: undefined }), await token({ iat: undefined })]) {
    assert.equal((await session(jwt)).status, 401);
  }
});

test('A signed identity still needs a complete dedicated Access configuration and allowed email', async () => {
  assert.equal((await session(await token({ email: 'other@example.test' }))).status, 403);
  assert.equal((await session(await token({ email: 'William@Example.Test' }), { ALLOWED_EMAILS: ' other@example.test, william@example.test ' })).status, 200);
  for (const setting of ['ACCESS_ISSUER', 'ACCESS_AUDIENCE', 'ALLOWED_EMAILS']) assert.equal((await session(await token(), { [setting]: '' })).status, 401);
  for (const issuer of ['http://synthetic.cloudflareaccess.com', 'https://attacker.example/path', 'https://user:pass@synthetic.cloudflareaccess.com']) assert.equal((await session(await token(), { ACCESS_ISSUER: issuer })).status, 401);
});

test('Other JWT algorithms cannot replace RS256 even with the same identity claims', async () => {
  const jwt = await new SignJWT({ iss: commercialSettings.ACCESS_ISSUER, aud: commercialSettings.ACCESS_AUDIENCE, sub: 'synthetic-william', email: 'william@example.test', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('synthetic-secret-at-least-32-bytes-long'));
  assert.equal((await session(jwt)).status, 401);
});
