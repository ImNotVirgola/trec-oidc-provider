const { saveAccount } = require('../persistence/account-store.cjs');
function createLoginFlow({ agent, provider, requestProof, core = require('@credo-ts/core'), timeoutMs = 180000 }) {
  const { ConnectionEventTypes, DidExchangeState, ProofEventTypes, ProofState } = core;
  const jobs = new Map();
  const save = req => new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
  function release(job) {
    clearTimeout(job.timer);
    jobs.delete(job.uid);
    job.res.off('close', job.onClose);
  }
  async function finish(job, error, data, accountId) {
    if (job.finished) return;
    job.finished = true;
    release(job);
    try {
      if (job.res.destroyed || job.res.writableEnded) return;
      let result;
      if (error) {
        console.log('OIDC_PROOF_FAILED=' + error);
        result = { error: 'access_denied', error_description: 'Verifica credenziale non completata.' };
      } else {
        saveAccount(accountId, data);
          job.req.session.customData = data;
        job.req.session.accountId = accountId;
        await save(job.req);
        result = { login: { accountId, oobId: job.oobId } };
        console.log('OIDC_PROOF_VERIFIED=true');
      }
      const redirectTo = await provider.interactionResult(job.req, job.res, result, { mergeWithLastSubmission: false });
      job.res.status(200).json({ redirectTo });
    } catch {
      console.error('OIDC_INTERACTION_FINISH_FAILED');
      if (!job.res.headersSent && !job.res.destroyed) job.res.status(500).send('Login non completato. Avvia un nuovo tentativo.');
    }
  }
  function acceptConnection(job, record) {
    if (job.finished || job.connectionId || record.outOfBandId !== job.oobId || record.state !== DidExchangeState.Completed) return;
    job.connectionId = record.id;
    console.log('OIDC_CONNECTION_COMPLETED');
    Promise.resolve().then(() => {
      if (!job.finished) return requestProof(agent, record.id);
    }).catch(() => finish(job, 'request_failed'));
  }
  function onConnection({ payload }) {
    for (const job of jobs.values()) acceptConnection(job, payload.connectionRecord);
  }
  async function inspectProof(job, record) {
    if (record.state === ProofState.Abandoned || record.state === ProofState.Declined) {
      return finish(job, 'proof_declined');
    }
    if (record.state !== ProofState.Done || job.processing) return;
    job.processing = true;
    if (record.isVerified !== true) return finish(job, 'not_verified');
    try {
      const formats = await agent.proofs.getFormatData(record.id);
      if (job.finished) return;
      const presentation = formats.presentation?.anoncreds;
      const attrs = presentation?.requested_proof?.revealed_attrs;
      const names = ['holderDid', 'issuerDid', 'givenName', 'familyName', 'dateOfBirth', 'phone', 'email', 'fiscalCode', 'gender'];
      if (!attrs || names.some(name => typeof attrs[name]?.raw !== 'string')) throw new Error();
      const index = attrs.holderDid.sub_proof_index;
      if (!Number.isInteger(index) || index < 0 || names.some(name => attrs[name].sub_proof_index !== index)) throw new Error();
      if (presentation.identifiers?.[index]?.cred_def_id !== process.env.CREDENTIAL_DEFINITION_ID) throw new Error();
      const expectedIssuer = process.env.CREDENTIAL_DEFINITION_ID.split('/resources/')[0];
      if (attrs.issuerDid.raw !== expectedIssuer || !attrs.holderDid.raw.trim()) throw new Error();
      const data = Object.fromEntries(names.filter(name => name !== 'holderDid').map(name => [name, attrs[name].raw]));
      await finish(job, null, data, attrs.holderDid.raw);
    } catch { await finish(job, 'invalid_proof_data'); }
  }
  function onProof({ payload }) {
    const record = payload.proofRecord;
    for (const job of jobs.values()) {
      if (!job.connectionId || record.connectionId !== job.connectionId || job.finished) continue;
      if (record.state === ProofState.RequestSent && !job.proofId) job.proofId = record.id;
      if (record.id !== job.proofId) continue;
      console.log('OIDC_PROOF_STATE=' + record.state);
      void inspectProof(job, record).catch(() => finish(job, 'proof_error'));
    }
  }
  agent.events.on(ConnectionEventTypes.ConnectionStateChanged, onConnection);
  agent.events.on(ProofEventTypes.ProofStateChanged, onProof);
  return {
    async bindInvitation(req, uid, oobId) {
      if (jobs.has(uid)) throw new Error('Login gia in corso.');
      const bindings = req.session.oidcInvitations || {};
      for (const [id, value] of Object.entries(bindings)) if (value.expires <= Date.now()) delete bindings[id];
      bindings[uid] = { oobId, expires: Date.now() + 600000 };
      req.session.oidcInvitations = bindings;
      await save(req);
    },
    async start(req, res) {
      const details = await provider.interactionDetails(req, res);
      const uid = details.uid;
      const binding = req.session.oidcInvitations?.[uid];
      if (details.prompt.name !== 'login' || req.params.uid !== uid || !binding ||
          binding.expires <= Date.now() || binding.oobId !== req.body?.oob_id) {
        return res.status(400).send('Invito non associato a questo login. Avvia un nuovo tentativo.');
      }
      if (jobs.has(uid)) return res.status(409).send('Login gia in corso.');
      const job = { uid, oobId: binding.oobId, sessionId: req.sessionID, req, res, finished: false };
      job.onClose = () => { if (!res.writableEnded && !job.finished) { job.finished = true; release(job); } };
      jobs.set(uid, job);
      res.on('close', job.onClose);
      job.timer = setTimeout(() => { void finish(job, 'timeout'); }, timeoutMs);
      delete req.session.oidcInvitations[uid];
      try {
        await save(req);
        if (job.finished) return;
        // Also handle an invitation accepted just before the HTTP login request arrived.
        const records = await agent.connections.getAll();
        for (const record of records) acceptConnection(job, record);
      } catch { await finish(job, 'connection_lookup_failed'); }
    },
    cancel(uid, sessionId) {
      const job = jobs.get(uid);
      if (job && job.sessionId === sessionId) { job.finished = true; release(job); }
    },
    activeCount() { return jobs.size; },
    close() {
      for (const job of [...jobs.values()]) { job.finished = true; release(job); }
      agent.events.off(ConnectionEventTypes.ConnectionStateChanged, onConnection);
      agent.events.off(ProofEventTypes.ProofStateChanged, onProof);
    }
  };
}
module.exports = { createLoginFlow };
