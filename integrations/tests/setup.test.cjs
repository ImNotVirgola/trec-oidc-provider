const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const config = require('../setup/config.cjs');
const lifecycle = require('../setup/lifecycle.cjs');
const root = path.resolve(__dirname,'../..');
function fixture() {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'trec-setup-test-'));
  return {base,directory:path.join(base,'config'),home:path.join(base,'home')};
}
function originalSource(base,changes={}) {
  const dir=path.join(base,'source');fs.mkdirSync(dir);
  const issuer='did:cheqd:testnet:'+crypto.randomUUID(),holder='did:cheqd:testnet:'+crypto.randomUUID();
  const definition=issuer+'/resources/'+crypto.randomUUID(),schema=issuer+'/resources/'+crypto.randomUUID();
  const data={provider:{CHEQD_NETWORK:'testnet',VERIFIER_WALLET_ID:'existing-verifier',VERIFIER_WALLET_KEY:'private-verifier-key',COSMOS_PAYER_SEED:'existing payer seed',CREDENTIAL_DEFINITION_ID:definition,SCHEMA_ID:schema},holder:{CHEQD_NETWORK:'testnet',DID_ID:holder,HOLDER_WALLET_ID:'existing-holder',WALLET_KEY:'private-holder-key',HOLDER_COSMOS_SEED:'existing holder seed'},issuer:{CHEQD_NETWORK:'testnet',DID_ID:issuer,HOLDER_DID_ID:holder,ISSUER_WALLET_ID:'existing-issuer',ISSUER_WALLET_KEY:'private-issuer-key',ISSUER_COSMOS_SEED:'existing issuer seed',CREDENTIAL_DEFINITION_ID:definition,SCHEMA_ID:schema}};
  for(const role of config.roles){Object.assign(data[role],changes[role]);const relative={provider:'.env',holder:'holder/.env',issuer:'issuer/.env'}[role];const file=path.join(dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,config.encode(data[role]));}
  return {dir,data,definition,schema};
}
test('import preserves another user identities, wallet secrets and resources',()=>{
  const f=fixture(),source=originalSource(f.base);const before=fs.readFileSync(path.join(source.dir,'.env'),'utf8');
  config.importExisting(source.dir,f.directory);const envs=config.readAll(f.directory);
  assert.equal(envs.provider.CREDENTIAL_DEFINITION_ID,source.definition);assert.equal(envs.issuer.SCHEMA_ID,source.schema);
  assert.equal(envs.provider.VERIFIER_COSMOS_SEED,source.data.provider.COSMOS_PAYER_SEED);
  for(const role of config.roles)for(const field of config.walletFields[role])assert.equal(envs[role][field],source.data[role][field]);
  assert.equal(fs.readFileSync(path.join(source.dir,'.env'),'utf8'),before);
  assert.equal(config.state(f.directory).mode,'import');assert.throws(()=>config.initialize({directory:f.directory}),/presente/);
});
test('conflicting definitions or holder identities reject import before writing files',()=>{
  for(const changes of [{provider:{CREDENTIAL_DEFINITION_ID:'did:cheqd:testnet:other/resources/other'}},{issuer:{HOLDER_DID_ID:'did:cheqd:testnet:other'}}]){
    const f=fixture(),source=originalSource(f.base,changes);assert.throws(()=>config.importExisting(source.dir,f.directory));assert.equal(fs.existsSync(f.directory),false);
  }
});
test('schema absent from both old env files stays absent instead of using an author constant',()=>{
  const f=fixture(),source=originalSource(f.base,{provider:{SCHEMA_ID:''},issuer:{SCHEMA_ID:''}});
  config.importExisting(source.dir,f.directory);assert.equal(config.readRole('provider',f.directory).SCHEMA_ID,'');
});
test('previous integration config can be migrated without copying wallets or original OIDC state',()=>{
  const f=fixture(),source=originalSource(f.base);config.importExisting(source.dir,f.directory);
  const other=path.join(f.base,'other');const before=config.readAll(f.directory);config.importExisting(f.directory,other);
  assert.equal(config.readRole('holder',other).WALLET_KEY,before.holder.WALLET_KEY);
  assert.notEqual(config.readRole('provider',other).OIDC_STORAGE_KEY,before.provider.OIDC_STORAGE_KEY);
});
test('fresh configuration has independent wallets and testnet DIDs, and no preselected chain resources',()=>{
  const a=fixture(),b=fixture();config.initialize({directory:a.directory});config.initialize({directory:b.directory});
  const envs=config.readAll(a.directory),other=config.readAll(b.directory);
  config.validate(envs,{resources:false});config.assertIdentities(config.state(a.directory),envs);
  assert.equal(new Set(config.roles.map(role=>envs[role][config.walletFields[role][0]])).size,3);
  assert.equal(envs.provider.CREDENTIAL_DEFINITION_ID,'');assert.equal(envs.issuer.HOLDER_DID_ID,envs.holder.DID_ID);
  assert.notEqual(envs.holder.WALLET_KEY,other.holder.WALLET_KEY);
  assert.equal(require('bip39').validateMnemonic(envs.issuer.ISSUER_COSMOS_SEED),true);
  assert.equal(fs.existsSync(a.home),false);
});
test('custom payer seed is validated and dotenv preserves quoted wallet secrets',()=>{
  const f=fixture();assert.throws(()=>config.initialize({directory:f.directory,payerMnemonic:'invalid'}),/mnemonica/);assert.equal(fs.existsSync(f.directory),false);
  const value='key "with" spaces # hash';assert.equal(require('dotenv').parse(config.encode({WALLET_KEY:value})).WALLET_KEY,value);
  assert.throws(()=>config.encode({WALLET_KEY:'bad\nvalue'}));
});
function simulatedNative(f,{failSchema=false,missingPrivate=false}={}) {
  const agents=new Map(),counts={wallets:0,dids:0,schemas:0,definitions:0,closed:0};
  const native={createLocalWallet:async(role,env)=>{counts.wallets++;const file=config.walletPath(env,role,f.home);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'simulated wallet');},hasPrivateDefinition:async()=>!missingPrivate,
    openAgent:async(role,env)=>{
      if(!agents.has(role)) {
        const dids=[],schemas=[],definitions=[];
        const agent={wallet:{createKey:async()=>({publicKeyBase58:'public-key',fingerprint:'key-id'})},dids:{getCreatedDids:async()=>dids,resolve:async()=>({didDocument:null}),create:async({didDocument})=>{counts.dids++;dids.push({did:didDocument.id});return{didState:{state:'finished',did:didDocument.id}}}},modules:{anoncreds:{
          getCreatedSchemas:async()=>schemas,getCreatedCredentialDefinitions:async()=>definitions,
          registerSchema:async({schema})=>{counts.schemas++;if(failSchema)return{schemaState:{state:'failed',reason:'insufficient funds'}};const id=schema.issuerId+'/resources/schema';schemas.push({schemaId:id});return{schemaState:{state:'finished',schemaId:id}};},
          registerCredentialDefinition:async({credentialDefinition:d})=>{counts.definitions++;const id=d.issuerId+'/resources/definition';definitions.push({credentialDefinitionId:id});return{credentialDefinitionState:{state:'finished',credentialDefinitionId:id}};},
        }}};agents.set(role,agent);
      }
      return{agent:agents.get(role),close:async()=>{counts.closed++;}};
    }};
  const core={KeyType:{Ed25519:'Ed25519'},DidDocument:class{constructor(value){Object.assign(this,value);}}};
  return{native,counts,agents,core};
}
test('local wallets and registrations are resumable and do not run twice',async()=>{
  const f=fixture();config.initialize({directory:f.directory});const s=simulatedNative(f),options={...f,...s,applyFees:false};
  await lifecycle.wallets(options);await lifecycle.wallets(options);assert.equal(s.counts.wallets,3);
  await lifecycle.publish(options);await lifecycle.publish(options);
  assert.equal(s.counts.dids,3);assert.equal(s.counts.schemas,1);assert.equal(s.counts.definitions,1);
  const envs=config.readAll(f.directory);config.validate(envs);assert.equal(envs.provider.CREDENTIAL_DEFINITION_ID,envs.issuer.DID_ID+'/resources/definition');
});
test('an interrupted registration is not automatically rebroadcast',async()=>{
  const f=fixture();config.initialize({directory:f.directory});const s=simulatedNative(f,{failSchema:true}),options={...f,...s,applyFees:false};
  await lifecycle.wallets(options);await assert.rejects(lifecycle.publish(options),/non completata/);
  await assert.rejects(lifecycle.publish(options),/esito incerto/);assert.equal(s.counts.schemas,1);assert.equal(s.counts.definitions,0);
});
test('Credo record saved before interruption recovers IDs without a new transaction',async()=>{
  const journal={operations:{schema:{status:'pending'}}};let sends=0,saves=0;
  assert.equal(await lifecycle.execute({journal,name:'schema',recover:async()=> 'existing-id',action:async()=>{sends++;},save:()=>saves++}),'existing-id');
  assert.equal(sends,0);assert.equal(saves,1);
});
test('explicit retry is required to reissue an uncertain operation',async()=>{
  const journal={operations:{schema:{status:'pending'}}};let calls=0;
  await lifecycle.execute({journal,name:'schema',recover:async()=>null,action:async()=>{calls++;return'retry-id'},save:()=>{},retryPending:true});assert.equal(calls,1);
});
test('import mode cannot create wallets or publish new resources',async()=>{
  const f=fixture(),source=originalSource(f.base);config.importExisting(source.dir,f.directory);
  await assert.rejects(lifecycle.wallets(f),/importato/);await assert.rejects(lifecycle.publish(f),/importato/);
});
test('missing completed wallet or changed identity fails closed',async()=>{
  const f=fixture();config.initialize({directory:f.directory});const s=simulatedNative(f),options={...f,...s,applyFees:false};await lifecycle.wallets(options);
  const envs=config.readAll(f.directory);fs.unlinkSync(config.walletPath(envs.holder,'holder',f.home));await assert.rejects(lifecycle.wallets(options),/ora assente/);
  envs.issuer.DID_ID='did:cheqd:testnet:changed';config.atomic(path.join(f.directory,'issuer.env'),config.encode(envs.issuer));await assert.rejects(lifecycle.publish(options),/Identità modificata/);
});
test('public Credential Definition without private material is never marked ready',async()=>{
  const f=fixture();config.initialize({directory:f.directory});const s=simulatedNative(f,{missingPrivate:true}),options={...f,...s,applyFees:false};await lifecycle.wallets(options);
  await assert.rejects(lifecycle.publish(options),/materiale privato/);assert.equal(config.state(f.directory).operations.definition.status,'pending');assert.equal(config.readRole('provider',f.directory).CREDENTIAL_DEFINITION_ID,'');
});
test('exclusive setup lock blocks concurrent invocations',()=>{
  const f=fixture();config.initialize({directory:f.directory});const release=config.lock(f.directory);assert.throws(()=>config.lock(f.directory),/lock/);release();config.lock(f.directory)();
});
test('credentials use the configured holder and editable attributes, never author IDs',()=>{
  const f=fixture();config.initialize({directory:f.directory});const env=config.readRole('issuer',f.directory);
  const attributes=require('../runtime/attributes.cjs').forIssuer(env,f.directory);
  assert.equal(attributes.find(x=>x.name==='holderDid').value,env.HOLDER_DID_ID);assert.equal(attributes.find(x=>x.name==='issuerDid').value,env.DID_ID);assert.equal(attributes.length,9);
});
test('compatibility allows configured .env and CRLF, but rejects changed runtime source',()=>{
  const f=fixture(),manifest=require('../compatibility.json');
  for(const name of Object.keys(manifest.files)){const file=path.join(f.base,name);fs.mkdirSync(path.dirname(file),{recursive:true});const raw=fs.readFileSync(path.join(root,name));fs.writeFileSync(file,name.endsWith('.tgz')?raw:raw.toString().replace(/\r?\n/g,'\r\n'));}
  fs.writeFileSync(path.join(f.base,'.env'),'SESSION_SECRET=local-secret');
  const verify=require('../verify-originals.cjs').verify;assert.equal(verify({root:f.base}),7);
  fs.appendFileSync(path.join(f.base,'index.js'),'\n// changed');assert.throws(()=>verify({root:f.base}),/compatibile/);
});
test('adapted original sources prefer integration dependencies over old project node_modules',()=>{
  const f=fixture();const fake=path.join(f.base,'node_modules','express');fs.mkdirSync(fake,{recursive:true});fs.writeFileSync(path.join(fake,'index.js'),'module.exports="old-project-dependency";');
  const loaded=require('../runtime/bootstrap.cjs').compile(path.join(f.base,'index.js'),"module.exports=require('express');");
  assert.equal(loaded,require('express'));
});
test('invalid mnemonic diagnostics never expose its value',()=>{
  const result=spawnSync(process.execPath,['-e',"const c=require('./setup/config.cjs');try{c.initialize({payerMnemonic:'sensitive invalid value',directory:'not-written'})}catch(e){console.log(e.message)}"],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'});
  assert.equal(result.status,0);assert.ok(!result.stdout.includes('sensitive invalid value'));
});
test('empty payer file and unknown CLI options do not silently create a different payer',()=>{
  const f=fixture();assert.throws(()=>config.initialize({payerMnemonic:'',directory:f.directory}),/mnemonica/);assert.equal(fs.existsSync(f.directory),false);
  const result=spawnSync(process.execPath,['setup.cjs','init','--payer-fiel','not-read'],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Argomenti non riconosciuti/);
});
