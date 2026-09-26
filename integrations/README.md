# TREC — Progetto originale con integrazione per l'autenticazione decentralizzata

Questa cartella aggiunge al progetto originale **TREC** l'autenticazione tramite credenziali verificabili **AnonCreds**, gestite da **Credo TS**, e il rilascio di token **JWT** attraverso **oidc-provider**. Il Verifier controlla la prova presentata dall'Holder; dopo la verifica, il client completa il normale flusso OpenID Connect.

**L'integrazione è aggiuntiva:** è sufficiente collocare `integrations/` nella radice di una copia compatibile del progetto originale. Non occorre sostituire `index.js`, `provider.js`, i sorgenti di Issuer/Holder/Verifier, i loro `.env` o il pacchetto OIDC. Gli adattamenti necessari vengono applicati all'avvio, in memoria.

La versione di riferimento è il commit originale `9ad2a3c7dba8908b57051064c94c6478bf6ca08c`. Con il controllo rigoroso, `verify-originals.cjs` verifica 44 file originali; il controllo ordinario ammette, tra l'altro, `.env` già configurati e terminatori CRLF. Una versione differente dei sorgenti potrebbe non essere compatibile.

## 1. Struttura e funzionamento

| Componente | Ruolo |
| --- | --- |
| **Issuer** | Emette la credenziale AnonCreds usando il proprio wallet Askar e la parte privata della Credential Definition. |
| **Holder** | Conserva la credenziale nel proprio wallet e presenta una prova quando viene richiesto il login. |
| **Verifier** | Controlla la prova tramite Credo TS. Viene avviato insieme al Provider OIDC. |
| **Provider OIDC** | Gestisce autenticazione, consenso e rilascio dei JWT. |
| **Client locale** | Avvia Authorization Code con PKCE, riceve e verifica ID token e access token. |
| **cheqd Testnet** | Ospita DID document, schema e Credential Definition pubblici; non contiene le credenziali né le chiavi private degli utenti. |

I principali moduli aggiunti sono:

- `configure.cjs`: importa i dati di configurazione di un ambiente preesistente senza creare nuove identità.
- `setup.cjs` e `setup/`: inizializzano un ambiente nuovo, creano i wallet, pubblicano le risorse testnet e mantengono il registro delle operazioni.
- `run.cjs` e `runtime/`: avviano gli agenti e adattano in memoria i sorgenti originali, senza modificarli sul disco.
- `verification/oidc-login.cjs`: associa l'interazione OIDC all'invito, alla connessione DIDComm e alla prova verificata.
- `persistence/`: conserva cifrati account, sessioni, artefatti OIDC e chiavi di firma.
- `views/login.pug`: mostra l'invito e riprende il flusso attraverso una navigazione del browser, anche nei login successivi.
- `local-client/`: contiene il client dimostrativo, separato dall'eventuale applicazione TREC esterna.

Gli attributi della credenziale rimangono quelli del progetto originale: `issuerDid`, `holderDid`, `givenName`, `familyName`, `dateOfBirth`, `phone`, `email`, `fiscalCode` e `gender`.

## 2. Setup — Preparazione comune

Le istruzioni sono pensate per **Ubuntu/WSL**, con **Node.js 18.20.8** e npm. Tutti i comandi, salvo indicazione contraria, vanno eseguiti dalla **radice del progetto**: non è necessario che il repository si trovi in una cartella particolare o che il nome dell'utente sia quello dello sviluppatore originale.

### 2.1. Aggiungere la cartella

Scaricare una copia compatibile del progetto originale e inserirvi la sola cartella `integrations/`, ottenendo questa struttura:

```text
trec-oidc-provider/
├── index.js
├── provider.js
├── holder/
├── issuer/
├── verification/
└── integrations/
    ├── configure.cjs
    ├── setup.cjs
    ├── run.cjs
    ├── package.json
    └── ...
```

Se si dispone dello ZIP contenente **soltanto** la cartella `integrations/`, è possibile estrarlo nella radice del repository, senza sovrascrivere configurazioni di un'installazione già avviata.

```bash
cd "/percorso/al/proprio/trec-oidc-provider"
unzip "/percorso/al/file/integrations-release.zip" -d .
```

Se `integrations/` è già presente nella fork scaricata, non occorre estrarre alcun archivio.

### 2.2. Installare le dipendenze e verificare la compatibilità

Fermare prima eventuali processi che usano gli stessi wallet o le stesse porte. Da Ubuntu/WSL:

```bash
cd "/percorso/al/proprio/trec-oidc-provider"

nvm install 18.20.8
nvm use 18.20.8

npm ci --prefix integrations
npm test --prefix integrations
node integrations/verify-originals.cjs
```

Se la repository è una **copia non configurata dello specifico commit originale** e si desidera verificare rigorosamente tutti i file previsti dal manifesto, eseguire anche:

```bash
node integrations/verify-originals.cjs --strict
```

Il risultato atteso del controllo rigoroso è `COMPATIBLE_ORIGINAL_FILES=44`. Il controllo ordinario verifica i sorgenti e il pacchetto essenziali per il runtime, senza rifiutare una copia soltanto perché gli `.env` originali sono già stati configurati.

Se `npm ci` richiede gli strumenti di compilazione nativa:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
npm ci --prefix integrations
```

Non usare `--ignore-scripts`: gli agenti richiedono le librerie native Askar/AnonCreds. Per questa integrazione non occorre eseguire `npm install` nella radice, né compilare manualmente i TypeScript originali con `tsc`.

**Scegliere adesso uno solo dei due percorsi seguenti.** La cartella privata `integrations/config/` non deve già contenere la configurazione di un'altra installazione. Non eliminarla se appartiene a un ambiente che si intende conservare: farne prima un backup privato.

## 3. Caso A — Importare un ambiente TREC già configurato

Usare questa modalità quando esistono già DID, wallet, schema, Credential Definition e, eventualmente, una credenziale ricevuta dall'Holder.

### 3.1. Importare le configurazioni

Se gli `.env` originali sono **nella stessa copia del progetto** in cui si è aggiunta `integrations/`:

```bash
node integrations/configure.cjs .
```

Se gli `.env` appartengono a **un'altra copia del progetto** presente sul computer:

```bash
node integrations/configure.cjs "/percorso/alla/copia/TREC-gia-configurata"
```

Il comando legge i tre file originali `.env`, `holder/.env` e `issuer/.env` e genera i file privati `integrations/config/provider.env`, `holder.env` e `issuer.env`. Conserva gli identificativi e le chiavi dei wallet, i seed necessari e i DID e ID delle risorse effettivamente presenti; non inserisce quelli dell'ambiente dell'autore. Se rileva identità Holder o Credential Definition discordanti, interrompe l'importazione senza sovrascrivere la configurazione esistente.

È supportata anche la migrazione dalla **precedente integrazione singolare** (`integration/`), indicando direttamente la sua directory di configurazione:

```bash
node integrations/configure.cjs "/percorso/alla/vecchia/integration/config"
```

L'importazione genera nuovi segreti per il provider e il client OIDC locali; **non trasferisce le vecchie sessioni OIDC** e non modifica i file del progetto originale.

### 3.2. Verificare che i wallet siano davvero disponibili

```bash
node integrations/setup.cjs status
node integrations/setup.cjs inspect
```

Verificare che tutti e tre i wallet risultino `present`, che la Credential Definition sia configurata e che `inspect` termini con `ISSUER_RESOURCES_VERIFIED=true` quando il wallet Issuer è disponibile.

**Importante:** importare ID, seed e configurazioni **non equivale a copiare fisicamente i wallet**. Per utilizzare le identità preesistenti i database Askar devono essere accessibili allo stesso utente e nello stesso ambiente (per impostazione predefinita in `~/.afj/data/wallet/`). Se ci si sposta su un altro computer, occorre migrare anche i wallet in modo sicuro: conoscere il solo DID o l'ID pubblico della Credential Definition non consente di recuperare le chiavi private, la credenziale dell'Holder o il materiale di emissione dell'Issuer.

Se lo schema non era riportato nei vecchi `.env`, l'importazione non inventa un ID: `inspect` può ricavarlo e verificare le risorse dell'Issuer. Se la configurazione risulta già presente, non ripetere l'importazione sovrascrivendola.

**In questa modalità non eseguire `init`, `wallets` o `publish`:** l'integrazione riutilizza le risorse esistenti e impedisce la creazione automatica di nuovi wallet e DID.

Se l'Holder possiede già una credenziale valida, passare direttamente alla [prova di login](#6-avvio-e-test-del-login-oidc). Altrimenti procedere all'[emissione](#5-emissione-della-credenziale).

## 4. Caso B — Installazione completamente nuova

Usare questa modalità quando si parte da una copia del progetto **senza identità e wallet configurati**, ad esempio per riprodurre il collaudo su un'altra installazione. La cartella `integrations/config/` non deve essere già stata generata.

### 4.1. Generare identità e configurazione

```bash
node integrations/setup.cjs init
node integrations/setup.cjs status
```

Vengono preparati tre ID wallet Askar e tre DID `did:cheqd:testnet` indipendenti, un account Cosmos pagatore e nuovi segreti OIDC. In questa fase **non viene creato alcun wallet e non viene inviata alcuna transazione**. La configurazione privata viene salvata in `integrations/config/`.

Facoltativamente, per usare un pagatore testnet già proprio, salvare la sua frase mnemonica **in un file privato locale** e usare, al posto del normale `init`:

```bash
node integrations/setup.cjs init --payer-file "/percorso/privato/payer.txt"
```

Non inserire mai la frase mnemonica direttamente nella riga di comando. Per il collaudo da zero è sufficiente usare l'account generato da `init` e finanziarne l'indirizzo pubblico.

### 4.2. Creare i wallet locali

```bash
node integrations/setup.cjs wallets
node integrations/setup.cjs status
```

Il comando inizializza i tre wallet Askar; l'output deve riportare `PROVIDER_WALLET=present`, `HOLDER_WALLET=present` e `ISSUER_WALLET=present`. I tre DID risultano ancora **soltanto preparati**, non registrati sulla blockchain. Non sono richiesti fondi per questa fase.

### 4.3. Finanziare il pagatore testnet

Prendere l'indirizzo `COSMOS_PAYER_ADDRESS` mostrato da `status` e finanziarlo tramite il [faucet cheqd Testnet](https://testnet-faucet.cheqd.io/) oppure tramite un altro account testnet. **Keplr e Leap servono eventualmente a gestire o finanziare l'account Cosmos: non sostituiscono i wallet Askar degli agenti.**

La configurazione di prova prevede `CHEQD_RESOURCE_FEE_NCHEQ=2500000000000` (2.500 CHEQ testnet) per le risorse JSON. Il collaudo ha richiesto inoltre una regolazione della commissione DID nella cartella `integrations/`: prima della pubblicazione assicurarsi di usare la **versione aggiornata e collaudata** della cartella, che include tale correzione. Verificare le commissioni effettivamente richieste dalla rete e che il saldo le copra; il valore storico non è una tariffa aggiornata garantita.

### 4.4. Pubblicare DID e risorse dell'Issuer

Solo dopo aver verificato saldo e commissioni:

```bash
node integrations/setup.cjs publish
node integrations/setup.cjs status
node integrations/setup.cjs inspect
```

Il setup registra i tre DID, lo schema TREC e una Credential Definition dell'Issuer, senza revoca, registrandone gli ID nei file di configurazione. L'esito atteso comprende `did-holder=done`, `did-provider=done`, `did-issuer=done`, `schema=done`, `definition=done`, `SCHEMA_ID` e `CREDENTIAL_DEFINITION_ID` valorizzati e `ISSUER_RESOURCES_VERIFIED=true`.

Le operazioni completate vengono registrate in `integrations/config/setup-state.json`. Se `publish` si interrompe, **non cancellare il registro, non ripetere `init` e non riavviare subito la pubblicazione**: prima verificare il risultato delle transazioni e consultare la sezione [Ripresa di un setup interrotto](#7-ripresa-di-un-setup-interrotto).

### 4.5. Preparare gli attributi dimostrativi

Prima dell'emissione, personalizzare se necessario `integrations/config/credential-attributes.json`. Per i test utilizzare dati fittizi: `issuerDid` e `holderDid` vengono ricavati dalla configurazione e **non** vanno inseriti manualmente nel JSON.

## 5. Emissione della credenziale

Questo passaggio serve sempre in un'installazione nuova e, in un ambiente importato, **soltanto se l'Holder non dispone già di una credenziale valida**.

Aprire due terminali diversi, entrambi nella radice del progetto e con Node 18 attivo.

**Terminale 1 — Issuer**

```bash
node integrations/run.cjs issuer
```

**Terminale 2 — Holder**

```bash
node integrations/run.cjs holder
```

Copiare **l'invito appena generato dall'Issuer** e incollarlo nel terminale Holder. Attendere il completamento dello scambio. L'Issuer utilizza la Credential Definition configurata e il proprio materiale privato; l'Holder salva la credenziale nel suo wallet.

Nel runner corretto, l'Holder attende il completamento dell'invio della conferma finale della credenziale prima dello spegnimento. Se lo scambio termina con `SCAMBIO_FALLITO` nonostante `credential-received`, controllare di aver copiato la versione aggiornata e collaudata di `integrations/runtime/agent-runner.cjs`.

I runner dimostrativi di Issuer e Holder possono terminare dopo lo scambio. Per il login, avviare nuovamente l'Holder.

## 6. Avvio e test del login OIDC

Avviare **tre terminali** nella radice del progetto, con Node 18 attivo. Il Verifier viene avviato dal Provider: non è necessario eseguire separatamente `verification/test-proof.ts`.

**Terminale 1 — Provider OIDC e Verifier**

```bash
node integrations/run.cjs provider
```

**Terminale 2 — Holder con credenziale già ricevuta**

```bash
node integrations/run.cjs holder
```

**Terminale 3 — Client dimostrativo**

```bash
node integrations/run.cjs client
```

Aprire **<http://localhost:3004>**, premere **Accedi con la credenziale**, copiare l'intero nuovo invito mostrato dalla pagina e incollarlo nel terminale Holder. Attendere la presentazione e la verifica della prova AnonCreds. Se appare la pagina di consenso, confermarla.

Risultati attesi:

```text
# Terminale Provider
OIDC_PROOF_VERIFIED=true

# Terminale Client
OIDC_ACCESS_TOKEN_VERIFIED=true
OIDC_LOGIN_VERIFIED=true
```

Il client verifica `state`, PKCE, firma, `issuer`, `audience`, scadenza, `nonce` e corrispondenza del soggetto nei token. I token completi non vengono mostrati nella pagina né stampati nei log. Lo scope `trec` abilita i claim personali previsti dall'integrazione.

Per provare **due login consecutivi**, lasciare attivi Provider e Client, riavviare soltanto l'Holder se è terminato e ripartire dalla pagina iniziale del client. Usare ogni volta un nuovo invito; il consenso OIDC potrebbe non essere richiesto al secondo accesso.

Nel profilo locale le porte sono: Provider `3000`, Verifier `3001`, Holder `3002`, Issuer `3003` e Client `3004`; la callback è `http://localhost:3004/callback`.

## 7. Ripresa di un setup interrotto

Il registro `integrations/config/setup-state.json` permette di riprendere un'installazione nuova senza ricreare automaticamente wallet o risorse già completate. Se l'esito di una transazione è incerto, il setup si ferma invece di ritrasmetterla.

Solo dopo aver controllato l'esito sulla rete e i record del wallet, è disponibile il tentativo **esplicito**:

```bash
node integrations/setup.cjs publish --retry-pending
```

Può consumare altri CHEQ testnet e creare risorse aggiuntive se una transazione precedente era in realtà riuscita. Per una Credential Definition già pubblicata ma senza le chiavi private nel wallet Issuer è necessario recuperare il wallet corretto; il solo ID pubblico non basta.

Se compare un errore di lock, verificare che nessun setup sia ancora attivo. Soltanto per rimuovere il lock di un processo effettivamente terminato **sullo stesso host**:

```bash
node integrations/setup.cjs unlock
```

Non eseguire il setup e gli agenti contemporaneamente sugli stessi wallet.

## 8. Problemi comuni e sicurezza

- **`Wallet non trovato`**: controllare ID, chiave e presenza fisica del wallet Askar nel giusto utente/ambiente; un import non crea wallet vuoti al posto di quelli mancanti.
- **`Sorgente non compatibile`**: verificare il commit del progetto originale e che siano stati aggiunti soltanto i file di `integrations/`. Non eliminare né aggirare il controllo degli hash.
- **`SCAMBIO_FALLITO`**: verificare che Issuer e Holder siano ancora attivi, che l'invito sia nuovo, che gli endpoint DIDComm siano raggiungibili e che si usi il runner con la correzione dell'ACK finale.
- **`INVALID_STATE` o callback non valida**: ricominciare il login dalla home del client con un nuovo invito; il codice di autorizzazione è monouso.
- **`did-*=pending`**: verificare la registrazione sulla rete e il saldo prima di scegliere un nuovo tentativo; non cancellare `setup-state.json`.

I file `integrations/config/`, `integrations/.oidc-data/`, `integrations/node_modules/`, i database dei wallet, le chiavi private, i seed e i log contenenti dati sensibili **non devono essere inclusi nello ZIP distribuibile né pubblicati su GitHub**. Conservare backup privati di configurazioni e wallet che si desidera riutilizzare. Il README non contiene identificativi fissi degli ambienti di prova dell'autore.

Questa configurazione è destinata al **collaudo locale su cheqd Testnet**. L'esecuzione persistente di tutti gli agenti tramite Docker, il deployment pubblico, le istanze multiple e l'integrazione con un'applicazione TREC di produzione non sono oggetto di questa guida.

## 9. Verifiche del progetto originale

Terminato il setup o il login, dalla radice del progetto:

```bash
npm test --prefix integrations
node integrations/verify-originals.cjs --strict
```

Il collaudo locale della versione aggiornata ha completato **34 test automatici** e il controllo rigoroso ha restituito `COMPATIBLE_ORIGINAL_FILES=44`. Questi controlli si aggiungono alla prova manuale di emissione, presentazione della credenziale e login OIDC eseguita con wallet e risorse reali sulla testnet. Per il dettaglio dei test automatici consultare `integrations/TEST-REPORT.md`, verificandone la data e l'eventuale aggiornamento rispetto al collaudo più recente.
