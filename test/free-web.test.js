import { test } from "node:test"
import assert from "node:assert/strict"
import { read, search, wiki, hn, github, SOURCES } from "../src/index.js"

test("sources are documented", () => {
  assert.ok(SOURCES.read.includes("r.jina.ai"))
  assert.ok(SOURCES.hn.includes("algolia"))
})

test("read rejects a non-URL input", async () => {
  await assert.rejects(() => read("not a url"), /full http/)
})

test("wiki returns an extract or matches", async () => {
  const r = await wiki("Python")
  assert.ok(r.extract || (r.matches && r.matches.length))
})

test("hn returns hits with titles", async () => {
  const hits = await hn("opencode", { limit: 2 })
  assert.ok(Array.isArray(hits))
  if (hits.length) assert.ok(hits[0].title)
})

test("search aggregates sources", async () => {
  const r = await search("opencode", { limit: 2 })
  assert.ok("wiki" in r && "hn" in r && "github" in r)
})
