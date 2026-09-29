# Rapporto dei test — 28 settembre 2026

Esecuzione finale con Node.js **22.14.0**, Windows: **16 test, 15 superati, 0 falliti, 1 saltato**.

Comando, dalla cartella integrations:

```sh
node --test tests/original.test.cjs tests/login.test.cjs tests/e2e.test.cjs tests/client.test.cjs tests/native.test.cjs
```

## Risultati e loro portata

| Controllo | Risultato | Evidenza / limite |
|---|---|---|
| ORIGINAL_PROJECT_UNCHANGED | true | SHA-256 di tutti i 44 file del commit originale |
| OIDC_DISCOVERY_OK | true | Endpoint HTTP di oidc-provider ufficiale 8.5.2 |
| QR_INVITATION_CREATED | true, invito simulato | Immagine PNG generata localmente, decodificata e confrontata con l'URL OOB della fixture |
| PROOF_VERIFIED | **NON ESEGUITO con Credo reale** | Il test automatico emette invece PROOF_VERIFIED_SIMULATED=true |
| AUTHORIZATION_CODE_OK | true, proof simulata | Authorization Code Flow sul vero provider HTTP |
| JWT_SIGNATURE_VALID | true | Firma RSA del provider verificata tramite JWKS e jose |
| JWT_ALL_TREC_CLAIMS_PRESENT | true, dati simulati | Nove claim top-level, identità e grant correttamente associati |
| SECOND_LOGIN_OK | true, proof simulata | Due login sul medesimo server, anche attraverso il client consegnato |
| NATIVE_LIBRARIES_AVAILABLE | false | Probe nativo saltato: FFI / Askar / AnonCreds non disponibili |

## Controlli automatici eseguiti

- State errato, cookie mancante e callback consumata vengono rifiutati.
- ID token con nonce, issuer, audience, scadenza o firma errati viene rifiutato dal client.
- Access token con attributi mancanti o identità incoerente viene rifiutato.
- Code riutilizzato e PKCE errato vengono rifiutati dal vero endpoint token.
- Due utenti concorrenti ricevono gli attributi del proprio grant.
- Nessun completamento prima della proof; proof di un'altra sessione o con altro identificativo ignorata.
- Risultato non verificato, Credential Definition errata, nonce diverso, attributi mancanti o provenienti da credenziali differenti vengono rifiutati dalla logica applicativa.
- Rifiuto, timeout ed eventi arrivati dopo la scadenza non completano il login.
- Evento anticipato rispetto al ritorno di requestProof e connessioni duplicate vengono gestiti; il numero di listener della fixture resta costante.
- Configurazione originale letta senza scritture e senza importare seed del pagatore Cosmos.
- Dipendenza ufficiale npm controllata: nessuna modifica al tarball originale o ai moduli del provider.

## Cosa non è stato verificato

**Non è stato eseguito un login end-to-end con una vera proof AnonCreds.** La suite HTTP usa un agente simulato soltanto al confine Credo: non prova che una credenziale reale sia risolvibile sulla rete o presentabile dal wallet dell'utente.

In questo ambiente l'installazione nativa FFI è fallita perché node-gyp non ha trovato una toolchain Visual Studio compatibile. I pacchetti JavaScript sono stati installati senza script per poter eseguire i test OIDC e crittografici; questo non costituisce un'installazione completa del runtime Credo. L'accesso alla distribuzione WSL non era disponibile, né erano disponibili configurazioni esterne di due wallet utilizzabili per il test reale.

Il comando live senza le due configurazioni termina con errore di prerequisiti, non con una prova riuscita. È incluso `tests/live.cjs` per eseguire il percorso reale in un ambiente predisposto, con wallet e credenziale già esistenti. Non effettua provisioning.

Non sono stati verificati uno scanner mobile specifico, la raggiungibilità DIDComm fra dispositivi, il riuso del database privato dell'utente o una distribuzione HTTPS. Il browser grafico non è stato collaudato manualmente; la suite verifica via HTTP la pagina e decodifica il QR prodotto.

## Integrità della consegna

Lo ZIP contiene i file originali e soltanto aggiunte sotto integrations/. Non contiene node_modules o configurazioni private aggiunte. Il provider originale conserva la chiave dimostrativa pubblicata nel repository, necessaria per mantenere i suoi byte invariati; il nuovo server non la usa e genera una propria chiave temporanea in memoria.
