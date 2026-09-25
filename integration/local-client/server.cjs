const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { safeDiagnostic } = require('./diagnostics.cjs');

const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'provider.env')));
const issuer = 'http://localhost:3000';
const origin = 'http://localhost:3004';
const redirectUri = origin + '/callback';
const clientId = env.TREC_ID;
const secret = env.CLIENT_SECRET;
if (env.PROVIDER_URL !== issuer || env.TREC_REDIRECT_URI !== redirectUri ||
    !clientId || !secret || /[<>]/.test(secret)) {
  throw new Error('Esegui prima node configure-local.cjs.');
}
const random = () => crypto.randomBytes(32).toString('base64url');
const transactions = new Map();
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
function page(res, status, title, content) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://localhost:3000; frame-ancestors 'none'"
  });
  res.end('<!doctype html><html lang="it"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width"><title>' + escape(title) + '</title>' +
    '<style>body{font:18px system-ui;max-width:760px;margin:60px auto;padding:20px;line-height:1.6}' +
    'button{font:inherit;padding:12px 20px;cursor:pointer}code{overflow-wrap:anywhere}</style>' +
    '<h1>' + escape(title) + '</h1>' + content + '</html>');
}
async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const error = new Error('HTTP_FAILURE');
    error.httpStatus = response.status;
    const body = await response.json().catch(() => null);
    error.oauthError = body?.error;
    throw error;
  }
  return response.json();
}
function trustedEndpoint(value) {
  const url = new URL(value);
  if (url.origin !== issuer || url.username || url.password) throw new Error('UNTRUSTED_ENDPOINT');
  return url;
}
async function metadata() {
  const value = await getJson(issuer + '/.well-known/openid-configuration');
  if (value.issuer !== issuer) throw new Error('ISSUER_MISMATCH');
  for (const name of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) trustedEndpoint(value[name]);
  return value;
}
async function main() {
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  const server = http.createServer(async (req, res) => {
    let stage = 'request';
    try {
      if (req.headers.host !== 'localhost:3004') return page(res, 400, 'Indirizzo non valido', 'Apri http://localhost:3004');
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/') {
        return page(res, 200, 'Test login TREC',
          '<p>Avvia il provider e prepara il terminale Holder. Il login richiede la prova della credenziale.</p>' +
          '<form method="post" action="/login"><button>Accedi con la credenziale</button></form>');
      }
      if (req.method === 'POST' && url.pathname === '/login') {
        if (req.headers.origin !== origin) return page(res, 403, 'Richiesta rifiutata', 'Origine non valida.');
        stage = 'discovery';
        const config = await metadata();
        const sid = random(), state = random(), nonce = random(), verifier = random();
        transactions.set(sid, { state, nonce, verifier, config, expires: Date.now() + 600000 });
        
        const auth = trustedEndpoint(config.authorization_endpoint);
        auth.search = new URLSearchParams({
          client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid trec',
          state, nonce, prompt: 'login', code_challenge_method: 'S256',
          code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url')
        }).toString();
        res.writeHead(303, { Location: auth.href, 'Cache-Control': 'no-store',
          'Set-Cookie': 'trec_local_oidc=' + sid + '; HttpOnly; SameSite=Lax; Path=/callback; Max-Age=600' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/callback') {
        stage = 'callback_state';
        const sid = (req.headers.cookie || '').split(';').map(x => x.trim())
          .find(x => x.startsWith('trec_local_oidc='))?.slice('trec_local_oidc='.length);
        if (!sid) throw new Error('LOGIN_COOKIE_MISSING');
        const txn = transactions.get(sid);
        if (!txn) throw new Error('LOGIN_TRANSACTION_MISSING');
        if (txn.expires < Date.now()) {
          transactions.delete(sid);
          throw new Error('LOGIN_TRANSACTION_EXPIRED');
        }
        if (url.searchParams.getAll('state').length !== 1) {
          throw new Error('CALLBACK_STATE_MISSING_OR_DUPLICATED');
        }
        if (url.searchParams.get('state') !== txn.state) throw new Error('CALLBACK_STATE_MISMATCH');
        transactions.delete(sid);
        res.setHeader('Set-Cookie', 'trec_local_oidc=; HttpOnly; SameSite=Lax; Path=/callback; Max-Age=0');
        if (url.searchParams.has('error')) {
          const error = new Error('LOGIN_DENIED');
          error.oauthError = url.searchParams.get('error');
          throw error;
        }
        const code = url.searchParams.get('code');
        if (!code || url.searchParams.getAll('code').length !== 1) throw new Error('MISSING_CODE');
        stage = 'token_exchange';
        const tokens = await getJson(trustedEndpoint(txn.config.token_endpoint), {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri,
            client_id: clientId, client_secret: secret, code_verifier: txn.verifier })
        });
        stage = 'id_token_verification';
        if (typeof tokens.id_token !== 'string') throw new Error('MISSING_ID_TOKEN');
        const { payload } = await jwtVerify(tokens.id_token,
          createRemoteJWKSet(trustedEndpoint(txn.config.jwks_uri)), {
            issuer, audience: clientId, algorithms: ['RS256', 'PS256', 'ES256', 'EdDSA'],
            requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'nonce'], clockTolerance: 5
          });
        stage = 'id_token_binding';
        if (payload.nonce !== txn.nonce) throw new Error('NONCE_MISMATCH');
        if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('INVALID_SUBJECT');
        if (payload.iat > Math.floor(Date.now() / 1000) + 5) throw new Error('INVALID_IAT');
        if ((payload.azp !== undefined && payload.azp !== clientId) ||
            (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) {
          throw new Error('INVALID_AZP');
        }
        stage = 'access_token_verification';
        const access = await jwtVerify(tokens.access_token, createRemoteJWKSet(trustedEndpoint(txn.config.jwks_uri)), {
          issuer, audience: clientId, algorithms: ['RS256'], requiredClaims: ['iss','aud','sub','iat','exp']
        });
        if (access.payload.sub !== payload.sub || !access.payload.trec) throw new Error('ACCESS_TOKEN_BINDING_FAILED');
        console.log('OIDC_ACCESS_TOKEN_VERIFIED=true');
        console.log('OIDC_LOGIN_VERIFIED=true');
        return page(res, 200, 'Login OIDC verificato',
          '<p>Codice scambiato con PKCE. Firma, issuer, audience, scadenza e nonce dellâ€™ID token verificati.</p>' +
          '<p>Identificativo utente: <code>' + escape(payload.sub) + '</code></p>' +
          '<p>I token e il segreto del client non vengono mostrati o conservati.</p><a href="/">Torna al test</a>');
      }
      page(res, 404, 'Pagina non trovata', '<a href="/">Torna al test</a>');
    } catch (error) {
      console.error('OIDC_LOGIN_FAILED ' + JSON.stringify({ stage, ...safeDiagnostic(error) }));
      page(res, 400, 'Login non completato',
        '<p>Controlla che il provider sia avviato e configurato. In caso di prova riuscita, controlla anche il suo log OIDC.</p>' +
        '<a href="/">Riprova</a>');
    }
  });
  setInterval(() => {
    for (const [key, value] of transactions) if (value.expires < Date.now()) transactions.delete(key);
  }, 60000).unref();
  server.on('error', () => { console.error('Avvio fallito: controlla che la porta 3004 sia libera.'); process.exitCode = 1; });
  server.listen(3004, '127.0.0.1', () => console.log('Client locale: http://localhost:3004'));
}
main().catch(() => { console.error('Avvio client fallito. Controlla le dipendenze.'); process.exitCode = 1; });
