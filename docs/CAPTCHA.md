# Капчи, защитные экраны и лимиты: что существует и что внедрять

Обыск решений — с проверкой на GitHub и в официальном MCP Registry. Ниже только
то, что реально поддерживается и работает на 20 октября 2026.

## Сначала главное

Капча — это способ сказать «ты робот». Самый дешёвый способ её не встретить —
не полагаться на неё:

| Путь | Что даёт |
|---|---|
| официальный API | нет капчи в принципе (GitHub, Wikipedia, HN, RSS) |
| текстовый рендер (`r.jina.ai`) | обходит JS-челленджи, нулевая цена |
| `robots.txt` + `sitemap.xml` | часто всё, что нужно с индекса |
| локальный браузер | работает там, где нужен настоящий JS |

Это ровно то, что уже делает `free-web-mcp`: поиск, чтение, извлечение ссылок и
ленты — без единого ключа. Дальше — только то, что действительно пригодится,
когда страница закрыта.

## Категория 1. Браузер, который не палится

Патчи поверх Playwright/Puppeteer: правят отпечаток, убирают automation-маркеры.

| Проект | Звёзды | Активность | Язык | Что это |
|---|---|---|---|---|
| `ultrafunkamsterdam/undetected-chromedriver` | 12 873 | 2025-07 | Python | классика: ChromeDriver, который не палится |
| `ultrafunkamsterdam/nodriver` | 4 873 | 2026-10 | Python | наследник, без Selenium, на asyncio |
| `rebrowser/rebrowser-playwright` | 61 | 2026-10 | TS | drop-in замена Playwright с патчами |
| `rebrowser/rebrowser-puppeteer` | 39 | 2026-10 | TS | то же для Puppeteer |

Ставится как обычная зависимость. В Node-проектах удобнее rebrowser-playwright:
`import { chromium } from "rebrowser-playwright"` — и всё остальное как обычно.

## Категория 2. Cloudflare «Just a moment…»

Это не капча, а JS-челленджей. Решается локально, без ключей и без чужих данных.

| Проект | Звёзды | Активность | Что это |
|---|---|---|---|
| `FlareSolverr/FlareSolverr` | 15 981 | 2026-10 | HTTP-сервис, который прогоняет челленджей в браузере и отдаёт cookie |
| `Byparr` (наследник FlareSolverr) | — | 2026 | современная версия, живёт в Docker |
| `cloudscraper` (npm/PyPI) | — | 2022 | лёгкая библиотека для простых случаев |

FlareSolverr поднимается одной командой:

```bash
docker run -d -p 8191:8191 --name flaresolverr ghcr.io/flaresolverr/flaresolverr:latest
```

И используется как HTTP-вызов — именно так он подключён в `free-web-fetch`.

## Категория 3. Платные решатели (API)

Считают капчу за деньги: reCAPTCHA v2/v3, Cloudflare Turnstile, DataDome, GeeTest.

| Сервис | Доступ | Особенность |
|---|---|---|
| **APInex** | уже подключён к твоему OpenCode | `apinex-tools_apinex-captcha-solve` работает прямо сейчас, нужен баланс |
| CapMonster | MCP-сервер в официальном реестре | `capmonster-mcp` (npm), поддержка reCAPTCHA/Turnstile/DataDome |
| 2Captcha | API + `2captcha-python` (★ 805) | самый старый и стабильный |
| CapSolver | API | есть Turnstile-расширение для браузера |
| Anti-Captcha | API | большой пул типов капч |

**MCP-серверы, которые уже можно подключить** (официальный MCP Registry):

```
io.github.CapMonsterCloud/capmonster-mcp-captcha-solver      v0.1.14
io.github.CapMonsterCloud/capmonster-mcp-patchright-captcha-solver  v1.1.3
cc.captcha/captchacc
io.github.DataLeadsPRO/captchaflow
```

## Категория 4. Браузеры в облаке

Удалённый браузер с прокси, отпечатками и разгадыванием капч — платно, но
без возни с локальным Chrome.

| Сервис | npm | Активность |
|---|---|---|
| Browserbase | `@browserbasehq/sdk` v2.22.0 | 2026-10 |
| Hyperbrowser | `@hyperbrowser/sdk` v1.3.0 | 2026-10 |
| Browserless / Steel | `browserless`, `@steel-dev/sdk` | 2026 |

## Что внедрено в портфеле

`free-web-mcp` получил инструмент `free-web-fetch` — честная цепочка попыток:

```
1. прямой запрос           (бесплатно, мгновенно)
2. локальный FlareSolverr  (свой сервер, ключи не нужны)
3. платный решатель        (только для доменов из allowlist)
4. текстовый рендер        (r.jina.ai, последний бесплатный шанс)
```

Ответ содержит `via` — каким путём получен контент: `direct`, `flaresolverr`,
`capsolver`, `markdown` или `blocked`.

**Политика расходов (это важно):**

- платный решатель вызывается **только** для доменов из `FREE_WEB_ALLOWLIST`;
- пустой allowlist = платный путь полностью выключен;
- при отсутствии ключа платный путь не трогается вовсе;
- обход paywall и авторизации не делается — это не про то.

Переменные окружения:

```bash
FLARESOLVERR_URL=http://127.0.0.1:8191     # свой FlareSolverr
CAPSOLVER_KEY=…                             # ключ CapSolver
FREE_WEB_ALLOWLIST=example.com,*.example.org  # кому можно платить
```

## Где проходит граница

Инструменты выше — легальная инфраструктура для автоматизации: чтение открытых
страниц, тестирование собственных сервисов,研究, сбор публичных данных для
агента. То же самое используют и краулеры для обхода чужих ограничений.

Что я не делаю и не буду делать в этих проектах: массовый обход капч и WAF в
чужих сервисах, credential stuffing, снятие paywall, сбор данных в объёмах,
запрещённых правилами сайта. Инструмент в портфеле сознательно ограничен
allowlist'ом и бюджетом — чтобы это был помощник, а не оружие массового
обхода.
