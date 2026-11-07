// Small UI helpers: escaping, toasts, modal, formatting, motion preference.
import { CONFIG, CATEGORIES, CATEGORY_ICONS } from "./config.js";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, type = "info", ms = 4200) {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span>${type === "error" ? "⚠️" : type === "ok" ? "✅" : "ℹ️"}</span><span>${message}</span>`;
  box.appendChild(el);
  if (window.gsap && !reducedMotion()) gsap.from(el, { y: 16, opacity: 0, duration: 0.3, ease: "power2.out" });
  setTimeout(() => {
    if (window.gsap && !reducedMotion()) gsap.to(el, { opacity: 0, y: 8, duration: 0.25, onComplete: () => el.remove() });
    else el.remove();
  }, ms);
}

export function openModal(html) {
  const modal = $("#modal");
  $("#modal-card").innerHTML = html;
  modal.hidden = false;
  const close = () => closeModal();
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener("keydown", escClose);
  $$("[data-close]", modal).forEach((b) => (b.onclick = close));
  $("#modal-card").querySelector("button, input, textarea, a")?.focus();
  return $("#modal-card");
}
function escClose(e) {
  if (e.key === "Escape") closeModal();
}
export function closeModal() {
  $("#modal").hidden = true;
  document.removeEventListener("keydown", escClose);
}

/** Run an async action with a spinner on `btn`; returns the result or undefined on error. */
export async function withBusy(btn, label, fn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.innerHTML = `<span class="spinner"></span>${esc(label)}`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.innerHTML = original;
  }
}

export function timeLeft(endsAt) {
  const ms = endsAt - Date.now();
  if (ms <= 0) return "ended";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

export function ago(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const fmt = (n) => Number(n || 0).toLocaleString("en-US");
export const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

export function categoryChip(c) {
  return `<span class="chip">${CATEGORY_ICONS[c] ?? "📰"} ${esc(CATEGORIES[c] ?? "Headline")}</span>`;
}

export function ipfsUrl(cid) {
  return CONFIG.IPFS_GATEWAY.replace(/\/?$/, "/") + encodeURIComponent(cid);
}

/** Inner HTML for one version (text or image). */
export function versionHTML(duel, side, cls = "") {
  const v = side === 1 ? duel.a : duel.b;
  if (duel.isImage) return `<img class="${cls}" src="${esc(ipfsUrl(v))}" alt="Version ${side === 1 ? "A" : "B"}" loading="lazy" crossorigin="anonymous" />`;
  return esc(v);
}

export function copyText(text) {
  return navigator.clipboard?.writeText(text).then(
    () => toast("Copied", "ok", 1800),
    () => toast("Couldn't copy — select and copy manually", "error")
  );
}

export function aiBadge(duel) {
  if (!duel.aiPick) return `<span class="ai-badge">🤖 No AI pick</span>`;
  const L = duel.aiPick === 1 ? "A" : "B";
  if (duel.live) return `<span class="ai-badge">🤖 AI picked ${L}${duel.total ? "" : " — waiting for votes"}</span>`;
  if (duel.winner === 3) return `<span class="ai-badge ai-badge--miss">🤖 AI picked ${L} — the crowd was split</span>`;
  if (duel.winner === duel.aiPick) return `<span class="ai-badge ai-badge--ok">🤖 AI picked ${L} — ✓ the crowd agreed</span>`;
  return `<span class="ai-badge ai-badge--miss">👀 The crowd surprised the AI (AI picked ${L})</span>`;
}

/** Live-ish badge comparing AI pick with the current leader (used while live). */
export function aiLeadBadge(duel) {
  if (!duel.aiPick || !duel.total) return aiBadge(duel);
  if (!duel.live) return aiBadge(duel);
  const L = duel.aiPick === 1 ? "A" : "B";
  const leader = duel.votesA === duel.votesB ? 0 : duel.votesA > duel.votesB ? 1 : 2;
  if (!leader) return `<span class="ai-badge">🤖 AI picked ${L} — it's neck and neck</span>`;
  return leader === duel.aiPick
    ? `<span class="ai-badge ai-badge--ok">🤖 AI picked ${L} — the crowd agrees so far</span>`
    : `<span class="ai-badge ai-badge--miss">👀 AI picked ${L} — the crowd disagrees so far</span>`;
}
