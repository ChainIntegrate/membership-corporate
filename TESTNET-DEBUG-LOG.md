# Testnet debug log — deploy e primo mint di ChainIntegrateMembershipCorporate

Sessione del 31 agosto 2026. Deploy su LUKSO testnet (4201) andato liscio
sulla carta ma con una serie lunga di problemi infrastrutturali a catena,
nessuno dei quali dovuto al contratto. Tenuto come riferimento per capire
sintomi simili in futuro, su questo o altri progetti.

## Sintesi in una riga

**Tutto quello che è "nuovo" (contratto appena deployato, indirizzo mai
visto) soffre di stime/indicizzazioni sbagliate da parte di più servizi
indipendenti attorno alla chain — non della chain stessa.** La logica del
contratto (mint, upgrade/downgrade tier, sospensione, riattivazione,
`tierOf()`) è stata verificata funzionante al 100%, end-to-end, tramite
script diretti che bypassano questi livelli inaffidabili.

## Cronologia dei problemi incontrati

| # | Sintomo | Causa reale | Come l'abbiamo scoperto | Fix |
|---|---|---|---|---|
| 1 | Deploy bloccato, nessuna risposta | `rpc.testnet.lukso.network` (RPC ufficiale) indietro di ~28 ore rispetto alla chain reale | Confronto `eth_blockNumber` tra RPC diversi | Passato a `https://explorer.execution.testnet.lukso.network/api/eth-rpc` (Blockscout) in `hardhat.config.js` |
| 2 | `HH110: Missed \`to\` address` durante il deploy | L'endpoint `/api/eth-rpc` di Blockscout non sa stimare il gas per una tx di creazione contratto (nessun campo `to`) | Lettura diretta dell'errore | `gasLimit` esplicito in `deploy.js`, bypassa `eth_estimateGas` |
| 3 | Deploy "bloccato" di nuovo, nessun errore | Buco di nonce: un tentativo precedente (Ctrl+C durante l'attesa) era comunque stato trasmesso alla rete e restava lì, bloccando tutto ciò che veniva dopo per lo stesso indirizzo | Confronto nonce `latest` vs nonce della tx specifica | Tx di "sblocco" con lo stesso nonce e gas price più alto, per rimpiazzare quella bloccata |
| 4 | Ancora bloccato dopo aver risolto il nonce | Gas price auto-stimato da Blockscout: **7 wei**, praticamente zero, mai raccolto da nessun validatore | Lettura del campo `gasPrice` della tx pending | `gasPrice` esplicito (3 gwei) in `deploy.js` |
| 5 | `eth_getTransactionReceipt` → `"Internal server error"` ripetuto | L'indicizzatore interno di Blockscout è più lento del nodo che serve le chiamate live (`eth_blockNumber`, `eth_call`) — due sistemi separati dentro lo stesso servizio | Confronto tra risposte coerenti su `eth_call`/`eth_blockNumber` e fallimenti sistematici su `eth_getTransactionReceipt` | Retry loop tollerante agli errori invece di un singolo tentativo (`waitForReceiptWithRetry` in tutti gli script) |
| 6 | `owner()` → `could not decode result data (value="0x")` nell'estensione | L'estensione UP ha un RPC interno proprio (probabilmente quello ufficiale, anch'esso indietro), non configurabile dall'utente | Nessuna opzione RPC nelle impostazioni dell'estensione | `admin.html`: letture (`owner()`, `membershipStatus()`, ecc.) spostate su un `readContract` separato, puntato a Blockscout, mentre le scritture restano sull'estensione |
| 7 | Mint/setData falliscono con `"internal error" -32603` o `"out of gas"` nella catena UP→KeyManager→contratto | L'estensione stima il gas per l'intera catena in modo sistematicamente insufficiente (~100-172k) quando il contratto di destinazione non ha ancora uno storico di transazioni riuscite. Verificato: anche un `setData` di **1 byte su una chiave nuova** falliva allo stesso modo — non è il peso del payload, è overhead fisso di verifica permessi (~35k gas solo per il Key Manager) unito a una stima complessivamente troppo bassa | Raw trace (`/internal-transactions` su Blockscout) di più tentativi falliti, tutti con lo stesso pattern `"error": "out of gas"` nel punto più interno della catena | **Bypass completo dell'estensione**: script Node/ethers che firma con la chiave del deployer (già verificata come controller autorizzato della UP) e chiama `UP.execute()` con `gasLimit` esplicito realmente rispettato |
| 8 | Contratto "non sembra deployato" su universaleverything.io | Stesso tipo di ritardo di indicizzazione degli altri punti — confermato perché **anche il contratto private, collaudato da mesi**, non compariva su UE nello stesso momento | Confronto diretto tra contratto nuovo e contratto vecchio nello stesso istante | Nessun fix necessario — non è un problema nostro, si risolve da sé quando UE si aggiorna |
| 9 | Bug banale: upload immagine rifiutato dal backend (`"Il file deve essere un'immagine"`) | `Blob` costruito in Node senza MIME type esplicito | Errore chiaro e specifico dal backend | Impostato `type: "image/png"` nel `Blob` |
| 10 | Mint fallito con revert pulito (`0x24ecef4d`), non "out of gas" | Bug nostro, non infrastrutturale: script rigenerato aveva perso la modifica dell'indirizzo di destinazione, tornato al placeholder `0x000...000` (indirizzo zero) — il contratto ha **correttamente rifiutato** il mint verso l'indirizzo zero | Decodifica manuale del calldata nel raw trace | Indirizzo di test ripristinato nello script |

## Prova finale: la logica funziona, end-to-end

Verificato tramite script diretti (bypassando completamente l'estensione),
lettura via `eth_call` diretto quando necessario:

- **Mint riuscito** — token Bronze emesso su `0x4BE6502A3Ad8ce1ab5127A042C678918F07Af351`
  (token ID 1), evento `MembershipMinted` confermato nei log.
- **Sospensione** — `suspendMembership(1)`: `isSuspended=true`, tier interno
  conservato (`Bronze`), ma `tierOf()` esterno torna `0` — esattamente il
  comportamento voluto (invisibile al gating di altri progetti, senza
  perdere lo storico).
- **Riattivazione** — `reactivateMembership(1)`: `isSuspended=false`,
  `tierOf()` torna a mostrare `Bronze` — nessun bisogno di ricaricare
  metadata.

## Strumenti nati da questa sessione (rimasti nel repo)

- **`scripts/testViaUP.js`** — test minimo di scrittura via UP, bypassando
  l'estensione. Utile come primo controllo su qualunque nuovo contratto per
  isolare "è un problema di gas/estensione" da "è un problema di logica".
- **`scripts/mintViaUP.js`** — mint completo (upload metadata + mint) via
  script diretto. Da preferire ad `admin.html` per i primi utilizzi di un
  contratto appena deployato, finché l'estensione non ha accumulato
  transazioni riuscite verso quell'indirizzo.
- **`scripts/testSuspendReactivate.js`** — verifica end-to-end del ciclo
  sospendi/riattiva, con lettura tollerante ai timeout.

(Due script usa-e-getta creati durante l'incidente del nonce — uno per
sbloccare la coda, uno per sostituire una tx con gas price troppo basso —
sono stati rimossi dal repo dopo l'uso: erano specifici di quell'episodio
con valori hardcoded, non riutilizzabili. La lezione resta qui.)

## Lezioni da portare al prossimo deploy (mainnet o altro progetto)

1. **Un contratto appena deployato non è affidabile tramite estensione
   browser nei primi utilizzi**, indipendentemente da quanto sia stabile
   la rete sottostante — è l'estensione stessa che deve "impararlo". Primi
   mint/operazioni via script diretto, poi passare all'interfaccia normale.
2. **`gasLimit` esplicito sempre**, sia in deploy che nelle chiamate di
   scrittura — evita di dipendere da `eth_estimateGas`, che si è dimostrato
   inaffidabile su più livelli diversi (nodo, indicizzatore, estensione).
3. **Mai fidarsi di un solo canale per verificare lo stato di una
   transazione**: RPC ufficiale, Blockscout ed estensione hanno mostrato,
   in momenti diversi della stessa sessione, informazioni diverse e a
   volte contraddittorie sulla stessa transazione. La fonte di verità
   resta sempre `eth_getTransactionReceipt`/`eth_call` diretto, con retry.
4. **La cronologia "Activity" dell'estensione non riflette lo stato reale
   della chain** — può mostrare "pending" per transazioni già fallite o
   sparite dalla mempool da giorni. Non usarla per diagnosi.
