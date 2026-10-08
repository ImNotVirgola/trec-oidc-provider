const crypto=require('node:crypto');
const claims=require('./claims.cjs');
function createLoginFlow({agent,core,config,log=console.log}) {
  const jobs=new Map(),byOob=new Map(),byConnection=new Map();
  function fail(job,message) {if(!['waiting','verified'].includes(job.status))return;job.status='failed';job.message=message;clearTimeout(job.timer);if(job.connectionId)byConnection.delete(job.connectionId);}
  async function inspect(job,record) {
    if(job.status!=='waiting'||record.id!==job.proofId||record.connectionId!==job.connectionId)return;
    if([core.ProofState.Abandoned,core.ProofState.Declined].includes(record.state))return fail(job,'La richiesta di prova è stata rifiutata. Avvia un nuovo accesso.');
    if(record.state!==core.ProofState.Done||job.processing||!job.proofNonce)return;
    job.processing=true;
    if(record.isVerified!==true)return fail(job,'La prova della credenziale non è valida.');
    try {
      const data=await agent.proofs.getFormatData(record.id);
      if(job.status!=='waiting')return;
      job.claims=claims.extract(data,config.definitionId,job.proofNonce);job.status='verified';
      byConnection.delete(job.connectionId);log('PROOF_VERIFIED=true');
    }catch(error){
      log('PROOF_CLAIMS_ERROR=' + (error?.message || 'unknown'));
      fail(job,'La prova non contiene tutti gli attributi TREC della credenziale richiesta.');
    }
  }
  async function connect(job,record) {
    if(!job||job.status!=='waiting'||job.connectionId||record.state!==core.DidExchangeState.Completed||record.outOfBandId!==job.oobId)return;
    job.connectionId=record.id;byConnection.set(record.id,job);
    try {
      const proof=await agent.proofs.requestProof({protocolVersion:'v2',connectionId:record.id,proofFormats:{anoncreds:claims.request(config.definitionId,job.nonce)}});
      if(job.status!=='waiting')return;
      job.proofId=proof.id;

      // Credo 0.5.x può generare internamente il nonce AnonCreds.
      // Salviamo quindi quello realmente presente nella richiesta inviata.
      const requestData=await agent.proofs.getFormatData(proof.id);
      const actualNonce=requestData?.request?.anoncreds?.nonce;

      if(actualNonce===undefined || actualNonce===null){
        throw Error('proof_nonce_missing');
      }

      job.proofNonce=String(actualNonce);
      // The response can arrive before requestProof resolves: reread the stored record.
      await inspect(job,await agent.proofs.getById(proof.id));
    }catch{fail(job,'Impossibile richiedere la prova al wallet. Riprova.');}
  }
  const connectionListener=({payload})=>{void connect(byOob.get(payload.connectionRecord.outOfBandId),payload.connectionRecord).catch(()=>{});};
  const proofListener=({payload})=>{const job=byConnection.get(payload.proofRecord.connectionId);if(job)void inspect(job,payload.proofRecord).catch(()=>fail(job,'Verifica non completata.'));};
  agent.events.on(core.ConnectionEventTypes.ConnectionStateChanged,connectionListener);
  agent.events.on(core.ProofEventTypes.ProofStateChanged,proofListener);
  async function create(uid,clientId) {
    const existing=jobs.get(uid);if(existing)return existing.ready;
    if(jobs.size>=100)throw Error('Troppe richieste di accesso. Riprova fra qualche minuto.');
    const job={uid,clientId,status:'waiting',csrf:crypto.randomBytes(32).toString('hex'),nonce:BigInt('0x'+crypto.randomBytes(10).toString('hex')).toString(),deadline:Date.now()+config.timeoutMs};
    jobs.set(uid,job);
    job.timer=setTimeout(()=>fail(job,'Tempo scaduto. Avvia un nuovo accesso e scansiona il nuovo QR.'),config.timeoutMs);job.timer.unref?.();
    job.ready=(async()=>{
      try {
        const oob=await agent.oob.createInvitation({autoAcceptConnection:true});
        job.oobId=oob.id;
        job.invitationUrl=oob.outOfBandInvitation.toUrl({domain:config.endpoint});
        byOob.set(oob.id,job);

        // BC Wallet / BC Services Card riconosce l'invito OOB
        // nel QR attraverso lo schema DIDComm.
        const invitation=new URL(job.invitationUrl);
        const oobPayload=
          invitation.searchParams.get('oob') ??
          invitation.searchParams.get('_oob');

        if(!oobPayload)throw Error('Payload OOB assente');

        job.walletInvitationUrl=
          'didcomm://?oob='+encodeURIComponent(oobPayload);

        const qrcode=require('qrcode');
        job.qr=await qrcode.toDataURL(
          job.walletInvitationUrl,
          {errorCorrectionLevel:'M',margin:6,width:700}
        );
        log('QR_INVITATION_CREATED=true');return job;
      }catch{fail(job,'Impossibile creare il QR. Controllare il Verifier.');return job;}
    })();return job.ready;
  }
  const sweep=setInterval(()=>{for(const[uid,job]of jobs)if(job.deadline+60000<Date.now()){clearTimeout(job.timer);jobs.delete(uid);byOob.delete(job.oobId);if(job.connectionId)byConnection.delete(job.connectionId);}},30000);sweep.unref();
  return {create,get:uid=>jobs.get(uid),
    consume(uid) {const job=jobs.get(uid);if(!job||job.status!=='verified'||job.deadline<=Date.now())throw Error('Prova assente o scaduta.');job.status='completing';clearTimeout(job.timer);byOob.delete(job.oobId);return job;},
    close(){clearInterval(sweep);for(const job of jobs.values())clearTimeout(job.timer);jobs.clear();byOob.clear();byConnection.clear();agent.events.off(core.ConnectionEventTypes.ConnectionStateChanged,connectionListener);agent.events.off(core.ProofEventTypes.ProofStateChanged,proofListener);},
    size:()=>jobs.size
  };
}
module.exports={createLoginFlow};
