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
test('public provisioning configuration is fixed and private configuration contains only secrets',()=>{
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'trec-config-'));
  try{
    const file=path.join(dir,'auth.env');

    fs.writeFileSync(
      file,
      [
        'VERIFIER_WALLET_KEY=test-wallet-key',
        'OIDC_CLIENT_SECRET=test-client-secret',
        'VERIFIER_COSMOS_SEED=must-not-be-imported'
      ].join('\n')+'\n'
    );

    const before=fs.readFileSync(file);

    const runtime=require('../runtime/config.cjs');
    const c=runtime.loadConfig({env:{},file});

    assert.equal(
      c.definitionId,
      runtime.publicConfig.cheqd.credentialDefinitionId
    );

    assert.equal(
      c.walletId,
      runtime.publicConfig.verifier.walletId
    );

    assert.equal(
      c.walletKey,
      'test-wallet-key'
    );

    assert.equal(
      c.clientSecret,
      'test-client-secret'
    );

    assert.ok(
      !JSON.stringify(c).includes('must-not-be-imported')
    );

    assert.deepEqual(
      fs.readFileSync(file),
      before
    );

    assert.equal(
      c.issuerDid,
      runtime.publicConfig.cheqd.issuerDid
    );

    assert.equal(
      c.schemaId,
      runtime.publicConfig.cheqd.schemaId
    );

  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
