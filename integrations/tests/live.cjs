// Opt-in real-wallet E2E. Opens EXISTING wallets only, never registers or issues anything.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {browser,reachLogin,resume,csrf,close}=require('./http-helpers.cjs');
let stage='configurazione';
async function main(){
  if(!process.env.TREC_HOLDER_ENV||!process.env.TREC_AUTH_ENV)throw Error('LIVE_TEST_NOT_RUN: impostare TREC_AUTH_ENV e TREC_HOLDER_ENV con percorsi esterni di wallet già configurati.');
  const config=require('../runtime/config.cjs').loadConfig(),raw=require('dotenv').parse(fs.readFileSync(path.resolve(process.env.TREC_HOLDER_ENV)));
  const holderConfig={...config,walletId:raw.HOLDER_WALLET_ID,walletKey:raw.WALLET_KEY||raw.HOLDER_WALLET_KEY,walletPath:raw.HOLDER_WALLET_PATH,endpoint:raw.HOLDER_ENDPOINT,verifierPort:Number(raw.HOLDER_PORT),did:raw.DID_ID};
  if(!holderConfig.walletId||!holderConfig.walletKey||!holderConfig.endpoint||!Number.isInteger(holderConfig.verifierPort)||holderConfig.walletId===config.walletId||holderConfig.verifierPort===config.verifierPort)throw Error('LIVE_TEST_NOT_RUN: configurazione Holder assente o non distinta dal Verifier.');
  const {createVerifier}=require('../server/verifier.cjs');let verifier,holder,app,client;
  try{
    stage='apertura wallet Verifier';verifier=await createVerifier(config);
    stage='apertura wallet Holder';holder=await createVerifier(holderConfig);
    stage='avvio servizi';
    app=await require('../server/app.cjs').createServer({...verifier,config});client=await require('../local-client/client.cjs').createClient(config);
    await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(Number(new URL(config.issuer).port||80),config.bindHost,r);});
    await new Promise((r,j)=>{client.once('error',j);client.listen(Number(new URL(config.clientOrigin).port||80),config.clientBindHost,r);});
    const seen=new Set();let holderError=false;
    holder.agent.events.on(holder.core.ProofEventTypes.ProofStateChanged,async({payload:{proofRecord:r}})=>{
      if(r.state!==holder.core.ProofState.RequestReceived||seen.has(r.id))return;seen.add(r.id);
      try{const selected=await holder.agent.proofs.selectCredentialsForRequest({proofRecordId:r.id});await holder.agent.proofs.acceptRequest({proofRecordId:r.id,proofFormats:selected.proofFormats});}catch{holderError=true;console.error('LIVE_HOLDER_PROOF_ERROR: controllare presenza della credenziale e comunicazione DIDComm.');}
    });
    const b=browser(),connectionsBefore=verifier.agent.events.listenerCount?.(verifier.core.ConnectionEventTypes.ConnectionStateChanged);
    const discovery=await(await fetch(config.issuer+'/.well-known/openid-configuration')).json();assert.equal(discovery.issuer,config.issuer);console.log('OIDC_DISCOVERY_OK=true');
    assert.equal((await fetch(config.issuer+'/trec-api/profile')).status,401);
    console.log('PROTECTED_RESOURCE_WITHOUT_TOKEN_REJECTED=true');
    for(let run=0;run<2;run++){
      stage='login '+(run+1)+': invito e proof';
      const start=await b(config.clientOrigin+'/login',{method:'POST',headers:{Origin:config.clientOrigin}}),login=await reachLogin(b,start.headers.get('location'));
      // Decode the actual image rendered by the server; do not take the URL from internal state.
      const png=require('pngjs').PNG.sync.read(Buffer.from(login.html.match(/src="data:image\/png;base64,([^"]+)"/)[1],'base64'));
      const decoded=require('jsqr')(new Uint8ClampedArray(png.data),png.width,png.height);assert.ok(decoded?.data);console.log('QR_INVITATION_CREATED=true');
      const walletUri=new URL(decoded.data);
      assert.equal(walletUri.protocol,'didcomm:');

      const oobPayload=
        walletUri.searchParams.get('oob') ??
        walletUri.searchParams.get('_oob');

      assert.ok(oobPayload);

      const holderInvitationUrl=
        config.endpoint+'?oob='+encodeURIComponent(oobPayload);

      await holder.agent.oob.receiveInvitationFromUrl(
        holderInvitationUrl,
        {reuseConnection:false}
      );
      const deadline=Date.now()+config.timeoutMs;let status;
      while(Date.now()<deadline){status=await(await b(login.url+'/status')).json();if(['verified','failed'].includes(status.status)||holderError)break;await new Promise(r=>setTimeout(r,250));}
      if(status?.status!=='verified'){
        console.error('LIVE_PROOF_STATUS='+JSON.stringify(status));
      }
      assert.equal(holderError,false);
      assert.equal(status?.status,'verified');console.log('PROOF_VERIFIED=true');
      stage='login '+(run+1)+': authorization code';
      const result=await b(login.url+'/complete',{method:'POST',headers:{Origin:new URL(config.issuer).origin},body:new URLSearchParams({csrf:csrf(login.html)})});
      const callback=await resume(b,result,login.url,config.redirectUri);assert.ok(new URL(callback).searchParams.get('code'));console.log('AUTHORIZATION_CODE_OK=true');
      stage='login '+(run+1)+': token endpoint e verifica JWT';
      const success=await b(callback);assert.equal(success.status,200);const html=await success.text();assert.match(html,/Accesso verificato/);
      for(const marker of ['AUTHORIZATION_CODE_OK=true','TOKEN_ENDPOINT_EXCHANGE_OK=true','ACCESS_TOKEN_RECEIVED=true','JWT_SIGNATURE_VALID=true','JWT_ALL_TREC_CLAIMS_PRESENT=true'])assert.ok(html.includes(marker),marker);
      stage='login '+(run+1)+': richiesta Bearer';
      assert.equal((await b(config.clientOrigin+'/demo-resource?with=none')).status,401);
      console.log('PROTECTED_RESOURCE_WITHOUT_TOKEN_REJECTED=true');
      const resource=await b(config.clientOrigin+'/demo-resource?with=token');assert.equal(resource.status,200);assert.match(await resource.text(),/authenticated/);
      console.log('PROTECTED_RESOURCE_WITH_TOKEN_OK=true');
    }
    if(connectionsBefore!==undefined)assert.equal(verifier.agent.events.listenerCount(verifier.core.ConnectionEventTypes.ConnectionStateChanged),connectionsBefore);
    console.log('SECOND_LOGIN_OK=true');
  }finally{await close(client);await close(app?.server);if(holder)await holder.close();if(verifier)await verifier.close();}
}
main().catch((e)=>{
  console.error('LIVE_TEST_STAGE='+stage);
  if(stage==='configurazione'&&(!process.env.TREC_AUTH_ENV||!process.env.TREC_HOLDER_ENV))console.error('LIVE_TEST_NOT_RUN: impostare i percorsi esterni TREC_AUTH_ENV e TREC_HOLDER_ENV.');
  console.error('LIVE_TEST_FAILED_OR_NOT_RUN: verificare prerequisiti nativi, configurazioni esterne, credenziale, porte e rete. Nessun segreto mostrato.');
  process.exitCode=1;
});
