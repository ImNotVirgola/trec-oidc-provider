# Integrazione aggiuntiva TREC / Credo / cheqd Testnet

Questa cartella contiene l'integrazione del progetto funzionante fornito dall'utente nel repository originale https://github.com/ImNotVirgola/trec-oidc-provider, commit `9ad2a3c7dba8908b57051064c94c6478bf6ca08c`.

**Tutti i 44 file originali sono conservati byte per byte.** Sono inclusi anche i README, i file di configurazione di esempio e il pacchetto OIDC personalizzato. Tutte le aggiunte sono in `integration/`. Il comando di verifica controlla gli SHA-256 prima di ogni avvio.

Per avviare questa variante seguire [LEGGIMI.txt](LEGGIMI.txt), con comandi in testo semplice. Non occorre modificare `index.js`, `provider.js`, i sorgenti TypeScript, i package originali o `node_modules` a mano. Le normali istruzioni del README originale descrivono l'avvio senza questa integrazione.

## Come funziona

Il README originale descrive già un provider OIDC basato su SSI. L'Issuer emette la credenziale AnonCreds; l'Holder la conserva nel wallet Askar; il Verifier, integrato nel provider, richiede e verifica una presentazione con Credo TS. Dopo la prova e il consenso, **oidc-provider firma ID token e access token JWT** per il client. Credo non è il componente che firma i JWT OIDC. Cheqd Testnet rende disponibili DID, schema e Credential Definition; non ospita il server OIDC né i dati personali della credenziale.

L'integrazione mantiene gli agenti, i nove attributi, le pagine Pug, le route e il pacchetto OIDC personalizzato del repository. Il client locale aggiunto serve per provare il flusso in assenza dell'app TREC esterna.

## File e correzioni

| Aggiunta | Funzione |
| --- | --- |
| `run.cjs`, `configure.cjs` | Avvio per ruolo; importazione locale della configurazione; verifica dei wallet esistenti. |
| `runtime/bootstrap.cjs`, `transform.cjs` | Caricano i sorgenti originali e applicano solo in memoria le correzioni alle sessioni, al parser HTTP, ai listener e alla configurazione degli agenti. Il TypeScript viene compilato in memoria. |
| `runtime/oidc-loader.mjs` | Corregge in memoria due moduli del pacchetto OIDC originale, dopo controllo hash. L'issuer del JWT coincide con quello della discovery; i dati dell'access token provengono dall'account verificato, non dalla prima sessione. |
| `persistence/` | Conserva cifrati account verificati, sessioni, artefatti OIDC e chiavi di firma. `findAccount` funziona anche quando `/token` non riceve cookie del browser. |
| `verification/oidc-login.cjs` | Associa invito, sessione, connessione e prova; controlla `isVerified`, Credential Definition e attributi provenienti dalla stessa credenziale; gestisce duplicati e timeout. |
| `runtime/agent-runner.cjs` | Riutilizza gli agenti Holder e Issuer originali. Registra i listener prima dell'uso dell'invito; gestisce esito e timeout. Non registra risorse sulla blockchain. |
| `local-client/` | Authorization Code con PKCE S256, state e nonce; verifica firma, issuer, audience, scadenza e soggetto di entrambi i JWT, senza mostrarli. |
| `upstream-manifest.json`, `verify-originals.cjs` | Verifica dell'integrità dei 44 file originali. |

Non viene sostituito il pacchetto personalizzato con un provider diverso. Le trasformazioni sono legate a questo commit e a questo tarball: un aggiornamento upstream richiede una nuova revisione delle trasformazioni, non la rimozione dei controlli hash.

## Configurazione e stato

`configure.cjs` legge i tre `.env` del progetto locale funzionante e scrive esclusivamente `integration/config/provider.env`, `holder.env` e `issuer.env`. Mantiene ID e chiavi dei wallet, DID e seed degli agenti; configura il test su localhost e genera nuove chiavi private per il nuovo ambiente OIDC. Non modifica il progetto sorgente. Se i file di destinazione esistono, si ferma senza sovrascriverli.

Gli account, i token e le sessioni del vecchio ambiente OIDC non vengono migrati: avviare un nuovo login. Le credenziali e le chiavi degli agenti rimangono nei wallet Askar dello stesso utente WSL, normalmente in `~/.afj/data/wallet/`. Cambiare directory del progetto non cambia questa posizione. I wallet non sono contenuti in questo ZIP.

La chiave RSA dimostrativa incorporata nel `provider.js` pubblico resta nel file originale, ma **non viene usata** dall'integrazione. Al primo avvio si genera una nuova chiave RSA, conservata cifrata in `integration/.oidc-data/`. Conservare insieme tale cartella e la relativa `OIDC_STORAGE_KEY` privata. I file privati sono esclusi dalla consegna.

Lo scope `trec` abilita il claim annidato `trec`; `sub` è l'holder DID attestato nella credenziale. L'access token ha come audience il client, secondo il contratto del pacchetto originale, salvo un'audience esplicita del token. Il test locale richiede `openid trec`. Gli attributi personali non vengono aggiunti all'access token quando manca lo scope `trec`.

La configurazione locale usa Authorization Code, come il client originale. Il flusso refresh token non è stato esteso né collaudato: la configurazione originale non abilita il grant `refresh_token` per il client. Le route di introspezione e revoca del provider rimangono disponibili.

## Verifiche e limiti

Vedere [TEST-REPORT.md](TEST-REPORT.md). Sono stati verificati scambi HTTP reali e firme JWT con il provider originale, usando account di test; gli eventi Credo sono simulati nei test del coordinamento. Il nuovo avvio completo con i wallet dell'utente e cheqd Testnet deve essere verificato nel suo WSL: le librerie native non sono caricabili nell'ambiente Windows usato per la preparazione.

Questo pacchetto è predisposto per il test locale, una sola istanza del provider. Lo storage su file non implementa il coordinamento tra più processi. Le URL localhost, i cookie HTTP e l'auto-accettazione delle prove dell'Holder riprendono il contesto dimostrativo; un deployment pubblico richiede una configurazione e un'interfaccia di consenso dell'Holder dedicate.
