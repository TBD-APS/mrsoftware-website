import { createRemoteJWKSet, jwtVerify } from 'jose';

const remoteKeySets = new Map();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function identitySettings(env) {
  try {
    if (typeof env.ACCESS_ISSUER !== 'string' || typeof env.ACCESS_AUDIENCE !== 'string' || typeof env.ALLOWED_EMAILS !== 'string') return null;
    const issuer = new URL(env.ACCESS_ISSUER);
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.pathname !== '/' || issuer.search || issuer.hash) return null;
    const audience = env.ACCESS_AUDIENCE.trim();
    if (!audience || audience.length > 256 || /\s/.test(audience)) return null;
    const emails = env.ALLOWED_EMAILS.split(',').map(email => email.trim().toLowerCase());
    if (!emails.length || emails.length > 50 || emails.some(email => email.length > 254 || !emailPattern.test(email))) return null;
    return { issuer: issuer.origin, audience, allowedEmails: new Set(emails) };
  } catch {
    return null;
  }
}

export function validIdentity(identity) {
  return identity && typeof identity.sub === 'string' && identity.sub.trim().length > 0 && identity.sub.length <= 255 && typeof identity.email === 'string' && identity.email.length <= 254 && emailPattern.test(identity.email);
}

// A key resolver can be supplied by a signed-token test harness. Deployment env
// never selects a resolver or substitutes an identity.
export function accessVerifier(keys) {
  return async (request, env) => {
    const settings = identitySettings(env);
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!settings || !token || token.length > 16384) return null;
    try {
      let keySet = keys;
      if (!keySet) {
        if (!remoteKeySets.has(settings.issuer)) remoteKeySets.set(settings.issuer, createRemoteJWKSet(new URL(`${settings.issuer}/cdn-cgi/access/certs`)));
        keySet = remoteKeySets.get(settings.issuer);
      }
      const { payload } = await jwtVerify(token, keySet, {
        issuer: settings.issuer,
        audience: settings.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'email'],
      });
      if (!validIdentity(payload) || payload.iat > Math.floor(Date.now() / 1000) + 5) return null;
      return { sub: payload.sub, email: payload.email.toLowerCase() };
    } catch {
      return null;
    }
  };
}
