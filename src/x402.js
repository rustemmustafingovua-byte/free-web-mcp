/**
 * x402 payment verification for the hosted free-web service.
 *
 * The server asks for a payment; the client signs an EIP-3009
 * `transferWithAuthorization` for USDC on Base and sends the signature back.
 * We verify the signature, the amount, the payee and the time window before
 * serving anything.
 */
import { createPublicClient, http, verifyTypedData, erc20Abi } from "viem"
import { base } from "viem/chains"

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
export const PAY_TO = "0x2670b922ef37c7df47158725c0cc407b5382293f"

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
    body: { error: { message: `payment required: ${priceUsd} USDC on Base`, type: "payment_required" } },
  }
}
