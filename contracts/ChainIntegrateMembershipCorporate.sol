// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// NOTA: verificare i path di import contro la versione installata di
// @lukso/lsp8-contracts / @lukso/lsp4-contracts (stesso avviso già visto
// su MyCarBook e sul repo private: i path sono cambiati più volte tra
// versioni major).
import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import {_LSP8_TOKENID_FORMAT_NUMBER} from "@lukso/lsp8-contracts/contracts/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_NFT, _LSP4_METADATA_KEY} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";

/**
 * @title ChainIntegrateMembershipCorporate
 * @notice Variante "corporate" del repo chainintegrate-membership (private):
 *         stessa struttura a tier (Bronze/Silver/Gold), stesso modello
 *         un-token-per-indirizzo soulbound, stesso tierOf(address) per il
 *         gating cross-progetto. Pensata per UP di aziende/organizzazioni
 *         invece che persone fisiche — il contratto non fa alcuna
 *         distinzione a livello di codice tra i due casi, la differenza è
 *         solo organizzativa/off-chain (chi è il titolare della UP).
 *
 *         Differenza reale rispetto al repo private: qui una membership
 *         può essere SOSPESA e RIATTIVATA dall'owner, senza fare burn.
 *         Caso d'uso: rinnovo annuale non pagato, contenzioso in corso,
 *         ecc. — si vuole congelare i benefici senza perdere lo storico
 *         (tier, token id, metadata) e senza permettere che l'azienda
 *         aggiri lo stop mintandosi una seconda membership (bloccato dal
 *         check "un token per indirizzo", che resta valorizzato anche da
 *         sospesi).
 *
 *         Mint e aggiornamento livello: solo owner del contratto
 *         (ChainIntegrate), gestione manuale per ora, come nel repo
 *         private.
 *
 *         Soulbound: il token non è trasferibile una volta mintato.
 */
contract ChainIntegrateMembershipCorporate is LSP8IdentifiableDigitalAsset {
    uint256 private _nextTokenId = 1;

    uint8 public constant TIER_BRONZE = 1;
    uint8 public constant TIER_SILVER = 2;
    uint8 public constant TIER_GOLD   = 3;

    // Un solo token per indirizzo: teniamo la mappa noi stessi invece di
    // fare affidamento su tokenIdsOf (che è external, richiederebbe una
    // call a this. per essere letta da dentro il contratto).
    mapping(address => bytes32) public membershipTokenOf;
    mapping(bytes32 => uint8) public tierOfToken;

    // Sospensione: il tier resta scritto in tierOfToken (non lo azzeriamo),
    // questo flag decide solo se tierOf() lo espone o meno all'esterno.
    mapping(bytes32 => bool) public suspended;

    event MembershipMinted(bytes32 indexed tokenId, address indexed member, uint8 tier);
    event MembershipTierChanged(bytes32 indexed tokenId, uint8 oldTier, uint8 newTier);
    event MembershipSuspended(bytes32 indexed tokenId, address indexed member);
    event MembershipReactivated(bytes32 indexed tokenId, address indexed member);

    constructor(address collectionOwner)
        LSP8IdentifiableDigitalAsset(
            "ChainIntegrate Membership Corporate",
            "CIMC",
            collectionOwner,
            _LSP4_TOKEN_TYPE_NFT,
            _LSP8_TOKENID_FORMAT_NUMBER
        )
    {}

    /**
     * @notice Minta una membership per `to`. Solo owner del contratto —
     *         gestione manuale, il contratto registra solo il risultato.
     * @param metadataURI VerifiableURI (LSP4Metadata) già codificato con
     *        ERC725.encodeData: nome, icona del tier (badge), attributes.
     */
    function mintMembership(
        address to,
        uint8 tier,
        bytes memory metadataURI
    ) external onlyOwner returns (bytes32 tokenId) {
        require(tier >= TIER_BRONZE && tier <= TIER_GOLD, "Invalid tier");
        require(membershipTokenOf[to] == bytes32(0), "Address already has a membership");

        tokenId = bytes32(_nextTokenId);
        _nextTokenId++;

        _mint(to, tokenId, true, "");
        _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, metadataURI);

        membershipTokenOf[to] = tokenId;
        tierOfToken[tokenId] = tier;

        emit MembershipMinted(tokenId, to, tier);
    }

    /**
     * @notice Aggiorna il livello di una membership esistente (upgrade
     *         Bronze->Silver->Gold sullo stesso token). Consentito anche
     *         su una membership sospesa (il nuovo tier sarà quello
     *         esposto alla riattivazione), ma tierOf() resta 0 finché
     *         resta sospesa.
     */
    function setTier(
        bytes32 tokenId,
        uint8 newTier,
        bytes memory newMetadataURI
    ) external onlyOwner {
        require(newTier >= TIER_BRONZE && newTier <= TIER_GOLD, "Invalid tier");
        require(_exists(tokenId), "Membership does not exist");

        uint8 oldTier = tierOfToken[tokenId];
        tierOfToken[tokenId] = newTier;
        _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, newMetadataURI);

        emit MembershipTierChanged(tokenId, oldTier, newTier);
    }

    /**
     * @notice Sospende una membership: tierOf() torna 0 da questo momento,
     *         ma tier e token id restano intatti per la riattivazione.
     *         Niente burn — lo storico non si perde e il mint resta
     *         bloccato per lo stesso indirizzo finché non si riattiva o
     *         non si decide diversamente.
     */
    function suspendMembership(bytes32 tokenId) external onlyOwner {
        require(_exists(tokenId), "Membership does not exist");
        require(!suspended[tokenId], "Already suspended");

        suspended[tokenId] = true;
        emit MembershipSuspended(tokenId, tokenOwnerOf(tokenId));
    }

    /**
     * @notice Riattiva una membership sospesa: tierOf() torna a esporre
     *         il tier così com'era prima della sospensione, senza dover
     *         ricaricare metadata su IPFS.
     */
    function reactivateMembership(bytes32 tokenId) external onlyOwner {
        require(_exists(tokenId), "Membership does not exist");
        require(suspended[tokenId], "Not suspended");

        suspended[tokenId] = false;
        emit MembershipReactivated(tokenId, tokenOwnerOf(tokenId));
    }

    /**
     * @notice Comodo per qualunque altro progetto ChainIntegrate: dato un
     *         indirizzo, ritorna il tier (0 = nessuna membership O
     *         membership sospesa — chi legge non deve distinguere i due
     *         casi, il gating è lo stesso). Non richiede risolvere IPFS,
     *         una sola chiamata on-chain.
     */
    function tierOf(address member) external view returns (uint8) {
        bytes32 tokenId = membershipTokenOf[member];
        if (tokenId == bytes32(0) || suspended[tokenId]) {
            return 0;
        }
        return tierOfToken[tokenId];
    }

    /**
     * @notice Per pannelli admin/back-office: a differenza di tierOf(),
     *         qui si distingue "nessuna membership" da "sospesa", cosa
     *         che serve a chi deve gestire i rinnovi, non al gating.
     * @return exists true se l'indirizzo ha mai avuto una membership.
     * @return isSuspended true se sospesa in questo momento.
     * @return tier tier registrato (indipendente dallo stato sospeso).
     */
    function membershipStatus(address member)
        external
        view
        returns (bool exists, bool isSuspended, uint8 tier)
    {
        bytes32 tokenId = membershipTokenOf[member];
        exists = tokenId != bytes32(0);
        isSuspended = exists && suspended[tokenId];
        tier = exists ? tierOfToken[tokenId] : 0;
    }

    /**
     * @dev Blocca ogni trasferimento reale (from != address(0)): la
     *      membership è soulbound, resta legata a chi l'ha ricevuta.
     *      Il mint (from == address(0)) resta permesso.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        bytes32 tokenId,
        bool force,
        bytes memory data
    ) internal virtual override {
        require(from == address(0), "Membership is non-transferable");
        super._beforeTokenTransfer(from, to, tokenId, force, data);
    }
}
