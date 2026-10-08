# Integrazione dell'autenticazione decentralizzata TREC

Per la dimostrazione minima Holder → Proof → OIDC → JWT → risorsa protetta, vedere **[DEMO.md](DEMO.md)**. Il client ora conserva l'access token soltanto in memoria fino alla scadenza per la richiesta dimostrativa; mostra un payload con valori personali oscurati. Non sono stati modificati gli identificativi provisionati o il formato dei token.

Questa cartella contiene l'integrazione dell'autenticazione decentralizzata sviluppata a partire dal progetto originale `trec-oidc-provider`.

Il progetto originale rimane conservato nel repository. L'implementazione presente in `integrations/` aggiunge un flusso di autenticazione basato su:

- OpenID Connect
- DIDComm
- Credo
- AnonCreds
- cheqd testnet
- autenticazione tramite QR code
- JWT firmati contenenti gli attributi dell'utente TREC

## Architettura

Il flusso di autenticazione è il seguente:

```text
Client OIDC
    |
    | Richiesta di autorizzazione
    v
OIDC Provider / Server di autenticazione
    |
    | Invito DIDComm Out-of-Band
    v
QR Code
    |
    v
Wallet Holder
    |
    | Proof AnonCreds
    v
Credo Verifier
    |
    | attributi TREC verificati
    v
OIDC Provider
    |
    | Authorization Code
    v
Client OIDC
    |
    | richiesta al Token Endpoint
    v
JWT firmato
