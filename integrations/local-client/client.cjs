const http=require('node:http'),crypto=require('node:crypto');
const {names}=require('../server/claims.cjs');
const random=()=>crypto.randomBytes(32).toString('base64url');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(res,status,title,content) {
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://localhost:3000; frame-ancestors 'none'"});
  res.end('<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+escape(title)+'</title><style>body{font:18px system-ui;max-width:760px;margin:50px auto;padding:24px;line-height:1.6}button{font:inherit;padding:12px 28px}td{padding:8px;overflow-wrap:anywhere}table{table-layout:fixed;width:100%}</style><h1>'+escape(title)+'</h1>'+content+'</html>');
}
async function createClient(config) {
  const {jwtVerify,createRemoteJWKSet}=await import('jose'),transactions=new Map(),demoTokens=new Map();
  const issuer=new URL(config.issuer).origin,origin=config.clientOrigin;
  function endpoint(value){const u=new URL(value);if(u.origin!==issuer||u.username||u.password)throw Error('UNTRUSTED_ENDPOINT');return u.href;}
  async function json(url,options={}){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP_FAILURE');return r.json();}
  async function discovery(){const d=await json(config.issuer+'/.well-known/openid-configuration');if(d.issuer!==config.issuer)throw Error('ISSUER_MISMATCH');for(const name of ['authorization_endpoint','token_endpoint','jwks_uri'])endpoint(d[name]);return d;}
  const server=http.createServer(async(req,res)=>{
    let stage='request';
    try {
      if(req.headers.host!==new URL(origin).host)return page(res,400,'Indirizzo non valido','Usa l’indirizzo configurato del client.');
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&url.pathname==='/demo-resource'){
        stage='protected_resource';
        const withToken=url.searchParams.get('with')==='token',headers={};
        if(withToken){
          const sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('trec_demo='))?.slice(10),demo=demoTokens.get(sid);
          if(!demo||demo.expires<=Date.now())return page(res,401,'Sessione demo scaduta','<a href="/">Ripeti il login</a>');
          headers.Authorization='Bearer '+demo.token;
        }
        const result=await fetch(new URL('/trec-api/profile',config.issuer),{headers,redirect:'error',signal:AbortSignal.timeout(15000)}),body=await result.json();
        if(!withToken&&result.status===401)console.log('PROTECTED_RESOURCE_WITHOUT_TOKEN_REJECTED=true');
        if(withToken&&result.status===200&&body.authenticated===true)console.log('PROTECTED_RESOURCE_WITH_TOKEN_OK=true');
        return page(res,result.status,'Risorsa protetta: HTTP '+result.status,'<p>GET /trec-api/profile '+(withToken?'con Authorization: Bearer [JWT non mostrato]':'senza Authorization')+'</p><pre>'+escape(JSON.stringify(body,null,2))+'</pre><p><a href="/demo-resource?with=token">Richiedi con Bearer JWT</a> | <a href="/demo-resource?with=none">Richiedi senza JWT</a> | <a href="/">Nuovo login</a></p>');
      }
      if(req.method==='GET'&&url.pathname==='/')return page(res,200,'Accesso TREC','<p>Autenticati presentando la tua credenziale dal wallet compatibile.</p><form method="post" action="/login"><button>Accedi</button></form>');
      if(req.method==='POST'&&url.pathname==='/login'){
        if(req.headers.origin!==origin)return page(res,403,'Richiesta rifiutata','Origine non valida.');
        stage='discovery';const metadata=await discovery(),sid=random(),state=random(),nonce=random(),verifier=random();
        transactions.set(sid,{state,nonce,verifier,metadata,expires:Date.now()+600000});
        const auth=new URL(metadata.authorization_endpoint);auth.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'openid trec',resource:config.resource,prompt:'login',state,nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
        res.writeHead(303,{Location:auth.href,'Cache-Control':'no-store','Set-Cookie':'trec_login='+sid+'; HttpOnly; SameSite=Lax; Path='+new URL(config.redirectUri).pathname+'; Max-Age=600'+(origin.startsWith('https:')?'; Secure':'')});return res.end();
      }
      if(req.method==='GET'&&url.pathname===new URL(config.redirectUri).pathname){
        stage='callback_state';const sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('trec_login='))?.slice(11),txn=transactions.get(sid);
        if(!txn||txn.expires<=Date.now()||url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==txn.state)throw Error('INVALID_STATE');
        transactions.delete(sid);res.setHeader('Set-Cookie','trec_login=; HttpOnly; SameSite=Lax; Path='+url.pathname+'; Max-Age=0');
        if(url.searchParams.has('error'))throw Error('LOGIN_DENIED');
        if(url.searchParams.getAll('code').length!==1||!url.searchParams.get('code'))throw Error('INVALID_CODE');
        console.log('AUTHORIZATION_CODE_OK=true');
        stage='token_exchange';const tokens=await json(endpoint(txn.metadata.token_endpoint),{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code:url.searchParams.get('code'),code_verifier:txn.verifier,resource:config.resource})});
        console.log('TOKEN_ENDPOINT_EXCHANGE_OK=true');
        if(typeof tokens.access_token!=='string'||tokens.access_token.split('.').length!==3||String(tokens.token_type).toLowerCase()!=='bearer')throw Error('JWT_ACCESS_TOKEN_REQUIRED');
        console.log('ACCESS_TOKEN_RECEIVED=true');
        const keys=createRemoteJWKSet(new URL(endpoint(txn.metadata.jwks_uri)));
        stage='id_token_verification';const id=(await jwtVerify(tokens.id_token,keys,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256'],requiredClaims:['iss','aud','sub','iat','exp','nonce']})).payload;
        if(id.nonce!==txn.nonce||typeof id.sub!=='string'||!id.sub||id.iat>Date.now()/1000+5||(id.azp!==undefined&&id.azp!==config.clientId)||(Array.isArray(id.aud)&&id.aud.length>1&&id.azp!==config.clientId))throw Error('INVALID_ID_BINDING');
        stage='access_token_verification';const access=(await jwtVerify(tokens.access_token,keys,{issuer:config.issuer,audience:config.resource,algorithms:['RS256'],typ:'at+jwt',requiredClaims:['iss','sub','aud','iat','exp',...names]})).payload;
        if(access.sub!==id.sub||access.holderDid!==id.sub||access.issuerDid!==config.definitionId.split('/resources/')[0]||names.some(name=>typeof access[name]!=='string'||!access[name].trim())||access.iat>Date.now()/1000+5||!String(access.scope||'').split(' ').includes('trec'))throw Error('INVALID_TREC_CLAIMS');
        console.log('JWT_SIGNATURE_VALID=true');console.log('JWT_ALL_TREC_CLAIMS_PRESENT=true');console.log('OIDC_LOGIN_VERIFIED=true');
        const publicClaims=new Set(['iss','aud','iat','exp','scope','client_id','issuerDid']);
        const displayPayload=Object.fromEntries(Object.entries(access).map(([name,value])=>[name,publicClaims.has(name)?value:'[presente, valore omesso]']));
        if(demoTokens.size>=1000)throw Error('DEMO_CAPACITY');
        const demoId=random();demoTokens.set(demoId,{token:tokens.access_token,expires:access.exp*1000});
        res.setHeader('Set-Cookie',['trec_login=; HttpOnly; SameSite=Lax; Path='+url.pathname+'; Max-Age=0','trec_demo='+demoId+'; HttpOnly; SameSite=Lax; Path=/demo-resource; Max-Age='+Math.max(0,Math.floor(access.exp-Date.now()/1000))+(origin.startsWith('https:')?'; Secure':'')]);
        return page(res,200,'Accesso verificato','<pre>AUTHORIZATION_CODE_OK=true\nTOKEN_ENDPOINT_EXCHANGE_OK=true\nACCESS_TOKEN_RECEIVED=true\nJWT_SIGNATURE_VALID=true\nJWT_ALL_TREC_CLAIMS_PRESENT=true</pre><p>Payload del JWT verificato; valori personali oscurati. Il token completo e il codice di autorizzazione non vengono mostrati.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+escape(JSON.stringify(displayPayload,null,2))+'</pre><p><a href="/demo-resource?with=none">1. Risorsa senza JWT</a></p><p><a href="/demo-resource?with=token">2. Stessa risorsa con Bearer JWT</a></p><a href="/">Nuovo accesso</a>');
      }
      page(res,404,'Pagina non trovata','<a href="/">Torna al client</a>');
    }catch{console.error('OIDC_LOGIN_FAILED stage='+stage);page(res,400,'Accesso non completato','<p>Verifica rifiutata, sessione scaduta o configurazione non valida. Avvia un nuovo accesso.</p><a href="/">Torna al client</a>');}
  });
  const timer=setInterval(()=>{for(const collection of [transactions,demoTokens])for(const[id,txn]of collection)if(txn.expires<=Date.now())collection.delete(id);},60000);timer.unref();server.on('close',()=>{clearInterval(timer);transactions.clear();demoTokens.clear();});return server;
}
module.exports={createClient};
