# Retrospective

**Session:** Three times, a new file was added to `libs/ui` without exporting it from the lib's barrel (`libs/ui/src/index.ts`). Each time, downstream imports failed and the user had to point it out.

One mistake, three recurrences, user-caught every time. That is a load-bearing signal twice over: the export was *missed* (a code defect), and the breakage was *never self-detected* (a workflow gap). Everything below traces to those two facts.

---

## Candidate lessons considered

| # | Candidate | Verdict |
|---|-----------|---------|
| 1 | Every source file added to a lib must be re-exported from that lib's barrel `index.ts` | **Kept** → rung 1 (lint rule) |
| 2 | Don't declare work done while downstream consumers fail to compile — the user caught all three breaks, the agent caught none | **Kept** → rung 2 (Stop hook) |
| 3 | Add a CLAUDE.md line: "when you add a file to `libs/ui`, export it from `index.ts`" | **Dropped** — the violation is visible in code, so a guard (rung 1) enforces it without spending any agent's attention; a prose rule is read once and forgotten under context pressure, which is exactly how this failed three times |
| 4 | Write a project skill "adding a file to an Nx lib" | **Dropped** — no judgment involved; the step is purely mechanical, so a machine check beats a procedure document |
| 5 | Auto-generate barrels (e.g. barrelsby) so the export step disappears entirely | **Dropped** — a build-tooling design change, not a retrospective lesson; noted here so the user can choose it *instead of* lesson 1 if they prefer generation over checking |
| 6 | Global skill (`~/.claude/skills/`) about barrel hygiene | **Dropped** — the lesson is checkable (rung 1) and repo-shaped (this monorepo's `libs/*/src/index.ts` layout); it does not need to travel as know-how |

**Load-bearing test, applied:**
- Lesson 1: a future agent that forgets the export gets a red lint error naming the file and the fix, instead of shipping a broken import. Passes.
- Lesson 2: a future agent is interrupted at the moment it claims completion with downstream projects broken, instead of the user finding out. Passes.
- Candidates 3, 4, 6: a future agent would behave no differently than under lesson 1's guard, and less reliably. Fail.

---

## Lesson 1 — barrel completeness is machine-checkable → custom ESLint rule (rung 1)

A file that exists under a lib's `src/` but is unreachable from `src/index.ts` is a static property of the code. Encode it in the tool that already runs on every change.

**Proposed diff 1a — new file `tools/eslint-rules/require-barrel-export.mjs`:**

```js
// Every source file in a lib must be re-exported (directly or via a nested
// barrel) from the lib's src/index.ts. Opt a file out by putting
// `// barrel-ignore` on its first line.
import fs from 'node:fs';
import path from 'node:path';

const SKIP = /\.(spec|test|stories)\.(ts|tsx)$|\.d\.ts$/;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !SKIP.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveSpecifier(fromDir, spec) {
  for (const candidate of [
    path.join(fromDir, `${spec}.ts`),
    path.join(fromDir, `${spec}.tsx`),
    path.join(fromDir, spec, 'index.ts'),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Walk export-from statements, following nested local barrels.
function exportedFiles(barrelPath, seen = new Set()) {
  if (seen.has(barrelPath)) return seen;
  seen.add(barrelPath);
  const text = fs.readFileSync(barrelPath, 'utf8');
  const re = /export\s+(?:\*|type\s+\*|\{[^}]*\})\s+from\s+['"](\.[^'"]+)['"]/g;
  for (const m of text.matchAll(re)) {
    const resolved = resolveSpecifier(path.dirname(barrelPath), m[1]);
    if (!resolved) continue;
    if (resolved.endsWith(`${path.sep}index.ts`)) exportedFiles(resolved, seen);
    else seen.add(resolved);
  }
  return seen;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'every source file in a lib must be re-exported from src/index.ts',
    },
    messages: {
      missing:
        "'{{rel}}' is not exported from this barrel. Add `export * from " +
        "'./{{spec}}';` here, or mark the file internal with a " +
        '`// barrel-ignore` first-line comment.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const indexPath = context.filename;
        const srcDir = path.dirname(indexPath);
        const covered = exportedFiles(indexPath);
        for (const file of sourceFiles(srcDir)) {
          if (file === indexPath || covered.has(file)) continue;
          const firstLine = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
          if (firstLine.includes('barrel-ignore')) continue;
          const rel = path.relative(srcDir, file);
          context.report({
            node,
            messageId: 'missing',
            data: { rel, spec: rel.replace(/\.(ts|tsx)$/, '') },
          });
        }
      },
    };
  },
};
```

**Proposed diff 1b — root `eslint.config.mjs`, add:**

```js
import requireBarrelExport from './tools/eslint-rules/require-barrel-export.mjs';

// ...appended to the exported config array:
{
  files: ['libs/**/src/index.ts'],
  plugins: {
    workspace: { rules: { 'require-barrel-export': requireBarrelExport } },
  },
  rules: { 'workspace/require-barrel-export': 'error' },
},
```

Scope note: this covers **all** libs, not just `libs/ui` — the mistake is about the barrel pattern, not about one lib, and `// barrel-ignore` gives deliberately-internal files an explicit, visible opt-out.

Sanity check on adoption: temporarily delete one export line from `libs/ui/src/index.ts` and confirm `nx lint ui` goes red — a guard you have never seen fail proves nothing.

**Load-bearing because:** a forgotten barrel export now fails `nx lint` (editor, pre-commit, and CI) on every future change, naming the file and the exact line to add — no agent needs to remember anything.

---

## Lesson 2 — completion was claimed with downstream broken → Stop hook (rung 2)

All three breaks were found by the *user*, downstream. That is a *when* problem, independent of the barrel specifics: work was declared done without checking that affected consumers still compile. Lesson 1 makes this particular defect visible to lint, but only a gate at the "done" moment guarantees the check actually runs before the claim.

**Proposed diff — `.claude/settings.json` (hooks):**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx nx affected -t lint typecheck --base=main || echo 'BLOCK: affected lint/typecheck failing — fix before finishing'"
          }
        ]
      }
    ]
  }
}
```

(Adjust `--base` to the team's convention — `main`, `origin/main`, or `HEAD~1` — and add `-t build` if typecheck is not a first-class target in this workspace.)

**Load-bearing because:** the agent is interrupted at the exact moment it claims completion while a downstream project fails to compile, instead of the user having to point it out a fourth time.

---

## Not persisted

Candidates 3–6 above, each with its one-line reason. Nothing else in the session record clears the load-bearing bar.
