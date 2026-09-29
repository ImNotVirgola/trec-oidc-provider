const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const fields = ['OIDC_ISSUER','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','OIDC_REDIRECT_URI','OIDC_RESOURCE','OIDC_BIND_HOST','CLIENT_BIND_HOST','VERIFIER_WALLET_ID','VERIFIER_WALLET_KEY','VERIFIER_WALLET_PATH','VERIFIER_DID','VERIFIER_ENDPOINT','VERIFIER_PORT','CHEQD_NETWORK','CHEQD_RPC_URL','PROOF_TIMEOUT_SECONDS','OIDC_COOKIE_SECRET'];
function loadConfig({ env = process.env, file = env.TREC_AUTH_ENV || path.resolve(__dirname,'../.env') } = {}) {
  const local = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  const oldPath = env.ORIGINAL_VERIFIER_ENV || local.ORIGINAL_VERIFIER_ENV;
  const old = oldPath ? dotenv.parse(fs.readFileSync(path.resolve(path.dirname(file),oldPath))) : {};
  const values = {};
  for (const name of ['VERIFIER_WALLET_ID','VERIFIER_WALLET_KEY','VERIFIER_ENDPOINT','VERIFIER_PORT','CHEQD_NETWORK','CREDENTIAL_DEFINITION_ID']) if(old[name])values[name]=old[name];
  values.VERIFIER_DID = old.VERIFIER_DID || old.DID_ID;
  for(const name of [...fields,'CREDENTIAL_DEFINITION_ID'])if(local[name])values[name]=local[name];
  for(const name of [...fields,'CREDENTIAL_DEFINITION_ID'])if(env[name])values[name]=env[name];
  const required = name => { const value=values[name];if(!value || /[<>]/.test(value))throw Error('Configurare '+name+' nel file indicato da TREC_AUTH_ENV o in integrations/.env.');return value; };
  const url = (value,name) => {const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.search)throw Error(name+' non valido.');return u.href.replace(/\/$/,'');};
  const issuer=url(required('OIDC_ISSUER'),'OIDC_ISSUER');
  const redirectUri=url(required('OIDC_REDIRECT_URI'),'OIDC_REDIRECT_URI');
  if(new URL(issuer).origin!==issuer || new URL(issuer).protocol!=='http:' || new URL(redirectUri).protocol!=='http:' || new URL(redirectUri).pathname!=='/callback')throw Error('Questa demo richiede OIDC_ISSUER HTTP senza percorso e OIDC_REDIRECT_URI HTTP con percorso /callback.');
  const definitionId=required('CREDENTIAL_DEFINITION_ID');
  if(!/^did:cheqd:(testnet:)?[^/\s]+\/resources\/[^/\s]+$/.test(definitionId))throw Error('CREDENTIAL_DEFINITION_ID non valido.');
  const timeout=Number(values.PROOF_TIMEOUT_SECONDS || 180),verifierPort=Number(values.VERIFIER_PORT||3001);
  if(!Number.isInteger(timeout)||timeout<1||timeout>600||!Number.isInteger(verifierPort)||verifierPort<1||verifierPort>65535)throw Error('Timeout o porta Verifier non validi.');
  const network=values.CHEQD_NETWORK || 'testnet';if(!['testnet','mainnet'].includes(network))throw Error('CHEQD_NETWORK non valida.');
  if(definitionId.startsWith('did:cheqd:testnet:') !== (network==='testnet'))throw Error('Rete della Credential Definition incoerente.');
  return { issuer,redirectUri,clientOrigin:new URL(redirectUri).origin,clientId:required('OIDC_CLIENT_ID'),clientSecret:required('OIDC_CLIENT_SECRET'),resource:url(values.OIDC_RESOURCE || issuer+'/trec-api','OIDC_RESOURCE'),
    walletId:required('VERIFIER_WALLET_ID'),walletKey:required('VERIFIER_WALLET_KEY'),walletPath:values.VERIFIER_WALLET_PATH,did:values.VERIFIER_DID,
    endpoint:url(required('VERIFIER_ENDPOINT'),'VERIFIER_ENDPOINT'),verifierPort,definitionId,network,rpcUrl:values.CHEQD_RPC_URL,
    timeoutMs:timeout*1000,cookieSecret:values.OIDC_COOKIE_SECRET,bindHost:values.OIDC_BIND_HOST||'127.0.0.1',clientBindHost:values.CLIENT_BIND_HOST||'127.0.0.1' };
}
module.exports={loadConfig};
