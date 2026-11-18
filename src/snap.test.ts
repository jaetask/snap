import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { snap, table, type Suite } from "./snap.js"

function suite(cases: Record<string, unknown>): Suite {
  const dir = mkdtempSync(join(tmpdir(), "snap-test-"))
  for (const [name, input] of Object.entries(cases)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(input))
  return {
    dir,
    render: (input) => {
      const { a, b } = JSON.parse(input) as { a: number; b: number }
      if (b === 0) throw new Error("b is zero")
      return table(["a", "b", "a / b"], [[a, b, a / b]])
    },
  }
}

async function run(s: Suite, argv: string[] = []): Promise<{ failed: number; lines: string[] }> {
  const lines: string[] = []
  const failed = await snap([s], argv, (line) => lines.push(line))
  return { failed, lines }
}

test("a new case fails until --update writes its expect file, then passes", async () => {
  const s = suite({ half: { a: 1, b: 2 } })
  assert.equal((await run(s)).failed, 1)
  assert.equal((await run(s, ["--update"])).failed, 0)
  assert.equal(readFileSync(join(s.dir, "half.expect.md"), "utf8"),
    "# half\n\n## Input\n\n[half.json](half.json)\n\n## Output\n\n| a | b | a / b |\n| --- | --- | --- |\n| 1 | 2 | 0.5 |\n")
  assert.equal((await run(s)).failed, 0)
})

test("a changed output fails with a diff of the expect file", async () => {
  const s = suite({ half: { a: 1, b: 2 } })
  await run(s, ["--update"])
  writeFileSync(join(s.dir, "half.json"), JSON.stringify({ a: 3, b: 2 }))
  const { failed, lines } = await run(s)
  assert.equal(failed, 1)
  assert.match(lines.join("\n"), /-\| 1 \| 2 \| 0\.5 \|\n\+\| 3 \| 2 \| 1\.5 \|/)
})

test("an error. case passes only when it throws, and records the error", async () => {
  const s = suite({ "error.zero": { a: 1, b: 0 }, "error.runs": { a: 1, b: 1 } })
  const { failed, lines } = await run(s, ["--update"])
  assert.equal(failed, 1)
  assert.match(lines.join("\n"), /an error\. case must throw, but it ran/)
  assert.match(readFileSync(join(s.dir, "error.zero.expect.md"), "utf8"), /## Error\n\n```\nb is zero\n```/)
})

test("a case that throws without the error. prefix fails", async () => {
  const s = suite({ zero: { a: 1, b: 0 } })
  assert.equal((await run(s, ["--update"])).failed, 1)
  assert.equal((await run(s)).failed, 1)
})

test("an expect file without an input fails, and --update removes it", async () => {
  const s = suite({})
  writeFileSync(join(s.dir, "gone.expect.md"), "old")
  assert.equal((await run(s)).failed, 1)
  await run(s, ["--update"])
  assert.equal(existsSync(join(s.dir, "gone.expect.md")), false)
})

test("a case whose two runs differ fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "snap-test-"))
  writeFileSync(join(dir, "count.json"), "{}")
  let runs = 0
  const s: Suite = { dir, render: async () => `run ${++runs}` }
  const { failed, lines } = await run(s, ["--update"])
  assert.equal(failed, 1)
  assert.match(lines.join("\n"), /two runs gave different output/)
})
