# ChainIntegrate Membership Corporate

Variante corporate di [chainintegrate-membership](https://github.com/ChainIntegrate/chainintegrate-membership)
(che resta la membership private, per persone fisiche). Stessa struttura
a tier Bronze/Silver/Gold, stesso modello soulbound un-token-per-indirizzo,
stesso `tierOf(address)` per il gating cross-progetto. L'unica differenza
di funzionalità: qui una membership si può **sospendere e riattivare**,
niente burn.

## Struttura

```
chainintegrate-membership-corporate/
├── contracts/
│   └── ChainIntegrateMembershipCorporate.sol
├── scripts/
│   ├── deploy.js               — deploy testnet (usato e verificato)
│   ├── deployMainnet.js        — deploy mainnet (usato e verificato)
│   ├── testViaUP.js            — test minimo di scrittura via UP, bypassa l'estensione
│   ├── mintViaUP.js            — mint completo via UP, bypassa l'estensione
│   └── testSuspendReactivate.js — verifica end-to-end sospendi/riattiva
├── backend/
│   ├── server.js      — proxy Pinata (mai JWT nel browser)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── admin.html      — mint + tier + sospensione/riattivazione (solo owner contratto)
│   └── config.js        — indirizzi contratto per rete + ABI
├── hardhat.config.js
├── TESTNET-DEBUG-LOG.md — cronologia completa dei problemi infrastrutturali
│   incontrati durante deploy/test su testnet (nessuno nel contratto)
└── .env.example
```

## Concetti chiave

- **Un token per indirizzo**, soulbound (non trasferibile) — qui l'indirizzo
  è la UP di un'azienda/organizzazione, non di una persona fisica. Il
  contratto non fa alcuna distinzione a livello di codice tra i due casi.
- **Tier aggiornabile sullo stesso token** (Bronze→Silver→Gold), identico
  al repo private.
- **Sospensione invece del burn**: `suspendMembership(tokenId)` /
  `reactivateMembership(tokenId)`, solo owner. Il tier resta scritto in
  `tierOfToken` durante la sospensione — alla riattivazione torna visibile
  con lo stesso livello, senza dover ricaricare metadata su IPFS.
- **`tierOf(address)` torna 0 sia per "nessuna membership" sia per
  "membership sospesa"** — scelta deliberata: chi consuma il dato per il
  gating (MyCarBook, Birra20Venti, ecc.) non deve sapere nulla della
  sospensione, il comportamento è identico e automatico.
- **`membershipStatus(address)`**: seconda view, per pannelli admin/back-office,
  che distingue "mai avuta" da "sospesa" da "attiva" — solo per chi deve
  gestire i rinnovi, non per il gating.
- **Un'azienda sospesa non può mintarsi una seconda membership**: il check
  "un token per indirizzo" resta valorizzato anche da sospesi, quindi lo
  stop non si aggira ri-mintando.
- **Mint, upgrade, sospensione e riattivazione: solo owner del contratto**
  (ChainIntegrate) — gestione manuale, come nel repo private.
- **Un contratto appena deployato può dare problemi di stima del gas
  nell'estensione UP** nei primi utilizzi (sottostima sistematica,
  indipendente dal peso dell'operazione) — non è un bug del contratto.
  Gli script `testViaUP.js`/`mintViaUP.js` bypassano l'estensione con
  `gasLimit` esplicito per i primi test su un indirizzo nuovo. Dettagli
  completi in `TESTNET-DEBUG-LOG.md`.

## Stato del deploy

- **Testnet (4201)**: `0x08EA03294d6A27f4f819f0136d13fc5046175840` — verificato su Blockscout, mint/upgrade/downgrade/sospensione/riattivazione tutti testati con successo (vedi `TESTNET-DEBUG-LOG.md` per la cronologia dei problemi infrastrutturali incontrati, nessuno nel contratto).
- **Mainnet (42)**: `0x18BaFeD9B151Fb29b3cFEa35A3197F4830072a3e` — verificato su Blockscout, visibile su universaleverything.io.
- **Sottodominio**: `membership-corporate.chainintegrate.it`, su Aruba VPS (`31.14.140.170`), Nginx + Let's Encrypt.
- **Backend**: porta 3013 (3010/3011/3012 già occupate da altri servizi sullo stesso VPS), proxy Pinata via PM2 (`membership-corporate-backend`).

## Non ancora implementato (di proposito)

- Mint a pagamento in LYX con prezzo per fascia — stesso discorso del
  repo private, `mintMembership` resta `onlyOwner`.
- Nessuna motivazione di sospensione salvata on-chain (es. "rinnovo non
  pagato" vs "contenzioso") — se serve un audit trail, va tenuto lato
  backend/admin, non sul contratto, per non appesantire il gas.
- Nessuna differenziazione visiva del badge quando sospeso (l'immagine
  mostrata resta quella dell'ultimo tier impostato) — se serve un badge
  "grigio"/sospeso, si aggiunge passando una metadataURI aggiornata a
  `suspendMembership`, oggi volutamente non richiesta per tenere
  l'operazione leggera (nessun upload IPFS necessario per sospendere).
- Nessuna integrazione ancora con MyCarBook o altri progetti per leggere
  `tierOf()` di questo contratto — stesso pattern del repo private.