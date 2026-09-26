const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const DEFAULT_DIRECTORY = path.resolve(__dirname, '../config');
const roles = ['provider', 'holder', 'issuer'];
const walletFields = {
  provider: ['VERIFIER_WALLET_ID', 'VERIFIER_WALLET_KEY'],
  holder: ['HOLDER_WALLET_ID', 'WALLET_KEY'],
  issuer: ['ISSUER_WALLET_ID', 'ISSUER_WALLET_KEY'],
};
const seedFields = { provider: 'VERIFIER_COSMOS_SEED', holder: 'HOLDER_COSMOS_SEED', issuer: 'ISSUER_COSMOS_SEED' };
const attributeNames = ['issuerDid', 'holderDid', 'givenName', 'familyName', 'dateOfBirth', 'phone', 'email', 'fiscalCode', 'gender'];
const demoAttributes = { givenName: 'Utente', familyName: 'Dimostrativo', dateOfBirth: '2000-01-01', phone: '+390000000000', email: 'test@example.invalid', fiscalCode: 'DEMO-NON-VALIDO', gender: 'non specificato' };
const secret = () => crypto.randomBytes(32).toString('hex');
const clean = env => Object.fromEntries(Object.entries(env).filter(([k, v]) => /^[A-Z][A-Z0-9_]*$/.test(k) && v && !/[<>]/.test(v)));

function encode(env) {
  return Object.entries(env).map(([key, raw]) => {
    const value = String(raw);
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n\0]/.test(value)) throw Error('Formato configurazione non valido: ' + key);
    const quote = ["'", '"', '`'].find(q => !value.includes(q));
    if (!quote) throw Error('Virgolette non supportate nel valore: ' + key);
    const line = `${key}=${quote}${value}${quote}`;
    if (dotenv.parse(line)[key] !== value) throw Error('Valore non rappresentabile: ' + key);
    return line;
  }).join('\n') + '\n';
}
function atomic(file, value) {
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temporary, file); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function readRole(role, directory = DEFAULT_DIRECTORY) {
  return dotenv.parse(fs.readFileSync(path.join(directory, role + '.env')));
}
function readAll(directory = DEFAULT_DIRECTORY) { return Object.fromEntries(roles.map(role => [role, readRole(role, directory)])); }
function state(directory = DEFAULT_DIRECTORY) { return JSON.parse(fs.readFileSync(path.join(directory, 'setup-state.json'), 'utf8')); }
function saveState(value, directory = DEFAULT_DIRECTORY) { atomic(path.join(directory, 'setup-state.json'), JSON.stringify(value, null, 2)); }
function assertIdentities(journal, envs) {
  if(journal.mode !== 'new')return;
  for(const role of roles) {
    const expected=journal.identities?.[role];
    if(!expected || expected.walletId !== envs[role][walletFields[role][0]] || expected.did !== envs[role].DID_ID)throw Error('Identità modificata dopo init: '+role+'. Ripristinare la configurazione iniziale.');
  }
}
function walletPath(env, role, home = os.homedir()) {
  const id = env[walletFields[role][0]];
  if (!id || /[/\\\0]/.test(id) || id === '.' || id === '..') throw Error('ID wallet non valido: ' + role);
  return path.join(home, '.afj/data/wallet', id, 'sqlite.db');
}
function validate(config, { resources = true } = {}) {
  for (const role of roles) {
    const env = config[role];
    if (env.CHEQD_NETWORK !== 'testnet') throw Error('Configurazione ' + role + ': è richiesta testnet.');
    for (const field of [...walletFields[role], seedFields[role]]) {
      if (!env[field] || /[<>]/.test(env[field])) throw Error('Manca ' + field + ' nella configurazione ' + role);
    }
    walletPath(env, role);
  }
  for (const role of ['holder', 'issuer']) if (!/^did:cheqd:testnet:[^/\s]+$/.test(config[role].DID_ID || '')) throw Error('DID_ID testnet mancante o non valido: ' + role);
  if (config.issuer.HOLDER_DID_ID !== config.holder.DID_ID) throw Error('HOLDER_DID_ID non corrisponde al DID del titolare.');
  const definition = config.provider.CREDENTIAL_DEFINITION_ID;
  if (resources && !/^did:cheqd:testnet:[^/\s]+\/resources\/[^/\s]+$/.test(definition || '')) throw Error('CREDENTIAL_DEFINITION_ID non configurato.');
  if (definition && (definition !== config.issuer.CREDENTIAL_DEFINITION_ID || !definition.startsWith(config.issuer.DID_ID + '/resources/'))) throw Error('Credential Definition incoerente tra provider e Issuer.');
  const schemas = roles.map(role => config[role].SCHEMA_ID).filter(Boolean);
  if (new Set(schemas).size > 1) throw Error('SCHEMA_ID differenti nella configurazione.');
  if (schemas.some(id => !id.startsWith(config.issuer.DID_ID + '/resources/'))) throw Error('SCHEMA_ID non appartenente all’Issuer configurato.');
}
function localDefaults(config) {
  const provider = config.provider;
  Object.assign(provider, {
    PROVIDER_URL: 'http://localhost:3000', PORT: '3000', TREC_ID: provider.TREC_ID || 'trec-local-client',
    CLIENT_SECRET: secret(), SESSION_SECRET: secret(), COOKIES_KEY: secret(), OIDC_STORAGE_KEY: secret(),
    TREC_REDIRECT_URI: 'http://localhost:3004/callback', CORS_ORIGIN: 'http://localhost:3004',
    AUTH_ENDPOINT: '/auth', TOKEN_ENDPOINT: '/token', SCOPES: 'openid trec',
    VERIFIER_LABEL: provider.VERIFIER_LABEL || 'TREC Verifier', VERIFIER_ENDPOINT: 'http://localhost:3001', VERIFIER_PORT: '3001',
    AT_TTL: '3600', ID_TTL: '3600', RT_TTL: '86400',
  });
  Object.assign(config.holder, { HOLDER_LABEL: config.holder.HOLDER_LABEL || 'TREC Holder', HOLDER_ENDPOINT: 'http://localhost:3002', HOLDER_PORT: '3002' });
  Object.assign(config.issuer, { ISSUER_LABEL: config.issuer.ISSUER_LABEL || 'TREC Issuer', ISSUER_ENDPOINT: 'http://localhost:3003', ISSUER_URL: 'http://localhost:3003', ISSUER_PORT: '3003' });
  for (const env of Object.values(config)) { delete env.DEBUG; delete env.NODE_OPTIONS; delete env.NODE_PATH; }
  return config;
}
function commitConfiguration(config, journal, directory = DEFAULT_DIRECTORY, profile = demoAttributes) {
  if (fs.existsSync(directory)) throw Error('Configurazione già presente: nessun file sovrascritto.');
  // Validate and serialize everything before any write. Publish the whole directory atomically.
  const contents = Object.fromEntries(roles.map(role => [role + '.env', encode(config[role])]));
  contents['setup-state.json'] = JSON.stringify(journal, null, 2);
  contents['credential-attributes.json'] = JSON.stringify(profile, null, 2);
  const staging = directory + '.preparing-' + crypto.randomUUID();
  fs.mkdirSync(staging, { mode: 0o700 });
  try {
    for (const [name, value] of Object.entries(contents)) fs.writeFileSync(path.join(staging, name), value, { flag: 'wx', mode: 0o600 });
    fs.renameSync(staging, directory);
  } catch (error) {
    for (const name of Object.keys(contents)) { const file = path.join(staging, name); if (fs.existsSync(file)) fs.unlinkSync(file); }
    if (fs.existsSync(staging)) fs.rmdirSync(staging);
    throw error;
  }
}
function importExisting(source, directory = DEFAULT_DIRECTORY) {
  const root = path.resolve(source);
  const migrated = ['provider.env', 'holder.env', 'issuer.env'].every(name => fs.existsSync(path.join(root, name)));
  const files = migrated ? { provider: 'provider.env', holder: 'holder.env', issuer: 'issuer.env' } : { provider: '.env', holder: 'holder/.env', issuer: 'issuer/.env' };
  const config = Object.fromEntries(roles.map(role => [role, clean(dotenv.parse(fs.readFileSync(path.join(root, files[role]))))]));
  config.provider.VERIFIER_COSMOS_SEED ||= config.provider.COSMOS_PAYER_SEED;
  // Never substitute the author's public identifiers. Conflicts are errors.
  const definitions = [config.provider.CREDENTIAL_DEFINITION_ID, config.issuer.CREDENTIAL_DEFINITION_ID].filter(Boolean);
  if (new Set(definitions).size > 1) throw Error('Credential Definition differenti nei file sorgente.');
  const schemas = roles.map(role => config[role].SCHEMA_ID).filter(Boolean);
  if (new Set(schemas).size > 1) throw Error('SCHEMA_ID differenti nei file sorgente.');
  for (const role of ['provider', 'issuer']) {
    config[role].CREDENTIAL_DEFINITION_ID = definitions[0] || '';
    config[role].SCHEMA_ID = schemas[0] || '';
  }
  config.issuer.HOLDER_DID_ID ||= config.holder.DID_ID;
  validate(config);
  localDefaults(config);
  let profile = demoAttributes;
  if (migrated && fs.existsSync(path.join(root, 'credential-attributes.json'))) profile = JSON.parse(fs.readFileSync(path.join(root, 'credential-attributes.json'), 'utf8'));
  commitConfiguration(config, { version: 1, mode: 'import', operations: {} }, directory, profile);
  return config;
}
function initialize({ payerMnemonic, directory = DEFAULT_DIRECTORY } = {}) {
  const bip39 = require('bip39');
  const seed = payerMnemonic === undefined ? bip39.generateMnemonic(256) : payerMnemonic;
  if (!bip39.validateMnemonic(seed)) throw Error('Frase mnemonica del pagatore non valida.');
  const id = crypto.randomUUID();
  const config = Object.fromEntries(roles.map(role => [role, {
    CHEQD_NETWORK: 'testnet', DID_ID: 'did:cheqd:testnet:' + crypto.randomUUID(),
    [walletFields[role][0]]: 'trec-' + role + '-' + id,
    [walletFields[role][1]]: secret(), [seedFields[role]]: seed,
    CHEQD_RPC_URL: 'https://rpc.cheqd.network',
  }]));
  config.issuer.HOLDER_DID_ID = config.holder.DID_ID;
  // Explicit testnet value used by the previously working environment; can be changed before publishing.
  config.issuer.CHEQD_RESOURCE_FEE_NCHEQ = '2500000000000';
  for (const role of ['provider', 'issuer']) Object.assign(config[role], { SCHEMA_ID: '', CREDENTIAL_DEFINITION_ID: '' });
  localDefaults(config);
  validate(config, { resources: false });
  const identities=Object.fromEntries(roles.map(role=>[role,{walletId:config[role][walletFields[role][0]],did:config[role].DID_ID}]));
  commitConfiguration(config, { version: 1, mode: 'new', id, identities, schemaName: 'trec-' + id, schemaVersion: '1.0.0', credentialTag: 'default', operations: {} }, directory);
  return config;
}
function syncResources(journal, directory = DEFAULT_DIRECTORY) {
  for (const role of ['provider', 'issuer']) {
    const env = readRole(role, directory);
    if (journal.operations.schema?.id) env.SCHEMA_ID = journal.operations.schema.id;
    if (journal.operations.definition?.id) env.CREDENTIAL_DEFINITION_ID = journal.operations.definition.id;
    atomic(path.join(directory, role + '.env'), encode(env));
  }
}
function lock(directory = DEFAULT_DIRECTORY) {
  const file = path.join(directory, '.setup.lock');
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); } catch { throw Error('Setup già in esecuzione o lock residuo. Vedi README, ripresa del setup.'); }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname() })); fs.closeSync(fd);
  return () => fs.unlinkSync(file);
}
module.exports = { DEFAULT_DIRECTORY, roles, walletFields, seedFields, attributeNames, demoAttributes, encode, atomic, readRole, readAll, state, saveState, assertIdentities, walletPath, validate, importExisting, initialize, syncResources, lock };
