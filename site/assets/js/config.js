// ---------------------------------------------------------------------------
// Headline Duel — single source of configuration.
// After deploying the contract, paste its address + deploy block here.
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Mainnet contract (BOT Chain, chain ID 677). Leave empty to run in demo mode.
  CONTRACT_ADDRESS: "",
  // Block the contract was deployed in (speeds up event queries).
  DEPLOY_BLOCK: 0,

  // Which network the app talks to: "mainnet", "testnet" or "local" (hardhat node).
  NETWORK: "mainnet",

  // Shared Cloudflare Worker (AI predict / summary / IPFS upload).
  WORKER_URL: "https://headline-duel-worker.example.workers.dev",

  IPFS_GATEWAY: "https://ipfs.io/ipfs/",

  // Max block span per eth_getLogs call (falls back to chunks when an RPC caps ranges).
  LOG_CHUNK: 50_000,

  // How often live pages refresh (ms).
  POLL_MS: 12_000,

  SOCIAL: {
    x: "https://x.com/BOTChain_ai",
    github: "https://github.com/gmt-devs/headline-duel",
  },
};

export const NETWORKS = {
  mainnet: {
    chainId: 677,
    chainName: "BOT Chain",
    rpcUrl: "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
  testnet: {
    chainId: 968,
    chainName: "BOT Chain Testnet (Bohr)",
    rpcUrl: "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
};

NETWORKS.local = {
  chainId: 31337,
  chainName: "Hardhat",
  rpcUrl: "http://127.0.0.1:8545",
  explorer: "https://scan.bohr.life",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
};

export const NET = NETWORKS[CONFIG.NETWORK];

// Demo mode: no contract configured, or ?demo=1 in the URL. Uses a local,
// in-browser mock of the contract so the whole flow can be tried offline.
export const DEMO =
  !CONFIG.CONTRACT_ADDRESS || new URLSearchParams(location.search).get("demo") === "1";

export const CATEGORIES = ["Headline", "Tagline", "Ad", "Email subject", "Name", "Image"];
export const CATEGORY_ICONS = ["📰", "✨", "📣", "✉️", "🏷️", "🖼️"];
export const CONFIDENCE = ["", "low", "medium", "high"];
export const DURATIONS = [
  { label: "24 hours", seconds: 86_400 },
  { label: "3 days", seconds: 259_200 },
  { label: "7 days", seconds: 604_800 },
];
