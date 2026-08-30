const hre = require("hardhat");

// Owner del contratto (ChainIntegrate) per rete — indirizzo diverso tra
// test e main, separato dall'EOA deployer che paga solo il gas.
// Stessi indirizzi del repo private: la UP proprietaria della collezione
// resta la stessa, cambia solo il contratto che gestisce le membership.
const COLLECTION_OWNER_BY_CHAIN = {
  4201: "0x83cBE526D949A3AaaB4EF9a03E48dd862e81472C", // TODO: conferma UP ChainIntegrate testnet
  42:   "0x4a2605796e0d91A9667d6E30365aEEC384C48c27", // TODO: conferma UP ChainIntegrate mainnet
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chainId = hre.network.config.chainId;

  console.log("Deploying with account:", deployer.address);
  console.log("Network:", hre.network.name, "chainId:", chainId);

  const collectionOwner = COLLECTION_OWNER_BY_CHAIN[chainId];
  if (!collectionOwner) {
    throw new Error(`Nessun collectionOwner configurato per chainId ${chainId}.`);
  }
  console.log("Collection owner (ChainIntegrate UP):", collectionOwner);

  const ChainIntegrateMembershipCorporate = await hre.ethers.getContractFactory("ChainIntegrateMembershipCorporate");
  // gasLimit esplicito: Blockscout (via /api/eth-rpc) non sa stimare il gas
  // per una tx di creazione contratto (richiede sempre un `to`, che una
  // deploy tx non ha) — bypassiamo eth_estimateGas del tutto.
  const contract = await ChainIntegrateMembershipCorporate.deploy(collectionOwner, {
  gasLimit: 4_000_000,
  gasPrice: hre.ethers.parseUnits("3", "gwei")
});

  const deployTx = contract.deploymentTransaction();
  console.log("\nTransazione di deploy inviata:", deployTx.hash);
  console.log(
    "--> Se il polling qui sotto fallisce per ritardo di indicizzazione Blockscout, controlla a mano:\n" +
    "    https://explorer.execution.testnet.lukso.network/tx/" + deployTx.hash + "\n"
  );

  const address = await waitForReceiptWithRetry(deployTx.hash, 20, 15000);
  console.log("\nChainIntegrateMembershipCorporate deployed at:", address);
  console.log("\n--> Copia questo indirizzo in frontend/config.js, chiave", chainId, "\n");
}

// Blockscout (esposto via /api/eth-rpc) a volte è indietro con l'indicizzazione:
// eth_sendRawTransaction passa (va al nodo reale), ma eth_getTransactionReceipt
// subito dopo può fallire con "Internal server error" finché il blocco non è
// stato indicizzato. Stesso principio di resilienza già usato nell'oracolo di
// MatchPredictor: retry + tolleranza ai singoli fallimenti, non ci si arrende
// al primo errore RPC.
async function waitForReceiptWithRetry(txHash, maxAttempts, delayMs) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
      if (receipt) {
        if (receipt.status === 0) {
          throw new Error(`Transazione fallita on-chain (status 0): ${txHash}`);
        }
        if (receipt.contractAddress) {
          return receipt.contractAddress;
        }
      }
      console.log(`Tentativo ${attempt}/${maxAttempts}: receipt non ancora disponibile, riprovo tra ${delayMs / 1000}s...`);
    } catch (err) {
      console.log(`Tentativo ${attempt}/${maxAttempts}: errore RPC (${err.message || err}), riprovo tra ${delayMs / 1000}s...`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `Receipt non ottenuta dopo ${maxAttempts} tentativi. La tx potrebbe comunque essere passata: ` +
    `controlla manualmente su Blockscout con l'hash stampato sopra.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
