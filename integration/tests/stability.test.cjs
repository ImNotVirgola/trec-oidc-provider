const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const source = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'trec-stability-test-'));
for (const folder of ['persistence', 'verification']) {
  fs.mkdirSync(path.join(fixture, folder));
  for (const name of fs.readdirSync(path.join(source, folder))) {
    if (name.endsWith('.cjs')) fs.copyFileSync(path.join(source, folder, name), path.join(fixture, folder, name));
  }
}
process.env.OIDC_STORAGE_KEY = crypto.randomBytes(32).toString('hex');
const Adapter = require(path.join(fixture, 'persistence/adapter.cjs'));
const db = require(path.join(fixture, 'persistence/storage.cjs'));

test('encrypted records survive a fresh process; consumed state and TTL survive', async () => {
  const adapter = new Adapter('AuthorizationCode');
  await adapter.upsert('code-one', { grantId: 'grant-one', marker: 'SECRET-PAYLOAD' }, 3600);
  await adapter.consume('code-one');
  const result = spawnSync(process.execPath, ['-e',
    "const A=require('./persistence/adapter.cjs');new A('AuthorizationCode').find('code-one').then(x=>{if(!x?.consumed||x.marker!=='SECRET-PAYLOAD')process.exitCode=1})"],
    { cwd: fixture, env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 0);
  for (const name of fs.readdirSync(path.join(fixture, '.oidc-data'))) {
    assert.ok(!fs.readFileSync(path.join(fixture, '.oidc-data', name), 'utf8').includes('SECRET-PAYLOAD'));
  }
  await adapter.upsert('expired', { marker: 'old' }, 0);
  assert.equal(await adapter.find('expired'), undefined);
});
test('indexes and grant revocation work across token models', async () => {
  const sessions = new Adapter('Session');
  const access = new Adapter('AccessToken');
  const refresh = new Adapter('RefreshToken');
  await sessions.upsert('session-one', { uid: 'uid-one' }, 3600);
  assert.equal((await sessions.findByUid('uid-one')).uid, 'uid-one');
  const device = new Adapter('DeviceCode');
  await device.upsert('device-one', { userCode: 'user-code' }, 3600);
  assert.equal((await device.findByUserCode('user-code')).userCode, 'user-code');
  await access.upsert('access-one', { grantId: 'grant-one' }, 3600);
  await refresh.upsert('refresh-one', { grantId: 'grant-one' }, 3600);
  await access.upsert('access-other', { grantId: 'grant-other' }, 3600);
  await access.revokeByGrantId('grant-one');
  assert.equal(await access.find('access-one'), undefined);
  assert.equal(await refresh.find('refresh-one'), undefined);
  assert.ok(await access.find('access-other'));
});
test('wrong encryption key fails closed', () => {
  const result = spawnSync(process.execPath, ['-e',
    "const db=require('./persistence/storage.cjs');db.getRecord('Session','session-one')"],
    { cwd: fixture, env: { ...process.env, OIDC_STORAGE_KEY: '00'.repeat(32) }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
});
test('Express touch preserves previously saved account data', async () => {
  const { createStore } = require(path.join(fixture, 'persistence/session-store.cjs'));
  const store = createStore({ Store: EventEmitter });
  const call = (name, ...args) => new Promise((resolve, reject) => store[name](...args, (e, value) => e ? reject(e) : resolve(value)));
  await call('set', 'express-one', { cookie: {}, customData: { givenName: 'Example' } });
  await call('touch', 'express-one', { cookie: { expires: new Date(Date.now() + 3600000) } });
  assert.equal((await call('get', 'express-one')).customData.givenName, 'Example');
  const other = createStore({ Store: EventEmitter });
  const restored = await new Promise((resolve, reject) => other.get('express-one', (e, x) => e ? reject(e) : resolve(x)));
  assert.equal(restored.customData.givenName, 'Example');
  await call('destroy', 'express-one');
  assert.equal(await call('get', 'express-one'), null);
});
test('signing keys and explicit TTL survive reconfiguration', () => {
  process.env.COOKIES_KEY = 'test-cookie-key';
  const { withPersistence } = require(path.join(fixture, 'persistence/provider.cjs'));
  const first = withPersistence({});
  const second = withPersistence({});
  assert.deepEqual(first.jwks, second.jwks);
  assert.equal(typeof first.ttl.Grant, 'number');
  assert.equal(typeof first.ttl.Session, 'number');
});

const { createLoginFlow } = require(path.join(fixture, 'verification/oidc-login.cjs'));
const core = {
  ConnectionEventTypes: { ConnectionStateChanged: 'connection' },
  DidExchangeState: { Completed: 'completed' },
  ProofEventTypes: { ProofStateChanged: 'proof' },
  ProofState: { RequestSent: 'request-sent', Done: 'done', Abandoned: 'abandoned', Declined: 'declined' }
};
const definition = 'did:cheqd:testnet:issuer/resources/definition';
process.env.CREDENTIAL_DEFINITION_ID = definition;
function fixtureFlow(timeoutMs = 5000) {
  const events = new EventEmitter();
  let requests = 0;
  const completed = [];
  const names = ['holderDid', 'issuerDid', 'givenName', 'familyName', 'dateOfBirth', 'phone', 'email', 'fiscalCode', 'gender'];
  const attrs = Object.fromEntries(names.map(name => [name, { raw: name, sub_proof_index: 0 }]));
  attrs.issuerDid.raw = 'did:cheqd:testnet:issuer';
  const agent = { events, connections: { getAll: async () => [] },
    proofs: { getFormatData: async () => ({ presentation: { anoncreds: {
      requested_proof: { revealed_attrs: attrs }, identifiers: [{ cred_def_id: definition }]
    } } }) } };
  const provider = {
    interactionDetails: async req => ({ uid: req.params.uid, prompt: { name: 'login' } }),
    interactionResult: async (req, res, result) => { completed.push({ uid: req.params.uid, result }); return '/auth/resume'; }
  };
  const flow = createLoginFlow({ agent, provider, core, timeoutMs,
    requestProof: async (_, connectionId) => {
      requests++;
      events.emit('proof', { payload: { proofRecord: { id: 'proof-' + connectionId, connectionId, state: 'request-sent' } } });
    }
  });
  function request(uid) {
    const req = { params: { uid }, body: { oob_id: 'oob-' + uid }, sessionID: 'browser-' + uid,
      session: { save: cb => cb() } };
    const res = new EventEmitter();
    res.status = status => { res.statusCode = status; return res; };
    res.send = message => { res.message = message; res.writableEnded = true; return res; };
    res.json = body => { res.body = body; res.writableEnded = true; return res; };
    return { req, res };
  }
  function connect(uid) { events.emit('connection', { payload: { connectionRecord: {
    id: 'conn-' + uid, outOfBandId: 'oob-' + uid, state: 'completed'
  } } }); }
  function done(uid, verified = true) { events.emit('proof', { payload: { proofRecord: {
    id: 'proof-conn-' + uid, connectionId: 'conn-' + uid, state: 'done', isVerified: verified
  } } }); }
  return { flow, request, connect, done, events, agent, completed, attrs, requests: () => requests };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('two sequential logins, duplicated events, bounded listeners and one completion per proof', async () => {
  const f = fixtureFlow();
  try {
    for (const uid of ['one', 'two']) {
      const { req, res } = f.request(uid);
      await f.flow.bindInvitation(req, uid, 'oob-' + uid);
      await f.flow.start(req, res);
      f.connect(uid); f.connect(uid);
      await tick();
      f.done(uid); f.done(uid);
      await tick();
      assert.equal(f.flow.activeCount(), 0);
      assert.equal(res.listenerCount('close'), 0);
    }
    assert.equal(f.requests(), 2);
    assert.equal(f.completed.length, 2);
    assert.equal(f.events.listenerCount('connection'), 1);
    assert.equal(f.events.listenerCount('proof'), 1);
  } finally { f.flow.close(); }
  assert.equal(f.events.listenerCount('proof'), 0);
});
test('invitation/session mismatch is rejected before requesting proof', async () => {
  const f = fixtureFlow();
  try {
    const { req, res } = f.request('one');
    await f.flow.bindInvitation(req, 'one', 'different-oob');
    await f.flow.start(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(f.requests(), 0);
  } finally { f.flow.close(); }
});
test('completed connection before HTTP request is recovered', async () => {
  const f = fixtureFlow();
  try {
    f.agent.connections.getAll = async () => [{ id: 'conn-one', outOfBandId: 'oob-one', state: 'completed' }];
    const { req, res } = f.request('one');
    await f.flow.bindInvitation(req, 'one', 'oob-one');
    await f.flow.start(req, res);
    await tick(); f.done('one'); await tick();
    assert.equal(f.requests(), 1);
    assert.equal(f.completed.length, 1);
  } finally { f.flow.close(); }
});
test('failed cryptographic verification and mixed credentials never log in', async () => {
  for (const mixed of [false, true]) {
    const f = fixtureFlow();
    try {
      const { req, res } = f.request('one');
      await f.flow.bindInvitation(req, 'one', 'oob-one');
      await f.flow.start(req, res); f.connect('one'); await tick();
      if (mixed) f.attrs.email.sub_proof_index = 1;
      f.done('one', mixed); await tick();
      assert.equal(f.completed[0].result.error, 'access_denied');
      assert.equal(f.completed[0].result.login, undefined);
    } finally { f.flow.close(); }
  }
});
test('timeout and disconnect clean up; late proof cannot finish a cancelled login', async () => {
  const f = fixtureFlow(20);
  try {
    const first = f.request('one');
    await f.flow.bindInvitation(first.req, 'one', 'oob-one');
    await f.flow.start(first.req, first.res); f.connect('one'); await tick();
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(f.completed[0].result.error, 'access_denied');
    f.done('one'); await tick(); assert.equal(f.completed.length, 1);
    const second = f.request('two');
    await f.flow.bindInvitation(second.req, 'two', 'oob-two');
    await f.flow.start(second.req, second.res);
    second.res.emit('close');
    assert.equal(f.flow.activeCount(), 0);
    assert.equal(second.res.listenerCount('close'), 0);
  } finally { f.flow.close(); }
});
