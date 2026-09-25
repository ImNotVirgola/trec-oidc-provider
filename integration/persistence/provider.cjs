const crypto = require('node:crypto');
const db = require('./storage.cjs');
const Adapter = require('./adapter.cjs');
function seconds(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(name + ': durata non valida.');
  return value;
}
function withPersistence(config) {
  let jwks = db.getRecord('Configuration', 'signing-keys')?.payload;
  if (!jwks) {
    // The original repository's shared demonstration key is never used.
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    jwks = { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: crypto.randomUUID(), use: 'sig', alg: 'RS256' }] };
    db.put('Configuration', 'signing-keys', jwks);
  }
  const cookieKey = process.env.COOKIES_KEY;
  if (!cookieKey || /[<>]/.test(cookieKey)) throw new Error('COOKIES_KEY non configurata.');
  // Sweeping expired records is lazy and bounded by the size of this local test archive.
  db.scan(() => false);
  console.log('OIDC_PERSISTENCE=encrypted-local-files');
  return { ...config, adapter: Adapter, jwks,
    scopes: [...new Set(['openid', 'trec', ...(process.env.SCOPES || '').split(/\s+/).filter(Boolean)])],
    findAccount: async (ctx, accountId) => {
      const data = require('./account-store.cjs').loadAccount(accountId);
      if (!data) return undefined;
      return { accountId, claims: async (use, scope) => ({sub: accountId, ...(String(scope || '').split(' ').includes('trec') ? {trec:data} : {})}) };
    },
    cookies: { ...config.cookies, keys: [cookieKey] },
    ttl: { ...config.ttl,
      AccessToken: seconds('AT_TTL', 3600), IdToken: seconds('ID_TTL', 3600),
      RefreshToken: seconds('RT_TTL', 86400), Grant: seconds('GRANT_TTL', 86400),
      Session: seconds('OIDC_SESSION_TTL', 86400), Interaction: seconds('INTERACTION_TTL', 600)
    }
  };
}
function PersistentProvider(Base) {
  return class extends Base { constructor(issuer, config) { super(issuer, withPersistence(config)); } };
}
module.exports = { PersistentProvider, withPersistence };
