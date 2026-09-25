const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const role=process.argv[2];if(!['provider','holder','issuer','client'].includes(role))throw Error('Uso: node integration/run.cjs provider|holder|issuer|client');
require('./verify-originals.cjs').verify();const file=path.join(__dirname,'config',role==='client'?'provider.env':role+'.env');
const env=require('dotenv').parse(fs.readFileSync(file));
const required={provider:['SESSION_SECRET','CLIENT_SECRET','COOKIES_KEY','OIDC_STORAGE_KEY','VERIFIER_WALLET_KEY','VERIFIER_WALLET_ID','VERIFIER_COSMOS_SEED','CREDENTIAL_DEFINITION_ID'],holder:['WALLET_KEY','HOLDER_WALLET_ID','HOLDER_COSMOS_SEED'],issuer:['ISSUER_WALLET_KEY','ISSUER_WALLET_ID','ISSUER_COSMOS_SEED','CREDENTIAL_DEFINITION_ID'],client:['CLIENT_SECRET','TREC_ID']}[role];
for(const k of required)if(!env[k]||/[<>]/.test(env[k]))throw Error('Configurare '+k+' in integration/config/'+path.basename(file));
if(role!=='client'&&env.CHEQD_NETWORK!=='testnet')throw Error('Questa integrazione usa cheqd testnet');
if(role!=='client'){
 const key={provider:'VERIFIER_WALLET_ID',holder:'HOLDER_WALLET_ID',issuer:'ISSUER_WALLET_ID'}[role];
 const wallet=path.join(require('node:os').homedir(),'.afj','data','wallet',env[key],'sqlite.db');
 if(!fs.existsSync(wallet))throw Error('Wallet esistente non trovato. Usa lo stesso utente WSL del progetto funzionante e verifica '+key+'. Nessun wallet nuovo creato.');
}
const args=role==='provider'?['--loader',pathToFileURL(path.join(__dirname,'runtime/oidc-loader.mjs')).href,path.join(__dirname,'runtime/bootstrap.cjs')]:[path.join(__dirname,role==='client'?'local-client/server.cjs':'runtime/agent-runner.cjs'),role];
const child=spawn(process.execPath,args,{stdio:'inherit',cwd:__dirname,env:{...process.env,...env,DEBUG:'',NODE_PATH:path.join(__dirname,'node_modules')}});
child.on('exit',(code)=>{process.exitCode=code??1});child.on('error',()=>{console.error('Avvio fallito');process.exitCode=1});
