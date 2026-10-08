const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {port,close}=require('./http-helpers.cjs'),{fixture,attributes,definitionId}=require('./fixture.cjs');
test('protected profile validates signature, expiry, issuer, audience, scope and TREC claims',async()=>{
  const {SignJWT,exportJWK}=await import('jose');
  const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),wrong=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const p=await port(),ap=await port(),issuer='http://127.0.0.1:'+p;
  const config={issuer,resource:issuer+'/trec-api',clientId:'test',clientSecret:'test-only',redirectUri:'http://localhost:3004/callback',definitionId,endpoint:'http://localhost:3001',timeoutMs:1000};
  const jwk={...await exportJWK(pair.publicKey),kid:'test-key',use:'sig',alg:'RS256'};
  const jwks=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[jwk]}));});
  const app=await require('../server/app.cjs').createServer({...fixture(),config,log:()=>{}});
  await new Promise(r=>jwks.listen(p,'127.0.0.1',r));await new Promise(r=>app.server.listen(ap,'127.0.0.1',r));
  try{for(const scenario of ['valid','signature','expired','issuer','audience','scope','missing','holder']){
    const now=Math.floor(Date.now()/1000),claims={iss:issuer,aud:config.resource,sub:attributes().holderDid,iat:now,exp:now+60,scope:'trec',...attributes()};
    if(scenario==='expired')claims.exp=now-1;if(scenario==='issuer')claims.iss='http://another-issuer.invalid';if(scenario==='audience')claims.aud='another-resource';if(scenario==='scope')claims.scope='openid';if(scenario==='missing')delete claims.gender;if(scenario==='holder')claims.holderDid='did:example:wrong';
    const token=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:jwk.kid,typ:'at+jwt'}).sign(scenario==='signature'?wrong.privateKey:pair.privateKey);
    const res=await fetch('http://127.0.0.1:'+ap+'/trec-api/profile',{headers:{Authorization:'Bearer '+token}});
    assert.equal(res.status,scenario==='valid'?200:scenario==='scope'?403:401,scenario);
  }}finally{await close(app.server);await close(jwks);}
});
