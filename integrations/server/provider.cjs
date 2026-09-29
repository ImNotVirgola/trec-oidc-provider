const crypto=require('node:crypto');
async function createProvider(config) {
  const {Provider,errors}=await import('oidc-provider');
  const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...privateKey.export({format:'jwk'}),kid:crypto.randomUUID(),use:'sig',alg:'RS256'};
  const snapshots=new Map(),accounts=new Set();
  const provider=new Provider(config.issuer,{
    clients:[{client_id:config.clientId,client_secret:config.clientSecret,redirect_uris:[config.redirectUri],response_types:['code'],grant_types:['authorization_code'],token_endpoint_auth_method:'client_secret_post',id_token_signed_response_alg:'RS256'}],
    jwks:{keys:[jwk]},cookies:{keys:[config.cookieSecret||crypto.randomBytes(32).toString('hex')]},
    claims:{openid:['sub']},scopes:['openid'],
    pkce:{required:()=>true,methods:['S256']},
    features:{devInteractions:{enabled:false},userinfo:{enabled:false},resourceIndicators:{enabled:true,defaultResource:()=>config.resource,useGrantedResource:()=>true,
      getResourceServerInfo:async(ctx,resource,client)=>{
        if(resource!==config.resource||client.clientId!==config.clientId)throw new errors.InvalidTarget();
        return {scope:'trec',audience:config.resource,accessTokenFormat:'jwt',accessTokenTTL:600,jwt:{sign:{alg:'RS256'}}};
      }}},
    interactions:{url:async(ctx,interaction)=>'/interaction/'+interaction.uid},
    findAccount:async(ctx,id)=>accounts.has(id)?{accountId:id,claims:async()=>({sub:id})}:undefined,
    extraTokenClaims:async(ctx,token)=>{
      const snapshot=snapshots.get(token.grantId);
      if(!snapshot||snapshot.expires<=Date.now()||snapshot.claims.holderDid!==token.accountId||snapshot.clientId!==token.clientId)throw Error('Verified authentication unavailable');
      if(!String(token.scope||'').split(' ').includes('trec'))throw Error('TREC scope required');
      return {...snapshot.claims};
    },
    ttl:{AccessToken:600,IdToken:600,AuthorizationCode:60,Interaction:600,Session:1800,Grant:1800},
    routes:{authorization:'/auth',token:'/token',jwks:'/jwks'}
  });
  for(const event of ['server_error','interaction.error'])provider.on(event,()=>console.error('OIDC_REQUEST_FAILED'));
  const timer=setInterval(()=>{
    for(const[id,snapshot]of snapshots)if(snapshot.expires<=Date.now())snapshots.delete(id);
    for(const id of accounts)if(![...snapshots.values()].some(s=>s.claims.holderDid===id))accounts.delete(id);
  },60000);timer.unref();
  async function authenticate(job,req,res) {
    const grant=new provider.Grant({accountId:job.claims.holderDid,clientId:job.clientId});
    grant.addOIDCScope('openid');grant.addResourceScope(config.resource,'trec');
    const grantId=await grant.save();
    snapshots.set(grantId,{claims:job.claims,clientId:job.clientId,expires:Date.now()+1800000});accounts.add(job.claims.holderDid);
    await provider.interactionFinished(req,res,{login:{accountId:job.claims.holderDid,amr:['anoncreds'],remember:false},consent:{grantId}},{mergeWithLastSubmission:false});
  }
  return {provider,authenticate,close(){clearInterval(timer);snapshots.clear();accounts.clear();}};
}
module.exports={createProvider};
