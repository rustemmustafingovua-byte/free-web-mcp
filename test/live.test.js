// Integration test against the real service. Skipped unless LIVE=1.
//   LIVE=1 npm test
import { test } from "node:test"
import assert from "node:assert/strict"

const LIVE = process.env.LIVE === "1"
const skip = LIVE ? false : "set LIVE=1 to run the integration test"

import { read, search, hn, extract, feed } from "../src/index.js"

test("searches Hacker News for real", { skip }, async () => {
  const hits = await hn("opencode", { limit: 2 })
  assert.ok(Array.isArray(hits))
  assert.ok(hits.length > 0, "the live search should return hits")
})

test("reads a page as markdown", { skip }, async () => {
  const page = await read("https://example.com", { maxChars: 2000 })
  assert.ok(page.markdown.length > 0)
})

test("extracts links and metadata from a real page", { skip }, async () => {
  const r = await extract("https://example.com/")
  assert.ok(r.title, "должен быть заголовок")
  assert.ok(Array.isArray(r.links))
})

test("reads a real RSS feed", { skip }, async () => {
  const r = await feed("https://hnrss.org/frontpage")
  assert.ok(r.items.length > 0, "лента должна содержать записи")
  assert.ok(r.items[0].title)
})
