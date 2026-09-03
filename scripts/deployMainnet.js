const hre = require("hardhat");

// Deploy dedicato a LUKSO mainnet (42) — file separato da deploy.js
// (usato per il deploy testnet) per non alterare quella traccia, restata
// intatta con la configurazione esatta che abbiamo effettivamente usato
// e verificato in sessione (vedi TESTNET-DEBUG-LOG.md).
//
// Differenze rispetto a deploy.js:
// - Nessun gasPrice esplicito: su mainnet lasciamo la stima automatica
//   (scelta esplicita, mainnet considerata più stabile della testnet su
//   questo fronte — verificare comunque il gas price corrente prima del
//   deploy, non dare per scontato che la stima sia sempre affidabile).
// - Solo chainId 42: questo script non è pensato per girare su testnet.

const COLLECTION_OWNER = "0x4a2605796e0d91A9667d6E30365aEEC384C48c27"; // UP ChainIntegrate mainnet, confermato

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chainId = hre.network.config.chainId;

  if (chainId !== 42) {
    throw new Error(
      `Questo script è solo per LUKSO mainnet (chainId 42). Rilevato chainId ${chainId} — ` +
      `per testnet usa scripts/deploy.js.`
    );
  }

  console.log("Deploying with account:", deployer.address);
  console.log("Network:", hre.network.name, "chainId:", chainId);
  console.log("Collection owner (ChainIntegrate UP):", COLLECTION_OWNER);

  const ChainIntegrateMembershipCorporate = await hre.ethers.getContractFactory("ChainIntegrateMembershipCorporate");
  const contract = await ChainIntegrateMembershipCorporate.deploy(COLLECTION_OWNER, {
    gasLimit: 4_000_000
  });

  const deployTx = contract.deploymentTransaction();
  console.log("\nTransazione di deploy inviata:", deployTx.hash);
  console.log(
    "--> Se il polling qui sotto fallisce, controlla a mano:\n" +
    "    https://explorer.execution.mainnet.lukso.network/tx/" + deployTx.hash + "\n"
  );

  const address = await waitForReceiptWithRetry(deployTx.hash, 20, 15000);
  console.log("\nChainIntegrateMembershipCorporate deployed at:", address);
  console.log("\n--> Copia questo indirizzo in frontend/config.js, chiave 42\n");
}

// Stesso meccanismo di resilienza di deploy.js: retry invece di arrendersi
// al primo errore RPC (vedi TESTNET-DEBUG-LOG.md, punto 5).
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
