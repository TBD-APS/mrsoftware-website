import { createRemoteJWKSet, jwtVerify } from 'jose';

// Access application identifiers are public metadata, not credentials.
export const issuer = 'https://mr-saasy.cloudflareaccess.com';
export const audience = 'd89bb4bde2a99f21b1e4925cdc1921dcbf840c0a0f6d87acf7b3e97125b902d2';
const remoteKeys = createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'));

export function accessVerifier(keys = remoteKeys) {
  return async request => {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return false;
    try {
      await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'], clockTolerance: 5 });
      return true;
    } catch { return false; }
  };
}
