const test=require('node:test'),assert=require('node:assert/strict');
test('native Askar and AnonCreds availability (not an end-to-end proof)',t=>{
  try{
    const askar=require('@hyperledger/aries-askar-nodejs').ariesAskarNodeJS.version();
    const anoncreds=require('@hyperledger/anoncreds-nodejs').anoncredsNodeJS.version();
    assert.equal(typeof askar,'string');assert.equal(typeof anoncreds,'string');console.log('NATIVE_LIBRARIES_AVAILABLE=true');
  }catch{console.log('NATIVE_LIBRARIES_AVAILABLE=false');t.skip('FFI o librerie native non disponibili in questo ambiente. Nessuna prova Credo reale eseguita.');}
});
