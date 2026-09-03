require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3010;
const PINATA_JWT = process.env.PINATA_JWT;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://membership-corporate.chainintegrate.it";
const CHAININTEGRATE_RPC_URL = process.env.CHAININTEGRATE_RPC_URL;

if (!PINATA_JWT) {
  console.error("PINATA_JWT mancante in .env — il backend non può avviarsi senza.");
  process.exit(1);
}
if (!CHAININTEGRATE_RPC_URL) {
  console.error("CHAININTEGRATE_RPC_URL mancante in .env — il backend non può avviarsi senza.");
  process.exit(1);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: ALLOWED_ORIGIN }));

app.post("/api/pin-json", async (req, res) => {
  const metadataJson = req.body;
  if (!metadataJson || typeof metadataJson !== "object" || !metadataJson.LSP4Metadata) {
    return res.status(400).json({ error: "Payload non valido: atteso un oggetto con chiave LSP4Metadata." });
  }

  try {
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`
      },
      body: JSON.stringify({
        pinataContent: metadataJson,
        pinataMetadata: { name: "ci-membership-metadata" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Errore Pinata:", response.status, errText);
      return res.status(502).json({ error: "Pinata ha rifiutato la richiesta di pin." });
    }

    const data = await response.json();
    return res.json({ cid: data.IpfsHash });
  } catch (err) {
    console.error("Errore chiamata Pinata:", err);
    return res.status(500).json({ error: "Errore interno durante il pin su IPFS." });
  }
});

app.post("/api/pin-file", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nessun file immagine ricevuto." });
  }
  if (!req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "Il file deve essere un'immagine." });
  }

  try {
    const form = new FormData();
    form.append("file", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || "membership-badge");
    form.append("pinataMetadata", JSON.stringify({ name: "ci-membership-badge" }));

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Errore Pinata (file):", response.status, errText);
      return res.status(502).json({ error: "Pinata ha rifiutato il file." });
    }

    const data = await response.json();
    return res.json({ cid: data.IpfsHash });
  } catch (err) {
    console.error("Errore upload immagine su Pinata:", err);
    return res.status(500).json({ error: "Errore interno durante l'upload dell'immagine." });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Proxy verso il nodo LUKSO mainnet privato (Contabo, rpc.chainintegrate.it).
// La chiave API resta solo qui, mai nel browser — stesso principio del
// proxy Pinata sopra. Solo mainnet: la testnet non ha un nodo privato
// dedicato, admin.html continua a usare Blockscout direttamente per quella
// (nessun segreto coinvolto lì, è un endpoint pubblico).
app.post("/api/rpc", async (req, res) => {
  try {
    const response = await fetch(CHAININTEGRATE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Errore nodo RPC:", response.status, errText);
      return res.status(502).json({ error: "Il nodo RPC ha rifiutato la richiesta." });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Errore proxy RPC:", err);
    return res.status(500).json({ error: "Errore interno nel proxy RPC." });
  }
});

app.listen(PORT, () => {
  console.log(`ci-membership-backend in ascolto sulla porta ${PORT}`);
});