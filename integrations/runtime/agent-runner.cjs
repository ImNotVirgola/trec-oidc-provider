const {loadAgent}=require('./bootstrap.cjs');
const core=require('@credo-ts/core');
async function main(){const role=process.argv[2],api=loadAgent(role),agent=api[role];require('./didcomm-debug.cjs')(agent);await agent.initialize();
 let timer,finished=false;async function stop(code){if(finished)return;finished=true;clearTimeout(timer);api.rl?.close();await agent.shutdown();process.exitCode=code;}
 const fail=(error)=>{console.error('SCAMBIO_FALLITO:',error?.message || 'timeout o errore senza dettagli');if(error?.code)console.error('CODICE_ERRORE:',error.code);if(error?.cause)console.error('CAUSA:',error.cause.message || String(error.cause));void stop(1);};
 process.once('SIGINT',()=>void stop(0));
 if(role==='holder'){
  agent.events.on(core.CredentialEventTypes.CredentialStateChanged,async({payload:{credentialRecord:r}})=>{try{
   console.log('Credenziale: '+r.state);
   if(r.state===core.CredentialState.OfferReceived)await agent.credentials.acceptOffer({credentialRecordId:r.id});
   else if(r.state===core.CredentialState.CredentialReceived){
    await agent.credentials.acceptCredential({credentialRecordId:r.id});
    console.log('HOLDER_CREDENTIAL_ACK_SENT=true');
    await stop(0);
   }
   else if(r.state===core.CredentialState.Abandoned)await stop(1);
  }catch(error){fail(error);}});
  agent.events.on(core.ProofEventTypes.ProofStateChanged,async({payload:{proofRecord:r}})=>{try{
   console.log('Prova: '+r.state);
   if(r.state===core.ProofState.RequestReceived){const c=await agent.proofs.selectCredentialsForRequest({proofRecordId:r.id});await agent.proofs.acceptRequest({proofRecordId:r.id,proofFormats:c.proofFormats});}
   else if(r.state===core.ProofState.Done)await stop(0);
   else if([core.ProofState.Abandoned,core.ProofState.Declined].includes(r.state))await stop(1);
  }catch(error){fail(error);}});
  api.rl.question('Incolla invito Issuer o Verifier:\n',url=>{timer=setTimeout(fail,180000);api.receiveInvitation(url.trim()).catch(fail);});
 }else{
  await require('../setup/native.cjs').inspectIssuer(agent,process.env);
  let offered=false,connectionId;const {outOfBandRecord,invitationUrl}=await api.createNewInvitation();
  agent.events.on(core.CredentialEventTypes.CredentialStateChanged,async({payload:{credentialRecord:r}})=>{if(r.connectionId!==connectionId)return;try{
   console.log('Credenziale: '+r.state);if(r.state===core.CredentialState.RequestReceived)await agent.credentials.acceptRequest({credentialRecordId:r.id});
   if(r.state===core.CredentialState.Done){
    console.log('ISSUER_CREDENTIAL_ACK_RECEIVED=true');
    setTimeout(()=>void stop(0),3000);
   }
   if(r.state===core.CredentialState.Abandoned)await stop(1);
  }catch(error){fail(error);}});
  agent.events.on(core.ConnectionEventTypes.ConnectionStateChanged,({payload:{connectionRecord:r}})=>{if(!offered&&r.outOfBandId===outOfBandRecord.id&&r.state===core.DidExchangeState.Completed){offered=true;connectionId=r.id;api.offerCredential(r.id,process.env.CREDENTIAL_DEFINITION_ID).catch(fail);}});
  timer=setTimeout(fail,180000);console.log('Invito Issuer (credenziale dimostrativa originale):\n'+invitationUrl);
 }
}
main().catch(()=>{console.error('AGENT_START_FAILED: controlla configurazione e wallet esistente');process.exit(1);});
