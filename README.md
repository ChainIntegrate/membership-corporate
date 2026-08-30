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
│   └── deploy.js
├── backend/
│   ├── server.js      — proxy Pinata (mai JWT nel browser)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── admin.html      — mint + tier + sospensione/riattivazione (solo owner contratto)
│   └── config.js        — indirizzi contratto per rete + ABI
├── hardhat.config.js
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

## TODO prima del deploy

1. Confermare gli indirizzi owner in `scripts/deploy.js`
   (`COLLECTION_OWNER_BY_CHAIN`) — riusati quelli del repo private,
   assumendo la stessa UP ChainIntegrate; verificare che sia corretto.
2. Decidere il sottodominio (proposto: `membership-corporate.chainintegrate.it`)
   e aggiornare `ALLOWED_ORIGIN` in `backend/.env.example` di conseguenza.
3. `npx hardhat compile` — non verificato in sandbox (nessun accesso a
   binaries.soliditylang.org), solo revisione manuale finora.
4. Deploy su testnet 4201 prima, verifica mint+upgrade+sospendi+riattiva,
   poi mainnet 42.
5. Collegare il JWT Pinata (stesso account già in uso per gli altri
   progetti, o uno dedicato — a scelta). Backend gira su porta diversa
   (3010) dal repo private (3009) per poter stare sullo stesso VPS senza
   collisioni.

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
