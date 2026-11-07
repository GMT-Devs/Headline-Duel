// Website (/) — GSAP animations + live data from the contract.
import { recentDuels, api } from "./chain.js";
import { resultCardHTML } from "./app.js";
import { esc, $, $$, reducedMotion, fmt, pct } from "./ui.js";

let started = false;
const timelines = [];

export function initHome() {
  if (started) {
    ScrollTrigger?.refresh();
    return;
  }
  started = true;
  const rm = reducedMotion() || !window.gsap;
  if (window.gsap) gsap.registerPlugin(ScrollTrigger, SplitText, Flip);

  heroTitle(rm);
  heroDemo(rm);
  reveals(rm);
  tabRail(rm);
  carousel(rm);
  statement(rm);
  dropdownAndNav();
  loadLiveData();
}

// ---------- Hero H1 (SplitText) ----------
function heroTitle(rm) {
  if (rm) return;
  document.fonts?.ready.then(() => {
    const split = new SplitText("#hero-title", { type: "chars,words" });
    gsap.from(split.chars, { yPercent: 110, opacity: 0, duration: 0.8, stagger: 0.025, ease: "power4.out" });
    gsap.from(".hero .reveal", { y: 18, opacity: 0, duration: 0.7, stagger: 0.08, delay: 0.25, ease: "power3.out" });
  });
}

// ---------- Hero demo: type A/B → VS drops → cursor votes B → bar fills → AI badge ----------
function heroDemo(rm) {
  const textA = $("#demo-a .demo__text");
  const textB = $("#demo-b .demo__text");
  const full = (el) => el.dataset.text;
  const barA = $("#demo-bar-a"), barB = $("#demo-bar-b");
  if (rm) {
    textA.textContent = full(textA);
    textB.textContent = full(textB);
    gsap?.set?.([barA], { width: "38%" });
    barA.style.width = "38%";
    barB.style.width = "62%";
    $("#demo-b").classList.add("is-picked");
    return;
  }
  const type = (el, tl, at) => {
    const s = { n: 0 };
    const str = full(el);
    tl.set(el, { "--caret": 1 }, at);
    tl.to(s, { n: str.length, duration: str.length * 0.035, ease: "none", onUpdate: () => (el.textContent = str.slice(0, Math.round(s.n))) }, at);
    tl.set(el, { "--caret": 0 });
  };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.4, delay: 0.6, paused: true });
  tl.add(() => {
    textA.textContent = "";
    textB.textContent = "";
    $("#demo-b").classList.remove("is-picked");
  });
  tl.set([barA, barB], { width: "50%" });
  tl.set("#demo-badge", { scale: 0, opacity: 0 });
  tl.set("#demo-vs", { y: -160, opacity: 0, xPercent: -50, yPercent: -50, left: "50%", top: "50%" });
  tl.set("#demo-cursor", { opacity: 0, x: 0, y: 0 });
  type(textA, tl, 0.1);
  type(textB, tl, ">0.15");
  tl.to("#demo-vs", { y: 0, opacity: 1, duration: 0.7, ease: "bounce.out" }, ">-0.1");
  tl.to("#demo-cursor", { opacity: 1, duration: 0.2 }, ">0.1");
  tl.to("#demo-cursor", {
    x: () => $("#demo-b").offsetLeft + $("#demo-b").offsetWidth * 0.5 - $("#demo-cursor").offsetLeft,
    y: () => $("#demo-b").offsetTop + $("#demo-b").offsetHeight * 0.55 - $("#demo-cursor").offsetTop,
    duration: 0.9,
    ease: "power2.inOut",
  });
  tl.to("#demo-cursor", { scale: 0.8, duration: 0.1, yoyo: true, repeat: 1 });
  tl.add(() => $("#demo-b").classList.add("is-picked"), "<");
  tl.fromTo("#demo-b", { scale: 1 }, { scale: 1.02, duration: 0.15, yoyo: true, repeat: 1 }, "<");
  tl.to(barA, { width: "38%", duration: 1, ease: "power3.out" }, ">0.1");
  tl.to(barB, { width: "62%", duration: 1, ease: "power3.out" }, "<");
  tl.to("#demo-cursor", { opacity: 0, duration: 0.3 }, "<");
  tl.to("#demo-badge", { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(3)" }, ">-0.3");
  tl.to({}, { duration: 1.6 });
  timelines.push(tl);
  // Only run while visible
  ScrollTrigger.create({ trigger: "#hero-demo", start: "top 90%", end: "bottom top", onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });
}

// ---------- Generic reveals ----------
function reveals(rm) {
  if (rm) return;
  $$("section:not(.hero) .reveal").forEach((el) => {
    gsap.from(el, { y: 28, opacity: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
  });
  $$("section .h2").forEach((el) => {
    gsap.from(el, { y: 24, opacity: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } });
  });
  gsap.from("#cta-title", { scale: 0.92, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".cta", start: "top 75%" } });
}

// ---------- Statement: words light up on scroll ----------
function statement(rm) {
  if (rm) return;
  document.fonts?.ready.then(() => {
    const split = new SplitText("#statement", { type: "words" });
    gsap.fromTo(split.words, { opacity: 0.25 }, { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: "#statement", start: "top 80%", end: "bottom 45%", scrub: true } });
  });
}

// ---------- Tab rail with Flip ----------
const TABS = [
  { chip: "📰 Headline", q: "Which headline would you read?", a: "Why most side projects die in week two", b: "How to finish your side project", pa: 39, url: "d/14" },
  { chip: "📣 Ad", q: "Which ad would stop your scroll?", a: "Your first app, shipped by Friday", b: "Learn to code in 10 minutes a day", pa: 61, url: "d/9" },
  { chip: "✉️ Email subject", q: "Which subject line would you open?", a: "Your weekly wins are in 🎉", b: "3 things you missed this week", pa: 34, url: "d/17" },
  { chip: "🏷️ Name", q: "Best name for a budgeting app?", a: "Pennywise", b: "Stash", pa: 35, url: "d/12" },
];

function tabRail(rm) {
  const tabs = $$(".tabrail__tab[data-tab]");
  const split = $("#tab-split");
  let current = 0;
  const show = (i) => {
    if (i === current) return;
    current = i;
    const t = TABS[i];
    tabs.forEach((b, j) => { b.classList.toggle("is-active", j === i); b.setAttribute("aria-selected", j === i); });
    const apply = () => {
      $("#tab-chip").textContent = t.chip;
      $("#tab-q").textContent = t.q;
      $("#tab-a").textContent = t.a;
      $("#tab-b").textContent = t.b;
      $("#tab-pa").textContent = `${t.pa}%`;
      $("#tab-pb").textContent = `${100 - t.pa}%`;
      $("#tab-url").textContent = `headlineduel/${t.url}`;
      $$(".tabdemo__side--a .mini-bar i")[0].style.width = `${t.pa}%`;
      $$(".tabdemo__side--b .mini-bar i")[0].style.width = `${100 - t.pa}%`;
      split.classList.toggle("is-flipped", i % 2 === 1); // winner swaps sides → Flip animates the swap
    };
    if (rm || !window.Flip) return apply();
    const state = Flip.getState(".tabdemo__side");
    apply();
    Flip.from(state, { duration: 0.6, ease: "power3.inOut", absolute: true });
    gsap.from("#tabdemo .serif, #tab-q", { opacity: 0, y: 8, duration: 0.35, stagger: 0.05 });
  };
  tabs.forEach((b) => b.addEventListener("click", () => show(Number(b.dataset.tab))));
}

// ---------- 01–04 carousel ----------
function carousel(rm) {
  const steps = $$(".carousel__step");
  const track = $("#carousel-track");
  const slides = $$(".slide", track);
  let i = 0;
  let auto;
  let progress;

  const animateSlide = (n) => {
    if (rm) {
      $$(".typing", slides[n]).forEach((el) => (el.textContent = el.dataset.text));
      return;
    }
    const s = slides[n];
    if (n === 0) {
      $$(".typing", s).forEach((el, k) => {
        const str = el.dataset.text;
        const o = { n: 0 };
        el.textContent = "";
        gsap.to(o, { n: str.length, duration: str.length * 0.04, delay: k * 1.1, ease: "none", onUpdate: () => (el.textContent = str.slice(0, Math.round(o.n))) });
      });
    }
    if (n === 1) {
      gsap.fromTo($(".lock", s), { scale: 0, rotate: -40 }, { scale: 1, rotate: 0, duration: 0.6, ease: "back.out(3)" });
      gsap.fromTo($(".ai-card", s), { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, delay: 0.2, ease: "power3.out" });
    }
    if (n === 2) {
      gsap.fromTo($(".tap", s), { scale: 0.4, opacity: 1 }, { scale: 2, opacity: 0, duration: 0.8, delay: 0.4, repeat: 2, repeatDelay: 0.4 });
      gsap.fromTo($(".mv--b", s), { scale: 1 }, { scale: 1.08, duration: 0.2, delay: 0.4, yoyo: true, repeat: 1 });
      gsap.fromTo($(".reason-bubble", s), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.9, ease: "back.out(2)" });
    }
    if (n === 3) {
      gsap.fromTo($(".trophy", s), { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "bounce.out" });
      gsap.fromTo($$(".splitbar__a, .splitbar__b", s), { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.8, delay: 0.3, ease: "power3.out" });
      gsap.fromTo($(".ai-badge", s), { scale: 0 }, { scale: 1, duration: 0.5, delay: 1, ease: "back.out(3)" });
    }
  };

  const go = (n, user) => {
    i = (n + slides.length) % slides.length;
    steps.forEach((b, j) => b.classList.toggle("is-active", j === i));
    if (rm) track.style.transform = `translateX(-${i * 100}%)`;
    else gsap.to(track, { xPercent: -100 * i, duration: 0.7, ease: "power3.inOut" });
    animateSlide(i);
    restart(user);
  };
  const restart = (user) => {
    clearTimeout(auto);
    progress?.kill();
    steps.forEach((b) => b.style.setProperty("--p", "0%"));
    if (rm || user === "stop") return;
    progress = gsap.fromTo(steps[i], { "--p": "0%" }, { "--p": "100%", duration: 5, ease: "none" });
    auto = setTimeout(() => go(i + 1), 5000);
  };
  steps.forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.step), true)));
  $("#car-prev").addEventListener("click", () => go(i - 1, true));
  $("#car-next").addEventListener("click", () => go(i + 1, true));
  if (rm) { animateSlide(0); return; }
  ScrollTrigger.create({ trigger: "#carousel", start: "top 75%", once: true, onEnter: () => go(0) });
}

// ---------- Nav dropdown + mobile menu + scrolled state ----------
function dropdownAndNav() {
  /* handled in main.js for all routes */
}

// ---------- Live data: marquee, stats, showcase ----------
async function loadLiveData() {
  try {
    const [duels, stats] = await Promise.all([recentDuels(60), api.stats()]);
    const visible = duels.filter((d) => !d.hidden);
    const live = visible.filter((d) => d.live);

    // Marquee of real live duel questions
    const items = (live.length ? live : visible).slice(0, 14);
    if (items.length) {
      const html = items.map((d) => `<a href="d/${d.id}">${esc(d.question)} <span class="mono" style="font-size:13px">#${d.id}</span></a>`).join("");
      $("#live-strip .marquee__track").innerHTML = html + html;
    }
    marquee();

    // Stats
    const ai = stats.aiFinished ? `${pct(stats.aiCorrect, stats.aiFinished)}%` : "—";
    countUp($('[data-stat="duels"]'), stats.duels);
    countUp($('[data-stat="votes"]'), stats.votes);
    $('[data-stat="ai"]').textContent = ai;
    $("#bento-ai").textContent = ai;

    // Showcase: most-voted finished duel, read from the contract
    const finished = visible.filter((d) => !d.live).sort((a, b) => b.total - a.total)[0];
    const pick = finished || visible.sort((a, b) => b.total - a.total)[0];
    if (pick) {
      const ai = await api.aiReason(pick).catch(() => ({ reason: "" }));
      $("#showcase-card").innerHTML = `<a href="d/${pick.id}" style="display:block">${resultCardHTML(pick, ai.reason)}</a>`;
    } else {
      $("#showcase-card").innerHTML = `<p class="muted">The first finished duel will show up here.</p>`;
    }
  } catch (e) {
    marquee();
    $("#showcase-card").innerHTML = `<p class="muted">Couldn't reach BOT Chain right now.</p>`;
  }
}

let marqueeTween;
function marquee() {
  const track = $("#live-strip .marquee__track");
  marqueeTween?.kill();
  if (reducedMotion() || !window.gsap) return;
  // ensure two copies for a seamless loop
  if (track.children.length < 8) track.innerHTML += track.innerHTML;
  const w = track.scrollWidth / 2;
  marqueeTween = gsap.fromTo(track, { x: 0 }, { x: -w, duration: Math.max(20, w / 50), ease: "none", repeat: -1 });
  track.addEventListener("mouseenter", () => marqueeTween?.pause());
  track.addEventListener("mouseleave", () => marqueeTween?.play());
}

function countUp(el, n) {
  if (!el) return;
  if (reducedMotion() || !window.gsap) { el.textContent = fmt(n); return; }
  const o = { v: 0 };
  gsap.to(o, { v: n, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 95%" }, onUpdate: () => (el.textContent = fmt(Math.round(o.v))) });
}
