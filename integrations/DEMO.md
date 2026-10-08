# Demo minima del protocollo TREC

Base verificata: branch `decentralized-auth`, commit `26a959a6e27f64d2217d28c61dfa8847bb3a0720`. Nessuna modifica fuori da integrations, nessuna nuova dipendenza e nessun provisioning.

## Prima prova: test reale fuori da Docker

Nella WSL, ferma gli agenti che usano gli stessi wallet o porte. Usa i file privati già funzionanti. Esempio per la copia Git modificata su Windows:

```sh
cd /mnt/d/Desktop/trec-oidc-provider-github/integrations
nvm use 22
npm ci
export TREC_AUTH_ENV="$HOME/.config/trec-auth/auth.env"
export TREC_HOLDER_ENV="/mnt/d/Desktop/trec-oidc-provider/holder/.env"
npm run test:live
```

Se la configurazione privata del Verifier è in un'altra posizione, cambia TREC_AUTH_ENV. Non usare il `.env` principale originale con segnaposto. Il file Holder indicato contiene già ID e chiave nella copia privata fornita; non pubblicarlo. I database esistenti vengono solo aperti. La configurazione del Holder deve avere un endpoint/porta raggiungibili dal Verifier e diversi dalla porta del Verifier.

Il test avvia due agenti Credo separati che scambiano messaggi DIDComm via HTTP, il provider e il client; ripete due accessi. Non è sufficiente che il comando parta: deve terminare senza errori e mostrare:

```text
PROOF_VERIFIED=true
AUTHORIZATION_CODE_OK=true
TOKEN_ENDPOINT_EXCHANGE_OK=true
ACCESS_TOKEN_RECEIVED=true
JWT_SIGNATURE_VALID=true
JWT_ALL_TREC_CLAIMS_PRESENT=true
PROTECTED_RESOURCE_WITHOUT_TOKEN_REJECTED=true
PROTECTED_RESOURCE_WITH_TOKEN_OK=true
SECOND_LOGIN_OK=true
```

Gli errori riportano la fase, senza stampare oggetti contenenti segreti. Se il Holder non possiede una credenziale idonea, il test deve fallire. Non si creano nuove credenziali in questo percorso.

## Avvio manuale per il video

Terminato il test live, apri tre terminali nella stessa cartella integrations. In tutti seleziona Node 22.

**Terminale 1 — server OIDC e Verifier:**

```sh
export TREC_AUTH_ENV="$HOME/.config/trec-auth/auth.env"
node run.cjs server
```

**Terminale 2 — client:**

```sh
export TREC_AUTH_ENV="$HOME/.config/trec-auth/auth.env"
node run.cjs client
```

**Terminale 3 — Holder di test separato:**

```sh
export TREC_HOLDER_ENV="/mnt/d/Desktop/trec-oidc-provider/holder/.env"
npm run holder
```

Il Holder riutilizza l'agente Credo già presente in integrations e il proprio wallet. Non legge la chiave del Verifier o il segreto OIDC del client. Incollare un invito nel terminale autorizza la presentazione automatica per quel test, come nel vecchio Holder. Resta in ascolto dopo ogni accesso; digitare `esci` per chiuderlo. Non usare contemporaneamente il vecchio Holder sullo stesso database.

## Scaletta video

1. Mostra i tre terminali avviati e `HOLDER_READY=true`.
2. Apri `http://localhost:3004` e premi Accedi.
3. Nella pagina QR apri **Invito per il Holder locale di test**: contiene lo stesso payload DIDComm del QR.
4. Copia l'invito nel terminale Holder. Mostra `HOLDER_PRESENTATION_SENT=true` e, nel server, `PROOF_VERIFIED=true`.
5. Il browser torna al client. Mostra i marker del codice ricevuto, dello scambio sul token endpoint e dell'access token JWT verificato. Il codice monouso e il token completo non vengono stampati.
6. Mostra il payload verificato: i claim standard non personali sono visibili, i valori personali sono indicati come omessi. I nomi dei nove claim TREC sono presenti.
7. Premi **1. Risorsa senza JWT**: HTTP 401.
8. Premi **Richiedi con Bearer JWT**: stessa risorsa, HTTP 200.
9. Torna al client e ripeti il login senza riavviare il Holder.

La stessa prova senza token si può mostrare nel terminale:

```sh
curl -i http://localhost:3000/trec-api/profile
```

La chiamata con token viene effettuata realmente dal backend del client verso `/trec-api/profile`, con header `Authorization: Bearer <access_token>`. Il cookie del browser contiene solo un identificativo casuale della demo. Il token resta in memoria fino alla scadenza; non viene salvato nel browser o su disco. L'endpoint verifica firma RS256, issuer, audience, scadenza, scope e claim TREC. Non è una piattaforma completa: la risposta restituisce soltanto conferma di accesso, senza dati personali.

## Test eseguiti durante la modifica

- Baseline: 15 passati, 0 falliti, 1 saltato.
- Fase Holder: conversione invito e continuità listener, più regressione OIDC, passati.
- Fase marker/payload: test del client e OIDC passati.
- Fase risorsa: 401 senza token, 200 con token, rifiuto di JWT alterato e ID token, passati.
- Suite finale: **18 passati, 0 falliti, 1 saltato**, Node 22.14.0. I test aggiunti verificano anche firma, scadenza, issuer, audience, scope, attributi e identità della risorsa protetta.
- Nei test automatici il provider, HTTP e le firme JWT sono reali, ma la proof è simulata (`PROOF_VERIFIED_SIMULATED=true`). Il test nativo è saltato perché le librerie non sono disponibili nell'ambiente Windows accessibile.
- **Test live non eseguito sui wallet dell'utente:** WSL restituisce accesso negato. Non viene dichiarato `PROOF_VERIFIED=true` per questa consegna.

## Docker: fase successiva, non ancora eseguita

Come richiesto, la dockerizzazione va fatta **dopo** il successo del test reale fuori da Docker. Non sono stati aggiunti Dockerfile o Compose in questo intervento: non è possibile superare onestamente quel requisito senza eseguire il test con i wallet esistenti. Anche il daemon Docker non è disponibile nell'ambiente accessibile. Il prossimo passo è eseguire il comando live sopra nella WSL e verificarne l'output; non rifare il provisioning né sostituire gli ID configurati.
