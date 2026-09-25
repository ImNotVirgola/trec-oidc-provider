const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dotenv=require('dotenv');
const source=process.argv[2];if(!source)throw Error('Uso: node integration/configure.cjs /percorso/progetto-funzionante');
require('./verify-originals.cjs').verify();
const dir=path.join(__dirname,'config');fs.mkdirSync(dir,{recursive:true,mode:0o700});
for(const role of ['provider','holder','issuer'])if(fs.existsSync(path.join(dir,role+'.env')))throw Error('Configurazione gia presente: nessun file sovrascritto. Modifica integration/config/*.env se necessario.');
function read(relative){const env=dotenv.parse(fs.readFileSync(path.resolve(source,relative)));return Object.fromEntries(Object.entries(env).filter(([k,v])=>v&&!/[<>]/.test(v)));}
const provider=read('.env'),holder=read('holder/.env'),issuer=read('issuer/.env');
const definition='did:cheqd:testnet:3ee6c158-abf7-457b-9ef1-a6a5f8f740c1/resources/6b0cc7d9-08df-451d-9710-5d8f3722c2a8';
const schema='did:cheqd:testnet:3ee6c158-abf7-457b-9ef1-a6a5f8f740c1/resources/0dd248ec-75b2-4498-b3c8-2f4164aaa470';
const secret=()=>crypto.randomBytes(32).toString('hex');
Object.assign(provider,{PROVIDER_URL:'http://localhost:3000',PORT:'3000',TREC_ID:provider.TREC_ID||'trec-local-client',
 CLIENT_SECRET:secret(),SESSION_SECRET:secret(),COOKIES_KEY:secret(),OIDC_STORAGE_KEY:secret(),
 TREC_REDIRECT_URI:'http://localhost:3004/callback',CORS_ORIGIN:'http://localhost:3004',AUTH_ENDPOINT:'/auth',TOKEN_ENDPOINT:'/token',
 SCOPES:'openid trec',CHEQD_NETWORK:'testnet',CREDENTIAL_DEFINITION_ID:definition,SCHEMA_ID:schema,
 VERIFIER_LABEL:provider.VERIFIER_LABEL||'TREC Verifier',VERIFIER_ENDPOINT:'http://localhost:3001',VERIFIER_PORT:'3001',
 VERIFIER_COSMOS_SEED:provider.VERIFIER_COSMOS_SEED||provider.COSMOS_PAYER_SEED||'',
 AT_TTL:'3600',ID_TTL:'3600',RT_TTL:'86400'});
Object.assign(holder,{CHEQD_NETWORK:'testnet',HOLDER_ENDPOINT:'http://localhost:3002',HOLDER_PORT:'3002'});
Object.assign(issuer,{CHEQD_NETWORK:'testnet',ISSUER_ENDPOINT:'http://localhost:3003',ISSUER_URL:'http://localhost:3003',ISSUER_PORT:'3003',CREDENTIAL_DEFINITION_ID:definition,SCHEMA_ID:schema});
for(const [role,env,keys] of [['provider',provider,['VERIFIER_WALLET_ID','VERIFIER_WALLET_KEY','VERIFIER_COSMOS_SEED']],['holder',holder,['HOLDER_WALLET_ID','WALLET_KEY','HOLDER_COSMOS_SEED']],['issuer',issuer,['ISSUER_WALLET_ID','ISSUER_WALLET_KEY','ISSUER_COSMOS_SEED','DID_ID','HOLDER_DID_ID']]]){
 for(const k of keys)if(!env[k])throw Error('Manca '+k+' nella configurazione sorgente '+role+'; nessuna configurazione scritta.');
}
// No external configuration is ever evaluated as JavaScript or shell code.
for(const [role,env] of Object.entries({provider,holder,issuer})){
 delete env.DEBUG;
 const text=Object.entries(env).map(([k,v])=>{if(/[\r\n"]/.test(v))throw Error('Formato valore non supportato: '+k);return k+'="'+v+'"';}).join('\n')+'\n';
 fs.writeFileSync(path.join(dir,role+'.env'),text,{flag:'wx',mode:0o600});
}
console.log('Configurazione importata. Wallet e chiavi Askar mantenuti. Nuove chiavi OIDC private in integration/config.');
console.log('Nessuna registrazione sulla blockchain; nessun file originale modificato.');
