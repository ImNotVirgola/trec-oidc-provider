const path=require('node:path');
const http=require('node:http');
const express=require('express');
async function createServer({config,agent,core,log=console.log}) {
  const oidc=await require('./provider.cjs').createProvider(config);
  const flow=require('./oidc-login.cjs').createLoginFlow({config,agent,core,log});
  const app=express();app.disable('x-powered-by');app.set('view engine','pug');app.set('views',path.resolve(__dirname,'../views'));
  const {jwtVerify,createRemoteJWKSet}=await import('jose');
  const jwtKeys=createRemoteJWKSet(new URL('/jwks',config.issuer));
  app.get('/trec-api/profile',async(req,res)=>{
    res.set('Cache-Control','no-store');
    const bearer=req.headers.authorization||'';
    if(!/^Bearer [A-Za-z0-9_.-]+$/i.test(bearer)||bearer.length>20000)return res.set('WWW-Authenticate','Bearer').status(401).json({error:'access_token_required'});
    try{
      const names=require('./claims.cjs').names;
      const {payload}=await jwtVerify(bearer.slice(7),jwtKeys,{issuer:config.issuer,audience:config.resource,algorithms:['RS256'],typ:'at+jwt',requiredClaims:['iss','sub','aud','iat','exp',...names]});
      if(payload.sub!==payload.holderDid||payload.issuerDid!==config.definitionId.split('/resources/')[0]||names.some(n=>typeof payload[n]!=='string'||!payload[n].trim())||payload.iat>Date.now()/1000+5)throw Error('INVALID_CLAIMS');
      if(!String(payload.scope||'').split(' ').includes('trec'))return res.status(403).json({error:'insufficient_scope'});
      console.log('PROTECTED_RESOURCE_WITH_TOKEN_OK=true');
      return res.json({authenticated:true,message:'Accesso alla risorsa TREC autorizzato dal JWT verificato.'});
    }catch{return res.set('WWW-Authenticate','Bearer error="invalid_token"').status(401).json({error:'invalid_access_token'});}
  });
  app.use('/public',express.static(path.resolve(__dirname,'../public'),{index:false}));
  app.use('/interaction',(req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self' "+new URL(config.redirectUri).origin+"; frame-ancestors 'none'"});next();});
  async function details(req,res) {
    const data=await oidc.provider.interactionDetails(req,res);
    if(data.uid!==req.params.uid||data.params.client_id!==config.clientId||data.prompt.name!=='login')throw Error('Interazione non valida.');
    return data;
  }
  app.get('/interaction/:uid',async(req,res,next)=>{try{
    const data=await details(req,res),job=await flow.create(data.uid,data.params.client_id);
    res.render('login',{uid:job.uid,csrf:job.csrf,qr:job.qr,invitationUrl:job.invitationUrl,status:job.message||'In attesa della verifica…',clientUrl:config.clientOrigin});
  }catch(e){next(e);}});
  app.get('/interaction/:uid/status',async(req,res,next)=>{try{
    await details(req,res);const job=flow.get(req.params.uid);if(!job)return res.status(410).json({status:'failed',message:'Sessione scaduta. Avvia un nuovo accesso.'});
    res.json({status:job.status,message:job.message});
  }catch(e){next(e);}});
  app.post('/interaction/:uid/complete',express.urlencoded({extended:false,limit:'2kb'}),async(req,res,next)=>{try{
    await details(req,res);const job=flow.get(req.params.uid);
    if(req.headers.origin!==new URL(config.issuer).origin||!job||req.body.csrf!==job.csrf)return res.status(403).send('Richiesta non valida.');
    const verified=flow.consume(job.uid);await oidc.authenticate(verified,req,res);
  }catch(e){next(e);}});
  app.use(oidc.provider.callback());
  app.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(400).type('text/plain').send('Accesso non completato o sessione scaduta. Torna al client e avvia un nuovo accesso.');});
  const server=http.createServer(app);
  server.on('close',()=>{flow.close();oidc.close();});
  return {server,flow,provider:oidc.provider};
}
module.exports={createServer};
