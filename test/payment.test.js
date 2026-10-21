import { test } from "node:test"
import assert from "node:assert/strict"
import { verifyNativePayment, paymentRequired } from "../src/x402.js"
import { weiForUsd } from "../src/price.js"

const PAY_TO = "0x8aC6a229f254980CCd3Dd35CF5E1B7c08880B40E"

function rpcFetch(result) {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return { jsonrpc: "2.0", id: 1, result }
    },
  })
}

test("нативная оплата ETH: перевод на получателя засчитывается", async () => {
  const tx = {
    hash: "0x" + "ab".repeat(32),
    to: PAY_TO,
    from: "0x" + "11".repeat(20),
    value: "0x" + (10n ** 15n).toString(16), // 0.001 ETH
  }
  const r = await verifyNativePayment(tx.hash, {
    priceUsd: 0.001,
    payTo: PAY_TO,
    ethUsd: 2000,
    fetchImpl: rpcFetch(tx),
  })
  assert.equal(r.ok, true)
  assert.equal(r.asset, "ETH")
  assert.equal(r.amountWei, 10n ** 15n)
  assert.ok(r.amountUsd >= 0.001)
})

test("нативная оплата: перевод не получателю не засчитывается", async () => {
  const tx = { hash: "0x" + "ab".repeat(32), to: "0x" + "99".repeat(20), value: "0x1" }
  const r = await verifyNativePayment(tx.hash, {
    priceUsd: 0.001,
    payTo: PAY_TO,
    ethUsd: 2000,
    fetchImpl: rpcFetch(tx),
  })
  assert.equal(r.ok, false)
  assert.match(r.reason, /payee/)
})

test("нативная оплата: сумма меньше требуемой не засчитывается", async () => {
  const tx = { hash: "0x" + "ab".repeat(32), to: PAY_TO, value: "0x1" } // 1 wei
  const r = await verifyNativePayment(tx.hash, {
    priceUsd: 0.001,
    payTo: PAY_TO,
    ethUsd: 2000,
    fetchImpl: rpcFetch(tx),
  })
  assert.equal(r.ok, false)
  assert.match(r.reason, /paid/)
})

test("нативная оплата: кривой хеш отклоняется", async () => {
  const r = await verifyNativePayment("0x123", { priceUsd: 0.001, payTo: PAY_TO, ethUsd: 2000 })
  assert.equal(r.ok, false)
})

test("402 предлагает и USDC, и нативный ETH с точными условиями", () => {
  const req = paymentRequired(0.001, { payTo: PAY_TO, ethUsd: 2000 })
  const kinds = req.body.ways.map((w) => w.kind)
  assert.ok(kinds.includes("transfer-and-prove"))
  assert.ok(kinds.includes("native-eth-transfer"))
  const eth = req.body.ways.find((w) => w.kind === "native-eth-transfer")
  assert.equal(eth.asset, "ETH")
  assert.equal(eth.payTo, PAY_TO)
  assert.equal(eth.amount, "500000000000") // 0.001 USD / 2000 = 5e-7 ETH = 5e11 wei
  assert.equal(req.status, 402)
})

test("weiForUsd переводит доллары в wei с округлением вверх", () => {
  assert.equal(weiForUsd(0.001, 2000), 500000000000n)
  assert.equal(weiForUsd(1, 3000), 333333333333334n) // округление вверх
})
