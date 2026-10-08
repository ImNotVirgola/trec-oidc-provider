const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {invitationUrl,attachProofListener}=require('../holder.cjs');
test('holder accepts the QR payload without changing it',()=>{
  const payload=Buffer.from(JSON.stringify({'@id':'example'})).toString('base64url');
  assert.equal(new URL(invitationUrl('didcomm://?oob='+payload)).searchParams.get('oob'),payload);
  assert.equal(invitationUrl('http://localhost:3001?oob='+payload),'http://localhost:3001/?oob='+payload);
  assert.throws(()=>invitationUrl('https://example.org/no-invitation'));
});
test('holder listener serves two requests, does not duplicate pending presentation and is removable',async()=>{
  const events=new EventEmitter(),core={ProofEventTypes:{ProofStateChanged:'proof'},ProofState:{RequestReceived:'requested',Done:'done'}};let accepted=0;
  const agent={events,proofs:{selectCredentialsForRequest:async()=>({proofFormats:{}}),acceptRequest:async()=>{accepted++;},declineRequest:async()=>{}}};
  const detach=attachProofListener({agent,core}),event=id=>({payload:{proofRecord:{id,state:'requested'}}});
  events.emit('proof',event('first'));events.emit('proof',event('first'));await new Promise(r=>setImmediate(r));assert.equal(accepted,1);
  events.emit('proof',event('second'));await new Promise(r=>setImmediate(r));assert.equal(accepted,2);assert.equal(events.listenerCount('proof'),1);detach();assert.equal(events.listenerCount('proof'),0);
});
