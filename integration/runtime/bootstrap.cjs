const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../..'),integration=path.join(root,'integration');
process.env.NODE_PATH=path.join(integration,'node_modules');Module._initPaths();
function compile(file,source){const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);return m.exports;}
function agentSource(role){const ts=require('typescript');const file=path.join(root,role==='verifier'?'verification/verifier.ts':role+'/src/'+role+'.ts');
 let s=fs.readFileSync(file,'utf8');
 s=s.replace(/port: process.env.(VERIFIER|HOLDER|ISSUER)_PORT/g,'port: Number(process.env.$1_PORT)');
 if(role==='verifier')s=s.replace('process.env.COSMOS_PAYER_SEED','process.env.VERIFIER_COSMOS_SEED').replace('console.log(e)','throw e');
 else {s=s.slice(0,s.indexOf('async function main()'));s+='\nmodule.exports = '+(role==='holder'?'{holder,rl,receiveInvitation}':'{issuer,createNewInvitation,offerCredential}')+';';}
 return {file,code:ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText};
}
function loadAgent(role){const {file,code}=agentSource(role);return compile(file,code);}
function sources(){let index=fs.readFileSync(path.join(root,'index.js'),'utf8'),provider=fs.readFileSync(path.join(root,'provider.js'),'utf8');
 index=index.replace("path.join(__dirname, 'views')", "[path.join(__dirname, 'integration/views'), path.join(__dirname, 'views')]");
 const prepared=require('./transform.cjs').prepare(index,provider);index=prepared.index;provider=prepared.provider;
 for(const prefix of ['persistence','verification/oidc-login.cjs']){index=index.split("'./"+prefix).join("'./integration/"+prefix);provider=provider.split("'./"+prefix).join("'./integration/"+prefix);}
 provider=provider.replace("await import('oidc-provider')","await require('./integration/runtime/provider-import.cjs').load()");
 index=index.replace("require('./verification/verifier.js')","require('./integration/runtime/bootstrap.cjs').loadAgent('verifier')");
 index=index.replace('app.use(bodyParser.urlencoded','app.use(\'/interaction\', bodyParser.urlencoded');
 index=index.replace('const oobId = interactionDetails.lastSubmission.login.oobId','// Consent may follow a previously authenticated session.');
 index=index.replace('const provider = await getOidcProvider()',"const provider = await getOidcProvider(); require('./integration/runtime/provider-import.cjs').safeLogs(provider)");
 index=index.trim().replace(/\}\)\s*$/, "}).catch(() => { console.error('PROVIDER_START_FAILED: controlla configurazione, wallet e porte'); process.exit(1); })");
 return {index,provider};
}
function start(){require('../verify-originals.cjs').verify();const s=sources();const filename=path.join(root,'provider.js');const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);m._compile(s.provider,filename);require.cache[filename]=m;compile(path.join(root,'index.js'),s.index);}
module.exports={loadAgent,agentSource,sources,start};if(require.main===module)start();
