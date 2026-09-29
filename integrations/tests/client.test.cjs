const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {port,browser,close}=require('./http-helpers.cjs'),{attributes,definitionId}=require('./fixture.cjs');
test('delivered client rejects signed tokens with wrong nonce, expiry, issuer, audience, claims or signature',{timeout:20000},async()=>{
  const {SignJWT,exportJWK,importPKCS8}=await import('jose');
  const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),badPair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const privateKey=await importPKCS8(pair.privateKey.export({type:'pkcs8',format:'pem'}),'RS256');const jwk=await exportJWK(pair.publicKey);Object.assign(jwk,{kid:'test',use:'sig',alg:'RS256'});
  const p=await port(),cp=await port(),issuer='http://127.0.0.1:'+p,origin='http://127.0.0.1:'+cp;
  const config={issuer,clientOrigin:origin,redirectUri:origin+'/callback',resource:issuer+'/api',clientId:'test',clientSecret:crypto.randomBytes(32).toString('hex'),definitionId};
  let scenario,nonce;
  const op=http.createServer(async(req,res)=>{try{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/.well-known/openid-configuration')return res.end(JSON.stringify({issuer,authorization_endpoint:issuer+'/auth',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks'}));
    if(req.url==='/jwks')return res.end(JSON.stringify({keys:[jwk]}));
    if(req.url==='/token'){
      const now=Math.floor(Date.now()/1000),sub=attributes().holderDid;
      const idClaims={iss:issuer,aud:config.clientId,sub,iat:now,exp:now+60,nonce};
      const accessClaims={iss:issuer,aud:config.resource,sub,iat:now,exp:now+60,scope:'trec',...attributes()};
      if(scenario==='nonce')idClaims.nonce='incorrect';
      if(scenario==='expired')idClaims.exp=now-1;
      if(scenario==='issuer')idClaims.iss=issuer+'/wrong';
      if(scenario==='audience')idClaims.aud='other-client';
      if(scenario==='missing-claim')delete accessClaims.gender;
      if(scenario==='holder-binding')accessClaims.holderDid='did:example:other';
      const signingKey=scenario==='signature'?badPair.privateKey:privateKey;
      const id_token=await new SignJWT(idClaims).setProtectedHeader({alg:'RS256',kid:'test'}).sign(signingKey);
      const access_token=await new SignJWT(accessClaims).setProtectedHeader({alg:'RS256',kid:'test',typ:'at+jwt'}).sign(privateKey);
      return res.end(JSON.stringify({id_token,access_token,token_type:'Bearer'}));
    }res.statusCode=404;res.end('{}');
  }catch{res.statusCode=500;res.end('{}');}});
  const client=await require('../local-client/client.cjs').createClient(config);await new Promise(r=>op.listen(p,'127.0.0.1',r));await new Promise(r=>client.listen(cp,'127.0.0.1',r));
  try{for(scenario of ['nonce','expired','issuer','audience','missing-claim','holder-binding','signature']){
    const b=browser(),start=await b(origin+'/login',{method:'POST',headers:{Origin:origin}});const auth=new URL(start.headers.get('location'));nonce=auth.searchParams.get('nonce');
    const result=await b(config.redirectUri+'?'+new URLSearchParams({code:'test-only-code',state:auth.searchParams.get('state')}));assert.equal(result.status,400,scenario);
  }}finally{await close(client);await close(op);}
});
