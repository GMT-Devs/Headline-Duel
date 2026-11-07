// App views: wall (/app), create (/app/new), vote + results (/d/:id), profile (/app/me), static pages.
import { CONFIG, CATEGORIES, CATEGORY_ICONS, CONFIDENCE, DURATIONS, DEMO } from "./config.js";
import { api, wallet, connectWallet, switchChain, recentDuels, errorMessage, shortAddr, sameAddr, explorerTx, explorerAddress } from "./chain.js";
import { predict, summarise, uploadImage, textProblem } from "./ai.js";
import { esc, $, $$, toast, openModal, closeModal, withBusy, timeLeft, ago, fmt, pct, categoryChip, versionHTML, ipfsUrl, copyText, aiBadge, aiLeadBadge, reducedMotion, isMobile } from "./ui.js";

const view = () => $("#view");
let cleanup = [];
export function teardown() {
  cleanup.forEach((fn) => { try { fn(); } catch {} });
  cleanup = [];
  document.body.classList.remove("has-sticky");
}
const every = (ms, fn) => {
  const t = setInterval(() => { if (!document.hidden) fn(); }, ms);
  cleanup.push(() => clearInterval(t));
};
const onWallet = (fn) => cleanup.push(wallet.onChange(fn));

export const duelUrl = (id) => new URL(`d/${id}`, document.baseURI).href;
const xIntent = (duel) => {
  const text = duel.isImage
    ? `Help me pick: A or B? 👀 "${duel.question}"`
    : `Help me pick: A or B? 👀\nA: "${duel.a}"\nB: "${duel.b}"`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(duelUrl(duel.id))}&hashtags=HeadlineDuel&via=BOTChain_ai`;
};

function animateIn(root = view()) {
  if (!window.gsap || reducedMotion()) return;
  gsap.from(root.children, { y: 14, opacity: 0, duration: 0.45, stagger: 0.05, ease: "power2.out", clearProps: "all" });
}

async function ensureWallet() {
  if (!wallet.hasProvider) {
    openModal(`<h2 style="font-size:22px;margin-bottom:10px">Install MetaMask</h2>
      <p class="muted" style="margin-bottom:18px">You need a wallet to start duels and vote — it keeps things fair: one wallet, one vote. You can still browse the wall and finished results.</p>
      <div style="display:flex;gap:10px"><a class="btn btn--primary" href="https://metamask.io/download/" target="_blank" rel="noopener">Get MetaMask ↗</a><button class="btn btn--ghost" data-close>Not now</button></div>`);
    return false;
  }
  if (!wallet.address) await connectWallet();
  if (!wallet.address) return false;
  if (!wallet.onRightChain) await switchChain();
  return wallet.ready;
}

function txToast(res, msg) {
  toast(res?.tx ? `${msg} · <a href="${explorerTx(res.tx)}" target="_blank" rel="noopener">view tx ↗</a>` : msg, "ok");
}

// ===========================================================================
// Wall
// ===========================================================================
const WALL_TABS = [
  ["live", "Live"],
  ["ending", "Ending soon"],
  ["top", "Most voted"],
  ["finished", "Finished"],
];

function duelCard(d) {
  const winA = !d.live && d.winner === 1, winB = !d.live && d.winner === 2;
  return `<a class="dcard" href="d/${d.id}" data-id="${d.id}">
    <div class="dcard__body">
      <div class="dcard__meta">${categoryChip(d.category)}<span class="mono muted small">${d.live ? timeLeft(d.endsAt) : d.winner === 3 ? "tie" : "finished"}</span></div>
      <p class="dcard__q">${esc(d.question)}</p>
      <div class="dcard__split">
        <div class="dcard__v dcard__v--a ${winA ? "is-win" : ""}">${versionHTML(d, 1)}</div>
        <div class="dcard__v dcard__v--b ${winB ? "is-win" : ""}">${versionHTML(d, 2)}</div>
        <span class="vs vs--sm">VS</span>
      </div>
      <div class="dcard__foot"><span>${fmt(d.total)} vote${d.total === 1 ? "" : "s"}</span><span>${d.aiPick ? "🤖 AI " + (d.aiPick === 1 ? "A" : "B") : "no AI pick"}${!d.live && d.aiPick && d.winner !== 3 ? (d.aiPick === d.winner ? " ✓" : " ✗") : ""}</span></div>
    </div>
  </a>`;
}

export async function renderWall() {
  const params = new URLSearchParams(location.search);
  let tab = params.get("tab") || "live";
  let cat = params.has("cat") ? Number(params.get("cat")) : -1;
  let all = [];

  view().innerHTML = `
    <div class="app-head"><div><h1>The Duel wall</h1><p>Pick a side. Results unlock after you vote.</p></div><a class="btn btn--primary" href="app/new">Start a duel</a></div>
    <div class="toolbar">
      <div class="tabrail" role="tablist">${WALL_TABS.map(([k, l]) => `<button class="tabrail__tab ${k === tab ? "is-active" : ""}" data-tab="${k}" role="tab">${l}</button>`).join("")}</div>
      <div class="filters"><button class="chip ${cat === -1 ? "is-active" : ""}" data-cat="-1">All</button>${CATEGORIES.map((c, i) => `<button class="chip ${cat === i ? "is-active" : ""}" data-cat="${i}">${CATEGORY_ICONS[i]} ${c}</button>`).join("")}</div>
    </div>
    <div id="wall-grid" class="grid">${'<div class="skeleton" style="height:280px"></div>'.repeat(6)}</div>`;

  const draw = () => {
    let list = all.filter((d) => !d.hidden && (cat === -1 || d.category === cat));
    if (tab === "live") list = list.filter((d) => d.live);
    if (tab === "ending") list = list.filter((d) => d.live).sort((x, y) => x.endsAt - y.endsAt);
    if (tab === "top") list = [...list].sort((x, y) => y.total - x.total);
    if (tab === "finished") list = list.filter((d) => !d.live);
    const grid = $("#wall-grid");
    if (!grid) return;
    grid.innerHTML = list.length
      ? list.map(duelCard).join("")
      : `<div class="empty" style="grid-column:1/-1"><h3>${tab === "finished" ? "No finished duels yet" : "No duels here yet"}</h3><p>Be the first — it takes a minute.</p><a class="btn btn--primary" href="app/new">Start a duel</a></div>`;
    if (window.gsap && !reducedMotion()) gsap.from(grid.children, { y: 16, opacity: 0, duration: 0.4, stagger: 0.03, ease: "power2.out", clearProps: "all" });
  };

  const sync = () => {
    const u = new URL(location.href);
    u.searchParams.set("tab", tab);
    if (cat === -1) u.searchParams.delete("cat"); else u.searchParams.set("cat", cat);
    history.replaceState(null, "", u);
  };

  $$("[data-tab]", view()).forEach((b) => (b.onclick = () => {
    tab = b.dataset.tab;
    $$("[data-tab]", view()).forEach((x) => x.classList.toggle("is-active", x === b));
    sync(); draw();
  }));
  $$("[data-cat]", view()).forEach((b) => (b.onclick = () => {
    cat = Number(b.dataset.cat);
    $$("[data-cat]", view()).forEach((x) => x.classList.toggle("is-active", x === b));
    sync(); draw();
  }));

  const load = async (first) => {
    try {
      const next = await recentDuels(200);
      const changed = JSON.stringify(next.map((d) => [d.id, d.total, d.live])) !== JSON.stringify(all.map((d) => [d.id, d.total, d.live]));
      all = next;
      if (first || changed) draw();
    } catch (e) {
      if (first) $("#wall-grid").innerHTML = `<div class="notice notice--error" style="grid-column:1/-1">Couldn't load duels: ${esc(errorMessage(e))} <button class="btn btn--ghost btn--sm" id="retry">Retry</button></div>`;
      $("#retry")?.addEventListener("click", () => load(true));
    }
  };
  await load(true);
  every(CONFIG.POLL_MS, () => load(false));
}

// ===========================================================================
// Create
// ===========================================================================
export async function renderCreate() {
  const params = new URLSearchParams(location.search);
  const s = {
    question: "Which would make you click?",
    category: 0,
    context: "",
    isImage: params.get("image") === "1",
    a: "",
    b: "",
    previewA: "",
    previewB: "",
    duration: DURATIONS[0].seconds,
    ai: null, // {pick, confidence, reason} | {error}
  };
  if (s.isImage) s.category = 5;

  // Rematch: winner (or leader) vs a new challenger
  const rematchId = params.get("rematch");
  if (rematchId !== null) {
    try {
      const d = await api.getDuel(Number(rematchId));
      const side = d.winner === 2 || (d.winner === 0 && d.votesB > d.votesA) ? 2 : 1;
      s.question = d.question;
      s.category = d.category;
      s.isImage = d.isImage;
      s.a = side === 1 ? d.a : d.b;
      if (s.isImage) s.previewA = ipfsUrl(s.a);
    } catch {
      toast("Couldn't load the original duel for a rematch", "error");
    }
  }

  const durationSeg = DURATIONS.map((d) => `<button type="button" data-dur="${d.seconds}" class="${d.seconds === s.duration ? "is-active" : ""}">${d.label}</button>`).join("");

  view().innerHTML = `
    <div class="app-head"><div><h1>${rematchId !== null ? "Start a rematch" : "Start a duel"}</h1><p>Two versions. Real people pick. The AI guesses first — and its guess is locked on-chain.</p></div></div>
    <div class="create" id="create">
      <form class="panel" id="create-form" novalidate>
        <div class="field"><label for="q">Question <span class="count" data-count="q">0/100</span></label><input class="input" id="q" maxlength="100" value="${esc(s.question)}" /></div>
        <div class="field"><span class="label">Category</span><div class="filters" id="cats">${CATEGORIES.map((c, i) => `<button type="button" class="chip ${i === s.category ? "is-active" : ""}" data-cat="${i}">${CATEGORY_ICONS[i]} ${c}</button>`).join("")}</div></div>
        <div class="field"><label for="ctx">Context (optional) <span class="count" data-count="ctx">0/120</span></label><input class="input" id="ctx" maxlength="120" placeholder="for a coffee subscription, audience: students" value="${esc(s.context)}" /></div>
        <div class="field"><span class="label">Format</span><div class="seg" id="mode"><button type="button" data-mode="text" class="${s.isImage ? "" : "is-active"}">Text</button><button type="button" data-mode="image" class="${s.isImage ? "is-active" : ""}">Image</button></div></div>
        <div class="vfields" id="vfields"></div>
        <div class="field" style="margin-top:18px"><span class="label">Duration</span><div class="seg" id="dur">${durationSeg}</div></div>
        <div id="ai-area"></div>
        <div id="form-error" class="err" role="alert"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
          <button type="button" class="btn btn--yellow" id="ask-ai">✨ Ask AI first</button>
          <button type="submit" class="btn btn--primary" id="start">Start duel</button>
        </div>
        <p class="muted small" style="margin-top:12px">Starting a duel is one transaction on BOT Chain. The versions, the AI pick and a hash of its reason are locked before any votes.</p>
      </form>
      <aside class="preview-sticky" id="preview"></aside>
    </div>`;

  const vfields = () => {
    $("#vfields").innerHTML = [1, 2].map((side) => {
      const k = side === 1 ? "a" : "b";
      const L = side === 1 ? "A" : "B";
      if (s.isImage) {
        const prev = side === 1 ? s.previewA : s.previewB;
        return `<div class="vfield vfield--${k}"><div class="field"><span class="label">Version ${L} · image ≤ 2 MB</span>
          <label class="drop" id="drop-${k}">${prev ? `<img src="${esc(prev)}" alt="" />` : `<span>Drop or choose an image<br/><small class="mono">PNG · JPEG · WebP · GIF</small></span>`}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-file="${k}" aria-label="Upload version ${L}" /></label>
          <span class="err" id="err-${k}"></span></div></div>`;
      }
      return `<div class="vfield vfield--${k}"><div class="field"><label for="v-${k}">Version ${L} <span class="count" data-count="v-${k}">0/140</span></label>
        <textarea class="textarea textarea--serif" id="v-${k}" maxlength="140" rows="3" placeholder="${side === 1 ? "Coffee that actually wakes you up" : "Fresh beans at your door every Monday"}">${esc(s[k])}</textarea><span class="err" id="err-${k}"></span></div></div>`;
    }).join("");
    bindVersionInputs();
    counts();
  };

  const counts = () => {
    $$("[data-count]", view()).forEach((c) => {
      const el = $("#" + c.dataset.count);
      if (!el) return;
      const max = Number(el.getAttribute("maxlength"));
      const n = [...el.value].length;
      c.textContent = `${n}/${max}`;
      c.classList.toggle("is-over", n > max);
    });
  };

  const invalidateAI = () => {
    if (s.ai && !s.ai.error) toast("Versions changed — ask the AI again", "info", 2500);
    s.ai = null;
    renderAI();
  };

  function bindVersionInputs() {
    $$("textarea[id^=v-]", view()).forEach((t) => (t.oninput = () => {
      const k = t.id.slice(2);
      s[k] = t.value;
      $("#err-" + k).textContent = textProblem(t.value) || "";
      t.classList.toggle("is-bad", Boolean(textProblem(t.value)));
      counts();
      if (s.ai) invalidateAI();
      renderPreview();
    }));
    $$("input[data-file]", view()).forEach((inp) => (inp.onchange = async () => {
      const k = inp.dataset.file;
      const file = inp.files?.[0];
      if (!file) return;
      const err = $("#err-" + k);
      err.textContent = "";
      if (file.size > 2 * 1024 * 1024) { err.textContent = "Too big — images must be 2 MB or smaller"; return; }
      const local = URL.createObjectURL(file);
      const drop = $("#drop-" + k);
      drop.querySelector("span")?.remove();
      drop.querySelector("img")?.remove();
      drop.insertAdjacentHTML("afterbegin", `<img src="${local}" alt="" style="opacity:.5" />`);
      try {
        const cid = await uploadImage(file);
        s[k] = cid;
        s[k === "a" ? "previewA" : "previewB"] = local;
        drop.querySelector("img").style.opacity = "1";
        if (s.ai) invalidateAI();
        renderPreview();
      } catch (e) {
        s[k] = "";
        drop.querySelector("img")?.remove();
        drop.insertAdjacentHTML("afterbegin", `<span>Upload failed — try again</span>`);
        err.textContent = e.message || "Upload failed";
      }
    }));
  }

  function renderAI() {
    const area = $("#ai-area");
    if (!s.ai) { area.innerHTML = ""; return; }
    if (s.ai.error) {
      area.innerHTML = `<div class="notice notice--warn">🤖 ${esc(s.ai.error)} — you can still start the duel with “No AI pick”.</div>`;
      return;
    }
    const L = s.ai.pick === 1 ? "A" : "B";
    area.innerHTML = `<div class="ai-box" style="margin-bottom:16px"><div class="ai-box__pick"><span class="ai-box__letter ai-box__letter--${L.toLowerCase()}">${L}</span><div><b>AI picks ${L}</b><br/><span class="chip">confidence: ${CONFIDENCE[s.ai.confidence]}</span></div></div><p class="serif" style="font-size:20px">“${esc(s.ai.reason)}”</p><p class="muted small">This guess gets locked on-chain when you start the duel.</p></div>`;
    if (window.gsap && !reducedMotion()) gsap.from(area.firstElementChild, { scale: 0.96, opacity: 0, duration: 0.35, ease: "back.out(2)" });
  }

  function renderPreview() {
    const fake = { id: "…", question: s.question || "Which would make you click?", category: s.category, a: s.a || "Version A", b: s.b || "Version B", isImage: false, total: 0, live: true, endsAt: Date.now() + s.duration * 1000, aiPick: s.ai?.pick || 0, winner: 0 };
    const imgA = s.isImage ? (s.previewA ? `<img src="${esc(s.previewA)}" alt="" />` : "Image A") : esc(fake.a);
    const imgB = s.isImage ? (s.previewB ? `<img src="${esc(s.previewB)}" alt="" />` : "Image B") : esc(fake.b);
    $("#preview").innerHTML = `<p class="eyebrow">Preview on the wall</p><div class="dcard"><div class="dcard__body"><div class="dcard__meta">${categoryChip(fake.category)}<span class="mono muted small">${timeLeft(fake.endsAt)}</span></div><p class="dcard__q">${esc(fake.question)}</p><div class="dcard__split"><div class="dcard__v dcard__v--a">${imgA}</div><div class="dcard__v dcard__v--b">${imgB}</div><span class="vs vs--sm">VS</span></div><div class="dcard__foot"><span>0 votes</span><span>${fake.aiPick ? "🤖 AI " + (fake.aiPick === 1 ? "A" : "B") : "AI not asked yet"}</span></div></div></div>`;
  }

  // bindings
  $("#q").oninput = (e) => { s.question = e.target.value; counts(); renderPreview(); };
  $("#ctx").oninput = (e) => { s.context = e.target.value; counts(); };
  $$("#cats [data-cat]").forEach((b) => (b.onclick = () => {
    s.category = Number(b.dataset.cat);
    $$("#cats [data-cat]").forEach((x) => x.classList.toggle("is-active", x === b));
    if (s.category === 5 && !s.isImage) setMode(true);
    renderPreview();
  }));
  const setMode = (img) => {
    if (s.isImage === img) return;
    s.isImage = img;
    s.a = s.b = s.previewA = s.previewB = "";
    s.ai = null;
    if (img) { s.category = 5; } else if (s.category === 5) { s.category = 0; }
    $$("#cats [data-cat]").forEach((x) => x.classList.toggle("is-active", Number(x.dataset.cat) === s.category));
    $$("#mode [data-mode]").forEach((x) => x.classList.toggle("is-active", (x.dataset.mode === "image") === img));
    vfields(); renderAI(); renderPreview();
  };
  $$("#mode [data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode === "image")));
  $$("#dur [data-dur]").forEach((b) => (b.onclick = () => {
    s.duration = Number(b.dataset.dur);
    $$("#dur [data-dur]").forEach((x) => x.classList.toggle("is-active", x === b));
    renderPreview();
  }));

  const validate = () => {
    const errors = [];
    if (!s.question.trim()) errors.push("Add a question");
    if (!s.a.trim() || !s.b.trim()) errors.push(s.isImage ? "Upload both images" : "Write both versions");
    if (!s.isImage && s.a.trim() && s.a.trim() === s.b.trim()) errors.push("The two versions are identical");
    const bad = textProblem(`${s.question} ${s.context} ${s.isImage ? "" : s.a + " " + s.b}`);
    if (bad) errors.push(bad);
    $("#form-error").textContent = errors[0] || "";
    return errors.length === 0;
  };

  const askAI = async () => {
    try {
      const out = await predict({ question: s.question, category: s.category, context: s.context, a: s.a.trim(), b: s.b.trim(), isImage: s.isImage });
      if (out.blocked) {
        s.ai = null;
        $("#form-error").textContent = `Blocked: ${out.reason}`;
        renderAI();
        return false;
      }
      s.ai = out;
    } catch (e) {
      s.ai = { error: e.message || "The AI couldn't answer" };
    }
    renderAI();
    renderPreview();
    return true;
  };

  $("#ask-ai").onclick = (e) => {
    if (!validate()) return;
    withBusy(e.currentTarget, "Asking AI…", askAI);
  };

  $("#create-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const btn = $("#start");
    await withBusy(btn, "Starting…", async () => {
      if (!s.ai) {
        const ok = await askAI();
        if (!ok) return;
      }
      if (!(await ensureWallet().catch((err) => { toast(errorMessage(err), "error"); return false; }))) return;
      const ai = s.ai && !s.ai.error ? s.ai : { pick: 0, confidence: 0, reason: "" };
      try {
        toast("Confirm the transaction in your wallet…", "info", 3000);
        const res = await api.startDuel({
          question: s.question.trim(),
          category: s.category,
          a: s.a.trim(),
          b: s.b.trim(),
          isImage: s.isImage,
          aiPick: ai.pick,
          aiConfidence: ai.confidence,
          aiReason: ai.reason,
          duration: s.duration,
        });
        txToast(res, "Duel started — AI pick locked 🔒");
        const d = await api.getDuel(res.id);
        renderShareKit(d);
      } catch (err) {
        toast(`${errorMessage(err)} — you can retry`, "error", 6000);
      }
    });
  };

  vfields(); renderAI(); renderPreview(); counts();
  animateIn();
}

function renderShareKit(d) {
  const url = duelUrl(d.id);
  view().innerHTML = `
    <div class="app-head"><div><p class="eyebrow">Duel #${d.id} is live</p><h1>Now get some votes.</h1><p>Share the link — results unlock for voters after they pick.</p></div></div>
    <div class="create">
      <div class="panel share">
        <div class="share__link"><input class="input" readonly value="${esc(url)}" id="share-url" aria-label="Duel link" /><button class="btn btn--ghost" id="copy-link">Copy</button></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn--primary" href="${esc(xIntent(d))}" target="_blank" rel="noopener">Post on 𝕏</a><a class="btn btn--outline" href="d/${d.id}">Open duel</a><a class="btn btn--ghost" href="app/new">Start another</a></div>
        <div><p class="label" style="margin-bottom:8px">Ready post</p><div class="xpost"><p>Help me pick: A or B? 👀${d.isImage ? "" : `<br/>A: “${esc(d.a)}”<br/>B: “${esc(d.b)}”`}</p><div class="xpost__link mono">${esc(url.replace(/^https?:\/\//, ""))}</div></div></div>
      </div>
      <aside class="panel"><p class="label" style="margin-bottom:12px">QR code</p><div class="qr" id="qr"></div><p class="muted small" style="margin-top:12px">Put it on a slide or a poster.</p></aside>
    </div>`;
  $("#copy-link").onclick = () => copyText(url);
  if (window.QRCode) new QRCode($("#qr"), { text: url, width: 160, height: 160, colorDark: "#1c1c1c", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  animateIn();
}

// ===========================================================================
// Duel (vote + results)
// ===========================================================================
export async function renderDuel(id) {
  view().innerHTML = `<div class="skeleton" style="height:60px;margin-bottom:20px"></div><div class="skeleton" style="height:52vh"></div>`;
  let duel;
  try {
    if (!Number.isInteger(id) || id < 0 || id >= (await api.count())) throw Object.assign(new Error("NotFound"), { revert: { name: "NotFound" } });
    duel = await api.getDuel(id);
  } catch (e) {
    const nf = e?.revert?.name === "NotFound";
    view().innerHTML = `<div class="empty"><h3>${nf ? "Duel not found" : "Couldn't load this duel"}</h3><p>${nf ? "It may not exist yet — check the link." : esc(errorMessage(e))}</p><a class="btn btn--primary" href="app">Back to the wall</a></div>`;
    return;
  }

  const st = { duel, myVote: 0, chosen: 0, votes: null, ai: null, summary: null, curator: null, chart: null };

  const isCreator = () => sameAddr(wallet.address, st.duel.creator);
  const canSee = () => !st.duel.live || isCreator() || st.myVote > 0;
  const canVote = () => st.duel.live && !st.duel.hidden && !isCreator() && !st.myVote;

  async function refreshMine() {
    st.myVote = wallet.address ? await api.voteOf(id, wallet.address).catch(() => 0) : 0;
  }

  await refreshMine();
  st.ai = await api.aiReason(st.duel).catch(() => ({ reason: "", verified: false }));
  api.curator?.().then((c) => { st.curator = c; if (sameAddr(c, wallet.address)) drawActions(); }).catch(() => {});

  const d = () => st.duel;
  const L = (n) => (n === 1 ? "A" : "B");

  function frame() {
    const x = d();
    view().innerHTML = `
      ${x.hidden ? `<div class="notice notice--warn">This duel was hidden by the curator.</div>` : ""}
      <div class="duel-head">
        <div>
          <div class="meta">${categoryChip(x.category)}<span class="chip">${x.live ? "⏱ " + timeLeft(x.endsAt) : "Ended"}</span><span class="chip mono">#${x.id}</span><a class="chip" href="${explorerAddress(x.creator)}" target="_blank" rel="noopener">by ${shortAddr(x.creator)}</a></div>
          <h1>${esc(x.question)}</h1>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--ghost btn--sm" id="share-btn">Share</button><button class="btn btn--ghost btn--sm" id="report-btn">Report</button></div>
      </div>
      <div id="banner"></div>
      <div id="notice"></div>
      <div class="arena" id="arena">
        <button class="arena__side arena__side--a" data-side="1" aria-label="Vote for version A"><span class="side-label">A</span><div class="arena__content">${x.isImage ? versionHTML(x, 1, "arena__img") : `<p class="arena__text">${esc(x.a)}</p>`}</div><span class="arena__key">←</span></button>
        <div class="vs">VS</div>
        <button class="arena__side arena__side--b" data-side="2" aria-label="Vote for version B"><span class="side-label">B</span><div class="arena__content">${x.isImage ? versionHTML(x, 2, "arena__img") : `<p class="arena__text">${esc(x.b)}</p>`}</div><span class="arena__key">→</span></button>
      </div>
      <div id="votebox"></div>
      <div id="results"></div>
      <div class="sticky-result" id="sticky" hidden></div>`;

    $$(".arena__side").forEach((b) => (b.onclick = () => choose(Number(b.dataset.side))));
    $("#share-btn").onclick = shareModal;
    $("#report-btn").onclick = reportModal;
    bindSwipe();
    drawState();
    if (window.gsap && !reducedMotion()) {
      gsap.from(".arena__side--a", { x: -40, opacity: 0, duration: 0.5, ease: "power3.out" });
      gsap.from(".arena__side--b", { x: 40, opacity: 0, duration: 0.5, ease: "power3.out" });
      gsap.from(".arena .vs", { scale: 0, rotate: -30, duration: 0.6, delay: 0.25, ease: "back.out(3)" });
    }
  }

  function drawState() {
    const x = d();
    // banner
    $("#banner").innerHTML = x.live ? "" : x.winner === 3
      ? `<div class="banner banner--draw">🤝 It's a tie — ${fmt(x.votesA)} each</div>`
      : `<div class="banner banner--win-${L(x.winner).toLowerCase()}">🏆 Version ${L(x.winner)} wins · ${pct(x.winner === 1 ? x.votesA : x.votesB, x.total)}% of ${fmt(x.total)} votes ${aiBadge(x)}</div>`;

    // notice
    let n = "";
    if (x.live && isCreator()) n = `<div class="notice">This is your duel — you can't vote on it, but you can see results as they come in.</div>`;
    else if (x.live && !wallet.hasProvider) n = `<div class="notice notice--warn">Install MetaMask to vote — one wallet, one vote keeps it fair. <a class="btn btn--ghost btn--sm" href="https://metamask.io/download/" target="_blank" rel="noopener">Get MetaMask ↗</a></div>`;
    else if (x.live && wallet.address && !wallet.onRightChain) n = `<div class="notice notice--warn">You're on the wrong network. <button class="btn btn--yellow btn--sm" id="switch-net">Switch to BOT Chain</button></div>`;
    else if (st.myVote) n = `<div class="notice">You voted <b style="color:${st.myVote === 1 ? "var(--a)" : "var(--b)"}">&nbsp;${L(st.myVote)}&nbsp;</b> on this duel.</div>`;
    $("#notice").innerHTML = n;
    $("#switch-net")?.addEventListener("click", () => switchChain().catch((e) => toast(errorMessage(e), "error")));

    // arena state
    $$(".arena__side").forEach((b) => {
      const side = Number(b.dataset.side);
      b.disabled = !canVote();
      b.classList.toggle("is-chosen", side === (st.chosen || st.myVote));
      b.querySelector(".win-flag")?.remove();
      if (!x.live && x.winner === side) b.insertAdjacentHTML("beforeend", `<span class="chip chip--green win-flag">🏆 winner</span>`);
    });

    drawVoteBox();
    if (canSee()) drawResults(); else drawLocked();
  }

  function drawVoteBox() {
    const box = $("#votebox");
    if (!canVote() || !st.chosen) {
      box.innerHTML = canVote() ? `<p class="muted mono small" style="margin-top:14px;text-align:center">${isMobile() ? "Tap or swipe to pick a side" : "Click a side or press ← / →"}</p>` : "";
      return;
    }
    const side = L(st.chosen);
    box.innerHTML = `<form class="votebox" id="vote-form">
      <div class="field"><label for="reason">Why ${side}? (optional) <span class="count" id="reason-count">0/140</span></label><input class="input" id="reason" maxlength="140" placeholder="${side} feels clearer" autocomplete="off" /><span class="err" id="reason-err"></span></div>
      <div class="votebox__actions" style="padding-top:26px"><button type="button" class="btn btn--ghost" id="vote-cancel">Cancel</button><button type="submit" class="btn btn--${side.toLowerCase()}" id="vote-go">Vote ${side}</button></div>
    </form>`;
    const input = $("#reason");
    input.focus({ preventScroll: true });
    input.oninput = () => {
      $("#reason-count").textContent = `${[...input.value].length}/140`;
      $("#reason-err").textContent = textProblem(input.value) || "";
    };
    $("#vote-cancel").onclick = () => { st.chosen = 0; resetArena(); drawState(); };
    $("#vote-form").onsubmit = (e) => { e.preventDefault(); castVote(); };
    if (window.gsap && !reducedMotion()) gsap.from(box.firstElementChild, { y: 12, opacity: 0, duration: 0.3 });
  }

  function choose(side) {
    if (!canVote()) return;
    st.chosen = side;
    // chosen side expands, the other slides away (transform/opacity only)
    if (window.gsap && !reducedMotion()) {
      const chosen = $(`.arena__side[data-side="${side}"]`);
      const other = $(`.arena__side[data-side="${3 - side}"]`);
      const dir = isMobile() ? { y: side === 1 ? 30 : -30 } : { x: side === 1 ? 60 : -60 };
      gsap.to(chosen, { scale: 1.02, opacity: 1, x: 0, y: 0, duration: 0.35, ease: "power2.out" });
      gsap.to(other, { ...dir, scale: 0.94, opacity: 0.35, duration: 0.35, ease: "power2.out" });
    }
    drawState();
  }

  function resetArena() {
    if (window.gsap) gsap.to(".arena__side", { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.3 });
  }

  async function castVote() {
    const reason = ($("#reason")?.value || "").trim();
    if (textProblem(reason)) return;
    const btn = $("#vote-go");
    await withBusy(btn, "Voting…", async () => {
      try {
        if (!(await ensureWallet())) return;
        await refreshMine();
        if (isCreator()) { toast("You can't vote on your own duel", "error"); drawState(); return; }
        if (st.myVote) { toast("You already voted on this duel", "info"); drawState(); return; }
        toast("Confirm the vote in your wallet…", "info", 3000);
        const res = await api.vote(id, st.chosen, reason);
        txToast(res, `Voted ${L(st.chosen)} — results unlocked`);
        st.myVote = st.chosen;
        st.chosen = 0;
        st.duel = await api.getDuel(id);
        st.votes = null;
        resetArena();
        drawState();
        setTimeout(() => $("#results")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }), 350);
      } catch (e) {
        toast(`${errorMessage(e)} — you can retry`, "error", 6000);
      }
    });
  }

  function bindSwipe() {
    const arena = $("#arena");
    // Keyboard ← / →
    const onKey = (e) => {
      if (e.target.closest("input, textarea")) return;
      if (e.key === "ArrowLeft") choose(1);
      if (e.key === "ArrowRight") choose(2);
    };
    document.addEventListener("keydown", onKey);
    cleanup.push(() => document.removeEventListener("keydown", onKey));
    // Swipe (mobile): left = A, right = B — same as the arrow keys
    if (!window.Draggable || reducedMotion()) return;
    const proxy = document.createElement("div");
    const [drag] = Draggable.create(proxy, {
      trigger: arena,
      type: "x",
      minimumMovement: 12,
      allowNativeTouchScrolling: true,
      lockAxis: true,
      onDrag() { if (canVote()) gsap.set(arena, { x: this.x * 0.25 }); },
      onRelease() {
        gsap.to(arena, { x: 0, duration: 0.25 });
        if (Math.abs(this.x) > 70) choose(this.x < 0 ? 1 : 2);
        gsap.set(proxy, { x: 0 });
      },
    });
    cleanup.push(() => drag.kill());
  }

  function drawLocked() {
    $("#results").innerHTML = `<div class="locked"><div class="splitbar"><div class="splitbar__a" style="width:${30 + Math.random() * 40}%"></div><div class="splitbar__b" style="flex:1"></div></div><p><b>Vote to see results</b></p><p class="muted small">${fmt(d().total)} vote${d().total === 1 ? "" : "s"} so far · hidden so nobody just follows the crowd</p></div>`;
    $("#sticky").hidden = true;
    document.body.classList.remove("has-sticky");
  }

  async function drawResults() {
    const x = d();
    const pa = pct(x.votesA, x.total), pb = x.total ? 100 - pa : 0;
    const first = !$("#results .results");
    if (first) {
      $("#results").innerHTML = `<div class="results">
        <div class="panel results__bar">
          <div class="splitbar" id="res-bar"><div class="splitbar__a" style="width:${x.total ? pa : 50}%"><span>A ${pa}%</span></div><div class="splitbar__b" style="width:${x.total ? pb : 50}%"><span>B ${pb}%</span></div></div>
          <div class="results__meta"><span id="res-count"></span><span id="res-ai"></span></div>
          <div id="ai-reason" style="margin-top:14px"></div>
        </div>
        <div class="panel"><h2>Votes over time</h2><div class="chart-box"><canvas id="chart" aria-label="Votes over time"></canvas></div></div>
        <div class="panel"><h2>What voters said</h2><div id="themes"><p class="muted small">Summarising reasons…</p></div></div>
        <div class="reasons" id="reasons"></div>
        <div class="creator-actions" id="actions"></div>
      </div>`;
      if (window.gsap && !reducedMotion()) {
        gsap.fromTo("#res-bar .splitbar__a", { width: "0%" }, { width: `${x.total ? pa : 50}%`, duration: 0.9, ease: "power3.out" });
        gsap.fromTo("#res-bar .splitbar__b", { width: "0%" }, { width: `${x.total ? pb : 50}%`, duration: 0.9, ease: "power3.out" });
        gsap.from("#results .panel, #results .reasons", { y: 18, opacity: 0, duration: 0.45, stagger: 0.06, delay: 0.1 });
      }
    } else {
      $("#res-bar .splitbar__a").style.width = `${x.total ? pa : 50}%`;
      $("#res-bar .splitbar__b").style.width = `${x.total ? pb : 50}%`;
      $("#res-bar .splitbar__a span").textContent = `A ${pa}%`;
      $("#res-bar .splitbar__b span").textContent = `B ${pb}%`;
    }
    $("#res-bar .splitbar__a").classList.toggle("is-win", !x.live && x.winner === 1);
    $("#res-bar .splitbar__b").classList.toggle("is-win", !x.live && x.winner === 2);
    $("#res-count").textContent = `${fmt(x.votesA)} A · ${fmt(x.votesB)} B · ${fmt(x.total)} total`;
    $("#res-ai").innerHTML = x.live ? aiLeadBadge(x) : aiBadge(x);
    $("#ai-reason").innerHTML = x.aiPick && st.ai?.reason
      ? `<p class="muted small mono">AI reason (locked at creation${st.ai.verified ? " · hash ✓ verified" : ""}, confidence ${CONFIDENCE[x.aiConfidence]})</p><p class="serif" style="font-size:20px">“${esc(st.ai.reason)}”</p>`
      : x.aiPick ? "" : `<p class="muted small">No AI pick for this duel.</p>`;

    // sticky bar (mobile)
    const sticky = $("#sticky");
    sticky.hidden = false;
    sticky.innerHTML = `<div class="splitbar"><div class="splitbar__a" style="width:${x.total ? pa : 50}%"><span>A ${pa}%</span></div><div class="splitbar__b" style="width:${x.total ? pb : 50}%"><span>B ${pb}%</span></div></div>`;
    document.body.classList.add("has-sticky");

    drawActions();
    await loadVotes();
  }

  async function loadVotes() {
    const x = d();
    try {
      if (!st.votes || st.votes.length !== x.total) st.votes = await api.votes(x);
    } catch (e) {
      $("#reasons").innerHTML = `<div class="notice notice--error" style="grid-column:1/-1">Couldn't load vote events: ${esc(errorMessage(e))}</div>`;
      return;
    }
    drawChart();
    drawReasons();
    drawSummary();
  }

  function drawChart() {
    if (!window.Chart || !$("#chart")) return;
    const votes = st.votes || [];
    let a = 0, b = 0;
    const start = votes.length ? Math.min(votes[0].time, Date.now()) - 60_000 : Date.now();
    const ptsA = [{ x: start, y: 0 }], ptsB = [{ x: start, y: 0 }];
    for (const v of votes) {
      if (v.choice === 1) a++; else b++;
      ptsA.push({ x: v.time, y: a });
      ptsB.push({ x: v.time, y: b });
    }
    const data = {
      datasets: [
        { label: "A", data: ptsA, borderColor: "#3D7BFF", backgroundColor: "rgba(61,123,255,.12)", stepped: true, fill: true, pointRadius: 0, borderWidth: 2 },
        { label: "B", data: ptsB, borderColor: "#FF5C39", backgroundColor: "rgba(255,92,57,.12)", stepped: true, fill: true, pointRadius: 0, borderWidth: 2 },
      ],
    };
    if (st.chart) { st.chart.data = data; st.chart.update("none"); return; }
    const span = (ptsA.at(-1).x - start) || 1;
    st.chart = new Chart($("#chart"), {
      type: "line",
      data,
      options: {
        responsive: true, maintainAspectRatio: false, animation: reducedMotion() ? false : { duration: 700 },
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: "#A3A09A", font: { family: "Geist Mono" } } }, tooltip: { callbacks: { title: (items) => new Date(items[0].parsed.x).toLocaleString() } } },
        scales: {
          x: { type: "linear", ticks: { color: "#A3A09A", maxTicksLimit: 5, callback: (v) => { const dt = new Date(v); return span > 2 * 86400e3 ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } }, grid: { color: "#2f2f2f" } },
          y: { beginAtZero: true, ticks: { color: "#A3A09A", precision: 0 }, grid: { color: "#2f2f2f" } },
        },
      },
    });
    cleanup.push(() => { st.chart?.destroy(); st.chart = null; });
  }

  function drawReasons() {
    const votes = (st.votes || []).filter((v) => v.reason && !textProblem(v.reason));
    const col = (side) => {
      const list = votes.filter((v) => v.choice === side).slice(-6).reverse();
      return `<div class="panel"><h3><span class="chip" style="background:${side === 1 ? "var(--a)" : "var(--b)"};color:#fff;border:0">${L(side)}</span> Newest reasons</h3>${list.length ? `<ul>${list.map((v) => `<li>“${esc(v.reason)}”<small>${shortAddr(v.voter)} · ${ago(v.time)}</small></li>`).join("")}</ul>` : `<p class="muted small">No reasons yet.</p>`}</div>`;
    };
    $("#reasons").innerHTML = col(1) + col(2);
  }

  async function drawSummary() {
    const box = $("#themes");
    const votes = st.votes || [];
    const withReason = votes.filter((v) => v.reason && v.reason.trim());
    if (!withReason.length) { box.innerHTML = `<p class="muted small">No reasons yet — themes appear once voters explain their pick.</p>`; return; }
    const key = `hd-summary-${CONFIG.CONTRACT_ADDRESS || "demo"}-${id}-${withReason.length}`;
    let sum = null;
    try { sum = JSON.parse(sessionStorage.getItem(key)); } catch {}
    if (!sum) {
      try {
        sum = await summarise(d().question, withReason);
        try { sessionStorage.setItem(key, JSON.stringify(sum)); } catch {}
      } catch (e) {
        box.innerHTML = `<p class="muted small">AI summary unavailable right now (${esc(e.message)}).</p>`;
        return;
      }
    }
    st.summary = sum;
    const max = Math.max(1, ...[...sum.A, ...sum.B].map((t) => t.count));
    const side = (k, color) => sum[k].length
      ? `<p class="mono small" style="margin:8px 0 6px;color:${color}">${k}</p>${sum[k].map((t) => `<div class="theme"><span>${esc(t.theme)}</span><span class="theme__bar"><i style="width:${(t.count / max) * 100}%;background:${color}"></i></span><span class="mono small">${t.count}</span></div>`).join("")}`
      : "";
    box.innerHTML = `<div class="themes">${side("A", "var(--a)")}${side("B", "var(--b)")}</div><p class="muted small" style="margin-top:12px">🤖 AI-grouped from ${withReason.length} real reason${withReason.length === 1 ? "" : "s"} — never invented.</p>`;
  }

  function drawActions() {
    const box = $("#actions");
    if (!box) return;
    const x = d();
    let html = `<button class="btn btn--outline" id="dl-card">Download result card</button>`;
    if (isCreator() || !x.live) html += `<a class="btn btn--outline" href="app/new?rematch=${x.id}">Start a rematch</a>`;
    if (isCreator() && x.live) html += `<button class="btn btn--danger" id="end-early">End early</button>`;
    if (st.curator && sameAddr(st.curator, wallet.address)) html += `<button class="btn btn--ghost" id="hide-btn">${x.hidden ? "Unhide" : "Hide"} (curator)</button>`;
    box.innerHTML = html;
    $("#dl-card").onclick = (e) => withBusy(e.currentTarget, "Rendering…", () => downloadCard(st.duel, st.ai?.reason, st.summary));
    $("#end-early")?.addEventListener("click", (e) => {
      if (!confirm("End this duel now? The current leader wins.")) return;
      withBusy(e.currentTarget, "Ending…", async () => {
        try {
          if (!(await ensureWallet())) return;
          const res = await api.endEarly(id);
          txToast(res, "Duel ended");
          st.duel = await api.getDuel(id);
          drawState();
        } catch (err) { toast(errorMessage(err), "error"); }
      });
    });
    $("#hide-btn")?.addEventListener("click", (e) => withBusy(e.currentTarget, "Saving…", async () => {
      try {
        const res = await api.setHidden(id, !st.duel.hidden);
        txToast(res, st.duel.hidden ? "Duel unhidden" : "Duel hidden");
        st.duel = await api.getDuel(id);
        frame();
      } catch (err) { toast(errorMessage(err), "error"); }
    }));
  }

  function shareModal() {
    const url = duelUrl(id);
    const card = openModal(`<h2 style="font-size:22px;margin-bottom:14px">Share this duel</h2>
      <div class="share"><div class="share__link"><input class="input" readonly value="${esc(url)}" aria-label="Duel link" /><button class="btn btn--ghost" id="m-copy">Copy</button></div>
      <div class="qr" id="m-qr"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn--primary" href="${esc(xIntent(d()))}" target="_blank" rel="noopener">Post on 𝕏</a><button class="btn btn--ghost" data-close>Close</button></div></div>`);
    $("#m-copy", card).onclick = () => copyText(url);
    if (window.QRCode) new QRCode($("#m-qr", card), { text: url, width: 160, height: 160, colorDark: "#1c1c1c", colorLight: "#ffffff" });
  }

  function reportModal() {
    const card = openModal(`<h2 style="font-size:22px;margin-bottom:8px">Report this duel</h2>
      <p class="muted" style="margin-bottom:14px">Reports are recorded on-chain for the curator, who can hide duels that break the rules.</p>
      <div class="field"><label for="rep">What's wrong?</label><input class="input" id="rep" maxlength="140" placeholder="spam, offensive, misleading…" /></div>
      <div style="display:flex;gap:10px"><button class="btn btn--primary" id="rep-go">Send report</button><button class="btn btn--ghost" data-close>Cancel</button></div>`);
    $("#rep-go", card).onclick = (e) => withBusy(e.currentTarget, "Reporting…", async () => {
      try {
        if (!(await ensureWallet())) return;
        const res = await api.report(id, $("#rep", card).value.trim().slice(0, 140));
        closeModal();
        txToast(res, "Thanks — the curator will take a look");
      } catch (err) { toast(errorMessage(err), "error"); }
    });
  }

  frame();
  animateIn();

  // live updates
  every(CONFIG.POLL_MS, async () => {
    try {
      const next = await api.getDuel(id);
      const changed = next.total !== st.duel.total || next.live !== st.duel.live || next.hidden !== st.duel.hidden;
      st.duel = next;
      if (changed) {
        if (!$("#vote-form")) drawState();
        else if (canSee()) drawResults();
      }
    } catch {}
  });
  onWallet(async () => { await refreshMine(); st.chosen = 0; resetArena(); drawState(); });
}

// ===========================================================================
// Result card (shared with the home page showcase)
// ===========================================================================
export function resultCardHTML(x, aiReason = "", summary = null) {
  const pa = pct(x.votesA, x.total), pb = x.total ? 100 - pa : 0;
  const win = (s) => !x.live && x.winner === s;
  const v = (s) => `<div class="rcard__v rcard__v--${s === 1 ? "a" : "b"} ${win(s) ? "is-win" : ""}"><span class="side-label" style="position:static">${s === 1 ? "A" : "B"}</span>${win(s) ? `<span class="crown">🏆 WINNER</span>` : ""}${x.isImage ? versionHTML(x, s) : `<p>${esc(s === 1 ? x.a : x.b)}</p>`}</div>`;
  const theme = summary && !x.live ? (summary[x.winner === 1 ? "A" : "B"] || [])[0] : null;
  return `<div class="rcard">
    <div class="rcard__head">${categoryChip(x.category)}<span class="mono muted small">${x.live ? "live · " + timeLeft(x.endsAt) : x.winner === 3 ? "It's a tie" : "final result"}</span></div>
    <p class="rcard__q">${esc(x.question)}</p>
    <div class="rcard__versions">${v(1)}${v(2)}</div>
    <div class="splitbar"><div class="splitbar__a" style="width:${x.total ? pa : 50}%"><span>A ${pa}%</span></div><div class="splitbar__b" style="width:${x.total ? pb : 50}%"><span>B ${pb}%</span></div></div>
    <div class="rcard__foot">${aiBadge(x)}<span class="mono muted small">${fmt(x.total)} votes${theme ? ` · top reason: ${esc(theme.theme)}` : ""}</span></div>
    ${aiReason && x.aiPick ? `<p class="muted small" style="margin-top:10px">AI said: “${esc(aiReason)}”</p>` : ""}
    <div class="rcard__foot" style="margin-top:16px;padding-top:14px;border-top:1px solid #363636"><span class="rcard__brand"><svg width="28" height="20" viewBox="0 0 40 28"><rect width="19" height="28" rx="6" fill="#3D7BFF"/><rect x="21" width="19" height="28" rx="6" fill="#FF5C39"/></svg>Headline Duel</span><span class="mono muted small">Recorded on BOT Chain · duel #${x.id}</span></div>
  </div>`;
}

const FONTS_CSS = "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";
let fontEmbedCSS;
/** Google Fonts CSS with the Latin woff2 files inlined, so the PNG uses the real fonts. */
async function getFontEmbedCSS() {
  if (fontEmbedCSS !== undefined) return fontEmbedCSS;
  try {
    const css = await (await fetch(FONTS_CSS)).text();
    const blocks = css.split("/* ").filter((b) => b.startsWith("latin */"));
    const out = await Promise.all(blocks.map(async (b) => {
      const url = b.match(/url\((https:[^)]+)\)/)?.[1];
      if (!url) return "";
      const buf = await (await fetch(url)).arrayBuffer();
      let bin = "";
      new Uint8Array(buf).forEach((x) => (bin += String.fromCharCode(x)));
      return b.slice(b.indexOf("@font-face")).replace(url, `data:font/woff2;base64,${btoa(bin)}`);
    }));
    fontEmbedCSS = out.join("\n");
  } catch {
    fontEmbedCSS = ""; // fall back to system fonts
  }
  return fontEmbedCSS;
}

async function downloadCard(duel, aiReason, summary) {
  if (!window.htmlToImage) { toast("Image export isn't available", "error"); return; }
  // Off-screen host; we capture the card itself so the host's offset isn't cloned.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:760px";
  host.innerHTML = resultCardHTML(duel, aiReason, summary);
  document.body.appendChild(host);
  const card = host.firstElementChild;
  try {
    await document.fonts?.ready;
    const dataUrl = await htmlToImage.toPng(card, {
      pixelRatio: 2,
      backgroundColor: "#1c1c1c",
      cacheBust: true,
      fontEmbedCSS: await getFontEmbedCSS(),
      style: { margin: "0", maxWidth: "none" },
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `headline-duel-${duel.id}.png`;
    a.click();
  } catch (e) {
    toast("Couldn't render the card: " + (e.message || e), "error");
  } finally {
    host.remove();
  }
}

// ===========================================================================
// Profile
// ===========================================================================
export async function renderMe() {
  const draw = async () => {
    if (!wallet.address) {
      view().innerHTML = `<div class="app-head"><div><h1>My duels</h1><p>Your duels, the duels you voted on, and how often you agree with the crowd.</p></div></div>
        <div class="empty"><h3>Connect your wallet</h3><p>Your profile is your wallet — no accounts, no passwords.</p><button class="btn btn--primary" id="me-connect">Connect wallet</button></div>`;
      $("#me-connect").onclick = () => ensureWallet().catch((e) => toast(errorMessage(e), "error"));
      return;
    }
    view().innerHTML = `<div class="app-head"><div><h1>My duels</h1><p class="mono">${shortAddr(wallet.address)}</p></div><a class="btn btn--primary" href="app/new">Start a duel</a></div><div class="skeleton" style="height:120px"></div>`;
    try {
      const [{ created, voted }, stats] = await Promise.all([api.duelsOf(wallet.address), api.stats()]);
      const load = (ids) => Promise.all(ids.map((i) => api.getDuel(i)));
      const [mine, votedOn] = await Promise.all([load(created), load(voted)]);
      const myVotes = await Promise.all(votedOn.map((x) => api.voteOf(x.id, wallet.address)));
      const decided = votedOn.map((x, i) => [x, myVotes[i]]).filter(([x]) => !x.live && x.winner !== 3);
      const agree = decided.filter(([x, v]) => x.winner === v).length;
      const crowd = decided.length ? `${pct(agree, decided.length)}%` : "—";
      const ai = stats.aiFinished ? `${pct(stats.aiCorrect, stats.aiFinished)}%` : "—";
      let tab = "mine";
      view().innerHTML = `<div class="app-head"><div><h1>My duels</h1><p class="mono">${shortAddr(wallet.address)}</p></div><a class="btn btn--primary" href="app/new">Start a duel</a></div>
        <div class="profile-stats">
          <div class="stat"><span class="stat__num mono">${mine.length}</span><span class="stat__label">duels started · ${mine.filter((x) => !x.live).length} finished</span></div>
          <div class="stat"><span class="stat__num mono">${crowd}</span><span class="stat__label">crowd agreement${decided.length ? ` · ${agree}/${decided.length}` : ""}</span></div>
          <div class="stat"><span class="stat__num mono">${ai}</span><span class="stat__label">AI accuracy (site-wide) · ${stats.aiCorrect}/${stats.aiFinished}</span></div>
        </div>
        <div class="tabs tabrail" role="tablist"><button class="tabrail__tab is-active" data-t="mine">My duels (${mine.length})</button><button class="tabrail__tab" data-t="voted">Voted on (${votedOn.length})</button></div>
        <div class="grid" id="me-grid"></div>`;
      const grid = () => {
        const list = (tab === "mine" ? mine : votedOn).slice().reverse();
        $("#me-grid").innerHTML = list.length ? list.map(duelCard).join("") : `<div class="empty" style="grid-column:1/-1"><h3>${tab === "mine" ? "No duels yet" : "No votes yet"}</h3><a class="btn btn--primary" href="${tab === "mine" ? "app/new" : "app"}">${tab === "mine" ? "Start a duel" : "Browse the wall"}</a></div>`;
      };
      $$("[data-t]", view()).forEach((b) => (b.onclick = () => { tab = b.dataset.t; $$("[data-t]", view()).forEach((x) => x.classList.toggle("is-active", x === b)); grid(); }));
      grid();
      animateIn();
    } catch (e) {
      view().innerHTML += `<div class="notice notice--error">Couldn't load your profile: ${esc(errorMessage(e))}</div>`;
    }
  };
  await draw();
  onWallet(draw);
}

// ===========================================================================
// Static pages
// ===========================================================================
const PAGES = {
  about: `<h1>About Headline Duel</h1><p>Headline Duel lets you put two versions of something you wrote in front of real people and see which one wins — with reasons. An AI makes its guess first, and that guess is locked on BOT Chain before anyone votes, so you can see how often the machine agrees with the crowd.</p><p>There are no tokens and no payments. Every duel, vote and reason lives on-chain, which makes results impossible to quietly edit.</p><h2>Built for BOT Chain Build Week</h2><p>The contract, the static site and the Worker are open source — see the GitHub link in the footer.</p>`,
  guide: `<h1>Writing better headlines</h1><ol><li><b>Lead with the benefit.</b> “Fresh beans every Monday” beats “Premium coffee subscription”.</li><li><b>Be specific.</b> Numbers, names and deadlines make claims believable.</li><li><b>Cut words.</b> If a word doesn't change the meaning, delete it.</li><li><b>Talk to one person.</b> “You” usually beats “users”.</li><li><b>Create a small gap.</b> Curiosity works — clickbait doesn't.</li><li><b>Test, don't argue.</b> Write it twice and let the crowd pick.</li></ol><p><a class="btn btn--primary" href="app/new">Start a duel</a></p>`,
  privacy: `<h1>Privacy</h1><p>Headline Duel has no accounts and no database. Duels, votes and reasons are public on BOT Chain and tied to your wallet address — don't put personal information in them.</p><p>When you ask the AI for a prediction or a summary, the versions or public reasons are sent through our Cloudflare Worker to the AI provider to generate a response. The Worker doesn't log request contents. Images you upload are stored publicly on IPFS.</p><p>The site stores small preferences in your browser (for example, cached AI summaries). We don't use tracking cookies.</p>`,
  terms: `<h1>Terms</h1><p>Use Headline Duel to test your own copy and images. Don't post hateful, sexual, harassing, illegal or infringing content; the curator can hide duels that break these rules, and reports are recorded on-chain.</p><p>On-chain data can't be deleted. Gas fees are paid to the network, not to us. The service is provided as-is, without warranties.</p>`,
};

export function renderPage(name) {
  view().innerHTML = `<article class="prose">${PAGES[name]}</article>`;
  animateIn();
}

export function renderNotFound() {
  view().innerHTML = `<div class="empty"><h3>Page not found</h3><p>That link doesn't go anywhere.</p><a class="btn btn--primary" href="./">Go home</a></div>`;
}

export { duelCard };
