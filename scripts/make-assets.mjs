#!/usr/bin/env node
/**
 * make-assets.mjs — generates the visual identity of the portfolio:
 *   social-preview.png  (1280x640)  — the image GitHub shows in link previews
 *   docs/index.html                  — the GitHub Pages site
 *   logo.svg                         — the project mark
 *
 * Renders with a headless browser (Brave/Chrome) and writes into each repo.
 *
 *   node scripts/make-assets.mjs
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

const WORKSPACE = join(homedir(), "workspace")

const PROJECTS = [
  {
    dir: "opencode-free-stack",
    name: "opencode-free-stack",
    tagline: "Free-model router for OpenCode",
    sub: "Route every request to a $0 model. Fall back automatically when a provider runs dry.",
    accent: "#3fb950",
    accent2: "#2ea043",
    glyph: "route",
    install: "npm i -g opencode-free-stack",
    highlight: "free",
    terminalTitle: "~/agent — ofs status",
    terminal: `<span class="d">$</span> ofs status
provider            key   rpm   pool
  <span class="g">zen</span>              <span class="g">yes</span>   -     -
  <span class="g">copilot</span>          <span class="g">yes</span>   30    -
  <span class="g">apinex</span>           <span class="g">yes</span>   5     <span class="y">62% left</span>
  <span class="g">beatapi</span>          <span class="d">no </span>   1     -

<span class="d">$</span> ofs route "explain quicksort"
<span class="d">[apinex/free/qwen-3.8-max]</span> 402 Free 10M tokens used
<span class="d">[copilot/gpt-4.1]</span> <span class="y">✓ fell back in 1 attempt</span>`,
    repo: "https://github.com/rustemmustafingovua-byte/opencode-free-stack",
  },
  {
    dir: "agent-x402",
    name: "agent-x402",
    tagline: "x402 payments for AI agents",
    sub: "Pay per API call in USDC on Base — with a spend policy a prompt injection cannot bypass.",
    accent: "#a371f7",
    accent2: "#8957e5",
    glyph: "x402",
    install: "npm i -g agent-x402",
    highlight: "x402",
    terminalTitle: "~/agent — ax402 pay https://api.venice.ai",
    terminal: `<span class="d">$</span> ax402 policy
day 2026-10-20  spent <span class="g">0.000 USDC</span> / 5 USDC
payments 0 / 100   allow-list: 1 payee

<span class="d">$</span> ax402 pay https://api.venice.ai/api/v1/chat/completions
<span class="d">402</span> payment-required  <span class="g">eip155:8453</span>  <span class="g">5 USDC</span>
<span class="d">$</span> signing EIP-3009 transferWithAuthorization
<span class="g">✓ paid</span>  <span class="y">→ Claude Haiku 5.5 answered</span>`,
    repo: "https://github.com/rustemmustafingovua-byte/agent-x402",
  },
  {
    dir: "free-web-mcp",
    name: "free-web-mcp",
    tagline: "The web for agents, with zero credits",
    sub: "r.jina.ai · Wikipedia · Hacker News · GitHub behind one MCP server. No key, no meter.",
    accent: "#2f81f7",
    accent2: "#1f6feb",
    glyph: "web",
    install: "npm i -g free-web-mcp",
    highlight: "web",
    terminalTitle: "~/agent — free-web-search",
    terminal: `<span class="d">$</span> free-web-mcp
<span class="g">✓</span> MCP ready   (jina=no, github=yes)

<span class="d">$</span> free-web-search "opencode ai agent"
<span class="g">### Wikipedia</span>
  1. OpenCode
<span class="g">### Hacker News</span>
  1. opencode - AI coding agent (4★)
<span class="g">### GitHub</span>
  1. opencode-ai/opencode (13820★)
<span class="y">usage: 0 credits</span>`,
    repo: "https://github.com/rustemmustafingovua-byte/free-web-mcp",
  },
]

const BROWSERS = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
]

function browser() {
  for (const b of BROWSERS) if (existsSync(b)) return b
  return null
}

const fontStack = `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif`
const monoStack = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`

function glyph(p, size = 120) {
  const a = p.accent
  if (p.glyph === "route") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 78 C 18 44, 46 30, 78 30" stroke="${a}" stroke-width="7" stroke-linecap="round" opacity=".45"/>
      <path d="M42 90 C 42 108, 58 112, 78 96" stroke="${a}" stroke-width="7" stroke-linecap="round" opacity=".75"/>
      <circle cx="18" cy="78" r="9" fill="${a}"/>
      <circle cx="42" cy="90" r="9" fill="${a}" opacity=".75"/>
      <circle cx="84" cy="30" r="13" fill="${a}"/>
      <path d="M96 12 L104 30 L84 30 Z" fill="${a}" opacity=".9"/>
    </svg>`
  }
  if (p.glyph === "x402") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="40" stroke="${a}" stroke-width="6" opacity=".35"/>
      <path d="M42 44 L78 76 M78 44 L42 76" stroke="${a}" stroke-width="9" stroke-linecap="round"/>
      <circle cx="60" cy="60" r="9" fill="${a}"/>
    </svg>`
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="60" r="38" stroke="${a}" stroke-width="6" opacity=".35"/>
    <ellipse cx="60" cy="60" rx="38" ry="16" stroke="${a}" stroke-width="5" opacity=".8"/>
    <path d="M22 60 H98" stroke="${a}" stroke-width="5" opacity=".6"/>
    <path d="M34 44 H86 M34 76 H86" stroke="${a}" stroke-width="5" opacity=".45"/>
  </svg>`
}

function bannerHtml(p) {
  const accent = p.accent
  const hl = p.highlight
  const hi = p.name.indexOf(hl)
  const nameHtml =
    hi >= 0
      ? `${p.name.slice(0, hi)}<em>${hl}</em>${p.name.slice(hi + hl.length)}`
      : p.name
  const term = p.terminal
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;width:1280px;height:640px;overflow:hidden;background:
      radial-gradient(900px 520px at 8% -12%, ${accent}26, transparent 58%),
      radial-gradient(760px 460px at 96% 108%, ${p.accent2}22, transparent 55%),
      #0a0c10;
    color:#e6edf3;font-family:${fontStack};display:flex;align-items:center;gap:52px;padding:0 68px}
  .left{width:560px;flex:none}
  .mark{width:104px;height:104px;border-radius:26px;display:flex;align-items:center;justify-content:center;
        background:linear-gradient(160deg, ${accent}33, ${p.accent2}14);border:1px solid ${accent}5c;
        box-shadow:0 16px 50px ${accent}33, inset 0 1px 0 #ffffff1a;margin-bottom:28px}
  h1{margin:0 0 12px;font-size:50px;letter-spacing:-.03em;font-weight:800;line-height:1.05}
  h1 em{font-style:normal;color:${accent}}
  .tag{margin:0 0 10px;font-size:24px;font-weight:600;color:#c9d1d9;line-height:1.3}
  .sub{margin:0 0 24px;font-size:18.5px;color:#8b949e;line-height:1.5}
  .code{font-family:${monoStack};font-size:16.5px;color:#adbac7;background:#11161d;border:1px solid #2b333c;
        padding:11px 16px;border-radius:10px;display:inline-block}
  .code b{color:${accent};font-weight:700}
  .foot{margin-top:22px;font-size:14.5px;color:#6e7681;font-family:${monoStack}}
  .right{flex:1;min-width:0}
  .term{background:#0d1117;border:1px solid #262d36;border-radius:14px;overflow:hidden;
        box-shadow:0 30px 70px #0009, 0 0 0 1px #ffffff08}
  .bar{display:flex;align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid #21262d;background:#11161d}
  .dot{width:11px;height:11px;border-radius:50%}
  .bar span{margin-left:8px;font:12px ${monoStack};color:#6e7681}
  pre{margin:0;padding:16px 18px;font:13.5px/1.85 ${monoStack};color:#c9d1d9;white-space:pre}
  .g{color:${accent}} .d{color:#6e7681} .w{color:#e3b341} .y{color:#7ee787}
</style></head>
<body>
  <div class="left">
    <div class="mark">${glyph(p, 72)}</div>
    <h1>${nameHtml}</h1>
    <p class="tag">${p.tagline}</p>
    <p class="sub">${p.sub}</p>
    <div class="code"><b>$</b> ${p.install}</div>
    <p class="foot">github.com/rustemmustafingovua-byte</p>
  </div>
  <div class="right">
    <div class="term">
      <div class="bar"><i class="dot" style="background:#ff5f57"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><span>${p.terminalTitle}</span></div>
      <pre>${term}</pre>
    </div>
  </div>
</body></html>`
}

function docsHtml(p) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.name} — ${p.tagline}</title>
<meta name="description" content="${p.sub}">
<meta property="og:title" content="${p.name}">
<meta property="og:description" content="${p.sub}">
<meta property="og:image" content="https://raw.githubusercontent.com/rustemmustafingovua-byte/${p.dir}/main/docs/social-preview.png">
<style>
  :root{--accent:${p.accent};--accent2:${p.accent2};--bg:#0a0c10;--fg:#e6edf3;--muted:#8b949e;--line:#21262d}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 ${fontStack}}
  .wrap{max-width:900px;margin:0 auto;padding:72px 28px 96px}
  header{border-bottom:1px solid var(--line);padding-bottom:40px;margin-bottom:44px}
  .badge{display:inline-flex;align-items:center;gap:10px;padding:7px 14px;border-radius:999px;
         background:${p.accent}18;border:1px solid ${p.accent}44;color:var(--accent);font-size:13.5px;font-weight:600;margin-bottom:22px}
  h1{margin:0 0 12px;font-size:44px;letter-spacing:-.025em}
  .tag{color:#c9d1d9;font-size:22px;margin:0 0 10px}
  .sub{color:var(--muted);margin:0 0 26px;max-width:640px}
  pre{background:#11161d;border:1px solid var(--line);border-radius:12px;padding:16px 18px;overflow:auto;font:13.5px/1.6 ${monoStack}}
  code{font-family:${monoStack};font-size:.93em}
  p code,li code{background:#161b22;border:1px solid var(--line);padding:1.5px 6px;border-radius:6px}
  h2{font-size:21px;margin:40px 0 12px;letter-spacing:-.01em}
  a{color:var(--accent)}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:22px 0}
  .card{border:1px solid var(--line);border-radius:14px;padding:18px 20px;background:#0f141a}
  .card b{display:block;margin-bottom:5px}
  .card span{color:var(--muted);font-size:14.5px}
  table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14.5px}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600}
  .cta{display:inline-block;background:var(--accent);color:#07100a;font-weight:700;padding:11px 20px;border-radius:10px;text-decoration:none;margin:8px 10px 0 0}
  .cta.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
  footer{margin-top:64px;padding-top:26px;border-top:1px solid var(--line);color:#6e7681;font-size:14px}
</style></head>
<body><div class="wrap">
<header>
  <span class="badge">${p.name}</span>
  <h1>${p.tagline}</h1>
  <p class="sub">${p.sub}</p>
  <a class="cta" href="${p.repo}">View on GitHub</a>
  <a class="cta ghost" href="${p.repo}/releases">Releases</a>
</header>

<h2>Install</h2>
<pre><code>${p.install}</code></pre>

<h2>Why it exists</h2>
<div class="grid">
  <div class="card"><b>Built for agents</b><span>Every call is a tool call: no account, no key, no meter.</span></div>
  <div class="card"><b>Honest limits</b><span>RPM caps, daily pools and weights are modelled, not guessed.</span></div>
  <div class="card"><b>Open source</b><span>MIT. Fork it, self-host it, price it yourself.</span></div>
</div>

<h2>Documentation</h2>
<table>
  <tr><td>README</td><td>install, usage and the full provider table</td></tr>
  <tr><td>Issues</td><td>bounty-eligible, anyone can fund them</td></tr>
  <tr><td>Releases</td><td>changelog and npm publishing</td></tr>
</table>

<footer>${p.name} · MIT · <a href="${p.repo}">source</a> · USDC on Base: <code>0x8aC6a229f254980CCd3Dd35CF5E1B7c08880B40E</code></footer>
</div></body></html>`
}

const BR = browser()
if (!BR) {
  console.error("no chromium browser found")
  process.exit(1)
}

for (const p of PROJECTS) {
  const root = join(WORKSPACE, p.dir)
  if (!existsSync(root)) {
    console.log(`skip ${p.dir} (not found)`)
    continue
  }
  const docs = join(root, "docs")
  mkdirSync(docs, { recursive: true })
  writeFileSync(join(docs, "index.html"), docsHtml(p))
  writeFileSync(join(root, "logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${glyph(p, 120)}</svg>\n`)

  const tmpHtml = join(docs, "_banner.html")
  writeFileSync(tmpHtml, bannerHtml(p))
  const out = join(docs, "social-preview.png")
  try {
    execFileSync(
      BR,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--screenshot=${out}`,
        "--window-size=1280,640",
        `file://${tmpHtml}`,
      ],
      { stdio: "ignore" },
    )
  } catch (e) {
    console.log(`  banner render failed for ${p.dir}: ${e.message}`)
  }
  // the page must not ship the banner markup
  try {
    rmSync(tmpHtml)
  } catch {}

  console.log(`✓ ${p.dir}: docs/index.html, logo.svg, social-preview.png`)
}
