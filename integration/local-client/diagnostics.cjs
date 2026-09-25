const codes = new Set([
  'HTTP_FAILURE', 'UNTRUSTED_ENDPOINT', 'ISSUER_MISMATCH', 'INVALID_STATE',
  'LOGIN_COOKIE_MISSING', 'LOGIN_TRANSACTION_MISSING', 'LOGIN_TRANSACTION_EXPIRED',
  'CALLBACK_STATE_MISSING_OR_DUPLICATED', 'CALLBACK_STATE_MISMATCH',
  'LOGIN_DENIED', 'MISSING_CODE', 'MISSING_ID_TOKEN', 'INVALID_ID_TOKEN',
  'NONCE_MISMATCH', 'INVALID_SUBJECT', 'INVALID_IAT', 'INVALID_AZP',
  'ERR_JWT_EXPIRED', 'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS', 'ERR_JWKS_TIMEOUT',
  'ERR_JWKS_INVALID', 'ERR_JWS_INVALID', 'ERR_JWT_INVALID',
  'ERR_JOSE_ALG_NOT_ALLOWED', 'ERR_JOSE_NOT_SUPPORTED', 'ERR_JWK_INVALID'
]);
const oauthCodes = new Set(['invalid_request', 'invalid_client', 'invalid_grant',
  'unauthorized_client', 'unsupported_grant_type', 'invalid_scope',
  'server_error', 'temporarily_unavailable', 'access_denied', 'login_required',
  'consent_required', 'interaction_required']);
function safeDiagnostic(error) {
  const result = { code: codes.has(error?.code) ? error.code :
    codes.has(error?.message) ? error.message :
    error?.name === 'TimeoutError' ? 'TIMEOUT' : 'UNCLASSIFIED_ERROR' };
  if (Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599) {
    result.httpStatus = error.httpStatus;
  }
  if (oauthCodes.has(error?.oauthError)) result.oauthError = error.oauthError;
  if (['iss', 'aud', 'sub', 'exp', 'iat', 'nonce', 'azp', 'nbf'].includes(error?.claim)) result.claim = error.claim;
  if (['missing', 'invalid', 'check_failed'].includes(error?.reason)) result.reason = error.reason;
  if (result.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && error.claim === 'iss') {
    result.expectedIssuer = 'http://localhost:3000';
    const value = error.payload?.iss;
    result.receivedIssuer = '[valore non URL o non mostrabile]';
    if (typeof value === 'string' && value.length <= 240 && !/[\s\x00-\x1f\x7f]/.test(value)) {
      try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) {
          result.receivedIssuer = value;
        } else if (/^did:cheqd:(testnet:)?[a-f0-9-]+$/i.test(value)) {
          result.receivedIssuer = value;
        }
      } catch {}
    }
  }
  return result;
}
module.exports = { safeDiagnostic };
