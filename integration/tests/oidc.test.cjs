const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
test('real original OIDC provider: complete HTTP authorization and JWT validation',()=>{
 const result=spawnSync(process.execPath,['--loader',pathToFileURL(path.resolve(__dirname,'../runtime/oidc-loader.mjs')).href,path.join(__dirname,'oidc-flow.cjs')],{encoding:'utf8',timeout:45000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);console.log(result.stdout.trim());
});
test('all upstream files are byte-for-byte unchanged',()=>{assert.equal(require('../verify-originals.cjs').verify(),44)});
test('runtime transformations compile without writing original JS or TS files',()=>{
 const bootstrap=require('../runtime/bootstrap.cjs'),vm=require('node:vm');
 for(const [filename,code] of Object.entries(bootstrap.sources()))new vm.Script(code,{filename});
 for(const role of ['verifier','holder','issuer']){const {file,code}=bootstrap.agentSource(role);new vm.Script(code,{filename:file});assert.ok(code.includes('port: Number(process.env.'));if(role!=='verifier')assert.ok(!code.includes('async function main'));}
});
