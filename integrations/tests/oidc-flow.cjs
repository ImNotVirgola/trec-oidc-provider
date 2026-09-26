// Test harness only. Simulated authenticated accounts; NEVER used by run.cjs.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),http=require('node:http'),Module=require('node:module');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'trec-oidc-integration-'));
process.env.TREC_DATA_DIR=directory;
Object.assign(process.env,{OIDC_STORAGE_KEY:crypto.randomBytes(32).toString('hex'),COOKIES_KEY:'test-cookie-key-'.repeat(4),TREC_ID:'trec-test',CLIENT_SECRET:'test-client-secret-'.repeat(3),AUTH_ENDPOINT:'/auth',TOKEN_ENDPOINT:'/token',SCOPES:'openid trec',TREC_REDIRECT_URI:'http://localhost:3004/callback',DID_ID:'<placeholder-must-never-be-token-issuer>'});
async function main(){
 const express=require('express'),app=express(),server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const issuer='http://127.0.0.1:'+server.address().port;process.env.PROVIDER_URL=issuer;
 try {
 const bootstrap=require('../runtime/bootstrap.cjs');const file=path.resolve(__dirname,'../../provider.js');
 const factory=bootstrap.compile(file,bootstrap.sources().provider);
 const provider=await factory();require('../runtime/provider-import.cjs').safeLogs(provider);
 const accounts=require('../persistence/account-store.cjs');
 accounts.saveAccount('alice',{givenName:'Alice'});accounts.saveAccount('bob',{givenName:'Bob'});
 let consentCount=0;
 app.get('/interaction/:uid',async(req,res,next)=>{try{const d=await provider.interactionDetails(req,res);
  if(d.prompt.name==='login'){const redirectTo=await provider.interactionResult(req,res,{login:{accountId:d.params.state}},{mergeWithLastSubmission:false});return res.json({redirectTo});}
  consentCount++;
  const grant=new provider.Grant({accountId:d.session.accountId,clientId:d.params.client_id});
  if(d.prompt.details.missingOIDCScope)grant.addOIDCScope(d.prompt.details.missingOIDCScope.join(' '));
  if(d.prompt.details.missingOIDCClaims)grant.addOIDCClaims(d.prompt.details.missingOIDCClaims);
  await provider.interactionFinished(req,res,{consent:{grantId:await grant.save()}},{mergeWithLastSubmission:true});
 }catch(e){next(e)}});
 app.use(provider.callback());
 const {jwtVerify,createLocalJWKSet}=await import('jose');
 const metadata=await (await fetch(issuer+'/.well-known/openid-configuration')).json();assert.equal(metadata.issuer,issuer);
 const jwks=createLocalJWKSet(await(await fetch(metadata.jwks_uri)).json());
 async function authorize(account,scope='openid trec',cookies=new Map()){
  const verifier=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomUUID();
  let url=metadata.authorization_endpoint+'?'+new URLSearchParams({client_id:'trec-test',redirect_uri:process.env.TREC_REDIRECT_URI,response_type:'code',scope,state:account,nonce,prompt:'login',code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
  for(let n=0;n<15;n++){
   const r=await fetch(url,{redirect:'manual',headers:{cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}});
   for(const cookie of r.headers.getSetCookie()){const first=cookie.split(';')[0],index=first.indexOf('=');cookies.set(first.slice(0,index),first.slice(index+1));}
   const location=r.headers.get('content-type')?.includes('application/json')?(await r.json()).redirectTo:r.headers.get('location');assert.ok(location,'authorization response must redirect: '+r.status);
   url=new URL(location,url).href;
   if(url.startsWith(process.env.TREC_REDIRECT_URI))break;
  }
  const callback=new URL(url);assert.equal(callback.searchParams.get('state'),account);assert.equal(callback.searchParams.get('error'),null);
  const form=new URLSearchParams({grant_type:'authorization_code',code:callback.searchParams.get('code'),client_id:'trec-test',client_secret:process.env.CLIENT_SECRET,redirect_uri:process.env.TREC_REDIRECT_URI,code_verifier:verifier});
  // Token endpoint deliberately receives NO browser session cookie.
  const r=await fetch(metadata.token_endpoint,{method:'POST',body:form});const tokens=await r.json();assert.equal(r.status,200,JSON.stringify({error:tokens.error,description:tokens.error_description}));
  const id=await jwtVerify(tokens.id_token,jwks,{issuer,audience:'trec-test',algorithms:['RS256']});
  const access=await jwtVerify(tokens.access_token,jwks,{issuer,audience:'trec-test',algorithms:['RS256']});
  assert.equal(id.payload.nonce,nonce);assert.equal(id.payload.sub,account);assert.equal(access.payload.sub,account);
  if(scope.includes('trec'))assert.equal(access.payload.trec.givenName,account==='alice'?'Alice':'Bob');else assert.equal(access.payload.trec,undefined);
  return form;
 }
 const aliceCookies=new Map();
 await Promise.all([authorize('alice','openid trec',aliceCookies),authorize('bob')]);
 const previousConsentCount=consentCount;
 const repeatForm=await authorize('alice','openid trec',aliceCookies);
 assert.equal(consentCount,previousConsentCount,'second login reuses consent and must still complete');
 const replay=await fetch(metadata.token_endpoint,{method:'POST',body:repeatForm});assert.equal(replay.status,400);
 await authorize('alice','openid');
 const {spawnSync}=require('node:child_process');const fresh=spawnSync(process.execPath,['-e',"const a=require('./persistence/account-store.cjs');if(a.loadAccount('alice').givenName!=='Alice'||a.loadAccount('bob').givenName!=='Bob')process.exit(1)"],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'});assert.equal(fresh.status,0);
 console.log('OIDC_HTTP_TESTS_PASSED: discovery, PKCE, concurrent accounts, ID/access JWT signatures, issuer, audience, nonce, scope filtering, code replay, account reload');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
