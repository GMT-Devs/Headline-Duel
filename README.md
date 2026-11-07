# Headline Duel

**Two versions. One winner.** Let real people pick your best headline, tagline or ad: one vote per wallet, with the AI's guess locked in before anyone votes.

AI · Community · Built for BOT Chain Build Week 3.

| | |
|---|---|
| Live site | `https://<your-domain>` (GitHub Pages, see [Deploy the site](#4-deploy-the-site)) |
| Contract (BOT Chain mainnet, chain ID 677) | `0x…` (not deployed yet) · [scan.botchain.ai](https://scan.botchain.ai) |
| Worker | `https://<your-worker>.workers.dev` |

> After you deploy, put the mainnet address in this table **and** in `site/assets/js/config.js` (`CONTRACT_ADDRESS`). The footer reads it from there.

---

## How it works

1. **Write**: Wallet A writes two versions (text ≤ 140 chars, or two images ≤ 2 MB on IPFS), a question, a category, optional context and a duration (24 h · 3 d · 7 d).
2. **Predict**: The Worker asks Claude which version most people will pick (`A`/`B`, low/medium/high confidence, a one-line reason).
3. **Lock**: `startDuel` is one transaction. It stores the versions and the AI pick on-chain, computes `keccak256(reason)` on-chain, and emits the reason text in `DuelStarted`. The prediction can't change after votes come in, and the page shows "hash ✓ verified".
4. **Vote**: Wallet B picks a side (click, ← / →, or swipe on mobile) and can add a reason of up to 140 characters. The vote is one transaction, with one vote per wallet. The creator can't vote, and nobody can vote after the duel ends.
5. **Results**: Results stay hidden until you vote. After that you see the split bar, a votes-over-time chart, the AI-vs-crowd badge, the newest reasons for each side and an AI summary of themes. The summary only groups real reasons, and the Worker counts them from reason IDs. The creator can **End early**, **Download result card** (PNG) or **Start a rematch** (the winner against a new challenger).

## Repository layout

```
contracts/   Solidity contract, Hardhat tests, deploy script
worker/      Cloudflare Worker: /duel/predict · /duel/summary · /duel/check · /upload
site/        Static website + app (no build step) served by GitHub Pages
  index.html             website (10 sections) + app shell + DVD footer
  404.html               GitHub Pages deep-link fallback (/d/21, /app/new …)
  assets/js/config.js    ← contract address, network, Worker URL (single source)
  assets/js/chain.js     wallet (MetaMask, BOT Chain switch/add) + contract reads/writes
  assets/js/demo.js      in-browser mock contract (demo mode)
  assets/js/app.js       wall, create, vote/results, profile, static pages
  assets/js/home.js      website GSAP animations + live data
  assets/js/footer.js    DVD-screensaver BOT Chain logo + chain bar
```

**Routes:** `/` website · `/app` the wall · `/app/new` start a duel · `/d/:id` vote + results · `/app/me` profile · `/about` `/guide` `/privacy` `/terms`.

**Front-end stack (CDN, pinned):** ethers 6.13.4 · GSAP 3.13.0 (ScrollTrigger, SplitText, Flip, Draggable) · Chart.js 4.4.1 · html-to-image 1.11.11 · qrcodejs 1.0.0. Fonts: Instrument Sans, Instrument Serif, Geist Mono.

---

## 1. Contract

`contracts/contracts/HeadlineDuel.sol` (Solidity `^0.8.20`, compiled with 0.8.24, `evmVersion: paris`, no tokens and no payments).

| Function | Who | Notes |
|---|---|---|
| `startDuel(question, category, a, b, isImage, aiPick, aiConfidence, aiReason, duration)` | anyone | `aiPick` 0 = none, 1 = A, 2 = B · `aiConfidence` 0–3 · `duration` ∈ {1 d, 3 d, 7 d} · emits `DuelStarted(id, creator, aiPick, aiReason)` |
| `vote(id, choice, reason)` | anyone except the creator, once, while live | `choice` 1 = A, 2 = B · reason ≤ 560 bytes · emits `Voted(id, voter, choice, reason)` |
| `endEarly(id)` | creator | |
| `setHidden(id, bool)` · `setCurator(addr)` | curator (the deployer) | hidden duels can't be voted on, and the UI filters them out |
| `report(id, reason)` | anyone | event only, for the curator |
| `getDuel` · `getDuels(from, count)` · `hasVoted` · `voteOf` · `winner` · `isLive` · `duelsOf` · `stats` · `duelCount` | views | `winner`: 0 live · 1 A · 2 B · 3 draw |

**Differences from the PRD sketch:**

- `startDuel` takes the AI **reason text** instead of `aiReasonHash`. The contract computes `keccak256(bytes(aiReason))` itself and emits the text in `DuelStarted`. That guarantees the stored hash and the emitted text always match.
- `duels` is `internal`. Read it through `getDuel` / `getDuels`, because a public getter for a 15-field struct fails to compile with "stack too deep".
- I added `report()` (for the Report button), `isLive()`, `duelCount()`, `totalVotes` and `setCurator()`.
- Length limits are in **bytes** (question 400, versions 560, reason 560). UTF-8 can use up to 4 bytes per character, so the UI enforces the character limits (100 / 140 / 140).

### Test

```bash
cd contracts && npm ci
```

```bash
npx hardhat test
```

If `binaries.soliditylang.org` is unreachable, use the bundled solc-js:

```bash
USE_SOLCJS=1 npx hardhat test
```

### Deploy (testnet → mainnet)

**Option A: Remix.** Paste `HeadlineDuel.sol`, then set the compiler to 0.8.24 and EVM version **paris** (under Advanced). Deploy with MetaMask on BOT Chain testnet (968, `https://rpc.bohr.life`), test with two wallets, then deploy on mainnet (677, `https://rpc.botchain.ai`).

**Option B: Hardhat.**

```bash
cd contracts
```

```bash
DEPLOYER_KEY=0x… npm run deploy:testnet
```

```bash
DEPLOYER_KEY=0x… npm run deploy:mainnet
```

Then set the address and deploy block in `site/assets/js/config.js`:

```js
CONTRACT_ADDRESS: "0xYourMainnetAddress",
DEPLOY_BLOCK: 123456,
NETWORK: "mainnet",
```

The deploying wallet becomes the **curator**. Use it to hide reported duels from the duel page.

## 2. Worker

`worker/src/index.js` adds these routes to the shared Week 1 Worker (or you can deploy it on its own):

| Route | What it does |
|---|---|
| `POST /duel/predict` | `{question, category, context, a, b, isImage}` → `{pick: "A"\|"B", confidence, reason}` or `{blocked, reason}`. Claude with structured JSON output; image duels send both IPFS images to the model |
| `POST /duel/summary` | `{question, reasons:[{choice, reason}]}` → `{A:[{theme,count}], B:[…]}`. The model returns reason **ids** per theme and the Worker does the counting, so themes stay grounded in real reasons |
| `POST /duel/check` | word-filter check |
| `POST /upload` | multipart `file` (PNG/JPEG/WebP/GIF ≤ 2 MB) → Pinata → `{cid}` |

How it's locked down:

- API keys are Worker secrets.
- CORS is locked to `ALLOWED_ORIGINS`.
- Each IP is rate-limited per route.
- The Worker doesn't log request bodies, and observability is off.
- A word filter runs before any AI call, and the AI also returns a `safe` flag.

Model: `claude-opus-5-5` at `effort: low`, with server-side refusal fallback enabled (`fallbacks: "default"`).

```bash
cd worker && npm ci
```

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler secret put PINATA_JWT
```

Edit `ALLOWED_ORIGINS` in `wrangler.toml` to your domain, then deploy:

```bash
npx wrangler deploy
```

Run the tests (no network or keys needed):

```bash
npm test
```

Then set `WORKER_URL` in `site/assets/js/config.js`.

## 3. Run the site locally

The site is static and has no build step. Serve `site/` from any static server:

```bash
cd site && python3 -m http.server 8080
```

Open http://localhost:8080. Deep links like `/d/3` need a server that falls back to `404.html`, which is how GitHub Pages behaves.

**Demo mode.** While `CONTRACT_ADDRESS` is empty, or with `?demo=1`, the app uses an in-browser mock of the contract with seeded duels. You get a fake wallet, and a banner lets you **switch demo wallet** (so you can vote on your own duel) or reset the data. Without the Worker, AI predictions and summaries fall back to local heuristics labelled "Demo guess".

**Local chain.** Set `NETWORK: "local"`, then:

```bash
npx hardhat node
```

```bash
npx hardhat run scripts/deploy.js --network localhost
```

Paste the printed address into `CONTRACT_ADDRESS` and add the Hardhat network to MetaMask (chain ID 31337).

## 4. Deploy the site

1. Turn on **Settings → Pages → Source: GitHub Actions**. `.github/workflows/pages.yml` publishes `site/` on every push to `main`.
2. For a custom domain, add `site/CNAME` containing your domain, point DNS at GitHub Pages, and add the domain to the Worker's `ALLOWED_ORIGINS`.
3. Update the `og:image` URL in `index.html` to an absolute URL on your domain.

The site works at both `https://domain/` and `https://user.github.io/repo/`. The base path is detected at runtime.

---

## States handled

- **No MetaMask:** you can browse the wall and finished results. Voting or creating opens a modal asking you to install MetaMask.
- **Wrong network:** the app shows a "Switch to BOT Chain" button, which calls `wallet_switchEthereumChain` and falls back to `wallet_addEthereumChain`.
- **Live duel, not voted:** results are hidden and the page says "Vote to see results".
- **Already voted:** results show.
- **Your own duel:** results show and voting is disabled.
- **Ended:** a winner banner, or "It's a tie".
- **AI error:** the duel starts with "No AI pick".
- **Image too big, upload failed or offensive text:** inline message with the reason.
- **Transaction pending, rejected or failed:** toast plus retry. Contract errors are decoded into plain language.
- **Unknown `/d/…`:** "Duel not found". Unknown route: "Page not found".
- **Reduced motion:** no hero loop, carousel autoplay or marquee, and the DVD logo sits still in the centre.

## Before launch

- [ ] Deploy the contract to mainnet, then update `CONTRACT_ADDRESS`, `DEPLOY_BLOCK` and this README.
- [ ] Deploy the Worker with its secrets, set `WORKER_URL`, and lock `ALLOWED_ORIGINS`.
- [ ] Turn on GitHub Pages and add the custom domain (`site/CNAME`).
- [ ] Confirm BOT Chain's native currency symbol (`NETWORKS.mainnet.nativeCurrency` in `config.js` assumes `BOT`).
- [ ] Replace the footer's drawn BOT Chain mark with the official logo asset if brand guidelines require it.
- [ ] Start 3 real duels, record a demo clip, and post on X tagging @BOTChain_ai.

## Out of scope (MVP)

More than 2 versions, real-traffic A/B testing, paid voters, demographics, comment threads, accounts, backend database, NFTs.

© 2026 Headline Duel
