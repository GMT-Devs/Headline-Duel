// Worker client: AI predict + summary, IPFS upload. Falls back to local
// heuristics when the Worker isn't configured (demo mode) so the UI still works.
import { CONFIG, DEMO } from "./config.js";
import { blockedWord } from "./wordfilter.js";

const configured = () => CONFIG.WORKER_URL && !CONFIG.WORKER_URL.includes("example");

async function post(path, body, isForm = false) {
  const res = await fetch(CONFIG.WORKER_URL.replace(/\/$/, "") + path, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** → { pick: 1|2, confidence: 1|2|3, reason } | { blocked, reason } */
export async function predict({ question, category, context, a, b, isImage }) {
  if (!configured()) {
    if (!DEMO) throw new Error("AI is not configured");
    return demoPredict({ a, b, isImage });
  }
  const out = await post("/duel/predict", { question, category, context, a, b, isImage });
  if (out.blocked) return out;
  return { pick: out.pick === "A" ? 1 : 2, confidence: { low: 1, medium: 2, high: 3 }[out.confidence] || 1, reason: out.reason };
}

/** reasons: [{choice, reason}] → { A: [{theme,count}], B: [...] } */
export async function summarise(question, reasons) {
  const usable = reasons.filter((r) => r.reason && r.reason.trim());
  if (usable.length === 0) return { A: [], B: [] };
  if (!configured()) return localSummary(usable);
  return post("/duel/summary", { question, reasons: usable.map((r) => ({ choice: r.choice, reason: r.reason })) });
}

export async function uploadImage(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error("Image must be 2 MB or smaller");
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Use PNG, JPEG, WebP or GIF");
  if (!configured()) throw new Error("Image uploads need the Worker (not available in demo mode)");
  const form = new FormData();
  form.append("file", file);
  const { cid } = await post("/upload", form, true);
  return cid;
}

export function textProblem(text) {
  const w = blockedWord(text);
  return w ? "That text contains a word we don't allow" : null;
}

// --- local fallbacks (demo only) --------------------------------------------
function demoPredict({ a, b, isImage }) {
  if (isImage) return { pick: 1, confidence: 1, reason: "Demo mode: the AI can't see images without the Worker." };
  const score = (s) => {
    let x = 0;
    if (/\d/.test(s)) x += 2;
    if (/\byou(r)?\b/i.test(s)) x += 2;
    x += Math.max(0, 8 - s.split(/\s+/).length) * 0.4;
    if (/[!?]$/.test(s)) x += 0.5;
    return x;
  };
  const [sa, sb] = [score(a), score(b)];
  const pick = sa >= sb ? 1 : 2;
  const diff = Math.abs(sa - sb);
  const win = pick === 1 ? a : b;
  const why = /\d/.test(win) ? "uses a concrete number" : /\byou/i.test(win) ? "speaks directly to the reader" : "is shorter and easier to scan";
  return { pick, confidence: diff > 2 ? 3 : diff > 0.8 ? 2 : 1, reason: `Demo guess: ${pick === 1 ? "A" : "B"} ${why}.` };
}

function localSummary(reasons) {
  const out = { A: [], B: [] };
  for (const side of [1, 2]) {
    const counts = new Map();
    for (const r of reasons.filter((x) => x.choice === side)) {
      const key = r.reason.trim().toLowerCase().replace(/[.!]+$/, "").replace(/^(a|b) (feels|is) /, "");
      const theme = /clear/.test(key) ? "clearer" : /short/.test(key) ? "shorter" : /specific|concrete/.test(key) ? "more specific" : /curio/.test(key) ? "creates curiosity" : /trust|confident/.test(key) ? "feels trustworthy" : /personal/.test(key) ? "more personal" : key.slice(0, 30);
      counts.set(theme, (counts.get(theme) || 0) + 1);
    }
    out[side === 1 ? "A" : "B"] = [...counts].map(([theme, count]) => ({ theme, count })).sort((x, y) => y.count - x.count).slice(0, 4);
  }
  return out;
}
