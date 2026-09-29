# Integrazione dell'autenticazione decentralizzata TREC

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
