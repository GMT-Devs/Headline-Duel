// Entry: router (/ → website, /app… → app), nav, wallet button, demo banner.
import { DEMO, NET } from "./config.js";
import { wallet, connectWallet, disconnectWallet, restoreWallet, switchChain, shortAddr, errorMessage, newDemoWallet } from "./chain.js";
import { demoBackend } from "./demo.js";
import { $, $$, toast, esc, openModal } from "./ui.js";
import * as app from "./app.js";
import { initHome } from "./home.js";
import { initFooter } from "./footer.js";

const BASE = window.__BASE__ || "/";

function routePath() {
  let p = location.pathname;
  if (p.startsWith(BASE)) p = "/" + p.slice(BASE.length);
  return p.replace(/\/+$/, "") || "/";
}

async function route() {
  app.teardown();
  const path = routePath();
  const isHome = path === "/" || path === "/index.html";
  $("#site").hidden = !isHome;
  $("#app").hidden = isHome;
  $$(".nav__link[href='app']").forEach((a) => a.classList.toggle("is-active", path === "/app"));
  $("#mobile-menu").hidden = true;
  $("#burger").setAttribute("aria-expanded", "false");

  if (isHome) {
    document.title = "Headline Duel — Let the crowd pick";
    initHome();
    if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
    return;
  }
  window.scrollTo(0, 0);
  let m;
  if (path === "/app") { document.title = "The wall — Headline Duel"; return app.renderWall(); }
  if (path === "/app/new") { document.title = "Start a duel — Headline Duel"; return app.renderCreate(); }
  if (path === "/app/me") { document.title = "My duels — Headline Duel"; return app.renderMe(); }
  if ((m = path.match(/^\/d\/(\d+)$/))) { document.title = `Duel #${m[1]} — Headline Duel`; return app.renderDuel(Number(m[1])); }
  if (path.match(/^\/d\//)) return app.renderDuel(-1);
  if (["/about", "/guide", "/privacy", "/terms"].includes(path)) return app.renderPage(path.slice(1));
  document.title = "Not found — Headline Duel";
  app.renderNotFound();
}

export function navigate(href) {
  const url = new URL(href, document.baseURI);
  const samePage = url.pathname === location.pathname && url.search === location.search;
  if (samePage && url.hash) {
    history.pushState(null, "", url);
    document.querySelector(url.hash)?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  history.pushState(null, "", url);
  route();
}

// Intercept internal links
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  const url = new URL(a.getAttribute("href"), document.baseURI);
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  e.preventDefault();
  closeMenus();
  navigate(url.href);
});
window.addEventListener("popstate", route);

// ---------- Nav ----------
function closeMenus() {
  $(".dropdown")?.classList.remove("is-open");
  $(".dropdown__btn")?.setAttribute("aria-expanded", "false");
  $("#mobile-menu").hidden = true;
}
const ddBtn = $(".dropdown__btn");
ddBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !$(".dropdown").classList.contains("is-open");
  $(".dropdown").classList.toggle("is-open", open);
  ddBtn.setAttribute("aria-expanded", open);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".dropdown")) { $(".dropdown").classList.remove("is-open"); ddBtn.setAttribute("aria-expanded", "false"); } });
$("#burger").addEventListener("click", () => {
  const m = $("#mobile-menu");
  m.hidden = !m.hidden;
  $("#burger").setAttribute("aria-expanded", String(!m.hidden));
});
const onScroll = () => $("#nav").classList.toggle("is-scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- Wallet button ----------
function drawWallet() {
  const btn = $("#wallet-btn");
  btn.classList.remove("wallet-chip", "wallet-chip--warn");
  if (!wallet.address) {
    btn.textContent = "Connect wallet";
    return;
  }
  if (!wallet.onRightChain) {
    btn.classList.add("wallet-chip", "wallet-chip--warn");
    btn.textContent = "Switch to BOT Chain";
    return;
  }
  btn.classList.add("wallet-chip");
  btn.innerHTML = `<span class="dot"></span><span class="mono">${esc(shortAddr(wallet.address))}</span>`;
}
wallet.onChange(drawWallet);

$("#wallet-btn").addEventListener("click", async () => {
  try {
    if (!wallet.address) {
      if (!wallet.hasProvider) {
        openModal(`<h2 style="font-size:22px;margin-bottom:10px">Install MetaMask</h2><p class="muted" style="margin-bottom:18px">Headline Duel uses MetaMask on BOT Chain (chain ID ${NET.chainId}). You can browse the wall without one.</p><div style="display:flex;gap:10px"><a class="btn btn--primary" href="https://metamask.io/download/" target="_blank" rel="noopener">Get MetaMask ↗</a><button class="btn btn--ghost" data-close>Not now</button></div>`);
        return;
      }
      await connectWallet();
      if (wallet.address) toast(`Connected ${shortAddr(wallet.address)}`, "ok", 2000);
      return;
    }
    if (!wallet.onRightChain) return await switchChain();
    const card = openModal(`<h2 style="font-size:22px;margin-bottom:6px">Wallet</h2><p class="mono muted" style="margin-bottom:18px;word-break:break-all">${esc(wallet.address)}</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn--primary" href="app/me" data-close>My duels</a><button class="btn btn--ghost" id="w-disc">Disconnect</button></div>`);
    $("#w-disc", card).onclick = () => { disconnectWallet(); $("#modal").hidden = true; };
    card.querySelector("a").addEventListener("click", () => ($("#modal").hidden = true));
  } catch (e) {
    toast(errorMessage(e), "error");
  }
});

// ---------- Demo banner ----------
if (DEMO) {
  const b = $("#demo-banner");
  b.hidden = false;
  b.innerHTML = `<span>⚠️ Demo mode — data lives in your browser, nothing is on-chain. Set CONTRACT_ADDRESS in config.js to go live.</span><button id="demo-switch">Switch demo wallet</button><button id="demo-reset">Reset demo data</button>`;
  $("#demo-switch").onclick = () => { newDemoWallet(); toast(`Now acting as ${shortAddr(wallet.address)}`, "ok"); };
  $("#demo-reset").onclick = () => { demoBackend.reset(); toast("Demo data reset", "ok"); route(); };
}

// ---------- Boot ----------
drawWallet();
initFooter();
restoreWallet().finally(route);
