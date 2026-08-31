const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Mint reale via script diretto, stesso principio di testViaUP.js: bypassa
// l'estensione browser (stima del gas inaffidabile per un contratto che i
// suoi sistemi interni non "conoscono" ancora), firma con la chiave del
// deployer che sappiamo già avere i permessi giusti sulla UP, gasLimit
// esplicito che NOI controlliamo davvero.

const UP_ADDRESS = "0x83cBE526D949A3AaaB4EF9a03E48dd862e81472C";
const CONTRACT_ADDRESS = "0x08EA03294d6A27f4f819f0136d13fc5046175840";
const BACKEND_URL = "https://membership-corporate.chainintegrate.it";

// ==== MODIFICA QUI PRIMA DI LANCIARE ====
const MINT_TO_ADDRESS = "0x4BE6502A3Ad8ce1ab5127A042C678918F07Af351"; // <-- indirizzo di test
const TIER = 1; // 1=Bronze, 2=Silver, 3=Gold
// =========================================

const TIER_NAMES = { 1: "Bronze", 2: "Silver", 3: "Gold" };
const TIER_BADGE_FILE = { 1: "corporate_bronze.png", 2: "corporate_silver.png", 3: "corporate_gold.png" };
const LSP4_METADATA_KEY = "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

const UP_ABI = [
  "function execute(uint256 operationType, address target, uint256 value, bytes calldata data) external payable returns (bytes memory)"
];
const MEMBERSHIP_ABI = [
  "function mintMembership(address to, uint8 tier, bytes metadataURI) external returns (bytes32 tokenId)"
];

async function uploadImageToPinata(buffer, filename) {
  const formData = new FormData();
  const ext = path.extname(filename).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
  formData.append("image", new Blob([buffer], { type: mimeType }), filename);
  const res = await fetch(`${BACKEND_URL}/api/pin-file`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("upload immagine fallito: " + (await res.text()));
  const data = await res.json();
  return data.cid;
}

async function uploadJsonToPinata(json) {
  const res = await fetch(`${BACKEND_URL}/api/pin-json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json)
  });
  if (!res.ok) throw new Error("upload JSON fallito: " + (await res.text()));
  const data = await res.json();
  return data.cid;
}

async function main() {
  if (MINT_TO_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error("Modifica MINT_TO_ADDRESS in cima allo script prima di lanciarlo.");
  }

  const { ERC725 } = await import("@erc725/erc725.js");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Firma con:", deployer.address);
  console.log("Mint per:", MINT_TO_ADDRESS, "- Tier:", TIER_NAMES[TIER]);

  // 1. Carica il badge locale e caricalo su Pinata
  const badgeFilename = TIER_BADGE_FILE[TIER];
  const badgePath = path.join(__dirname, "..", "frontend", badgeFilename);
  const badgeBuffer = fs.readFileSync(badgePath);
  const badgeHash = hre.ethers.keccak256(badgeBuffer);

  console.log(`Upload ${badgeFilename} su Pinata...`);
  const imageCid = await uploadImageToPinata(badgeBuffer, badgeFilename);
  console.log("Icona caricata: ipfs://" + imageCid);

  // Nota: dimensioni hardcoded, servono solo alle UI per il rendering, non
  // sono validate on-chain. Se i badge reali hanno una risoluzione diversa
  // da 512x512, aggiornare qui (non blocca la funzionalità).
  const icon = {
    width: 512,
    height: 512,
    url: `ipfs://${imageCid}`,
    verification: { method: "keccak256(bytes)", data: badgeHash }
  };

  // 2. Costruisci e carica il JSON metadata
  const metadataJson = {
    LSP4Metadata: {
      name: `ChainIntegrate Membership Corporate — ${TIER_NAMES[TIER]}`,
      description: "EN: ChainIntegrate corporate membership badge.\n\nIT: Badge membership corporate ChainIntegrate.",
      links: [{ title: "Website", url: "https://chainintegrate.it" }],
      icon: [icon],
      images: [[icon]],
      assets: [],
      attributes: [{ key: "Tier", value: TIER_NAMES[TIER], type: "string" }]
    }
  };

  console.log("Upload JSON metadata su Pinata...");
  const jsonCid = await uploadJsonToPinata(metadataJson);
  console.log("JSON caricato: ipfs://" + jsonCid);

  // 3. Costruisci il VerifiableURI (stessa logica di admin.html)
  const schema = [{
    name: "LSP4Metadata",
    key: LSP4_METADATA_KEY,
    keyType: "Singleton",
    valueType: "bytes",
    valueContent: "VerifiableURI"
  }];
  const encoded = ERC725.encodeData([{
    keyName: "LSP4Metadata",
    value: { json: metadataJson, url: `ipfs://${jsonCid}` }
  }], schema);
  const metadataValue = encoded.values[0];

  // 4. Costruisci la calldata di mintMembership e mandala via UP.execute()
  const membershipInterface = new hre.ethers.Interface(MEMBERSHIP_ABI);
  const mintCalldata = membershipInterface.encodeFunctionData("mintMembership", [
    MINT_TO_ADDRESS,
    TIER,
    metadataValue
  ]);

  const up = new hre.ethers.Contract(UP_ADDRESS, UP_ABI, deployer);

  console.log("\nInvio mintMembership tramite UP.execute(), gasLimit esplicito...");
  const tx = await up.execute(0, CONTRACT_ADDRESS, 0, mintCalldata, {
    gasLimit: 800_000,
    gasPrice: hre.ethers.parseUnits("3", "gwei")
  });
  console.log("Tx inviata:", tx.hash);

  const receipt = await waitForReceiptWithRetry(tx.hash, 20, 15000);
  console.log("\nStatus:", receipt.status === 1 ? "✓ SUCCESS" : "✗ FAILED");
  console.log("Gas used:", receipt.gasUsed.toString());

  if (receipt.status === 1) {
    console.log("\n--> Verifica su universaleverything.io (potrebbe metterci un po' a indicizzare):");
    console.log(`    https://universaleverything.io/${MINT_TO_ADDRESS}?network=testnet`);
  }
}

async function waitForReceiptWithRetry(txHash, maxAttempts, delayMs) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
      console.log(`Tentativo ${attempt}/${maxAttempts}: receipt non ancora disponibile...`);
    } catch (err) {
      console.log(`Tentativo ${attempt}/${maxAttempts}: errore RPC (${err.message || err})...`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Receipt non ottenuta. Controlla manualmente su Blockscout con l'hash stampato sopra.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});