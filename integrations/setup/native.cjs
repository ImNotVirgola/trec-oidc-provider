const { walletFields, seedFields } = require('./config.cjs');
function setRoleEnvironment(env) {
  // Agent source files call dotenv.config(); keep CWD at integrations and set each role explicitly.
  for (const field of ['DID_ID', 'HOLDER_DID_ID', 'SCHEMA_ID', 'CREDENTIAL_DEFINITION_ID', 'COSMOS_PAYER_SEED', 'CHEQD_RPC_URL', ...Object.values(seedFields)]) delete process.env[field];
  Object.assign(process.env, env, { DEBUG: '' });
}
async function createLocalWallet(role, env) {
  const { Agent, ConsoleLogger, LogLevel } = require('@credo-ts/core');
  const { agentDependencies } = require('@credo-ts/node');
  const { AskarModule } = require('@credo-ts/askar');
  const { ariesAskar } = require('@hyperledger/aries-askar-nodejs');
  const [id, key] = walletFields[role];
  const agent = new Agent({ config: { label: 'TREC setup ' + role, walletConfig: { id: env[id], key: env[key] }, logger: new ConsoleLogger(LogLevel.off) }, dependencies: agentDependencies, modules: { askar: new AskarModule({ ariesAskar }) } });
  try { await agent.initialize(); } finally { if(agent.isInitialized)await agent.shutdown(); }
}
async function openAgent(role, env) {
  setRoleEnvironment(env);
  const api = require('../runtime/bootstrap.cjs').loadAgent(role === 'provider' ? 'verifier' : role, { transports: false });
  if (role === 'provider') return { agent: await api.getInitializedAgent(), close: async function() { await this.agent.shutdown(); } };
  const agent = api[role];
  api.rl?.close();
  await agent.initialize();
  return { agent, close: async () => agent.shutdown() };
}
async function payerAddress(seed) {
  const sdkRequire = require('node:module').createRequire(require.resolve('@cheqd/sdk'));
  const { DirectSecp256k1HdWallet } = sdkRequire('@cosmjs/proto-signing');
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(seed, { prefix: 'cheqd' });
  return (await wallet.getAccounts())[0].address;
}
async function hasPrivateDefinition(agent, id) {
  const path = require('node:path');
  const base = path.dirname(require.resolve('@credo-ts/anoncreds'));
  for(const name of ['AnonCredsCredentialDefinitionPrivateRepository', 'AnonCredsKeyCorrectnessProofRepository']) {
    const Repository = require(path.join(base, 'repository', name + '.js'))[name];
    if(!await agent.context.dependencyManager.resolve(Repository).findByCredentialDefinitionId(agent.context, id))return false;
  }
  return true;
}
async function inspectIssuer(agent, env) {
  const id = env.CREDENTIAL_DEFINITION_ID;
  if(!id)throw Error('Credential Definition non configurata.');
  const resolved = await agent.modules.anoncreds.getCredentialDefinition(id);
  const def = resolved.credentialDefinition;
  if(!def || def.issuerId !== env.DID_ID)throw Error('Credential Definition non risolvibile o Issuer differente.');
  if(env.SCHEMA_ID && env.SCHEMA_ID !== def.schemaId)throw Error('Schema configurato differente da quello della Credential Definition.');
  const schema = (await agent.modules.anoncreds.getSchema(def.schemaId)).schema;
  const {attributeNames} = require('./config.cjs');
  if(!schema || attributeNames.some(name=>!schema.attrNames.includes(name)))throw Error('Lo schema non contiene gli attributi TREC richiesti.');
  if(!await hasPrivateDefinition(agent, id))throw Error('Il wallet Issuer non contiene il materiale privato della Credential Definition.');
  return def.schemaId;
}
module.exports = { createLocalWallet, openAgent, payerAddress, hasPrivateDefinition, inspectIssuer };
