const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
test('real original OIDC provider: complete HTTP authorization and JWT validation',()=>{
 const result=spawnSync(process.execPath,['--loader',pathToFileURL(path.resolve(__dirname,'../runtime/oidc-loader.mjs')).href,path.join(__dirname,'oidc-flow.cjs')],{encoding:'utf8',timeout:45000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);console.log(result.stdout.trim());
});
test('upstream runtime sources are compatible',()=>{assert.equal(require('../verify-originals.cjs').verify(),7)});
test('login page navigates the browser to resume instead of following the callback inside fetch',async()=>{
 const html=require('pug').renderFile(path.resolve(__dirname,'../views/login.pug'),{url:'invitation',oob_id:'oob',u_id:'uid',cors_origin:'http://localhost:3004'});
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 for(const redirectTo of ['/auth/resume','http://untrusted.example/']){
  let assigned,options;const status={};
  await require('node:vm').runInNewContext(script,{
   URL,document:{getElementById:id=>id==='invitation'?{dataset:{uid:'uid',oob:'oob'}}:status},
   window:{location:{origin:'http://localhost:3000',assign:url=>{assigned=url}}},
   fetch:async(url,config)=>{options=config;assert.equal(url,'/interaction/uid/login');return{ok:true,json:async()=>({redirectTo})}}
  });
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');
  if(redirectTo.startsWith('/'))assert.equal(assigned,'http://localhost:3000/auth/resume');else assert.equal(assigned,undefined);
 }
});
test('Credo cheqd and its CommonJS did-jwt dependency load on the active Node runtime',()=>{
 const sdkRequire=require('node:module').createRequire(require.resolve('@cheqd/sdk'));
 assert.equal(typeof sdkRequire('did-jwt').verifyJWT,'function');
 assert.equal(typeof require('@credo-ts/cheqd').CheqdModule,'function');
});
test('runtime transformations compile without writing original JS or TS files',()=>{
 const bootstrap=require('../runtime/bootstrap.cjs'),vm=require('node:vm');
 for(const [filename,code] of Object.entries(bootstrap.sources()))new vm.Script(code,{filename});
 for(const role of ['verifier','holder','issuer']){const {file,code}=bootstrap.agentSource(role);new vm.Script(code,{filename:file});assert.ok(code.includes('port: Number(process.env.'));if(role!=='verifier')assert.ok(!code.includes('async function main'));}
});
