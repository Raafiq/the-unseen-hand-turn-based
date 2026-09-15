# Changelog

## 0.3.0

- Add: both commands run `/speckit-analyze` and `/speckit-converge` inline after the
  approved write, surface CRITICAL analyze findings and converge disputes as warnings, and
  end with one status block naming the next command
- Add: `sync` writes `plan.md` — a code change that makes a plan claim false is a `plan`
  finding with a proposed plan edit, covered by the same approval gate
- Add: `rebase` sanity-checks an `ORIG_HEAD`-derived old base (the commits behind it must
  be the commits now on `HEAD`) and prints where the range came from
- Fix: a `[NEEDS REVISION: …]` marker names the thing that is gone (a file, an export, the
  sections an FR lists), not the file it lived in

## 0.2.0

- Fix: identifier matching restricted to plan-listed paths (issue #5)
- Add: `test` kind (LOW) for new test assertions (issue #7)

## 0.1.0

- Initial build. Two commands: `speckit.drift.rebase`, `speckit.drift.sync`.
