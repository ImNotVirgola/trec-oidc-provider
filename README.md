# TreC-oidc-provider — Integrazione SSI e JWT per client OIDC

Questa cartella contiene un'integrazione aggiuntiva per [TreC-oidc-provider](https://github.com/ImNotVirgola/trec-oidc-provider), finalizzata a consentire a un client di autenticare un utente mediante una credenziale verificabile e ricevere token JWT attraverso OpenID Connect (OIDC).

L'integrazione **non modifica i file del progetto originale**: riutilizza gli agenti Issuer, Holder e Verifier già presenti e applica gli adattamenti necessari durante l'esecuzione. Il riferimento previsto è il commit `9ad2a3c7dba8908b57051064c94c6478bf6ca08c`, al quale è associato il controllo d'integrità dei 44 file originali. Il README della radice del repository resta il riferimento per il funzionamento del progetto di partenza.

# Struttura

Come nel progetto originale, il provider OIDC svolge il ruolo di **Verifier** in un sistema SSI (*Self-Sovereign Identity*). L'Issuer emette una credenziale AnonCreds, l'Holder la conserva nel proprio wallet e il Verifier ne controlla la presentazione. Solo in seguito alla verifica e al consenso, `oidc-provider` può completare l'autenticazione del client ed emettere i token JWT.

I nove attributi dello schema `trec` rimangono quelli del progetto iniziale:

| issuerDid | holderDid | givenName | familyName | dateOfBirth | phone | email | fiscalCode | gender |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DID Issuer | DID Holder | Nome | Cognome | Data di nascita | Telefono | Email | Codice fiscale | Genere |

**Credo TS verifica la presentazione; `oidc-provider` emette e firma i JWT.** Cheqd Testnet è utilizzata per DID, schema e Credential Definition già registrati: non conserva i dati personali dell'utente e non sostituisce il server OIDC.

L'integrazione è organizzata nei seguenti componenti principali:

| Componente | Funzione |
| --- | --- |
| `run.cjs` e `configure.cjs` | Avvio dei singoli ruoli e importazione della configurazione dal progetto locale già funzionante. |
| `runtime/bootstrap.cjs` e `runtime/transform.cjs` | Riutilizzo dei sorgenti originali, adattati e compilati **in memoria**, senza riscrivere `index.js`, `provider.js` o i file TypeScript originali. |
| `runtime/oidc-loader.mjs` | Adattamento in memoria del pacchetto OIDC personalizzato per l'emissione dei JWT, dopo la verifica dell'hash dei moduli attesi. |
| `verification/oidc-login.cjs` | Coordinamento tra invito OOB, interazione OIDC, connessione Credo e presentazione verificata. |
| `persistence/` | Persistenza cifrata dei dati di account, delle sessioni Express, degli oggetti OIDC e delle chiavi di firma. |
| `local-client/` | Client dimostrativo per Authorization Code con PKCE, ricezione e verifica dei token. |
| `runtime/agent-runner.cjs` | Avvio degli agenti Holder e Issuer originali utilizzando i wallet già esistenti. |
| `upstream-manifest.json` e `verify-originals.cjs` | Verifica SHA-256 dei 44 file originali prima dell'avvio. |

## Funzionamento dell'autenticazione

1. Il client apre una richiesta OIDC con **Authorization Code**, PKCE S256, `state` e `nonce`, richiedendo gli scope `openid trec`.
2. Il provider crea un invito Out-of-Band e lo associa all'interazione di login. L'Holder riceve l'URL ed entra in connessione con il Verifier.
3. Il Verifier richiede una presentazione AnonCreds e ne verifica l'esito crittografico (`isVerified`), la Credential Definition attesa, il DID dell'Issuer e la provenienza degli attributi dalla medesima credenziale. Il DID dell'Holder diventa l'identificativo dell'account OIDC (`sub`).
4. L'associazione tra invito, sessione, connessione e proof impedisce che una presentazione riferita a un altro tentativo completi il login. Il coordinamento gestisce anche eventi duplicati, timeout e annullamenti.
5. Gli attributi verificati sono associati all'account in un archivio cifrato. Dopo l'eventuale pagina di consenso, il client scambia il codice di autorizzazione presso `/token` e riceve ID token e access token JWT firmati dal provider.
6. Il client verifica crittograficamente firma, issuer, audience, scadenza e soggetto dei token, oltre a `nonce` dell'ID token e corrispondenza dei soggetti. Il claim `trec` è previsto per l'access token quando è stato richiesto lo scope omonimo.

Il client dimostrativo non stampa i token ricevuti e non implementa una sessione dell'applicazione TREC esterna: serve a verificare l'integrazione OIDC end-to-end.

# Setup

Il setup seguente riguarda **l'integrazione contenuta in questa cartella**, non l'avvio ordinario del progetto originale. L'ambiente di prova previsto dal pacchetto è Ubuntu/WSL con Node.js 18.x e npm 10.4.0; Node 18 è una scelta di compatibilità con il progetto di partenza, non una raccomandazione per un deployment pubblico.

## a) Prerequisiti

Sono necessari:

- una copia **non modificata** del progetto originale al commit indicato sopra, con il pacchetto `oidc-provider-8.5.2.tgz` nella radice;
- `node` 18.x, `npm` 10.4.0 e `nvm`, oltre agli strumenti nativi richiesti dalle librerie Credo/Askar/AnonCreds su Ubuntu;
- una precedente configurazione funzionante dei tre agenti, contenente i rispettivi file `.env` e i wallet Askar esistenti **dello stesso utente WSL**;
- DID, schema, Credential Definition e una credenziale dimostrativa già registrati/emessa su **cheqd Testnet**. I valori di schema e Credential Definition attualmente predisposti sono quelli indicati in `configure.cjs`: non sono generici per qualsiasi Issuer.

L'integrazione non registra automaticamente nuovi DID o nuove risorse sulla blockchain. I wallet non sono inclusi nell'archivio `integration.zip`.

Per preparare una copia pulita, senza intervenire sulla directory originale già funzionante:

```bash
git clone https://github.com/ImNotVirgola/trec-oidc-provider.git \
  ~/Tirocinio/trec-oidc-provider-integrato
cd ~/Tirocinio/trec-oidc-provider-integrato
git checkout 9ad2a3c7dba8908b57051064c94c6478bf6ca08c
```

Estrarre `integration.zip` **nella radice di questa copia**, così da ottenere `trec-oidc-provider-integrato/integration/`. Sostituire `/percorso/integration.zip` con il percorso effettivo del file:

```bash
unzip /percorso/integration.zip
```

Non sovrascrivere una cartella `integration/` già configurata: al suo interno potrebbero trovarsi le chiavi private e l'archivio cifrato dell'ambiente di prova.

## b) Installazione delle dipendenze

Le dipendenze aggiuntive vengono installate nella sola cartella `integration/`, senza sostituire quelle del progetto originale:

```bash
cd ~/Tirocinio/trec-oidc-provider-integrato
nvm use 18
cd integration
npm ci
cd ..
```

Se l'installazione delle librerie native fallisce, verificare la presenza dei compilatori in WSL:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
cd integration
npm ci
cd ..
```

Non usare `--ignore-scripts`: le librerie native degli agenti richiedono i propri script di installazione. Non è necessario ricompilare o modificare a mano i sorgenti originali.

## c) Importazione della configurazione

Dalla radice della nuova copia, indicando la directory **del precedente progetto funzionante**:

```bash
node integration/configure.cjs "$HOME/Tirocinio/trec-oidc-provider"
node integration/verify-originals.cjs
```

`configure.cjs` legge i tre file `.env` precedenti e genera i file privati `integration/config/provider.env`, `holder.env` e `issuer.env`, mantenendo gli identificativi e le chiavi dei wallet esistenti. Imposta i servizi locali e genera nuovi segreti per la coppia provider/client OIDC. **Non modificare o pubblicare tali file.** Se la configurazione di destinazione esiste già, lo script si interrompe senza sovrascriverla.

Il secondo comando deve mostrare:

```text
ORIGINAL_FILES_UNCHANGED=44
```

L'avvio ripete il controllo d'integrità. Le trasformazioni sono compatibili con la versione del progetto e del tarball indicate nel manifesto: un aggiornamento del repository originale richiede una nuova revisione dell'integrazione.

## d) Test automatici

Eseguire:

```bash
cd ~/Tirocinio/trec-oidc-provider-integrato/integration
npm test
cd ..
```

Il rapporto allegato [`TEST-REPORT.md`](TEST-REPORT.md) riporta **13 test superati** nell'ambiente in cui il pacchetto è stato preparato. I test coprono i percorsi HTTP/OIDC e JWT, la persistenza, la revoca per grant e il coordinamento dei listener. Le proof Credo dei test automatici utilizzano eventi simulati: **non sostituiscono una prova con i wallet reali e cheqd Testnet**.

## e) Provider OIDC e Verifier

Nel **primo terminale WSL**, dalla radice della nuova copia:

```bash
cd ~/Tirocinio/trec-oidc-provider-integrato
nvm use 18
node integration/run.cjs provider
```

Questo comando avvia insieme il provider OIDC e il Verifier Credo del progetto originale. L'endpoint OIDC locale è `http://localhost:3000`; il Verifier utilizza la porta `3001`. Il provider utilizza l'archivio cifrato dell'integrazione per account, sessioni, artefatti OIDC e chiavi di firma, invece di dipendere da una sessione Express scelta arbitrariamente durante `/token`.

## f) Holder

Nel **secondo terminale WSL**, con il wallet che contiene già la credenziale:

```bash
cd ~/Tirocinio/trec-oidc-provider-integrato
nvm use 18
node integration/run.cjs holder
```

Il terminale chiederà di incollare l'invito dell'Issuer o del Verifier. Per un nuovo tentativo, utilizzare sempre l'invito appena generato dalla pagina di login. **L'Holder di questo pacchetto termina al completamento di uno scambio**: per eseguire un secondo login, riavviare soltanto il comando Holder. Il provider e il client possono restare accesi.

## g) Client locale e prova completa

Nel **terzo terminale WSL**:

```bash
cd ~/Tirocinio/trec-oidc-provider-integrato
nvm use 18
node integration/run.cjs client
```

Aprire `http://localhost:3004` nel browser, premere **Accedi con la credenziale**, copiare l'intero URL mostrato dal provider e incollarlo nel terminale dell'Holder. Completare la presentazione e, quando richiesto, premere **Conferma** nella pagina di consenso.

I messaggi previsti sono:

```text
# Nel provider
OIDC_PROOF_VERIFIED=true

# Nel client
OIDC_ACCESS_TOKEN_VERIFIED=true
OIDC_LOGIN_VERIFIED=true
```

Per una seconda prova, tornare alla **home del client** e avviare una nuova richiesta. Non riutilizzare URL di callback, codici di autorizzazione o inviti precedenti. Il pacchetto aggiuntivo deve ancora essere collaudato integralmente nel WSL con i wallet dell'utente: i test automatici non certificano il funzionamento del browser e degli agenti nativi in questo ambiente.

## h) Issuer (facoltativo)

Se l'Holder contiene già la credenziale necessaria, non occorre avviare l'Issuer. Per emettere un'altra credenziale dimostrativa con la **Credential Definition già esistente**, utilizzare un terminale aggiuntivo:

```bash
cd ~/Tirocinio/trec-oidc-provider-integrato
nvm use 18
node integration/run.cjs issuer
```

L'Issuer mostra un invito da trasmettere all'Holder. Servono il wallet e le chiavi private originali dell'Issuer: conoscere il solo ID pubblico della Credential Definition non basta. Questo comando non ricrea DID, schema o Credential Definition e termina quando lo scambio si conclude.

# Corrispondenza con gli obiettivi dell'integrazione

| Obiettivo | Componenti che lo realizzano |
| --- | --- |
| Autenticazione decentralizzata basata su credenziali verificabili | Issuer/Holder/Verifier originali e `verification/oidc-login.cjs`: presentazione AnonCreds e controllo del risultato di verifica. |
| Login di un client con rilascio di JWT | `local-client/server.cjs`, provider OIDC originale e `runtime/oidc-loader.mjs`: Authorization Code con PKCE, scambio del codice e firma/verifica dei token. |
| Associazione dell'utente autenticato al token | `verification/oidc-login.cjs` e `persistence/account-store.cjs`: `holderDid` come `sub`, dati verificati recuperati per account anziché dalla prima sessione disponibile. |
| Login ripetuti e isolamento delle richieste | `verification/oidc-login.cjs`: associazione tra `uid`, invito OOB, connessione e proof; listener condivisi e gestione degli eventi duplicati. |
| Persistenza e recupero dopo il riavvio del provider | `persistence/storage.cjs`, `adapter.cjs`, `session-store.cjs`, `provider.cjs` e `account-store.cjs`: stato cifrato, scadenze, revoche e chiavi JWT persistenti. |
| Conservazione integrale del progetto di partenza | `upstream-manifest.json`, `verify-originals.cjs` e `runtime/`: controllo degli hash e trasformazioni dei sorgenti **solo in memoria**. |

# Persistenza e sicurezza

La configurazione privata viene conservata in `integration/config/*.env`; i dati OIDC cifrati in `integration/.oidc-data/`, salvo diversa configurazione tramite `TREC_DATA_DIR`. L'archivio usa AES-256-GCM; gli attributi verificati degli account hanno una durata massima configurata nel relativo modulo di 30 giorni. Conservare **insieme** l'archivio e la rispettiva `OIDC_STORAGE_KEY`: sostituire la chiave impedisce la lettura dei dati precedenti. I wallet Askar rimangono normalmente nel profilo dell'utente WSL (`~/.afj/data/wallet/`) e non vengono copiati nell'archivio ZIP.

La chiave RSA dimostrativa eventualmente incorporata nel progetto originale rimane nel sorgente immutato, ma l'integrazione configura nuove chiavi di firma per il proprio ambiente e le conserva cifrate. Non pubblicare segreti, seed, wallet o dati personali. Poiché l'originale rimane invariato, la sicurezza di un'eventuale pubblicazione dell'intera repository deve essere verificata separatamente, compresa la cronologia dei file `.env`.

# Limiti e sviluppi successivi

Questa versione è destinata a prove **locali**, con una singola istanza del provider. Non sono stati collaudati il deployment pubblico, più processi concorrenti sullo stesso archivio, un client TREC esterno o il flusso refresh token. Le URL `localhost`, i cookie HTTP e l'accettazione automatica delle proof da parte dell'Holder non sono una configurazione di produzione. La verifica nel browser con gli agenti reali va ripetuta nel proprio WSL; vedere [`TEST-REPORT.md`](TEST-REPORT.md) per distinguere quanto collaudato da quanto ancora da verificare.

**Docker non è incluso in questa consegna**: nell'archivio non sono presenti `Dockerfile` né `docker-compose.yml`. I comandi documentati qui sono quelli effettivamente supportati dall'integrazione allegata. Per eseguire l'intero sistema in container che rimangano attivi, occorre ancora predisporre la rete tra i servizi, volumi persistenti per wallet/configurazione/dati OIDC e una modalità continuativa per Holder e Issuer, che attualmente terminano al termine dello scambio.

Per la procedura operativa sintetica, consultare anche [`LEGGIMI.txt`](LEGGIMI.txt).
