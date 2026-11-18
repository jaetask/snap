import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, relative } from "node:path"

// A folder of cases. Each `name.json` is an input. `render` turns it into the
// Markdown that `name.expect.md` holds once a person approves it.
export type Suite = {
  dir: string
  render: (input: string, name: string) => string | Promise<string>
}

type Result = { name: string; path: string; actual: string | null; expected: string | null; problem: string | null }

const INPUT = ".json"
const EXPECT = ".expect.md"

// A case whose name starts with `error.` must throw. Its error is the output.
function isErrorCase(name: string): boolean {
  return name.startsWith("error.")
}

async function renderOnce(suite: Suite, name: string, input: string): Promise<{ text: string; problem: string | null }> {
  const head = `# ${name}\n\n## Input\n\n[${name}${INPUT}](${name}${INPUT})\n\n`
  try {
    const output = (await suite.render(input, name)).trimEnd()
    const problem = isErrorCase(name) ? "an error. case must throw, but it ran" : null
    return { text: `${head}## Output\n\n${output}\n`, problem }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const problem = isErrorCase(name) ? null : "the case threw; rename it error. if that is intended"
    return { text: `${head}## Error\n\n\`\`\`\n${message}\n\`\`\`\n`, problem }
  }
}

// Every case runs twice. Output that differs between the runs breaks the
// determinism rule, and the case fails.
async function renderCase(suite: Suite, name: string): Promise<{ text: string; problem: string | null }> {
  const input = readFileSync(join(suite.dir, name + INPUT), "utf8")
  const first = await renderOnce(suite, name, input)
  const second = await renderOnce(suite, name, input)
  if (first.text !== second.text) return { text: first.text, problem: `two runs gave different output:\n${diff(first.text, second.text)}` }
  return first
}

async function runSuite(suite: Suite): Promise<Result[]> {
  const files = readdirSync(suite.dir).sort()
  const names = files.filter((f) => f.endsWith(INPUT)).map((f) => basename(f, INPUT))
  const results: Result[] = []
  for (const name of names) {
    const path = join(suite.dir, name + EXPECT)
    const { text, problem } = await renderCase(suite, name)
    results.push({ name, path, actual: text, expected: existsSync(path) ? readFileSync(path, "utf8") : null, problem })
  }
  for (const file of files.filter((f) => f.endsWith(EXPECT))) {
    const name = basename(file, EXPECT)
    if (!names.includes(name)) {
      results.push({ name, path: join(suite.dir, file), actual: null, expected: readFileSync(join(suite.dir, file), "utf8"), problem: null })
    }
  }
  return results
}

function diff(expected: string, actual: string): string {
  const dir = mkdtempSync(join(tmpdir(), "snap-"))
  try {
    writeFileSync(join(dir, "approved"), expected)
    writeFileSync(join(dir, "actual"), actual)
    execFileSync("diff", ["-u", "--label", "approved", "--label", "actual", join(dir, "approved"), join(dir, "actual")])
    return ""
  } catch (error) {
    return String((error as { stdout?: Buffer }).stdout ?? error)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function update(result: Result): string {
  if (result.actual === null) {
    unlinkSync(result.path)
    return "REMOVE"
  }
  if (result.actual === result.expected) return "OKAY  "
  writeFileSync(result.path, result.actual)
  return result.expected === null ? "CREATE" : "UPDATE"
}

// Runs every suite. With `--update` it writes the expect files instead of
// comparing them. Returns the number of failed cases; the CLI exits with 1
// when it is not 0.
export async function snap(suites: Suite[], argv: string[] = process.argv.slice(2), log: (line: string) => void = console.log): Promise<number> {
  const updating = argv.includes("--update")
  let total = 0
  let failed = 0
  for (const suite of suites) {
    for (const result of await runSuite(suite)) {
      total++
      const label = relative(process.cwd(), result.path)
      if (updating) {
        log(`${update(result)} ${label}`)
        if (result.problem !== null) {
          failed++
          log(`  ${result.problem}`)
        }
        continue
      }
      if (result.actual !== null && result.actual === result.expected && result.problem === null) {
        log(`PASS   ${label}`)
        continue
      }
      failed++
      log(`FAIL   ${label}`)
      if (result.problem !== null) log(`  ${result.problem}`)
      if (result.actual === null) log("  the input file is gone; run with --update to remove this file")
      else if (result.expected === null) log("  no expect file yet; run with --update and read the new file")
      else if (result.actual !== result.expected) log(diff(result.expected, result.actual))
    }
  }
  log(`${total} cases, ${failed} failed${updating ? "" : failed > 0 ? ". Run with --update to approve the new output." : ""}`)
  return failed
}

// A Markdown table. Cells are written as given, so format numbers before.
export function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n")
}
