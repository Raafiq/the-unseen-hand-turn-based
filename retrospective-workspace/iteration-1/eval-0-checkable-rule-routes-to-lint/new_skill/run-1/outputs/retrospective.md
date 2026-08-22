# Session retrospective

Three candidate lessons from this session. Two survive; one is dropped as noise. Both survivors route to **rung 1 (machine-checkable rule)** — neither needs a line of prose anywhere.

---

## Candidate 1: TypeORM queries on `ShiftRepository` shipped without tenant scoping — twice

**Signal:** You stopped me twice for the same mistake: a query missing `.andWhere('shift.accountId = :accountId')`. Recurring correction, high stakes (tenant data leak in a multi-tenant app). This is the strongest signal a session can produce.

**Load-bearing test:** A future agent writing any query against a tenant-owned repository would be forced to scope it by `accountId` — passes.

**Routing:** The temptation is a CLAUDE.md line ("this app is multi-tenant; always scope by accountId"). But a violation of this rule is *visible in the code*: a query-builder chain that reaches a terminal call without an `accountId` predicate. That makes it machine-checkable, so it goes to **rung 1: a custom ESLint rule** — a lint failure fires on every future violation forever, with no agent needing to remember anything. Prose would be read once and forgotten under context pressure; the multi-tenancy *fact* is carried by the rule's error message, so it needs no second home.

**Proposed diff (rung 1 — custom ESLint rule):**

```
File: tools/eslint-rules/rules/require-account-scope.ts   (new file)
```
```ts
import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  () => 'tools/eslint-rules/rules/require-account-scope.ts',
);

/**
 * Multi-tenant guard: any TypeORM query-builder chain that reaches a terminal
 * call (getMany/getOne/getCount/getRawMany/getRawOne/find/findOne/findAndCount)
 * on a tenant-owned repository must contain a where/andWhere clause that
 * references `accountId`. An unscoped query leaks data across tenants.
 */
const TERMINAL_CALLS = new Set([
  'getMany', 'getOne', 'getOneOrFail', 'getCount', 'getRawMany', 'getRawOne',
  'find', 'findOne', 'findOneOrFail', 'findAndCount', 'findBy', 'findOneBy',
]);
const WHERE_CALLS = new Set(['where', 'andWhere', 'orWhere']);

export const requireAccountScope = createRule({
  name: 'require-account-scope',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every query on a tenant-owned repository must filter by accountId (multi-tenant app).',
    },
    messages: {
      unscoped:
        'Query reaches "{{terminal}}" without a where/andWhere referencing accountId. ' +
        'This is a multi-tenant app — an unscoped query leaks tenant data.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function chainHasAccountScope(node: TSESTree.CallExpression): boolean {
      let current: TSESTree.Node | undefined = node;
      while (
        current?.type === 'CallExpression' &&
        current.callee.type === 'MemberExpression'
      ) {
        const callee = current.callee;
        if (
          callee.property.type === 'Identifier' &&
          WHERE_CALLS.has(callee.property.name)
        ) {
          const argText = context.sourceCode.getText(current.arguments[0] ?? current);
          if (/accountId/.test(argText)) return true;
        }
        current = callee.object;
      }
      // Also accept find({ where: { accountId: ... } }) object-literal form.
      const firstArg = node.arguments[0];
      if (firstArg && /accountId/.test(context.sourceCode.getText(firstArg))) {
        return true;
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          !TERMINAL_CALLS.has(node.callee.property.name)
        ) {
          return;
        }
        // Only police chains that trace back to a repository / query builder.
        const chainText = context.sourceCode.getText(node);
        if (!/Repository|createQueryBuilder/.test(chainText)) return;
        if (!chainHasAccountScope(node)) {
          context.report({
            node,
            messageId: 'unscoped',
            data: { terminal: node.callee.property.name },
          });
        }
      },
    };
  },
});
```
```
File: eslint.config.mjs   (root flat config — wire the rule for the backend libs)
+ import { requireAccountScope } from './tools/eslint-rules/rules/require-account-scope.ts';
+
+ export default [
+   // ...existing config...
+   {
+     files: ['apps/api/**/*.ts', 'libs/**/data-access/**/*.ts'],
+     plugins: { 'tenant': { rules: { 'require-account-scope': requireAccountScope } } },
+     rules: { 'tenant/require-account-scope': 'error' },
+   },
+ ];
```

**Load-bearing because:** an unscoped tenant query now fails lint on every future change — the exact mistake that happened twice this session becomes mechanically impossible to ship, with no agent needing to remember anything.

*Honest limits, so this guard can't lie:* a regex-over-source heuristic can be fooled (a `where` built in a helper function, or an `accountId` mention that isn't actually a predicate). It catches the failure mode that actually occurred — a chain written inline with the clause simply missing — and errs toward false positives (an inline `// eslint-disable-next-line tenant/require-account-scope -- <reason>` is then a visible, reviewable exemption rather than a silent leak).

---

## Candidate 2: use `date-fns`, never `moment`

**Signal:** Corrected once — I reached for `moment` for a date diff; the project uses `date-fns` everywhere. Fixed cleanly after that.

**Load-bearing test:** A future agent (who starts with no memory of this session) would plausibly reach for `moment` again; the rule changes that on the first keystroke — passes.

**Routing:** One correction, low friction — but the violation is trivially visible in code (an import statement), and ESLint already has a built-in for exactly this. When the guard is a three-line config entry in a tool that already runs on every change, the bar for "worth persisting" is low. **Rung 1: built-in ESLint rule** — no custom code, no prose.

**Proposed diff (rung 1 — `no-restricted-imports`):**

```
File: eslint.config.mjs   (root flat config, applies repo-wide)
+ {
+   files: ['**/*.ts'],
+   rules: {
+     'no-restricted-imports': ['error', {
+       paths: [{
+         name: 'moment',
+         message: 'This repo uses date-fns for all date handling. Import from "date-fns" instead.',
+       }],
+     }],
+   },
+ },
```

**Load-bearing because:** any future `import moment` fails lint immediately with a message that names the sanctioned alternative, so the convention enforces itself instead of costing a correction per session.

---

## Candidate 3: `readonly` on DTO fields

**Signal:** Mentioned once, in passing, explicitly waved off ("not a big deal").

**Load-bearing test / routing:** **Dropped — rung 5 (nowhere).** A preference stated once and downgraded by the user is noise by this skill's own weighting; persisting it would spend every future agent's attention on something the user said doesn't matter. (If it ever hardens into a real preference, it is a one-line lint config — say the word and I'll add it — but it does not clear the bar today.)

---

## Summary

| Lesson | Verdict | Home |
|---|---|---|
| Tenant queries must scope by `accountId` (corrected 2x) | Keep | Rung 1 — custom ESLint rule `tenant/require-account-scope` |
| `date-fns`, not `moment` (corrected 1x) | Keep | Rung 1 — built-in `no-restricted-imports` config |
| `readonly` on DTO fields ("not a big deal") | Drop | Nowhere — user-waved-off one-off |

Nothing routes to a hook (no *when*-shaped lesson occurred), no skill (no judgment-requiring know-how — both survivors are mechanically checkable), and nothing to CLAUDE.md (no uncheckable fact remains once the lint rule carries the multi-tenancy invariant in its error message). On your confirmation I would apply the two lint diffs; the `readonly` preference stays in the chat.
