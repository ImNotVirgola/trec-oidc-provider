// Test-only simulated Credo transport and proof result. Never loaded by run.cjs.
const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const core={ConnectionEventTypes:{ConnectionStateChanged:'connection'},ProofEventTypes:{ProofStateChanged:'proof'},DidExchangeState:{Completed:'completed'},ProofState:{RequestSent:'request-sent',Done:'done',Abandoned:'abandoned',Declined:'declined'}};
const issuerDid='did:cheqd:testnet:11111111-1111-4111-8111-111111111111';
const definitionId=issuerDid+'/resources/22222222-2222-4222-8222-222222222222';
const attributes=(who='alice')=>({issuerDid,holderDid:'did:example:'+who,givenName:who,familyName:'Example',dateOfBirth:'2000-01-01',phone:'+390000000000',email:who+'@example.invalid',fiscalCode:'DEMO',gender:'unspecified'});
function fixture(){
  const events=new EventEmitter(),invitations=[],records=new Map(),formats=new Map();let early=false;
  const agent={events,oob:{createInvitation:async()=>{const id=crypto.randomUUID();const record={id,outOfBandInvitation:{toUrl:({domain})=>domain+'?oob='+Buffer.from(JSON.stringify({'@id':id,'@type':'https://didcomm.org/out-of-band/1.1/invitation',services:[{id:'#inline',type:'did-communication',serviceEndpoint:domain,recipientKeys:['did:key:z6Mktest']}]})).toString('base64url')}};invitations.push(record);return record;}},proofs:{
    requestProof:async(options)=>{const id=crypto.randomUUID(),record={id,connectionId:options.connectionId,state:core.ProofState.RequestSent};records.set(id,record);formats.set(id,{request:options.proofFormats});events.emit('proof',{payload:{proofRecord:{...record}}});if(early)present(id,attributes());return record;},
    getById:async id=>({...records.get(id)}),getFormatData:async id=>formats.get(id)
  }};
  function connect(oobId){const id=crypto.randomUUID();events.emit('connection',{payload:{connectionRecord:{id,outOfBandId:oobId,state:'completed'}}});return id;}
  function present(id,attrs,overrides={}){
    const format=formats.get(id);format.presentation={anoncreds:{requested_proof:{revealed_attrs:Object.fromEntries(Object.entries(attrs).map(([name,raw])=>[name,{raw,sub_proof_index:0}]))},identifiers:[{cred_def_id:definitionId}]}};
    if(overrides.format)overrides.format(format);
    const record=records.get(id);Object.assign(record,{state:'done',isVerified:true},overrides.record||{});events.emit('proof',{payload:{proofRecord:{...record}}});
  }
  return {agent,core,invitations,records,formats,connect,present,setEarly:value=>early=value};
}
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let n=0;n<100;n++){const result=check();if(result)return result;await new Promise(r=>setTimeout(r,5));}throw Error('Condition not reached');}
module.exports={fixture,core,definitionId,attributes,tick,until};
