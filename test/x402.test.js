import { test } from "node:test"
import assert from "node:assert/strict"
import { decodePaymentHeader, verifyPayment, paymentRequired } from "../src/x402.js"

test("decodes a base64 payment header", () => {
  const body = { x402Version: 2, payload: { payload: { signature: "0xabc", authorization: { from: "0x1", to: "0x2", value: "1000", validAfter: "1", validBefore: "99999999999", nonce: "0x00" } } } }
  const raw = Buffer.from(JSON.stringify(body)).toString("base64")
  const p = decodePaymentHeader(raw)
  assert.equal(p.authorization.to, "0x2")
  assert.equal(p.signature, "0xabc")
})

test("a missing header is rejected", async () => {
  const v = await verifyPayment(null, { priceUsd: 0.001 })
  assert.equal(v.ok, false)
  assert.match(v.reason, /missing/)
})

test("an expired payment is rejected", async () => {
  const body = { x402Version: 2, payload: { payload: { signature: "0xabc", authorization: { from: "0x1", to: "0x2", value: "1000", validAfter: "1", validBefore: "1", nonce: "0x00" } } } }
  const raw = Buffer.from(JSON.stringify(body)).toString("base64")
  const v = await verifyPayment(raw, { priceUsd: 0.001 })
  assert.equal(v.ok, false)
  assert.match(v.reason, /expired/)
})

test("a payment to the wrong payee is rejected", async () => {
  const body = { x402Version: 2, payload: { payload: { signature: "0xabc", authorization: { from: "0x1", to: "0xdead", value: "1000", validAfter: "1", validBefore: "99999999999", nonce: "0x00" } } } }
  const raw = Buffer.from(JSON.stringify(body)).toString("base64")
  const v = await verifyPayment(raw, { priceUsd: 0.001 })
  assert.equal(v.ok, false)
  assert.match(v.reason, /expected/)
})

test("the 402 carries the payment terms", () => {
  const r = paymentRequired(0.001)
  assert.equal(r.status, 402)
  const decoded = JSON.parse(Buffer.from(r.headers["payment-required"], "base64").toString())
  assert.equal(decoded.accepts[0].amount, "1000")
  assert.equal(decoded.accepts[0].network, "eip155:8453")
})
