# Demo Docker locale

Il flusso reale fuori da Docker e il secondo login sono stati confermati dall'utente. Questa configurazione Docker deve ancora essere costruita ed eseguita nella sua WSL: non è dichiarata verificata end-to-end.

## Struttura

Tre container: `server` (OIDC e Verifier), `client`, `holder`. Client e Holder condividono la rete del container server tramite `network_mode: service:server`, mantenendo gli URL localhost della demo. Sono processi separati con filesystem separati: il Holder scambia messaggi DIDComm via HTTP, non accede al wallet Verifier. Questa demo è locale, non permette di usare il QR da un telefono.

L'immagine contiene soltanto il codice e le dipendenze di integrations. I file privati sono montati come Compose secrets e i due database come directory persistenti distinte. Il client riutilizza il file auth esistente perché il caricatore comune lo richiede; non riceve il database Verifier. Gli ID e le chiavi non vengono cambiati. Il provider mantiene il suo stato OIDC temporaneo: dopo un riavvio occorre un nuovo login.

Riferimenti: [reti e servizi Compose](https://docs.docker.com/reference/compose-file/services/) e [file privati come secrets](https://docs.docker.com/compose/how-tos/use-secrets/).

## Preparazione nella WSL

Verifica Docker Desktop acceso, container Linux e integrazione con la tua distribuzione WSL, oppure un Docker Engine Linux già funzionante:

```sh
docker version
docker compose version
```

Ferma server, client e Holder avviati fuori da Docker. Non aprire contemporaneamente gli stessi wallet da due processi. Copia solo i nuovi file nella cartella funzionante:

```sh
cd ~/trec-demo-vr9sAD/integrations
cp /mnt/d/Desktop/trec-oidc-provider-github/integrations/{Dockerfile,.dockerignore,compose.yaml,holder.cjs,DOCKER.md} .
export TREC_AUTH_ENV="$HOME/.config/trec-auth/auth.env"
export TREC_HOLDER_ENV="/mnt/d/Desktop/trec-oidc-provider/holder/.env"
export TREC_UID="$(id -u)"
export TREC_GID="$(id -g)"
export TREC_VERIFIER_WALLET_DIR="$HOME/.afj/data/wallet/trec-verifier-e86633fc-b913-435b-b4ea-504e3f96951f"
export TREC_HOLDER_WALLET_DIR="$HOME/.afj/data/wallet/holder-46d7af0b-241c-4b45-878f-ebd4abe3ec30"
```

Questi percorsi si riferiscono ai wallet già individuati nella demo. Se la configurazione funzionante usa un percorso SQLite esplicito differente, usa la directory di quel database. Non creare directory o database vuoti per aggirare un errore. Verifica tutti i file senza stamparne il contenuto:

```sh
test -f "$TREC_AUTH_ENV" && test -f "$TREC_HOLDER_ENV" && test -f "$TREC_VERIFIER_WALLET_DIR/sqlite.db" && test -f "$TREC_HOLDER_WALLET_DIR/sqlite.db" && echo FILES_PRESENT=true
```

Solo se compare FILES_PRESENT=true, con i vecchi agenti fermi, conserva una copia privata dei database prima di montarli in scrittura:

```sh
BACKUP_DIR=$(mktemp -d "$HOME/trec-wallet-backup-XXXXXX")
cp -a "$TREC_VERIFIER_WALLET_DIR" "$BACKUP_DIR/verifier"
cp -a "$TREC_HOLDER_WALLET_DIR" "$BACKUP_DIR/holder"
```

Non committare né condividere questi backup.

## Avvio e prova

Nello stesso terminale con le variabili esportate:

```sh
docker compose config --quiet
docker compose build server
docker compose up --no-build -d
docker compose ps
docker compose logs --tail=40 server client holder
```

Attendi OIDC_SERVER_READY, CLIENT_READY e HOLDER_READY. Il primo build scarica le dipendenze; quelle Windows non vengono copiate nell'immagine. Se il build o l'avvio fallisce, fermati e conserva l'errore: non rifare il provisioning.

Apri http://localhost:3004 e avvia un login. Per incollare l'invito nel Holder già acceso:

```sh
docker compose attach holder
```

Incolla l'invito del QR e premi Invio. Per staccarti senza arrestare il Holder usa Ctrl+P, poi Ctrl+Q. Non digitare `esci` finché vuoi altri login.

Verifica il ritorno al client, JWT e payload, risorsa senza token 401, con Bearer token 200, e un secondo accesso. Per seguire i marker in un altro terminale predisposto con le stesse variabili:

```sh
docker compose logs -f server client
```

La verifica senza token può essere ripetuta con `curl -i http://localhost:3000/trec-api/profile`. Il pulsante del client effettua la vera richiesta con token, senza mostrarlo o copiarlo nel terminale.

Per fermare la demo usa `docker compose down` nel terminale configurato. I database montati rimangono nelle loro directory WSL. Per riavviare: `docker compose up -d` con le stesse variabili.

## Stato dei controlli

- Flow reale fuori Docker: confermato dall'utente, compresi due login e risorsa protetta.
- Dopo l'aggiunta Docker: cinque test di regressione passati (Holder, OIDC con proof simulata, verifiche negative JWT e risorsa protetta).
- Build, validazione con Compose e prova end-to-end dentro Docker: non eseguiti nell'ambiente dell'assistente, che non dispone del comando Docker. Devono essere eseguiti con i comandi sopra.
