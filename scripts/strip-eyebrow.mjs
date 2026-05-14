/**
 * One-shot codemod: removes the redundant branch-name / "Taylab" eyebrow
 * `<p className="text-sm font-medium uppercase tracking-wide text-brand-blue">`
 * line from every page header. The sidebar already shows the branch, so
 * the eyebrow was just visual noise.
 *
 * Idempotent — re-running on a clean file makes no changes.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync('grep -rl "uppercase tracking-wide text-brand-blue" app/', {
  encoding: "utf8",
}).trim().split(/\r?\n/).filter(Boolean);

let touched = 0;
for (const path of files) {
  const src = readFileSync(path, "utf8");
  // Match the entire <p>...eyebrow...</p> block, optionally followed by a
  // newline + whitespace, so we don't leave a blank line behind.
  const next = src.replace(
    /\s*<p className="text-sm font-medium uppercase tracking-wide text-brand-blue">\s*\{?[^}<]*\}?\s*<\/p>\s*\n/g,
    "\n",
  );
  if (next !== src) {
    writeFileSync(path, next);
    const before = src.length;
    const after = next.length;
    console.log(`  ✓ ${path} (${before - after} chars removed)`);
    touched++;
  } else {
    console.log(`  - ${path} (no match — already stripped?)`);
  }
}
console.log(`\nTouched ${touched} of ${files.length} files.`);
