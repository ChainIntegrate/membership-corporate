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
  const contract = await ChainIntegrateMembershipCorporate.deploy(collectionOwner);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nChainIntegrateMembershipCorporate deployed at:", address);
  console.log("\n--> Copia questo indirizzo in frontend/config.js, chiave", chainId, "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
