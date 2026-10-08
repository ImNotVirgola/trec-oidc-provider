const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,definitionId,attributes,until}=require('./fixture.cjs');
const {port,browser,reachLogin,resume,csrf,close}=require('./http-helpers.cjs');
test('real OIDC HTTP, signed JWT, nine claims, client, second login and concurrent grants; simulated Credo proof',{timeout:30000},async()=>{
  const f=fixture(),p=await port(),cp=await port(),issuer='http://127.0.0.1:'+p,origin='http://127.0.0.1:'+cp;
  const config={issuer,clientOrigin:origin,redirectUri:origin+'/callback',resource:issuer+'/trec-api',clientId:'test-client',clientSecret:crypto.randomBytes(32).toString('hex'),definitionId,endpoint:'http://localhost:3001',timeoutMs:5000};
  const app=await require('../server/app.cjs').createServer({...f,config,log:()=>{}});
  const client=await require('../local-client/client.cjs').createClient(config);
  await new Promise(r=>app.server.listen(p,'127.0.0.1',r));await new Promise(r=>client.listen(cp,'127.0.0.1',r));
  try{
    const discovery=await(await fetch(issuer+'/.well-known/openid-configuration')).json();assert.equal(discovery.issuer,issuer);console.log('OIDC_DISCOVERY_OK=true');
    assert.equal((await fetch(issuer+'/trec-api/profile')).status,401);
    assert.equal((await fetch(issuer+'/trec-api/profile',{headers:{Authorization:'Bearer fake.token.value'}})).status,401);
    console.log('PROTECTED_RESOURCE_WITHOUT_TOKEN_REJECTED=true');
    const {jwtVerify,createLocalJWKSet}=await import('jose'),keys=createLocalJWKSet(await(await fetch(discovery.jwks_uri)).json());
    async function complete(b,login,who){
      const job=app.flow.get(login.uid);assert.ok(login.html.includes('Scansiona il QR con il tuo wallet'));assert.ok(login.html.includes('data:image/png;base64,'));
      const page=await b(login.url);
      const policy=page.headers.get('content-security-policy');
      assert.equal(policy.split(';').map(s=>s.trim()).find(s=>s.startsWith('form-action ')),"form-action 'self' "+new URL(config.redirectUri).origin,'allow the configured OIDC callback origin after form submission, without wildcards');
      f.connect(job.oobId);await until(()=>job.proofId);f.present(job.proofId,attributes(who));await until(()=>job.status==='verified');
      const result=await b(login.url+'/complete',{method:'POST',headers:{Origin:issuer},body:new URLSearchParams({csrf:csrf(login.html)})});
      return resume(b,result,login.url,config.redirectUri);
    }
    async function authorize(who,b=browser()){
      const verifier=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomUUID(),state=crypto.randomUUID();
      const auth=issuer+'/auth?'+new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'openid trec',resource:config.resource,prompt:'login',state,nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
      const login=await reachLogin(b,auth),callback=new URL(await complete(b,login,who));assert.equal(callback.searchParams.get('state'),state);assert.ok(callback.searchParams.get('code'));
      return {nonce,who,form:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code:callback.searchParams.get('code'),code_verifier:verifier,resource:config.resource})};
    }
    async function exchange(item){const r=await fetch(discovery.token_endpoint,{method:'POST',body:item.form});assert.equal(r.status,200);const tokens=await r.json();
      const id=(await jwtVerify(tokens.id_token,keys,{issuer,audience:config.clientId,algorithms:['RS256']})).payload;
      const access=(await jwtVerify(tokens.access_token,keys,{issuer,audience:config.resource,algorithms:['RS256'],typ:'at+jwt'})).payload;
      assert.equal(id.nonce,item.nonce);assert.equal(id.sub,attributes(item.who).holderDid);assert.equal(access.sub,id.sub);assert.ok(access.exp>access.iat);
      for(const[name,value]of Object.entries(attributes(item.who)))assert.equal(access[name],value);
      const resource=await fetch(issuer+'/trec-api/profile',{headers:{Authorization:'Bearer '+tokens.access_token}});assert.equal(resource.status,200);assert.equal((await resource.json()).authenticated,true);
      assert.equal((await fetch(issuer+'/trec-api/profile',{headers:{Authorization:'Bearer '+tokens.id_token}})).status,401);
      await assert.rejects(jwtVerify(tokens.access_token,keys,{issuer:issuer+'/wrong',audience:config.resource}));await assert.rejects(jwtVerify(tokens.access_token,keys,{issuer,audience:'wrong'}));await assert.rejects(jwtVerify(tokens.access_token,keys,{issuer,audience:config.resource,currentDate:new Date((access.exp+1)*1000)}));
      const split=tokens.access_token.split('.');split[1]=Buffer.from(JSON.stringify({...access,sub:'attacker'})).toString('base64url');await assert.rejects(jwtVerify(split.join('.'),keys,{issuer,audience:config.resource}));
      assert.equal((await fetch(issuer+'/trec-api/profile',{headers:{Authorization:'Bearer '+split.join('.')}})).status,401);
    }
    const aliceBrowser=browser();const [alice,bob]=await Promise.all([authorize('alice',aliceBrowser),authorize('bob')]);await exchange(bob);await exchange(alice);
    console.log('AUTHORIZATION_CODE_OK=true');console.log('JWT_SIGNATURE_VALID=true');console.log('JWT_ALL_TREC_CLAIMS_PRESENT=true');
    assert.equal((await fetch(discovery.token_endpoint,{method:'POST',body:alice.form})).status,400,'authorization code is single use');
    const badPkce=await authorize('alice');badPkce.form.set('code_verifier','wrong'.repeat(12));assert.equal((await fetch(discovery.token_endpoint,{method:'POST',body:badPkce.form})).status,400);
    const repeat=await authorize('alice',aliceBrowser);await exchange(repeat);console.log('SECOND_LOGIN_OK=true');
    // Drive the delivered client, including its state cookie and actual token exchange.
    const b=browser();for(let run=0;run<2;run++){
      const start=await b(origin+'/login',{method:'POST',headers:{Origin:origin}});assert.equal(start.status,303);
      const login=await reachLogin(b,start.headers.get('location'));
      assert.equal((await b(login.url+'/complete',{method:'POST',headers:{Origin:issuer},body:new URLSearchParams({csrf:csrf(login.html)})})).status,400,'no completion before proof');
      assert.equal((await fetch(login.url+'/status')).status,400,'another browser cannot read the interaction');
      const callback=await complete(b,login,'alice'),wrong=new URL(callback);wrong.searchParams.set('state','wrong');assert.equal((await b(wrong.href)).status,400,'state mismatch rejected');
      const success=await b(callback);assert.equal(success.status,200);const html=await success.text();assert.match(html,/Accesso verificato/);assert.match(html,/ACCESS_TOKEN_RECEIVED=true/);assert.match(html,/valore omesso/);assert.equal((await b(callback)).status,400,'callback is consumed');
      assert.equal((await b(origin+'/demo-resource?with=none')).status,401);
      const withToken=await b(origin+'/demo-resource?with=token');assert.equal(withToken.status,200);assert.match(await withToken.text(),/authenticated/);
      assert.equal((await fetch(origin+'/demo-resource?with=token')).status,401);
    }
    assert.equal(f.agent.events.listenerCount('connection'),1);assert.equal(f.agent.events.listenerCount('proof'),1);
    console.log('PROOF_VERIFIED_SIMULATED=true');
  }finally{await close(client);await close(app.server);}
});
