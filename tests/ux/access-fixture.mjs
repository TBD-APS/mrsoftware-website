import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { accessVerifier, issuer, audience } from '../../dashboard/access.mjs';

// Ephemeral synthetic credentials, used only by isolated loopback tests.
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' };
export const verifyTestAccess = accessVerifier(createLocalJWKSet({ keys: [jwk] }));
export function testToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, aud: audience, sub: 'synthetic-user', iat: now, exp: now + 3600, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey);
}
