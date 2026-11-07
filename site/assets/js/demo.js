// In-browser mock of the HeadlineDuel contract. Same API as the chain backend.
// Used when CONFIG.CONTRACT_ADDRESS is empty (or ?demo=1) so the full flow can
// be tried without a wallet or deployed contract. Nothing here touches a chain.
import { normaliseDuel } from "./chain.js";

const KEY = "hd-demo-v1";
const WALLET_KEY = "hd-demo-wallet";
const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);

function randomAddress() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fakeHash(text) {
  // Not keccak — demo only. Real hashes are computed on-chain.
  let h = 0n;
  for (const c of new TextEncoder().encode(text)) h = (h * 131n + BigInt(c)) & ((1n << 256n) - 1n);
  return "0x" + h.toString(16).padStart(64, "0");
}

const REASONS_A = ["Shorter and punchier", "Feels more personal", "Made me curious", "Clearer benefit", "Sounds confident", "Shorter", "I'd click this one"];
const REASONS_B = ["Clearer benefit", "B feels clearer", "Clearer benefit, less fluff", "More specific", "Shorter", "Feels trustworthy", "Clear benefit up front", "More concrete"];

function seed() {
  const t = now();
  const mk = (question, category, a, b, aiPick, aiConfidence, aiReason, startedAgoH, durationH, vA, vB, extra = {}) => ({
    raw: {
      creator: randomAddress(),
      question,
      category,
      a,
      b,
      isImage: false,
      aiPick,
      aiConfidence,
      aiReasonHash: aiPick ? fakeHash(aiReason) : "0x" + "0".repeat(64),
      endsAt: t - startedAgoH * HOUR + durationH * HOUR,
      votesA: vA,
      votesB: vB,
      createdBlock: 1000,
      ended: false,
      hidden: false,
      ...extra,
    },
    aiReason,
    created: t - startedAgoH * HOUR,
  });

  const list = [
    mk("Which would make you click?", 0, "Coffee that actually wakes you up", "Fresh beans at your door every Monday", 2, 2, "B names a concrete benefit and a rhythm students can picture.", 30, 72, 19, 31),
    mk("Which tagline sticks?", 1, "Think out loud.", "Your voice, organised.", 1, 1, "A is shorter and has a verb — easier to remember.", 5, 24, 12, 9),
    mk("Which subject line would you open?", 3, "Your weekly wins are in 🎉", "3 things you missed this week", 2, 3, "Numbers and a curiosity gap usually win on open rates.", 50, 72, 14, 27),
    mk("Best name for a budgeting app?", 4, "Pennywise", "Stash", 2, 1, "Stash is one syllable and avoids the horror-clown association.", 10, 168, 8, 15),
    mk("Which ad would stop your scroll?", 2, "Learn to code in 10 minutes a day", "Your first app, shipped by Friday", 2, 2, "B promises a finished outcome with a deadline.", 200, 168, 41, 63),
    mk("Which headline would you read?", 0, "Why most side projects die in week two", "How to finish your side project", 1, 2, "A uses a surprising claim that creates curiosity.", 100, 72, 22, 34),
    mk("Which tagline for a bike repair shop?", 1, "We fix bikes. Fast.", "Back on the road by tomorrow", 1, 1, "A is short and confident.", 180, 168, 18, 18),
    mk("Which hero headline for a study app?", 0, "Study less. Remember more.", "AI flashcards that adapt to you", 0, 0, "", 2, 24, 3, 2),
  ];

  const duels = list.map((d) => d.raw);
  const aiReasons = list.map((d) => d.aiReason);
  const created = list.map((d) => d.created);
  const votes = [];
  list.forEach((d, id) => {
    const total = d.raw.votesA + d.raw.votesB;
    const end = Math.min(t, d.raw.endsAt);
    for (let i = 0; i < total; i++) {
      const choice = i < d.raw.votesA ? 1 : 2;
      const pool = choice === 1 ? REASONS_A : REASONS_B;
      votes.push({
        id,
        voter: randomAddress(),
        choice,
        reason: Math.random() < 0.6 ? pool[Math.floor(Math.random() * pool.length)] : "",
        time: (d.created + Math.random() ** 1.4 * (end - d.created)) * 1000,
      });
    }
  });
  votes.sort((x, y) => x.time - y.time);
  return { duels, aiReasons, created, votes, reports: [] };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.duels)) return s;
  } catch {}
  const s = seed();
  save(s);
  return s;
}

let memory = null;
function save(s) {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
function state() {
  return memory || (memory = load());
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (name, arg) => {
  const e = new Error(name);
  e.revert = { name, args: arg ? [arg] : [] };
  throw e;
};

function isLive(d) {
  return !d.ended && now() < d.endsAt;
}

export const demoBackend = {
  demo: true,
  walletAddress() {
    try {
      let a = localStorage.getItem(WALLET_KEY);
      if (!a) {
        a = randomAddress();
        localStorage.setItem(WALLET_KEY, a);
      }
      return a;
    } catch {
      return (this._addr ||= randomAddress());
    }
  },
  newWallet() {
    const a = randomAddress();
    try { localStorage.setItem(WALLET_KEY, a); } catch { this._addr = a; }
    return a;
  },
  reset() {
    try { localStorage.removeItem(KEY); } catch {}
    memory = null;
  },
  async count() {
    return state().duels.length;
  },
  async getDuel(id) {
    const d = state().duels[id];
    if (!d) fail("NotFound");
    return normaliseDuel(d, id);
  },
  async getDuels(from, count) {
    return state().duels.slice(from, from + count).map((d, i) => normaliseDuel(d, from + i));
  },
  async stats() {
    const s = state();
    let aiCorrect = 0, aiFinished = 0;
    s.duels.forEach((d, i) => {
      const n = normaliseDuel(d, i);
      if (n.hidden || !n.aiPick || n.live || n.winner === 3) return;
      aiFinished++;
      if (n.winner === n.aiPick) aiCorrect++;
    });
    return { duels: s.duels.length, votes: s.votes.length, aiCorrect, aiFinished };
  },
  async duelsOf(addr) {
    const s = state();
    const a = addr.toLowerCase();
    const created = s.duels.map((d, i) => (d.creator.toLowerCase() === a ? i : -1)).filter((i) => i >= 0);
    const voted = [...new Set(s.votes.filter((v) => v.voter.toLowerCase() === a).map((v) => v.id))];
    return { created, voted };
  },
  async voteOf(id, addr) {
    const v = state().votes.find((x) => x.id === id && x.voter.toLowerCase() === addr.toLowerCase());
    return v ? v.choice : 0;
  },
  async aiReason(duel) {
    return { reason: state().aiReasons[duel.id] || "", verified: true };
  },
  async votes(duel) {
    return state().votes.filter((v) => v.id === duel.id).map((v, i) => ({ ...v, block: 1000 + i, tx: null }));
  },
  async startDuel(p) {
    await delay(700);
    const s = state();
    const addr = this.walletAddress();
    if (![86400, 259200, 604800].includes(Number(p.duration))) fail("InvalidInput", "duration");
    s.duels.push({
      creator: addr,
      question: p.question,
      category: p.category,
      a: p.a,
      b: p.b,
      isImage: p.isImage,
      aiPick: p.aiPick,
      aiConfidence: p.aiConfidence,
      aiReasonHash: p.aiPick ? fakeHash(p.aiReason) : "0x" + "0".repeat(64),
      endsAt: now() + Number(p.duration),
      votesA: 0,
      votesB: 0,
      createdBlock: 1000,
      ended: false,
      hidden: false,
    });
    s.aiReasons.push(p.aiReason || "");
    s.created.push(now());
    save(s);
    return { id: s.duels.length - 1, tx: null };
  },
  async vote(id, choice, reason) {
    await delay(600);
    const s = state();
    const d = s.duels[id];
    if (!d) fail("NotFound");
    if (!isLive(d) || d.hidden) fail("NotLive");
    const addr = this.walletAddress();
    if (d.creator.toLowerCase() === addr.toLowerCase()) fail("CreatorCannotVote");
    if (s.votes.some((v) => v.id === id && v.voter.toLowerCase() === addr.toLowerCase())) fail("AlreadyVoted");
    if (choice === 1) d.votesA++;
    else d.votesB++;
    s.votes.push({ id, voter: addr, choice, reason, time: Date.now() });
    save(s);
    return { tx: null };
  },
  async endEarly(id) {
    await delay(500);
    const s = state();
    const d = s.duels[id];
    if (!d) fail("NotFound");
    if (d.creator.toLowerCase() !== this.walletAddress().toLowerCase()) fail("NotCreator");
    if (!isLive(d)) fail("NotLive");
    d.ended = true;
    d.endsAt = now();
    save(s);
    return { tx: null };
  },
  async report(id, reason) {
    await delay(300);
    const s = state();
    s.reports.push({ id, reason, time: Date.now() });
    save(s);
    return { tx: null };
  },
  async setHidden(id, hidden) {
    const s = state();
    s.duels[id].hidden = hidden;
    save(s);
    return { tx: null };
  },
  async curator() {
    return "0x0000000000000000000000000000000000000000";
  },
};
