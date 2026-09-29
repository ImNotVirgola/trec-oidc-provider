const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,definitionId,attributes,until,tick}=require('./fixture.cjs');
const {createLoginFlow}=require('../server/oidc-login.cjs');
const config={definitionId,endpoint:'http://localhost:3001',timeoutMs:1000};
test('QR is generated locally and decodes to the exact OOB invitation',async()=>{
  const f=fixture(),flow=createLoginFlow({...f,config,log:()=>{}});
  try{const [job,same]=await Promise.all([flow.create('one','client'),flow.create('one','client')]);assert.equal(job,same);assert.equal(f.invitations.length,1);
    const {PNG}=require('pngjs'),png=PNG.sync.read(Buffer.from(job.qr.split(',')[1],'base64'));const decoded=require('jsqr')(new Uint8ClampedArray(png.data),png.width,png.height);
    assert.equal(decoded.data,job.walletInvitationUrl);
    assert.match(decoded.data,/^didcomm:\/\/\?oob=/);

    const httpOob=new URL(job.invitationUrl).searchParams.get('oob');
    const didcommOob=new URL(decoded.data).searchParams.get('oob');
    assert.equal(didcommOob,httpOob);
    assert.notEqual((await flow.create('two','client')).invitationUrl,job.invitationUrl);console.log('QR_INVITATION_CREATED=true');
  }finally{flow.close();}
});
test('all nine requested attributes, correlation, repeated connections and early proof delivery',async()=>{
  const f=fixture(),flow=createLoginFlow({...f,config,log:()=>{}});
  try{f.setEarly(true);for(const uid of ['one','two']){const job=await flow.create(uid,'client');const connection=f.connect(job.oobId);await until(()=>job.status==='verified');
      assert.equal(job.claims.holderDid,attributes().holderDid);const request=f.formats.get(job.proofId).request.anoncreds;
      for(const name of require('../server/claims.cjs').names)assert.deepEqual(request.requested_attributes[name],{name});
      f.agent.events.emit('connection',{payload:{connectionRecord:{id:connection,outOfBandId:job.oobId,state:'completed'}}});assert.equal(flow.consume(uid),job);assert.throws(()=>flow.consume(uid));
    }assert.equal(f.records.size,2);assert.equal(f.agent.events.listenerCount('connection'),1);assert.equal(f.agent.events.listenerCount('proof'),1);
  }finally{flow.close();}assert.equal(f.agent.events.listenerCount('proof'),0);
});
test('proofs cannot cross sessions and a substituted proof ID is ignored',async()=>{
  const f=fixture(),flow=createLoginFlow({...f,config,log:()=>{}});
  try{const a=await flow.create('a','client'),b=await flow.create('b','client');f.connect(a.oobId);f.connect(b.oobId);await until(()=>a.proofId&&b.proofId);
    f.agent.events.emit('proof',{payload:{proofRecord:{id:a.proofId,connectionId:b.connectionId,state:'done',isVerified:true}}});await tick();assert.equal(b.status,'waiting');
    f.present(a.proofId,attributes('alice'));await until(()=>a.status==='verified');assert.equal(b.status,'waiting');f.present(b.proofId,attributes('bob'));await until(()=>b.status==='verified');assert.notEqual(a.claims.holderDid,b.claims.holderDid);
  }finally{flow.close();}
});
for(const [label,overrides] of Object.entries({unverified:{record:{isVerified:false}},wrongDefinition:{format:f=>f.presentation.anoncreds.identifiers[0].cred_def_id='wrong'},missingAttribute:{format:f=>delete f.presentation.anoncreds.requested_proof.revealed_attrs.gender},mixedCredentials:{format:f=>f.presentation.anoncreds.requested_proof.revealed_attrs.email.sub_proof_index=1},wrongNonce:{format:f=>f.request.anoncreds.nonce='wrong'},wrongIssuer:{format:f=>f.presentation.anoncreds.requested_proof.revealed_attrs.issuerDid.raw='wrong'}})){
  test('rejects '+label,async()=>{const f=fixture(),flow=createLoginFlow({...f,config,log:()=>{}});try{const job=await flow.create('one','client');f.connect(job.oobId);await until(()=>job.proofId);f.present(job.proofId,attributes(),overrides);await until(()=>job.status==='failed');assert.throws(()=>flow.consume('one'));}finally{flow.close();}});
}
test('declined and timed-out proofs cannot complete authentication, including late events',async()=>{
  const f=fixture(),flow=createLoginFlow({...f,config:{...config,timeoutMs:200},log:()=>{}});
  try{const job=await flow.create('one','client');f.connect(job.oobId);await until(()=>job.proofId);f.present(job.proofId,attributes(),{record:{state:'abandoned'}});await until(()=>job.status==='failed');
    const other=await flow.create('two','client');f.connect(other.oobId);await until(()=>other.proofId);await until(()=>other.status==='failed');f.present(other.proofId,attributes());await tick();assert.equal(other.status,'failed');assert.throws(()=>flow.consume('two'));
  }finally{flow.close();}
});
