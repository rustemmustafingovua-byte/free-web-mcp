/**
 * Курс ETH/USD для расчёта цены в нативном ETH.
 *
 * Нужен, чтобы принимать оплату в эфире: клиент платит 0.001 USDC, а сервер
 * переводит это в ETH по текущему курсу и требует соответствующую сумму.
 * Источник — публичный API без ключа, с кэшем и запасным значением.
 */

const COINGECKO = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
let cache = { at: 0, usd: 0 }
const TTL_MS = 60_000
/** Запасной курс, если API недоступен: консервативно (меньше ETH за доллар = дороже для клиента). */
const FALLBACK_USD = 3000

/** Текущий курс ETH в долларах. */
export async function ethUsd({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache.usd && now - cache.at < TTL_MS) return cache.usd
  try {
    const res = await fetchImpl(COINGECKO, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const j = await res.json()
      const usd = Number(j?.ethereum?.usd)
      if (usd > 0) {
        cache = { at: now, usd }
        return usd
      }
    }
  } catch {
    // используем запасное значение
  }
  if (!cache.usd) cache = { at: now, usd: FALLBACK_USD }
  return cache.usd
}

/** Сколько wei нужно за `usd` при курсе `usdPerEth`. */
export function weiForUsd(usd, usdPerEth) {
  if (!usdPerEth) return 0n
  return BigInt(Math.ceil((usd / usdPerEth) * 1e18))
}
