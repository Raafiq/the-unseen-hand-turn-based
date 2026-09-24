// check:adr-index — every ADR file under docs/adr/ has a row in docs/adr/README.md.
//
// Why: the index is a status table nobody derives. ADR-0045 shipped with no row and sat
// invisible for four days until a steward placing ADR-0047 happened to look (2026-09-23).
// A guard that only checks the rows present passes vacuously, so this one walks the
// FILES and demands a row per file, and fails if it finds no ADR files at all.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "docs/adr";
const files = readdirSync(dir)
  .filter((f) => /^\d{4}-.+\.md$/.test(f))
  .sort();
if (files.length === 0) {
  console.error(`❌ check:adr-index: no ADR files found under ${dir}`);
  process.exit(1);
}
const index = readFileSync(join(dir, "README.md"), "utf8");
const missing = files.filter((f) => !index.includes(`(${f})`));
if (missing.length) {
  console.error(`❌ check:adr-index: ${missing.length} ADR(s) have no row in ${dir}/README.md:`);
  for (const f of missing) console.error(`   ${f}`);
  process.exit(1);
}
console.log(`✅ check:adr-index: ${files.length} ADR(s), every one indexed in ${dir}/README.md.`);
