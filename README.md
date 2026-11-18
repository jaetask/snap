# snap

Expect tests for TypeScript. Each case is an input file. snap renders it to Markdown and compares the result with an approved `name.expect.md` beside it. A person reads and approves each expect file, so the test is the real output, not a second copy of the logic.

```ts
// expect/snap.ts
import { snap, table } from "@jaetask/snap"

const failed = await snap([{
  dir: "expect/cases",
  render: (input) => table(["x"], [[JSON.parse(input).x]]),
}])
process.exit(failed === 0 ? 0 : 1)
```

- `snap` compares every case. A changed output fails and prints the diff.
- `snap --update` writes the new expect files. Review them in the pull request.
- A case named `error.*` must throw. Its message is the approved output.
- An expect file without an input fails. `--update` removes it.
- Each case runs twice. Output that differs between the runs fails.

`render` may return a promise. `table(headers, rows)` writes a Markdown table. Failure output needs `diff` on `PATH`.

## Install

From GitHub, at a tag:

```
pnpm add -D github:jaetask/snap#v0.1.0
```

`npm i -D github:jaetask/snap#v0.1.0` works too. It builds on install. Node 22 or later.

On npm as `@jaetask/snap` later.

## Credits

With thanks to the React team. snap follows the idea of the [snap test runner](https://github.com/facebook/react/tree/main/compiler/packages/snap) they built for the React Compiler: fixtures in, approved Markdown out, reviewed like code. This is a separate, smaller implementation, not their code.

MIT
