# Rapporto di verifica

Base originale: commit `9ad2a3c7dba8908b57051064c94c6478bf6ca08c` del repository ImNotVirgola/trec-oidc-provider. Confronto con i sorgenti dello ZIP fornito dall'utente; lettura del README principale e dei README di Issuer e Holder.

## Risultati

- 44 file originali verificati con SHA-256, senza differenze.
- 15 test superati su Node 18.20.8, incluso il caricamento reale del modulo Credo cheqd e della dipendenza CommonJS did-jwt.
- Secondo login HTTP con la stessa sessione e consenso già memorizzato: completamento verificato senza un nuovo consenso. La pagina di login aggiunta naviga il browser alla ripresa OIDC; non segue la callback del client dentro fetch. Script della pagina verificato con un browser simulato, senza disabilitare cookie o state.
- Provider e tarball originali effettivamente caricati nei test HTTP; trasformazioni applicate in memoria dal medesimo loader usato per l'avvio.
- Discovery, Authorization Code, PKCE S256 e scambio su `/token` senza cookie di sessione del browser.
- Due utenti contemporanei: nessuna mescolanza dei claim negli access token.
- Verifica crittografica degli ID token e degli access token JWT: issuer, audience, soggetto e nonce dell'ID token.
- Richiesta senza scope `trec`: assenza degli attributi personali nell'access token.
- Riutilizzo del codice di autorizzazione respinto.
- Account verificati ricaricabili da un nuovo processo.
- Persistenza cifrata, scadenza, consumo dei codici, indici e revoca per grant; chiave errata respinta.
- Sessioni Express e chiavi RSA mantenute tra istanze dei rispettivi componenti.
- Coordinamento Credo: login ripetuti, eventi duplicati, invito non associato, connessione completata anticipatamente, prova non verificata, attributi da credenziali differenti, timeout e disconnessione.
- Sorgenti JS e TS adattati in memoria compilati senza scritture nei file originali.

## Limiti del collaudo

Correzione successiva al primo avvio dell'utente: `did-jwt 8.0.18` caricava `@scure/base 2.4.0` ESM tramite `require`, incompatibile con Node 18. L'override aggiunto in `integrations/package.json` fissa `did-jwt` a `8.0.4`, la versione del progetto funzionante fornito dall'utente; il lockfile è stato aggiornato. Il nuovo test copre questa catena di importazioni, che i precedenti test HTTP non caricavano.

Il test HTTP usa account simulati per attraversare l'interazione OIDC. I test del coordinamento usano eventi Credo simulati; non costituiscono una verifica crittografica AnonCreds reale. Nessun bypass di test è richiamato da `run.cjs`: i relativi strumenti rimangono in `tests/`.

La preparazione è avvenuta su Windows. Le librerie native FFI di Askar e AnonCreds non erano caricabili con il runtime disponibile; per eseguire i test senza agenti è stata completata l'installazione locale con gli script nativi disabilitati. Questo non è il comando consigliato all'utente: nel suo WSL va eseguito `npm ci` normalmente. I wallet privati non sono stati copiati o aperti.

Il runtime Node 18 usato nei test Windows ha richiesto le opzioni di risoluzione dei percorsi `--preserve-symlinks --preserve-symlinks-main` nell'ambiente sandbox. Queste opzioni non sono impostate né richieste dagli script consegnati per WSL.

Rimane da collaudare nel WSL dell'utente l'intero percorso con la credenziale già emessa e cheqd Testnet. Nella conversazione precedente quel percorso era stato completato con la versione modificata del progetto; ciò non viene presentato come un test già eseguito su questa nuova confezione aggiuntiva.

Non sono stati collaudati deployment pubblico, più istanze del provider, migrazione delle sessioni OIDC precedenti, grant refresh token o un'app TREC esterna. Il client dimostrativo verifica e scarta i token; non implementa una sessione applicativa TREC.
