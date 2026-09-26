const fs = require('node:fs');
const config = require('./config.cjs');

function safeFailure(label, result) {
  const reason = String(result?.reason || '');
  const hint = /insufficient.*fund|insufficient.*fee|not enough/i.test(reason) ? ' Verificare fondi e commissioni testnet.' : '';
  return Error(label + ': registrazione non completata.' + hint + ' Il tentativo resta nel registro; nessun nuovo invio automatico.');
}
async function execute({ journal, name, recover, action, save, retryPending = false }) {
  const previous = journal.operations[name];
  if (previous?.status === 'done') return previous.id;
  // Recovery from records already saved by Credo is read-only and never sends a transaction.
  const recovered = await recover();
  if (recovered) {
    journal.operations[name] = { ...previous, status: 'done', id: recovered };
    save(); return recovered;
  }
  if (previous?.status === 'pending' && !retryPending) throw Error(name + ': tentativo precedente con esito incerto. Verificare il wallet e la rete; leggere README prima di --retry-pending.');
  journal.operations[name] = { ...previous, status: 'pending', startedAt: new Date().toISOString() };
  save();
  const id = await action();
  if (!id) throw Error(name + ': risultato privo di identificativo.');
  journal.operations[name] = { ...journal.operations[name], status: 'done', id };
  save(); return id;
}
async function wallets({ directory = config.DEFAULT_DIRECTORY, native = require('./native.cjs'), home } = {}) {
  const journal = config.state(directory), envs = config.readAll(directory);
  if (journal.mode !== 'new') throw Error('Ambiente importato: i wallet devono già esistere. Non vengono creati.');
  config.validate(envs, { resources: false });
  config.assertIdentities(journal,envs);
  for (const role of config.roles) {
    const file = config.walletPath(envs[role], role, home);
    const name = 'wallet-' + role, previous = journal.operations[name];
    if (previous?.status === 'done') {
      if (!fs.existsSync(file)) throw Error('Wallet già inizializzato ma ora assente: ' + role + '. Ripristinare il wallet, non crearne un sostituto.');
      continue;
    }
    if (fs.existsSync(file) && !previous) throw Error('ID wallet già occupato: ' + role);
    journal.operations[name] = { status: 'pending' }; config.saveState(journal, directory);
    await native.createLocalWallet(role, envs[role]);
    journal.operations[name] = { status: 'done', id: envs[role][config.walletFields[role][0]] };
    config.saveState(journal, directory);
  }
}
async function ensureDid(agent, env, role, journal, options) {
  const name = 'did-' + role, did = env.DID_ID;
  const recover = async () => {
    const created = await agent.dids.getCreatedDids({ did });
    if (created.some(record => record.did === did)) return did;
    const prepared = journal.operations[name];
    // If publication succeeded before the local DidRecord was saved, recover only our own key.
    if (prepared?.publicKeyBase58) {
      const resolved = await agent.dids.resolve(did);
      if (resolved.didDocument) {
        if (!resolved.didDocument.verificationMethod?.some(key => key.publicKeyBase58 === prepared.publicKeyBase58)) throw Error('DID remoto con chiave differente: ' + role);
        await agent.dids.import({ did, didDocument: resolved.didDocument });
        return did;
      }
    }
  };
  return execute({ ...options, journal, name, recover, action: async () => {
    const { KeyType, DidDocument } = options.core || require('@credo-ts/core');
    const item = journal.operations[name];
    if (!item.publicKeyBase58) {
      const key = await agent.wallet.createKey({ keyType: KeyType.Ed25519 });
      item.publicKeyBase58 = key.publicKeyBase58; item.fingerprint = key.fingerprint;
      options.save();
    }
    const keyId = did + '#' + item.fingerprint;
    const result = await agent.dids.create({ method: 'cheqd', secret: {}, options: {}, didDocument: new DidDocument({
      id: did, controller: [did], verificationMethod: [{ id: keyId, type: 'Ed25519VerificationKey2018', controller: did, publicKeyBase58: item.publicKeyBase58 }], authentication: [keyId],
    }) });
    if (result.didState?.state !== 'finished' || result.didState.did !== did) throw safeFailure(name, result.didState);
    return did;
  } });
}
async function publish({ directory = config.DEFAULT_DIRECTORY, native = require('./native.cjs'), retryPending = false, core, applyFees = true, home } = {}) {
  const journal = config.state(directory);
  if (journal.mode !== 'new') throw Error('Ambiente importato: pubblicazione disabilitata. Vengono riutilizzate le risorse esistenti.');
  config.syncResources(journal, directory);
  const envs = config.readAll(directory);
  config.validate(envs, { resources: false });
  config.assertIdentities(journal,envs);
  for (const role of config.roles) {
    if (journal.operations['wallet-' + role]?.status !== 'done' || !fs.existsSync(config.walletPath(envs[role], role, home))) throw Error('Eseguire prima setup.cjs wallets: manca il wallet ' + role);
  }
  const save = () => config.saveState(journal, directory);
  if (applyFees) {
    const fee = envs.issuer.CHEQD_RESOURCE_FEE_NCHEQ;
    if (!/^[1-9][0-9]*$/.test(fee || '')) throw Error('Configurare CHEQD_RESOURCE_FEE_NCHEQ in config/issuer.env prima della pubblicazione.');
    const { ResourceModule, DIDModule } = require('@cheqd/sdk');
    DIDModule.fees.DefaultCreateDidDocFee.amount = fee;
    DIDModule.fees.DefaultCreateDidDocFee.denom = 'ncheq';
    ResourceModule.fees.DefaultCreateResourceJsonFee.amount = fee;
    ResourceModule.fees.DefaultCreateResourceJsonFee.denom = 'ncheq';
  }
  for (const role of ['holder', 'provider', 'issuer']) {
    const session = await native.openAgent(role, envs[role]);
    try {
      const agent = session.agent;
      await ensureDid(agent, envs[role], role, journal, { save, retryPending, core });
      if (role !== 'issuer') continue;
      const issuerId = envs.issuer.DID_ID;
      const schemaId = await execute({ journal, name: 'schema', save, retryPending,
        recover: async () => {
          const records = await agent.modules.anoncreds.getCreatedSchemas({ issuerId, schemaName: journal.schemaName, schemaVersion: journal.schemaVersion });
          if (records.length > 1) throw Error('Più schemi compatibili nel wallet: selezione automatica interrotta.');
          return records[0]?.schemaId;
        },
        action: async () => {
          const r = await agent.modules.anoncreds.registerSchema({ schema: { issuerId, attrNames: config.attributeNames, name: journal.schemaName, version: journal.schemaVersion }, options: {} });
          if (r.schemaState?.state !== 'finished') throw safeFailure('schema', r.schemaState);
          return r.schemaState.schemaId;
        },
      });
      config.syncResources(journal, directory);
      await execute({ journal, name: 'definition', save, retryPending,
        recover: async () => {
          const records = await agent.modules.anoncreds.getCreatedCredentialDefinitions({ issuerId, schemaId, tag: journal.credentialTag });
          if (records.length > 1) throw Error('Più Credential Definition compatibili nel wallet: selezione automatica interrotta.');
          if (records[0] && !await native.hasPrivateDefinition(agent, records[0].credentialDefinitionId)) throw Error('Credential Definition pubblica presente ma materiale privato assente. Ripristinare il wallet Issuer.');
          return records[0]?.credentialDefinitionId;
        },
        action: async () => {
          const r = await agent.modules.anoncreds.registerCredentialDefinition({ credentialDefinition: { issuerId, schemaId, tag: journal.credentialTag }, options: { supportRevocation: false } });
          if (r.credentialDefinitionState?.state !== 'finished') throw safeFailure('definition', r.credentialDefinitionState);
          if (!await native.hasPrivateDefinition(agent, r.credentialDefinitionState.credentialDefinitionId)) throw Error('Pubblicazione completata ma materiale privato non disponibile. Ripristinare il wallet prima di proseguire.');
          return r.credentialDefinitionState.credentialDefinitionId;
        },
      });
      config.syncResources(journal, directory);
    } finally { await session.close(); }
  }
  config.validate(config.readAll(directory));
}
module.exports = { execute, wallets, ensureDid, publish };
