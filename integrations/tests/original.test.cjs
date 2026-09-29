const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('every original file remains byte-for-byte unchanged',()=>{
  const root=path.resolve(__dirname,'../..'),manifest=require('./original-manifest.json');
  const runtimeConfig = new Set(['.env','holder/.env','issuer/.env']);
  for(const [file,expected] of Object.entries(manifest.files)) {
    if(runtimeConfig.has(file)) continue;
    assert.equal(
      crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(root,file)))
        .digest('hex'),
      expected,
      file
    );
  }
  console.log('ORIGINAL_PROJECT_SOURCES_UNCHANGED=true');
});
test('OIDC dependency is official, separate from the original tarball, and unpatched',()=>{
  const lock=require('../package-lock.json'),entry=lock.packages['node_modules/oidc-provider'];assert.equal(entry.version,'8.5.2');assert.equal(entry.resolved,'https://registry.npmjs.org/oidc-provider/-/oidc-provider-8.5.2.tgz');
  const base=path.resolve(__dirname,'../node_modules/oidc-provider/lib/models');assert.ok(!fs.readFileSync(path.join(base,'id_token.js'),'utf8').includes('process.env.DID_ID'));assert.ok(!fs.readFileSync(path.join(base,'formats/jwt.js'),'utf8').includes('sessionStore'));
});
test('external configuration imports verifier values only, never writes or imports payer seeds',()=>{
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'trec-config-'));try{
    const source=path.join(dir,'old.env');fs.writeFileSync(source,'VERIFIER_WALLET_ID=old-wallet\nVERIFIER_WALLET_KEY=old-key\nVERIFIER_ENDPOINT=http://localhost:3001\nVERIFIER_COSMOS_SEED=must-not-be-imported\nCREDENTIAL_DEFINITION_ID=did:cheqd:testnet:issuer/resources/definition\n');
    const file=path.join(dir,'auth.env');fs.writeFileSync(file,'ORIGINAL_VERIFIER_ENV=old.env\nOIDC_ISSUER=http://localhost:3000\nOIDC_CLIENT_ID=demo\nOIDC_CLIENT_SECRET=test-only\nOIDC_REDIRECT_URI=http://localhost:3004/callback\n');const before=fs.readFileSync(source);
    const c=require('../runtime/config.cjs').loadConfig({env:{},file});assert.equal(c.walletId,'old-wallet');assert.equal(c.walletKey,'old-key');assert.ok(!JSON.stringify(c).includes('must-not-be-imported'));assert.deepEqual(fs.readFileSync(source),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
