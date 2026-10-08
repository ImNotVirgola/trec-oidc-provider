// Local demo wallet. Uses the existing Credo agent/wallet; no provisioning.
const fs=require('node:fs'),readline=require('node:readline');
const {publicConfig}=require('./runtime/config.cjs');
function invitationUrl(value){
  const url=new URL(value.trim()),payload=url.searchParams.get('oob')||url.searchParams.get('_oob');
  if(!['http:','https:','didcomm:'].includes(url.protocol)||!payload||value.length>100000)throw Error('INVALID_INVITATION');
  // Credo receives the identical OOB payload represented by the QR.
  if(url.protocol==='didcomm:'){const result=new URL(publicConfig.verifier.endpoint);result.search=new URLSearchParams({oob:payload});return result.href;}
  return url.href;
}
function attachProofListener(holder){
  const {agent,core}=holder,pending=new Set();
  const listener=async({payload:{proofRecord:record}})=>{
    if(record.state===core.ProofState.Done){console.log('HOLDER_PRESENTATION_DONE=true');return;}
    if(record.state!==core.ProofState.RequestReceived||pending.has(record.id))return;
    pending.add(record.id);
    try{
      const selected=await agent.proofs.selectCredentialsForRequest({proofRecordId:record.id});
      await agent.proofs.acceptRequest({proofRecordId:record.id,proofFormats:selected.proofFormats});
      console.log('HOLDER_PRESENTATION_SENT=true');
    }catch{
      console.error('HOLDER_PROOF_FAILED: nessuna credenziale adatta o errore di comunicazione.');
      await agent.proofs.declineRequest({proofRecordId:record.id,sendProblemReport:true,problemReportDescription:'Unable to present requested credential'}).catch(()=>{});
    }finally{pending.delete(record.id);}
  };
  agent.events.on(core.ProofEventTypes.ProofStateChanged,listener);
  return()=>agent.events.off(core.ProofEventTypes.ProofStateChanged,listener);
}
async function main(){
  if(!process.env.TREC_HOLDER_ENV)throw Error('HOLDER_CONFIG_REQUIRED');
  const h=require('dotenv').parse(fs.readFileSync(process.env.TREC_HOLDER_ENV));
  // Container paths and DIDComm addresses only; keep the provisioned ID and key.
  for(const name of ['HOLDER_WALLET_PATH','HOLDER_ENDPOINT','HOLDER_PORT'])if(process.env[name])h[name]=process.env[name];
  const config={walletId:h.HOLDER_WALLET_ID,walletKey:h.HOLDER_WALLET_KEY||h.WALLET_KEY,walletPath:h.HOLDER_WALLET_PATH,endpoint:h.HOLDER_ENDPOINT,verifierPort:Number(h.HOLDER_PORT),network:h.CHEQD_NETWORK||publicConfig.cheqd.network,rpcUrl:publicConfig.cheqd.rpcUrl};
  if(!config.walletId||!config.walletKey||!config.endpoint||!Number.isInteger(config.verifierPort)||config.verifierPort<1)throw Error('HOLDER_CONFIG_INVALID');
  const holder=await require('./server/verifier.cjs').createVerifier(config);
  const detach=attachProofListener(holder),rl=readline.createInterface({input:process.stdin,output:process.stdout});
  console.log('HOLDER_READY=true');
  console.log('Wallet di test: ogni invito incollato autorizza la presentazione della credenziale richiesta. Incolla l’invito DIDComm/OOB; esci per terminare.');
  try{for await(const input of rl){if(input.trim()==='esci')break;try{await holder.agent.oob.receiveInvitationFromUrl(invitationUrl(input),{reuseConnection:false});console.log('HOLDER_INVITATION_ACCEPTED=true');}catch{console.error('HOLDER_INVITATION_FAILED: controlla invito, rete e scadenza.');}}}
  finally{rl.close();detach();await holder.close();}
}
if(require.main===module)main().catch(()=>{console.error('HOLDER_START_FAILED: controllare configurazione, wallet esistente, chiave, librerie native e porta. Nessun segreto mostrato.');process.exitCode=1;});
module.exports={invitationUrl,attachProofListener};
