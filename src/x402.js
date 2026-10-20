/**
 * x402 payment verification for the hosted free-web service.
 *
 * The server asks for a payment; the client signs an EIP-3009
 * `transferWithAuthorization` for USDC on Base and sends the signature back.
 * We verify the signature, the amount, the payee and the time window before
 * serving anything.
 */
import { createPublicClient, createWalletClient, http, verifyTypedData, erc20Abi, parseAbi } from "viem"
import { base } from "viem/chains"

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
/** Куда платежи. По умолчанию — кошелёк агента; переопределяется переменной окружения. */
export const PAY_TO = process.env.X402_PAY_TO || "0x8aC6a229f254980CCd3Dd35CF5E1B7c08880B40E"

const transferWithAuthorizationAbi = parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
])

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
}

const client = createPublicClient({ chain: base, transport: http() })

/** keccak("Transfer(address,address,uint256)") — подпись события перевода ERC-20 */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

/**
 * Проверка прямой оплаты: клиент сам переводит USDC на кошелёк получателя
 * и присылает хеш транзакции.
 *
 * Почему так: сбор через transferWithAuthorization требует газа у сервера,
 * а здесь газ платит клиент (он всё равно хочет данные). Значит сервис
 * работает при нулевом бюджете — важно, пока на счёте ноль.
 */
export async function verifyDirectPayment(txHash, { priceUsd, payTo = PAY_TO, asset = USDC_BASE } = {}) {
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash ?? ""))) {
    return { ok: false, reason: "missing or malformed transaction hash" }
  }
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash })
    if (receipt.status !== "success") return { ok: false, reason: "transaction failed" }
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== asset.toLowerCase()) continue
      if ((log.topics?.[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue
      const topics = log.topics ?? []
      if (topics.length < 3) continue
      const to = `0x${topics[2].slice(-40)}`.toLowerCase()
      if (to !== payTo.toLowerCase()) continue
      const value = BigInt(log.data)
      const amountUsd = Number(value) / 1e6
      if (amountUsd + 1e-9 < priceUsd) {
        return { ok: false, reason: `paid ${amountUsd} USDC, need ${priceUsd}` }
      }
      return { ok: true, amountUsd, tx: txHash }
    }
    return { ok: false, reason: "no USDC transfer to the payee found" }
  } catch (e) {
    return { ok: false, reason: `could not read the transaction: ${e?.shortMessage ?? e?.message ?? e}` }
  }
}

/** Decode the PAYMENT-SIGNATURE / SIGN-IN-WITH-X header into its parts. */
export function decodePaymentHeader(raw) {
  if (!raw) return null
  try {
    const json = Buffer.from(raw, "base64").toString("utf8")
    const parsed = JSON.parse(json)
    const payload = parsed.payload && parsed.payload.payload ? parsed.payload.payload : parsed.payload
    if (!payload || !payload.authorization || !payload.signature) return null
    return { authorization: payload.authorization, signature: payload.signature, x402Version: parsed.x402Version }
  } catch {
    return null
  }
}

/**
 * Verify a payment.
 * @param {string} raw the header value
 * @param {object} opts
 * @param {number} opts.priceUsd required amount in USD
 * @param {string} opts.payTo expected recipient
 * @returns {Promise<{ok: boolean, reason?: string, amountUsd?: number, from?: string}>}
 */
export async function verifyPayment(raw, { priceUsd, payTo = PAY_TO } = {}) {
  const payment = decodePaymentHeader(raw)
  if (!payment) return { ok: false, reason: "missing or malformed payment header" }
  const a = payment.authorization
  const now = Math.floor(Date.now() / 1000)
  if (Number(a.validBefore) < now) return { ok: false, reason: "payment expired" }
  if (Number(a.validAfter) > now + 60) return { ok: false, reason: "payment not yet valid" }
  if (String(a.to).toLowerCase() !== payTo.toLowerCase())
    return { ok: false, reason: `payment goes to ${a.to}, expected ${payTo}` }
  const amountUsd = Number(a.value) / 1e6
  if (amountUsd < priceUsd) return { ok: false, reason: `paid ${amountUsd} USDC, need ${priceUsd}` }
  try {
    const valid = await verifyTypedData({
      address: USDC_BASE,
      domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE },
      types: TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: a.from,
        to: a.to,
        value: BigInt(a.value),
        validAfter: BigInt(a.validAfter),
        validBefore: BigInt(a.validBefore),
        nonce: a.nonce,
      },
      signature: payment.signature,
    })
    if (!valid) return { ok: false, reason: "invalid signature" }
  } catch (err) {
    return { ok: false, reason: `signature check failed: ${err?.message ?? err}` }
  }
  return { ok: true, amountUsd, from: a.from }
}

/**
 * Забрать деньги: отправить подписанный EIP-3009 transferWithAuthorization.
 *
 * Проверка подписи — это только половина: без отправки транзакции USDC
 * так и остаются у плательщика. Здесь мы реально забираем оплату на кошелёк
 * получателя (нужен небольшой запас ETH на газ).
 *
 * @returns {Promise<{ok: boolean, tx?: string, reason?: string}>}
 */
export async function collectPayment(raw, { payTo = PAY_TO, privateKey } = {}) {
  const payment = decodePaymentHeader(raw)
  if (!payment) return { ok: false, reason: "missing or malformed payment header" }
  const a = payment.authorization
  const sig = payment.signature
  if (!/^0x[0-9a-f]{130}$/i.test(sig)) return { ok: false, reason: "malformed signature" }
  const r = "0x" + sig.slice(2, 66)
  const s = "0x" + sig.slice(66, 130)
  const v = Number.parseInt(sig.slice(130, 132), 16)
  try {
    const key = privateKey ?? process.env.X402_GAS_KEY
    if (!key) return { ok: false, reason: "no gas key configured (X402_GAS_KEY)" }
    const wallet = createWalletClient({ account: key, chain: base, transport: http() })
    const hash = await wallet.writeContract({
      address: USDC_BASE,
      abi: transferWithAuthorizationAbi,
      functionName: "transferWithAuthorization",
      args: [a.from, payTo, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, v, r, s],
      chain: base,
      account: key,
    })
    return { ok: true, tx: hash }
  } catch (e) {
    return { ok: false, reason: e?.shortMessage ?? e?.message ?? String(e) }
  }
}

/** The 402 a client should receive, with the accepted payment options. */
export function paymentRequired(priceUsd, { payTo = PAY_TO, asset = USDC_BASE } = {}) {
  const amount = String(Math.round(priceUsd * 1e6))
  const requirements = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount,
        asset,
        payTo,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
  }
  return {
    status: 402,
    headers: {
      "content-type": "application/json",
      "payment-required": Buffer.from(JSON.stringify(requirements)).toString("base64"),
    },
    body: {
      error: { message: `payment required: ${priceUsd} USDC on Base`, type: "payment_required" },
      // Два способа оплаты. Первый не требует газа у сервера: клиент сам переводит
      // USDC и присылает хеш транзакции — сервер только проверяет её в сети.
      ways: [
        {
          kind: "transfer-and-prove",
          note: "send USDC to payTo on Base, then repeat the request with header X-PAYMENT-TX: <tx hash>",
          asset,
          payTo,
          amount,
          network: "base",
        },
        {
          kind: "eip3009-authorization",
          note: "sign transferWithAuthorization and send it in the PAYMENT-SIGNATURE header",
          asset,
          payTo,
          amount,
          network: "base",
        },
      ],
    },
  }
}
