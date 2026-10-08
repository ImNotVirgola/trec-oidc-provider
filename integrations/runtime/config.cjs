const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const dotenv = require('dotenv')

const publicConfig = require('../config/testnet.json')

function loadConfig({
  env = process.env,
  file = env.TREC_AUTH_ENV ||
    path.join(os.homedir(), '.config', 'trec-auth', 'auth.env')
} = {}) {

  const defaults = {
    OIDC_ISSUER: publicConfig.oidc.issuer,
    OIDC_CLIENT_ID: publicConfig.oidc.clientId,
    OIDC_REDIRECT_URI: publicConfig.oidc.redirectUri,
    OIDC_RESOURCE: publicConfig.oidc.resource,

    OIDC_BIND_HOST: publicConfig.oidc.bindHost,
    CLIENT_BIND_HOST: publicConfig.oidc.clientBindHost,

    VERIFIER_WALLET_ID: publicConfig.verifier.walletId,
    VERIFIER_ENDPOINT: publicConfig.verifier.endpoint,
    VERIFIER_PORT: String(publicConfig.verifier.port),

    CHEQD_NETWORK: publicConfig.cheqd.network,
    CHEQD_RPC_URL: publicConfig.cheqd.rpcUrl,
    CREDENTIAL_DEFINITION_ID:
      publicConfig.cheqd.credentialDefinitionId,

    PROOF_TIMEOUT_SECONDS:
      String(publicConfig.proofTimeoutSeconds || 180)
  }

  const privateConfig = fs.existsSync(file)
    ? dotenv.parse(fs.readFileSync(file))
    : {}

  const allowedPrivateFields = [
    'OIDC_CLIENT_SECRET',
    'OIDC_COOKIE_SECRET',
    'VERIFIER_WALLET_KEY',
    'VERIFIER_WALLET_PATH',

    // Override opzionali di rete/deployment.
    'VERIFIER_ENDPOINT',
    'VERIFIER_PORT',
    'OIDC_BIND_HOST',
    'CLIENT_BIND_HOST'
  ]

  const values = { ...defaults }

  for (const name of allowedPrivateFields) {
    if (privateConfig[name]) {
      values[name] = privateConfig[name]
    }
  }

  // Le variabili d'ambiente hanno priorità massima.
  for (const name of [
    ...Object.keys(defaults),
    ...allowedPrivateFields
  ]) {
    if (env[name]) {
      values[name] = env[name]
    }
  }

  const required = (name) => {
    const value = values[name]

    if (!value || /[<>]/.test(value)) {
      throw new Error(
        `Configurazione privata mancante: ${name}`
      )
    }

    return value
  }

  const url = (value, name) => {
    const parsed = new URL(value)

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.search
    ) {
      throw new Error(`${name} non valido.`)
    }

    return parsed.href.replace(/\/$/, '')
  }

  const issuer = url(
    required('OIDC_ISSUER'),
    'OIDC_ISSUER'
  )

  const redirectUri = url(
    required('OIDC_REDIRECT_URI'),
    'OIDC_REDIRECT_URI'
  )

  if (
    new URL(issuer).origin !== issuer ||
    new URL(issuer).protocol !== 'http:' ||
    new URL(redirectUri).protocol !== 'http:' ||
    new URL(redirectUri).pathname !== '/callback'
  ) {
    throw new Error(
      'Configurazione OIDC pubblica non valida.'
    )
  }

  const definitionId =
    required('CREDENTIAL_DEFINITION_ID')

  if (
    !/^did:cheqd:(testnet:)?[^/\s]+\/resources\/[^/\s]+$/
      .test(definitionId)
  ) {
    throw new Error(
      'CREDENTIAL_DEFINITION_ID non valido.'
    )
  }

  const timeout =
    Number(values.PROOF_TIMEOUT_SECONDS || 180)

  const verifierPort =
    Number(values.VERIFIER_PORT || 3001)

  if (
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 600 ||
    !Number.isInteger(verifierPort) ||
    verifierPort < 1 ||
    verifierPort > 65535
  ) {
    throw new Error(
      'Timeout o porta Verifier non validi.'
    )
  }

  const network =
    values.CHEQD_NETWORK || 'testnet'

  if (!['testnet', 'mainnet'].includes(network)) {
    throw new Error(
      'CHEQD_NETWORK non valida.'
    )
  }

  if (
    definitionId.startsWith('did:cheqd:testnet:') !==
    (network === 'testnet')
  ) {
    throw new Error(
      'Rete della Credential Definition incoerente.'
    )
  }

  return {
    issuer,
    redirectUri,

    clientOrigin:
      new URL(redirectUri).origin,

    clientId:
      required('OIDC_CLIENT_ID'),

    clientSecret:
      required('OIDC_CLIENT_SECRET'),

    cookieSecret:
      values.OIDC_COOKIE_SECRET,

    resource:
      url(
        values.OIDC_RESOURCE ||
          issuer + '/trec-api',
        'OIDC_RESOURCE'
      ),

    // Wallet Verifier già creato: viene solo aperto.
    walletId:
      required('VERIFIER_WALLET_ID'),

    walletKey:
      required('VERIFIER_WALLET_KEY'),

    walletPath:
      values.VERIFIER_WALLET_PATH,

    endpoint:
      url(
        required('VERIFIER_ENDPOINT'),
        'VERIFIER_ENDPOINT'
      ),

    verifierPort,

    definitionId,
    network,

    rpcUrl:
      values.CHEQD_RPC_URL,

    timeoutMs:
      timeout * 1000,

    bindHost:
      values.OIDC_BIND_HOST || '127.0.0.1',

    clientBindHost:
      values.CLIENT_BIND_HOST || '127.0.0.1',

    // Informazioni pubbliche già provisionate.
    issuerDid:
      publicConfig.cheqd.issuerDid,

    schemaId:
      publicConfig.cheqd.schemaId,

    issuerConfig:
      publicConfig.issuer,

    testHolder:
      publicConfig.testHolder
  }
}

module.exports = {
  loadConfig,
  publicConfig
}
