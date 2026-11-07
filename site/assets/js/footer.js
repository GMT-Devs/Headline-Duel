// Footer: DVD-screensaver BOT Chain logo + chain bar (address, explorer, live stats).
import { CONFIG, NET, DEMO } from "./config.js";
import { api, shortAddr, explorerAddress } from "./chain.js";
import { $, reducedMotion, isMobile, copyText, fmt, pct, toast } from "./ui.js";

const COLORS = ["#3D7BFF", "#FF5C39", "#FFD23F"];

export function initFooter() {
  chainBar();
  dvd();
  refreshStats();
  setInterval(() => !document.hidden && refreshStats(), 60_000);
  $("#social-x").href = CONFIG.SOCIAL.x;
  $("#social-gh").href = CONFIG.SOCIAL.github;
  $("#footer-gh").href = CONFIG.SOCIAL.github;
}

function chainBar() {
  const addr = CONFIG.CONTRACT_ADDRESS;
  $("#chain-id").textContent = NET.chainId;
  $("#addr-short").textContent = addr ? shortAddr(addr) : DEMO ? "demo mode (not deployed)" : "not deployed";
  const link = $("#explorer-link");
  link.href = addr ? explorerAddress(addr) : NET.explorer;
  $("#copy-addr").onclick = () => (addr ? copyText(addr) : toast("Contract address not set yet", "info"));
}

export async function refreshStats() {
  try {
    const s = await api.stats();
    const ai = s.aiFinished ? `${pct(s.aiCorrect, s.aiFinished)}%` : "—";
    $("#footer-stats").textContent = `DUELS ${fmt(s.duels)} · VOTES ${fmt(s.votes)} · AI RIGHT ${ai}`;
  } catch {
    /* keep last value */
  }
}

function dvd() {
  const wrap = $("#dvd");
  const screen = $("#dvd-screen");
  const logo = $("#dvd-logo");
  const cheer = $("#dvd-cheer");

  if (reducedMotion() || !window.gsap) {
    wrap.classList.add("is-static"); // logo sits still in the centre
    return;
  }

  let x = 40, y = 30;
  let vx = 1, vy = 1;
  let colour = 0;
  let paused = false;
  let visible = false;

  const speed = () => (isMobile() ? 55 : 95); // px/s — slower on mobile
  const setColour = () => {
    colour = (colour + 1) % COLORS.length;
    logo.style.color = COLORS[colour];
  };
  logo.style.color = COLORS[0];

  const corner = (cx, cy) => {
    gsap.killTweensOf(cheer);
    gsap.set(cheer, { x: Math.min(cx, screen.clientWidth - 100), y: Math.max(0, Math.min(cy, screen.clientHeight - 24)), opacity: 1, scale: 0.6 });
    gsap.to(cheer, { scale: 1.2, duration: 0.3, ease: "back.out(3)" });
    gsap.to(cheer, { opacity: 0, y: "-=30", duration: 0.8, delay: 0.7 });
  };

  const tick = (_time, deltaMs) => {
    if (paused || !visible) return;
    const dt = Math.min(deltaMs, 64) / 1000;
    const maxX = screen.clientWidth - logo.offsetWidth;
    const maxY = screen.clientHeight - logo.offsetHeight;
    x += vx * speed() * dt;
    y += vy * speed() * dt * 0.8;
    let hitX = false, hitY = false;
    if (x <= 0) { x = 0; vx = 1; hitX = true; }
    if (x >= maxX) { x = maxX; vx = -1; hitX = true; }
    if (y <= 0) { y = 0; vy = 1; hitY = true; }
    if (y >= maxY) { y = maxY; vy = -1; hitY = true; }
    if (hitX || hitY) setColour();
    // generous corner window so it actually happens now and then
    const nearX = x <= 6 || x >= maxX - 6, nearY = y <= 6 || y >= maxY - 6;
    if ((hitX && nearY) || (hitY && nearX)) corner(x, y);
    gsap.set(logo, { x, y });
  };

  gsap.ticker.add(tick);
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(screen);
  logo.addEventListener("mouseenter", () => (paused = true));
  logo.addEventListener("mouseleave", () => (paused = false));
  logo.addEventListener("focus", () => (paused = true));
  logo.addEventListener("blur", () => (paused = false));
}
