const hre = require("hardhat");

// Test sospensione/riattivazione, stesso principio degli script precedenti:
// firma diretta con la chiave del deployer, gasLimit esplicito, nessuna
// dipendenza da Blockscout/UE per capire l'esito — solo lettura diretta
// dal contratto via RPC.

const UP_ADDRESS = "0x83cBE526D949A3AaaB4EF9a03E48dd862e81472C";
const CONTRACT_ADDRESS = "0x08EA03294d6A27f4f819f0136d13fc5046175840";
const TOKEN_ID_NUM = 1; // il token Bronze già mintato su 0x4BE6502A...
const MEMBER_ADDRESS = "0x4BE6502A3Ad8ce1ab5127A042C678918F07Af351";

const UP_ABI = [
  "function execute(uint256 operationType, address target, uint256 value, bytes calldata data) external payable returns (bytes memory)"
];
const MEMBERSHIP_ABI = [
  "function suspendMembership(bytes32 tokenId) external",
  "function reactivateMembership(bytes32 tokenId) external",
  "function membershipStatus(address member) external view returns (bool exists, bool isSuspended, uint8 tier)",
  "function tierOf(address member) external view returns (uint8)"
];

function toTokenIdHex(n) {
  return hre.ethers.zeroPadValue(hre.ethers.toBeHex(BigInt(n)), 32);
}

async function callViaUP(deployer, up, membershipInterface, functionName, args) {
  const calldata = membershipInterface.encodeFunctionData(functionName, args);
  console.log(`\nInvio ${functionName}(${args.map(a => a.toString()).join(", ")}) tramite UP.execute()...`);
  const tx = await up.execute(0, CONTRACT_ADDRESS, 0, calldata, {
    gasLimit: 400_000,
    gasPrice: hre.ethers.parseUnits("3", "gwei")
  });
  console.log("Tx inviata:", tx.hash);
  const receipt = await waitForReceiptWithRetry(tx.hash, 15, 12000);
  console.log("Status:", receipt.status === 1 ? "✓ SUCCESS" : "✗ FAILED", "- Gas used:", receipt.gasUsed.toString());
  return receipt;
}

async function waitForReceiptWithRetry(txHash, maxAttempts, delayMs) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
    } catch (err) {
      console.log(`Tentativo ${attempt}/${maxAttempts}: errore RPC (${err.message || err})...`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Receipt non ottenuta dopo troppi tentativi.");
}

async function callWithRetry(fn, maxAttempts, delayMs) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`  (lettura) tentativo ${attempt}/${maxAttempts}: errore RPC (${err.message || err})...`);
      if (attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function printStatus(readContract, label) {
  const [exists, isSuspended, tier] = await callWithRetry(
    () => readContract.membershipStatus(MEMBER_ADDRESS), 8, 10000
  );
  const tierOf = await callWithRetry(
    () => readContract.tierOf(MEMBER_ADDRESS), 8, 10000
  );
  const tierNames = { 0: "-", 1: "Bronze", 2: "Silver", 3: "Gold" };
  console.log(`\n[${label}]`);
  console.log(`  membershipStatus: exists=${exists}, isSuspended=${isSuspended}, tier=${tierNames[tier]}`);
  console.log(`  tierOf() [quello che vedono gli altri contratti]: ${tierNames[tierOf]}`);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const tokenIdHex = toTokenIdHex(TOKEN_ID_NUM);
  console.log("Firma con:", deployer.address);
  console.log("Token ID:", TOKEN_ID_NUM, "->", tokenIdHex);
  console.log("Membro:", MEMBER_ADDRESS);

  const up = new hre.ethers.Contract(UP_ADDRESS, UP_ABI, deployer);
  const membershipInterface = new hre.ethers.Interface(MEMBERSHIP_ABI);
  const readContract = new hre.ethers.Contract(CONTRACT_ADDRESS, MEMBERSHIP_ABI, hre.ethers.provider);

  await printStatus(readContract, "STATO ATTUALE (sospensione già inviata in precedenza)");

  await callViaUP(deployer, up, membershipInterface, "reactivateMembership", [tokenIdHex]);
  await printStatus(readContract, "DOPO RIATTIVAZIONE (atteso: di nuovo attiva, Bronze)");

  console.log("\n✓ Test completo.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});