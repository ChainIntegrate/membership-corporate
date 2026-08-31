const hre = require("hardhat");

// Bypassa l'estensione browser (la sua stima del gas per chiamate via
// LSP6 Key Manager si è dimostrata inaffidabile: sottostima sistematicamente
// anche operazioni minime, indipendentemente dal peso del payload — vedi
// trace del 31/08, dove anche 1 byte su chiave nuova falliva per "out of
// gas" con budget totale auto-stimato di soli ~101k gas). Qui chiamiamo la
// UP direttamente con ethers, usando la chiave del deployer (già verificata
// nei trace precedenti come firmataria autorizzata) e un gasLimit esplicito
// che NOI controlliamo, non l'estensione.

const UP_ADDRESS = "0x83cBE526D949A3AaaB4EF9a03E48dd862e81472C";
const CONTRACT_ADDRESS = "0x08EA03294d6A27f4f819f0136d13fc5046175840";

const UP_ABI = [
  "function execute(uint256 operationType, address target, uint256 value, bytes calldata data) external payable returns (bytes memory)"
];

const MEMBERSHIP_ABI = [
  "function mintMembership(address to, uint8 tier, bytes metadataURI) external returns (bytes32 tokenId)",
  "function setData(bytes32 dataKey, bytes calldata dataValue) external"
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Firma con:", deployer.address);

  const up = new hre.ethers.Contract(UP_ADDRESS, UP_ABI, deployer);
  const membershipInterface = new hre.ethers.Interface(MEMBERSHIP_ABI);

  // ESEMPIO: test minimo, stessa identica operazione fallita in console
  // (1 byte su chiave 'test'). Cambialo con mintMembership quando confermato.
  const testKey = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test"));
  const innerCalldata = membershipInterface.encodeFunctionData("setData", [testKey, "0x01"]);

  console.log("Invio execute() sulla UP, gasLimit esplicito...");
  const tx = await up.execute(0, CONTRACT_ADDRESS, 0, innerCalldata, {
    gasLimit: 500_000,
    gasPrice: hre.ethers.parseUnits("3", "gwei")
  });

  console.log("Tx inviata:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  console.log("Gas used:", receipt.gasUsed.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
