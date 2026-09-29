# TREC OIDC Provider — Autenticazione decentralizzata

Questa repository è una fork del progetto originale `trec-oidc-provider`.

Il progetto originale è stato mantenuto e, nella directory `integrations/`, è stata aggiunta un'implementazione dell'autenticazione decentralizzata basata su:

- OpenID Connect;
- DIDComm;
- Credo;
- AnonCreds;
- cheqd testnet;
- QR code;
- Verifier decentralizzato;
- JWT contenenti gli attributi TREC.

L'obiettivo dell'implementazione è separare chiaramente:

```text
PROVISIONING
eseguito una sola volta

Issuer DID
    ↓
Schema
    ↓
Credential Definition
    ↓
Wallet
```

dal normale flusso di autenticazione:

```text
AUTENTICAZIONE

Client web
    ↓
OIDC Provider
    ↓
QR DIDComm
    ↓
Holder
    ↓
Proof AnonCreds
    ↓
Verifier
    ↓
OIDC Authorization Code
    ↓
JWT
```

Durante il normale utilizzo **non vengono creati nuovi DID, Schema o Credential Definition**.

---

# 1. Struttura del progetto

Il progetto originale è stato mantenuto.

L'implementazione aggiunta è contenuta principalmente in:

```text
integrations/
├── config/
│   └── testnet.json
├── local-client/
│   └── client.cjs
├── public/
├── runtime/
│   └── config.cjs
├── server/
├── tests/
├── views/
│   └── login.pug
├── .env.example
├── package.json
├── package-lock.json
└── run.cjs
```

Le componenti principali sono:

- **Issuer**: emette la credenziale TREC;
- **Holder**: rappresenta l'utente che possiede la credenziale;
- **Verifier**: verifica la proof presentata dall'Holder;
- **OIDC Provider**: completa il flusso OpenID Connect;
- **Client web**: avvia il login e riceve il risultato dell'autenticazione.

---

# 2. Configurazione già inizializzata

Le risorse pubbliche utilizzate dal progetto sono già state create su **cheqd testnet**.

Sono memorizzate in:

```text
integrations/config/testnet.json
```

e non devono essere ricreate a ogni esecuzione.

## Issuer DID

```text
did:cheqd:testnet:0dc326ad-0448-4397-9618-f93f0397f9d0
```

## Schema ID

```text
did:cheqd:testnet:0dc326ad-0448-4397-9618-f93f0397f9d0/resources/ce27ee35-3fec-48d7-a8f8-c72bb226804d
```

## Credential Definition ID

```text
did:cheqd:testnet:0dc326ad-0448-4397-9618-f93f0397f9d0/resources/a3253d35-9e65-4575-a2c2-120aacf2e80f
```

## Issuer Wallet ID

```text
issuer-ceab728a-0f99-47b3-867f-1c3c3707b446
```

## Verifier Wallet ID

```text
trec-verifier-e86633fc-b913-435b-b4ea-504e3f96951f
```

## Holder utilizzato nei test

DID:

```text
did:cheqd:testnet:3924dcdd-2361-41f7-873f-8449f0b5eebb
```

Wallet ID:

```text
holder-46d7af0b-241c-4b45-878f-ebd4abe3ec30
```

Questi valori sono identificativi pubblici e possono essere presenti nel repository.

---

# 3. Cosa NON deve essere ricreato

Per utilizzare normalmente l'implementazione non è necessario:

```text
creare nuovamente l'Issuer DID
creare nuovamente l'Holder DID di test
registrare nuovamente lo Schema
creare una nuova Credential Definition
modificare i sorgenti per una "prima esecuzione"
decommentare createDid()
decommentare registerSchema()
decommentare defineCredential()
```

Il runtime utilizza direttamente le risorse già provisionate.

In particolare, non è necessario modificare `issuer.ts` o `holder.ts` per effettuare il normale login.

---

# 4. Informazioni che non vengono pubblicate

Il repository non contiene materiale crittografico privato.

Non devono essere pubblicati:

```text
wallet key
seed Cosmos
mnemonic
private key
database Askar
OIDC client secret
cookie secret
.env reali
```

Questi valori devono essere conservati solamente sulla macchina che esegue i rispettivi servizi.

Il fatto che un Wallet ID sia pubblico **non permette di aprire il wallet**: è comunque necessaria la relativa chiave privata.

---

# 5. Requisiti

Per l'integrazione utilizzare una versione Node.js:

```text
>= 20
< 25
```

La versione utilizzata durante lo sviluppo e i test è:

```text
Node.js 22.14.0
npm 10.x
```

Se viene utilizzato `nvm`:

```bash
nvm use 22.14.0
```

L'Issuer e l'Holder originali sono stati utilizzati durante il provisioning con:

```text
Node.js 18.20.8
npm 10.4.0
```

---

# 6. Download e installazione

Clonare il repository:

```bash
git clone https://github.com/ImNotVirgola/trec-oidc-provider.git
```

Entrare nella directory:

```bash
cd trec-oidc-provider
```

Se l'implementazione non è ancora stata integrata in `main`, selezionare il branch:

```bash
git checkout decentralized-auth
```

Installare quindi le dipendenze dell'integrazione:

```bash
cd integrations
npm ci
```

---

# 7. Configurazione pubblica

La configurazione pubblica è contenuta in:

```text
integrations/config/testnet.json
```

Il file contiene:

- rete cheqd;
- Issuer DID;
- Schema ID;
- Credential Definition ID;
- Issuer Wallet ID;
- Verifier Wallet ID;
- Holder DID utilizzato nei test;
- Holder Wallet ID utilizzato nei test;
- configurazione OIDC;
- porte;
- endpoint DIDComm.

Questi dati vengono caricati automaticamente da:

```text
integrations/runtime/config.cjs
```

Non è quindi necessario duplicarli nel `.env`.

---

# 8. Configurazione privata del server

I dati privati vengono letti automaticamente da:

```text
$HOME/.config/trec-auth/auth.env
```

Creare prima la directory:

```bash
mkdir -p "$HOME/.config/trec-auth"
```

Poi creare:

```text
$HOME/.config/trec-auth/auth.env
```

È possibile utilizzare come riferimento:

```text
integrations/.env.example
```

## Valori obbligatori

```dotenv
VERIFIER_WALLET_KEY=<CHIAVE_WALLET_VERIFIER>
OIDC_CLIENT_SECRET=<SECRET_CLIENT_OIDC>
```

### `VERIFIER_WALLET_KEY`

È la chiave necessaria per aprire il wallet Verifier.

Il relativo Wallet ID è già configurato in:

```text
integrations/config/testnet.json
```

e normalmente non deve essere modificato.

Il placeholder:

```text
<CHIAVE_WALLET_VERIFIER>
```

deve essere sostituito con la chiave privata reale del wallet Verifier.

Questa chiave **non deve essere pubblicata su GitHub**.

### `OIDC_CLIENT_SECRET`

È il secret utilizzato dal client OIDC.

Il placeholder:

```text
<SECRET_CLIENT_OIDC>
```

deve essere sostituito con il secret utilizzato dall'installazione.

Anche questo valore deve rimanere privato.

---

# 9. Parametri privati opzionali

È possibile aggiungere al file:

```text
$HOME/.config/trec-auth/auth.env
```

anche:

```dotenv
OIDC_COOKIE_SECRET=
VERIFIER_WALLET_PATH=
```

## `OIDC_COOKIE_SECRET`

Secret utilizzato per la gestione delle sessioni/cookie.

È facoltativo nell'ambiente di sviluppo.

## `VERIFIER_WALLET_PATH`

Percorso del database del wallet Verifier.

Deve essere impostato solamente se il wallet si trova in una posizione diversa da quella predefinita.

---

# 10. Endpoint e configurazione di rete

Il file:

```text
integrations/config/testnet.json
```

contiene attualmente endpoint utilizzati durante lo sviluppo.

Ad esempio:

```text
Verifier:
http://192.168.0.101:3001

Issuer:
http://192.168.0.101:3003
```

Gli indirizzi IP **non fanno parte del provisioning decentralizzato**.

Se il progetto viene spostato su un'altra macchina o su un'altra rete non è necessario creare nuovi DID, Schema o Credential Definition.

È sufficiente cambiare l'endpoint di rete.

Per il Verifier è possibile evitare di modificare `testnet.json` aggiungendo nel file privato:

```dotenv
VERIFIER_ENDPOINT=http://<IP_SERVER>:3001
```

dove:

```text
<IP_SERVER>
```

deve essere sostituito con l'indirizzo LAN della macchina che esegue il Verifier.

Esempio:

```dotenv
VERIFIER_ENDPOINT=http://192.168.1.50:3001
```

È inoltre possibile modificare:

```dotenv
VERIFIER_PORT=3001
OIDC_BIND_HOST=127.0.0.1
CLIENT_BIND_HOST=127.0.0.1
```

solamente se richiesto dall'ambiente di deployment.

---

# 11. Avvio del server OIDC e del Verifier

Aprire un terminale e posizionarsi nella directory:

```bash
cd integrations
```

Se necessario:

```bash
nvm use 22.14.0
```

Avviare:

```bash
npm start
```

Il comando avvia:

```text
OIDC Provider
Server di autenticazione
Credo Verifier
```

La configurazione viene caricata automaticamente da:

```text
integrations/config/testnet.json
```

e:

```text
$HOME/.config/trec-auth/auth.env
```

Non è necessario impostare manualmente `TREC_AUTH_ENV` se viene utilizzato il percorso predefinito.

---

# 12. Avvio del client web

Aprire un secondo terminale.

Dalla root del repository:

```bash
cd integrations
```

Avviare:

```bash
npm run client
```

Aprire nel browser:

```text
http://localhost:3004
```

Premere:

```text
Accedi
```

per iniziare il flusso di autenticazione.

---

# 13. Flusso di login

Il flusso è:

```text
Client web
    ↓
OIDC Authorization Request
    ↓
Server di autenticazione
    ↓
QR DIDComm
    ↓
Holder
    ↓
Proof AnonCreds
    ↓
Credo Verifier
    ↓
OIDC Authorization Code
    ↓
Token Endpoint
    ↓
JWT
```

L'Issuer non partecipa al normale login.

Serve solamente durante l'emissione di una nuova credenziale.

---

# 14. Formato del QR

Il QR mostrato dal server utilizza:

```text
didcomm://?oob=...
```

Questo formato permette ai wallet DIDComm compatibili di riconoscere direttamente l'invito Out-of-Band.

Il precedente QR basato direttamente su un URL HTTP non veniva riconosciuto correttamente da BC Wallet / BC Services Card.

---

# 15. Attributi TREC richiesti

La Proof Request richiede i nove attributi previsti dal progetto originale:

```text
issuerDid
holderDid
givenName
familyName
dateOfBirth
phone
email
fiscalCode
gender
```

Gli stessi attributi vengono poi utilizzati per costruire l'identità OIDC autenticata e il JWT.

---

# 16. Verifica della Credential Definition

Per compatibilità con wallet che non implementano direttamente il registry AnonCreds di cheqd, la Proof Request inviata al wallet non contiene la restriction:

```text
cred_def_id
```

Il controllo non è stato eliminato.

È stato spostato lato Verifier.

Dopo aver ricevuto la proof, il server verifica:

- validità crittografica della proof;
- sessione associata;
- nonce;
- presenza di tutti i nove attributi;
- provenienza degli attributi dalla stessa credenziale;
- Issuer DID;
- Holder DID;
- Credential Definition ID realmente utilizzato.

Il Credential Definition ID deve corrispondere a:

```text
did:cheqd:testnet:0dc326ad-0448-4397-9618-f93f0397f9d0/resources/a3253d35-9e65-4575-a2c2-120aacf2e80f
```

---

# 17. Test automatici

Dalla directory:

```bash
cd integrations
```

eseguire:

```bash
npm test
```

Il risultato atteso è:

```text
tests 16
pass 16
fail 0
```

La suite verifica tra le altre cose:

- integrità del progetto originale;
- OIDC discovery;
- creazione degli inviti DIDComm;
- codifica QR;
- correlazione tra sessione e proof;
- nonce;
- connessioni ripetute;
- attributi mancanti;
- credenziali miste;
- Credential Definition errata;
- Issuer errato;
- timeout;
- proof rifiutate;
- Authorization Code;
- firma JWT;
- presenza di tutti i claim TREC;
- disponibilità delle dipendenze native Credo.

---

# 18. Test end-to-end reale

È disponibile anche:

```bash
npm run test:live
```

Questo test non utilizza una proof simulata.

Utilizza:

- Verifier Credo reale;
- Holder Credo reale;
- credenziale AnonCreds reale;
- DIDComm reale;
- proof AnonCreds reale;
- OIDC reale;
- JWT firmato.

Per eseguirlo è necessario indicare il file `.env` dell'Holder utilizzato per il test:

```bash
export TREC_HOLDER_ENV="<PERCORSO_REPOSITORY>/holder/.env"
```

## Placeholder `<PERCORSO_REPOSITORY>`

Indica la cartella nella quale il repository è stato clonato.

Esempio:

```text
/home/utente/progetti/trec-oidc-provider
```

Quindi:

```bash
export TREC_HOLDER_ENV="/home/utente/progetti/trec-oidc-provider/holder/.env"
```

In alternativa è possibile utilizzare `$HOME`:

```bash
export TREC_HOLDER_ENV="$HOME/progetti/trec-oidc-provider/holder/.env"
```

Poi:

```bash
cd integrations
npm run test:live
```

Un'esecuzione corretta produce, tra gli altri:

```text
OIDC_DISCOVERY_OK=true
QR_INVITATION_CREATED=true
PROOF_VERIFIED=true
AUTHORIZATION_CODE_OK=true
JWT_SIGNATURE_VALID=true
JWT_ALL_TREC_CLAIMS_PRESENT=true
OIDC_LOGIN_VERIFIED=true
SECOND_LOGIN_OK=true
```

---

# 19. Holder

L'Holder rappresenta l'utente che effettua l'accesso.

Il suo compito è:

```text
possedere una credenziale TREC
        ↓
scansionare il QR
        ↓
ricevere la Proof Request
        ↓
condividere gli attributi richiesti
        ↓
produrre la Proof
```

L'Holder non deve conoscere:

```text
VERIFIER_WALLET_KEY
OIDC_CLIENT_SECRET
OIDC_COOKIE_SECRET
Issuer Cosmos seed
Verifier wallet database
```

Questi sono dati del server.

---

# 20. Holder locale utilizzato nei test

Nel file:

```text
integrations/config/testnet.json
```

è documentato anche l'Holder utilizzato durante i test:

```text
DID:
did:cheqd:testnet:3924dcdd-2361-41f7-873f-8449f0b5eebb

Wallet ID:
holder-46d7af0b-241c-4b45-878f-ebd4abe3ec30
```

La relativa Wallet Key non viene pubblicata.

Per utilizzare esattamente quel wallet su una macchina è necessario disporre anche del relativo storage e della relativa chiave privata.

---

# 21. Issuer

L'Issuer serve esclusivamente per emettere una credenziale.

Non deve essere avviato durante un normale login.

Le seguenti operazioni sono già state completate:

```text
creazione Issuer DID
pubblicazione Schema
pubblicazione Credential Definition
```

Non è quindi necessario modificare il codice per rieseguire:

```text
createDid()
registerSchema()
defineCredential()
```

Il Credential Definition ID da utilizzare rimane:

```text
did:cheqd:testnet:0dc326ad-0448-4397-9618-f93f0397f9d0/resources/a3253d35-9e65-4575-a2c2-120aacf2e80f
```

Per emettere nuove credenziali servono comunque localmente le informazioni private dell'Issuer:

- wallet key;
- Cosmos seed;
- wallet storage.

Questi dati non sono e non devono essere presenti nel repository.

---

# 22. Utilizzo con wallet su smartphone

Se il Verifier gira sulla stessa macchina del browser ma l'Holder è su uno smartphone, il telefono deve poter raggiungere:

```text
VERIFIER_ENDPOINT
```

Un endpoint come:

```text
http://127.0.0.1:3001
```

non è utilizzabile da un telefono, perché sul telefono `127.0.0.1` indica il telefono stesso.

Utilizzare invece un indirizzo LAN, ad esempio:

```text
http://<IP_SERVER>:3001
```

---

# 23. Windows + WSL

Se il Verifier viene eseguito dentro WSL e il wallet si trova su uno smartphone nella stessa rete, può essere necessario inoltrare la porta da Windows verso WSL.

## Individuare l'IP LAN di Windows

Da WSL:

```bash
powershell.exe -NoProfile -Command \
"(Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -ne \$null -and \$_.NetAdapter.Status -eq 'Up' }).IPv4Address.IPAddress" \
| tr -d '\r'
```

## Individuare l'IP di WSL

```bash
hostname -I | awk '{print $1}'
```

## Port forwarding del Verifier

Aprire PowerShell come amministratore:

```powershell
netsh interface portproxy add v4tov4 `
  listenaddress=0.0.0.0 `
  listenport=3001 `
  connectaddress=<IP_WSL> `
  connectport=3001
```

Sostituire:

```text
<IP_WSL>
```

con l'indirizzo restituito dal comando precedente.

## Firewall

```powershell
New-NetFirewallRule `
  -DisplayName "TREC Verifier 3001" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3001 `
  -Action Allow `
  -Profile Private
```

Se deve essere raggiunto anche l'Issuer:

```powershell
netsh interface portproxy add v4tov4 `
  listenaddress=0.0.0.0 `
  listenport=3003 `
  connectaddress=<IP_WSL> `
  connectport=3003
```

e:

```powershell
New-NetFirewallRule `
  -DisplayName "TREC Issuer 3003" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3003 `
  -Action Allow `
  -Profile Private
```

Controllare con:

```powershell
netsh interface portproxy show all
```

---

# 24. Test con BC Wallet / BC Services Card

L'integrazione è stata provata anche su iPhone con BC Wallet / BC Services Card.

Sono stati verificati correttamente:

```text
Riconoscimento QR DIDComm          PASS
Connessione DIDComm               PASS
Ricezione Proof Request           PASS
Visualizzazione 9 attributi TREC  PASS
```

Una precedente Proof Request conteneva:

```text
cred_def_id=did:cheqd:...
```

e BC Wallet restituiva:

```text
Error code 1043 - Invalid credential definition id
```

Il problema è stato risolto eliminando la restriction dalla richiesta lato wallet e mantenendo il controllo lato Verifier.

Attualmente la build pubblica di BC Wallet utilizzata durante i test arriva correttamente alla selezione della credenziale, ma mostra:

```text
Credential
Not in your wallet
```

perché la credenziale TREC non è stata completata e memorizzata nel wallet mobile utilizzato.

Il flusso completo è stato invece verificato con successo utilizzando l'Holder Credo locale.

---

# 25. Placeholder da configurare

Di seguito sono riepilogati tutti i placeholder che possono comparire nella configurazione o nelle istruzioni.

| Placeholder | Dove | Significato | Obbligatorio |
|---|---|---|---|
| `<CHIAVE_WALLET_VERIFIER>` | `$HOME/.config/trec-auth/auth.env` | Chiave privata per aprire il wallet Verifier già configurato | Sì |
| `<SECRET_CLIENT_OIDC>` | `$HOME/.config/trec-auth/auth.env` | Secret del client OIDC | Sì |
| `<IP_SERVER>` | Override `VERIFIER_ENDPOINT` | IP LAN della macchina che esegue il Verifier | Solo per wallet remoti |
| `<PERCORSO_REPOSITORY>` | `TREC_HOLDER_ENV` | Directory nella quale è stato clonato il repository | Solo per `test:live` |
| `<IP_WSL>` | PowerShell `portproxy` | IP interno della distribuzione WSL | Solo con WSL + smartphone |

I seguenti valori **non sono placeholder** e normalmente non devono essere modificati:

```text
Issuer DID
Schema ID
Credential Definition ID
Issuer Wallet ID
Verifier Wallet ID
Holder DID di test
Holder Wallet ID di test
rete cheqd testnet
OIDC Client ID
OIDC Redirect URI
```

---

# 26. Setup rapido dopo il download

In sintesi, dopo aver scaricato il progetto:

### 1. Installare le dipendenze

```bash
cd trec-oidc-provider/integrations
nvm use 22.14.0
npm ci
```

### 2. Creare la configurazione privata

```bash
mkdir -p "$HOME/.config/trec-auth"
```

Creare:

```text
$HOME/.config/trec-auth/auth.env
```

contenente almeno:

```dotenv
VERIFIER_WALLET_KEY=<CHIAVE_WALLET_VERIFIER>
OIDC_CLIENT_SECRET=<SECRET_CLIENT_OIDC>
```

### 3. Se necessario, impostare l'IP del Verifier

Per un Holder su smartphone:

```dotenv
VERIFIER_ENDPOINT=http://<IP_SERVER>:3001
```

### 4. Verificare i test

```bash
npm test
```

Risultato atteso:

```text
16 pass
0 fail
```

### 5. Avviare server

```bash
npm start
```

### 6. Avviare client

In un secondo terminale:

```bash
cd trec-oidc-provider/integrations
npm run client
```

### 7. Aprire il browser

```text
http://localhost:3004
```

Premere `Accedi` e utilizzare l'Holder per scansionare il QR.

---

# 27. Sicurezza

Non pubblicare mai:

```text
.env reali
wallet key
Cosmos seed
mnemonic
private key
database Askar
OIDC client secret
cookie secret
```

Possono invece essere versionati:

```text
DID
Schema ID
Credential Definition ID
wallet ID
porte
nomi dei servizi
configurazione pubblica
```

---

# 28. Limiti attuali

L'OIDC Provider utilizza attualmente l'adapter in-memory di sviluppo.

Questo è adeguato per:

- sviluppo;
- test;
- demo del progetto.

Per un deployment di produzione deve essere sostituito da uno storage persistente.

La compatibilità completa con la build pubblica di BC Wallet rimane inoltre limitata dall'emissione della credenziale TREC sul wallet mobile.

La parte centrale dell'autenticazione decentralizzata è stata invece verificata end-to-end con Credo Holder e Credo Verifier reali.