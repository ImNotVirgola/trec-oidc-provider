async function createVerifier(config) {
  const core=require('@credo-ts/core');
  const {agentDependencies,HttpInboundTransport}=require('@credo-ts/node');
  const {AskarModule}=require('@credo-ts/askar');
  const {ariesAskar}=require('@hyperledger/aries-askar-nodejs');
  const {AnonCredsModule,AnonCredsProofFormatService}=require('@credo-ts/anoncreds');
  const {anoncreds}=require('@hyperledger/anoncreds-nodejs');
  const {CheqdModule,CheqdModuleConfig,CheqdDidResolver,CheqdAnonCredsRegistry}=require('@credo-ts/cheqd');
  const walletConfig={id:config.walletId,key:config.walletKey,...(config.walletPath?{storage:{type:'sqlite',config:{path:config.walletPath}}}:{})};
  const agent=new core.Agent({config:{label:'TREC Verifier',walletConfig,logger:new core.ConsoleLogger(core.LogLevel.off),endpoints:[config.endpoint]},dependencies:agentDependencies,modules:{
    askar:new AskarModule({ariesAskar}),connections:new core.ConnectionsModule({autoAcceptConnections:true}),
    cheqd:new CheqdModule(new CheqdModuleConfig({networks:[{network:config.network,rpcUrl:config.rpcUrl}]})),
    dids:new core.DidsModule({resolvers:[new CheqdDidResolver()]}),
    anoncreds:new AnonCredsModule({registries:[new CheqdAnonCredsRegistry()],anoncreds}),
    proofs:new core.ProofsModule({autoAcceptProofs:core.AutoAcceptProof.ContentApproved,proofProtocols:[new core.V2ProofProtocol({proofFormats:[new AnonCredsProofFormatService()]})]})
  }});
  agent.registerOutboundTransport(new core.HttpOutboundTransport());
  agent.registerOutboundTransport(new core.WsOutboundTransport());
  agent.registerInboundTransport(new HttpInboundTransport({port:config.verifierPort}));
  try {
    // open(), unlike initialize(), cannot create a missing wallet.
    await agent.wallet.open(walletConfig);
    await agent.initialize();
    return {agent,core,close:()=>agent.shutdown()};
  } catch {
    await agent.shutdown().catch(()=>{});
    throw Error('Verifier non avviato: controllare wallet esistente, chiave, librerie native, rete e porta DIDComm. Nessun wallet creato.');
  }
}
module.exports={createVerifier};
