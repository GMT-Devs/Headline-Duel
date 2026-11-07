// Wallet + contract access. Two backends behind one API:
//   - chain: BOT Chain via ethers v6 (MetaMask for writes, public RPC for reads)
//   - demo:  in-browser mock (localStorage) used when no contract is configured
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";
import { CONFIG, NET, DEMO } from "./config.js";
import { demoBackend } from "./demo.js";

export { ethers };

const DUEL_TUPLE =
  "tuple(address creator,string question,uint8 category,string a,string b,bool isImage,uint8 aiPick,uint8 aiConfidence,bytes32 aiReasonHash,uint64 endsAt,uint32 votesA,uint32 votesB,uint64 createdBlock,bool ended,bool hidden)";

export const ABI = [
  "function startDuel(string question,uint8 category,string a,string b,bool isImage,uint8 aiPick,uint8 aiConfidence,string aiReason,uint64 duration) returns (uint256 id)",
  "function vote(uint256 id,uint8 choice,string reason)",
  "function endEarly(uint256 id)",
  "function setHidden(uint256 id,bool hidden)",
  "function report(uint256 id,string reason)",
  "function duelCount() view returns (uint256)",
  `function getDuel(uint256 id) view returns (${DUEL_TUPLE})`,
  `function getDuels(uint256 from,uint256 count) view returns (${DUEL_TUPLE}[])`,
  "function hasVoted(uint256 id,address addr) view returns (bool)",
  "function voteOf(uint256 id,address addr) view returns (uint8)",
  "function winner(uint256 id) view returns (uint8)",
  "function duelsOf(address addr) view returns (uint256[] created,uint256[] voted)",
  "function stats() view returns (uint256 duelTotal,uint256 voteTotal,uint256 aiCorrect,uint256 aiFinished)",
  "function curator() view returns (address)",
  "event DuelStarted(uint256 indexed id,address indexed creator,uint8 aiPick,string aiReason)",
  "event Voted(uint256 indexed id,address indexed voter,uint8 choice,string reason)",
  "event DuelEnded(uint256 indexed id)",
  "event DuelHidden(uint256 indexed id,bool hidden)",
  "event Reported(uint256 indexed id,address indexed reporter,string reason)",
  "error NotFound()",
  "error NotCreator()",
  "error NotCurator()",
  "error InvalidInput(string field)",
  "error NotLive()",
  "error AlreadyVoted()",
  "error CreatorCannotVote()",
];

const ERROR_TEXT = {
  NotFound: "Duel not found",
  NotCreator: "Only the creator can do that",
  NotCurator: "Only the curator can do that",
  InvalidInput: "Something in the form isn't valid",
  NotLive: "This duel has ended",
  AlreadyVoted: "You already voted on this duel",
  CreatorCannotVote: "You can't vote on your own duel",
};

/** Human message for any wallet / contract error. */
export function errorMessage(err) {
  if (!err) return "Something went wrong";
  if (err.code === "ACTION_REJECTED" || err.code === 4001 || err?.info?.error?.code === 4001) return "Transaction rejected in your wallet";
  const name = err.revert?.name;
  if (name && ERROR_TEXT[name]) return ERROR_TEXT[name] + (name === "InvalidInput" && err.revert.args?.[0] ? ` (${err.revert.args[0]})` : "");
  if (err.code === "INSUFFICIENT_FUNDS") return "Not enough BOT for gas";
  if (err.code === "NETWORK_ERROR" || err.code === "TIMEOUT") return "Network problem — check your connection and retry";
  return err.shortMessage || err.message || "Something went wrong";
}

export function normaliseDuel(raw, id, now = Date.now()) {
  const endsAt = Number(raw.endsAt) * 1000;
  const ended = Boolean(raw.ended);
  const live = !ended && now < endsAt;
  const votesA = Number(raw.votesA);
  const votesB = Number(raw.votesB);
  const winner = live ? 0 : votesA > votesB ? 1 : votesB > votesA ? 2 : 3;
  return {
    id: Number(id),
    creator: raw.creator,
    question: raw.question,
    category: Number(raw.category),
    a: raw.a,
    b: raw.b,
    isImage: Boolean(raw.isImage),
    aiPick: Number(raw.aiPick),
    aiConfidence: Number(raw.aiConfidence),
    aiReasonHash: raw.aiReasonHash,
    endsAt,
    votesA,
    votesB,
    total: votesA + votesB,
    createdBlock: Number(raw.createdBlock),
    ended,
    hidden: Boolean(raw.hidden),
    live,
    winner,
  };
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
const listeners = new Set();
export const wallet = {
  address: null,
  chainId: null,
  get hasProvider() {
    return DEMO || Boolean(window.ethereum);
  },
  get onRightChain() {
    return DEMO || this.chainId === NET.chainId;
  },
  get ready() {
    return Boolean(this.address) && this.onRightChain;
  },
  onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

function emitWallet() {
  listeners.forEach((cb) => {
    try {
      cb(wallet);
    } catch (e) {
      console.error(e);
    }
  });
}

const hexChain = "0x" + NET.chainId.toString(16);

export async function switchChain() {
  if (DEMO) return;
  if (!window.ethereum) throw new Error("Install MetaMask to continue");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902) throw err;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChain,
          chainName: NET.chainName,
          rpcUrls: [NET.rpcUrl],
          blockExplorerUrls: [NET.explorer],
          nativeCurrency: NET.nativeCurrency,
        },
      ],
    });
  }
  wallet.chainId = NET.chainId;
  emitWallet();
}

export async function connectWallet() {
  if (DEMO) {
    wallet.address = demoBackend.walletAddress();
    wallet.chainId = NET.chainId;
    try { localStorage.setItem("hd-demo-connected", "1"); } catch {}
    emitWallet();
    return wallet;
  }
  if (!window.ethereum) throw new Error("Install MetaMask to connect a wallet");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  wallet.address = accounts[0] ? ethers.getAddress(accounts[0]) : null;
  wallet.chainId = Number(await window.ethereum.request({ method: "eth_chainId" }));
  emitWallet();
  if (wallet.chainId !== NET.chainId) {
    try {
      await switchChain();
    } catch {
      /* user can press "Switch to BOT Chain" */
    }
  }
  return wallet;
}

export function disconnectWallet() {
  wallet.address = null;
  if (DEMO) try { localStorage.removeItem("hd-demo-connected"); } catch {}
  emitWallet();
}

/** Restore a previous connection without prompting. */
export async function restoreWallet() {
  if (DEMO) {
    let on = false;
    try { on = localStorage.getItem("hd-demo-connected") === "1"; } catch {}
    if (on) {
      wallet.address = demoBackend.walletAddress();
      wallet.chainId = NET.chainId;
      emitWallet();
    }
    return;
  }
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    wallet.chainId = Number(await window.ethereum.request({ method: "eth_chainId" }));
    wallet.address = accounts[0] ? ethers.getAddress(accounts[0]) : null;
    emitWallet();
  } catch {
    /* ignore */
  }
  window.ethereum.on?.("accountsChanged", (accs) => {
    wallet.address = accs[0] ? ethers.getAddress(accs[0]) : null;
    emitWallet();
  });
  window.ethereum.on?.("chainChanged", (id) => {
    wallet.chainId = Number(id);
    emitWallet();
  });
}

/** Demo only: become a fresh wallet so you can vote on your own demo duel. */
export function newDemoWallet() {
  wallet.address = demoBackend.newWallet();
  emitWallet();
}

// ---------------------------------------------------------------------------
// Chain backend
// ---------------------------------------------------------------------------
let readProvider;
let readContract;
function reader() {
  if (!readProvider) {
    readProvider = new ethers.JsonRpcProvider(NET.rpcUrl, NET.chainId, { staticNetwork: true });
    readContract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, readProvider);
  }
  return readContract;
}

async function writer() {
  if (!window.ethereum) throw new Error("Install MetaMask to continue");
  if (!wallet.address) await connectWallet();
  if (!wallet.onRightChain) await switchChain();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);
}

async function queryChunked(filter, fromBlock) {
  const c = reader();
  const latest = await c.runner.getBlockNumber();
  const start = Math.max(Number(fromBlock) || 0, CONFIG.DEPLOY_BLOCK || 0);
  try {
    return await c.queryFilter(filter, start, latest);
  } catch {
    const out = [];
    for (let from = start; from <= latest; from += CONFIG.LOG_CHUNK) {
      const to = Math.min(latest, from + CONFIG.LOG_CHUNK - 1);
      out.push(...(await c.queryFilter(filter, from, to)));
    }
    return out;
  }
}

const blockTimeCache = new Map();
async function blockTime(n) {
  if (blockTimeCache.has(n)) return blockTimeCache.get(n);
  const b = await reader().runner.getBlock(n);
  const t = b ? b.timestamp * 1000 : Date.now();
  blockTimeCache.set(n, t);
  return t;
}

const chainBackend = {
  async count() {
    return Number(await reader().duelCount());
  },
  async getDuel(id) {
    const raw = await reader().getDuel(id);
    return normaliseDuel(raw, id);
  },
  async getDuels(from, count) {
    const list = await reader().getDuels(from, count);
    return list.map((raw, i) => normaliseDuel(raw, from + i));
  },
  async stats() {
    const s = await reader().stats();
    return { duels: Number(s.duelTotal), votes: Number(s.voteTotal), aiCorrect: Number(s.aiCorrect), aiFinished: Number(s.aiFinished) };
  },
  async duelsOf(addr) {
    const [created, voted] = await reader().duelsOf(addr);
    return { created: created.map(Number), voted: voted.map(Number) };
  },
  async voteOf(id, addr) {
    return Number(await reader().voteOf(id, addr));
  },
  async aiReason(duel) {
    const c = reader();
    const logs = await c.queryFilter(c.filters.DuelStarted(duel.id), duel.createdBlock, duel.createdBlock);
    const reason = logs[0]?.args?.aiReason ?? "";
    const verified = reason ? ethers.keccak256(ethers.toUtf8Bytes(reason)) === duel.aiReasonHash : false;
    return { reason, verified };
  },
  async votes(duel) {
    const logs = await queryChunked(reader().filters.Voted(duel.id), duel.createdBlock);
    if (logs.length === 0) return [];
    // Interpolate timestamps between the creation block and the last vote block (2 RPC calls, not N).
    const first = duel.createdBlock;
    const last = logs[logs.length - 1].blockNumber;
    const [t0, t1] = await Promise.all([blockTime(first), blockTime(last)]);
    const span = Math.max(1, last - first);
    return logs.map((l) => ({
      voter: l.args.voter,
      choice: Number(l.args.choice),
      reason: l.args.reason,
      block: l.blockNumber,
      tx: l.transactionHash,
      time: t0 + ((l.blockNumber - first) / span) * (t1 - t0),
    }));
  },
  async startDuel(p) {
    const c = await writer();
    const tx = await c.startDuel(p.question, p.category, p.a, p.b, p.isImage, p.aiPick, p.aiConfidence, p.aiReason, p.duration);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "DuelStarted");
    return { id: Number(ev.args.id), tx: receipt.hash };
  },
  async vote(id, choice, reason) {
    const c = await writer();
    const receipt = await (await c.vote(id, choice, reason)).wait();
    return { tx: receipt.hash };
  },
  async endEarly(id) {
    const c = await writer();
    const receipt = await (await c.endEarly(id)).wait();
    return { tx: receipt.hash };
  },
  async report(id, reason) {
    const c = await writer();
    const receipt = await (await c.report(id, reason)).wait();
    return { tx: receipt.hash };
  },
  async setHidden(id, hidden) {
    const c = await writer();
    const receipt = await (await c.setHidden(id, hidden)).wait();
    return { tx: receipt.hash };
  },
  async curator() {
    return reader().curator();
  },
};

export const api = DEMO ? demoBackend : chainBackend;

/** Newest-first list of recent duels (up to `limit`). */
export async function recentDuels(limit = 120) {
  const n = await api.count();
  if (n === 0) return [];
  const from = Math.max(0, n - limit);
  const list = await api.getDuels(from, n - from);
  return list.reverse();
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function sameAddr(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}

export function explorerAddress(addr) {
  return `${NET.explorer}/address/${addr}`;
}
export function explorerTx(hash) {
  return `${NET.explorer}/tx/${hash}`;
}
