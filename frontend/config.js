// ChainIntegrate Membership Corporate — config di rete e ABI
// Aggiornare contractAddress per ciascuna rete dopo il deploy.

const NETWORKS = {
  4201: {
    name: "LUKSO Testnet",
    rpcUrl: "https://rpc.testnet.lukso.network",
    explorer: "https://explorer.execution.testnet.lukso.network",
    contractAddress: "0x08EA03294d6A27f4f819f0136d13fc5046175840" // TODO dopo deploy testnet
  },
  42: {
    name: "LUKSO Mainnet",
    rpcUrl: "https://rpc.mainnet.lukso.network",
    explorer: "https://explorer.execution.mainnet.lukso.network",
    contractAddress: "0x0000000000000000000000000000000000000000" // TODO dopo deploy mainnet
  }
};

const MEMBERSHIP_ABI = [
  "function mintMembership(address to, uint8 tier, bytes metadataURI) external returns (bytes32 tokenId)",
  "function setTier(bytes32 tokenId, uint8 newTier, bytes newMetadataURI) external",
  "function suspendMembership(bytes32 tokenId) external",
  "function reactivateMembership(bytes32 tokenId) external",
  "function setData(bytes32 dataKey, bytes calldata dataValue) external",
  "function tierOf(address member) external view returns (uint8)",
  "function membershipStatus(address member) external view returns (bool exists, bool isSuspended, uint8 tier)",
  "function membershipTokenOf(address member) external view returns (bytes32)",
  "function tierOfToken(bytes32 tokenId) external view returns (uint8)",
  "function suspended(bytes32 tokenId) external view returns (bool)",
  "function getDataForTokenId(bytes32 tokenId, bytes32 dataKey) external view returns (bytes)",
  "function owner() external view returns (address)",
  "event MembershipMinted(bytes32 indexed tokenId, address indexed member, uint8 tier)",
  "event MembershipTierChanged(bytes32 indexed tokenId, uint8 oldTier, uint8 newTier)",
  "event MembershipSuspended(bytes32 indexed tokenId, address indexed member)",
  "event MembershipReactivated(bytes32 indexed tokenId, address indexed member)"
];

const LSP4_METADATA_KEY =
  "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

const TIER_NAMES = { 1: "Bronze", 2: "Silver", 3: "Gold" };
