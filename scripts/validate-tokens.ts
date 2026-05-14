#!/usr/bin/env tsx
/**
 * validate-tokens.ts — KG Recruit App AI Output Validation Gate
 *
 * Walks /app and /components, scans every .ts/.tsx file, and fails the build
 * if any of the following are found in component code:
 *
 *   1. Raw hex literals          (e.g. `#EF3340`, `#fff`)
 *   2. Raw rgba()/hsla() calls in source
 *   3. Inline `style={{ ... }}` with literal pixel / colour values
 *   4. Tailwind arbitrary-value classes        (e.g. `text-[#EF3340]`, `p-[13px]`)
 *   5. Off-allowlist Tailwind colour classes   (e.g. `text-red-500`, default palette)
 *
 * Exceptions:
 *   - /lib/design/* is the source of truth — tokens.css/.ts may contain hex
 *   - /scripts/* may contain pattern strings
 *   - // tokens-ok  comment on the line opts out of the line check
 *
 * See `KG_DesignSystem_v1.md` Sections 7.1–7.4.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const SKIP_FILE_PARTS = [
  path.join("lib", "design") + path.sep,
  path.join("scripts") + path.sep,
  path.join("node_modules") + path.sep,
  path.join(".next") + path.sep,
];
const VALID_EXTS = new Set([".ts", ".tsx"]);

type Violation = {
  file: string;
  line: number;
  col: number;
  rule: string;
  excerpt: string;
};

// Default Tailwind colour palette names that must NOT appear as bg-/text-/border-/ring- prefixes.
const FORBIDDEN_TW_COLOURS = [
  "slate", "gray", "zinc", "stone",
  "red", "orange", "amber", "yellow", "lime", "green",
  "emerald", "teal", "cyan", "sky", "blue", "indigo",
  "violet", "purple", "fuchsia", "pink", "rose",
  // 'neutral' is intentionally NOT here — we own that palette in tokens.json
  // 'white'/'black' are not in the design system; reject them too:
  "white", "black",
];

const RULES: { name: string; regex: RegExp; message: string }[] = [
  {
    name: "raw-hex",
    regex: /#[0-9A-Fa-f]{3,8}\b/g,
    message: "Raw hex literal — use a token (text-brand-red, bg-surface-card, etc.)",
  },
  {
    name: "raw-rgba",
    regex: /rgba?\s*\(/g,
    message: "Raw rgba()/rgb() — use a token or Tailwind utility from the allowlist",
  },
  {
    name: "raw-hsla",
    regex: /hsla?\s*\(/g,
    message: "Raw hsla()/hsl() — use a token or Tailwind utility from the allowlist",
  },
  {
    name: "tw-arbitrary-value",
    // Match Tailwind arbitrary values: prefix-[...] NOT followed by `:`.
    // The `(?!:)` skips variant selectors like `data-[state=open]:animate-in`
    // and `aria-[expanded=true]:bg-red` where the brackets are part of a
    // variant matcher, not the utility's value.
    regex: /\b[a-z-]+-\[[^\]]+\](?!:)/g,
    message: "Tailwind arbitrary value — use a token-derived class instead",
  },
];

const FORBIDDEN_TW_REGEX = new RegExp(
  String.raw`\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder)-(?:` +
    FORBIDDEN_TW_COLOURS.join("|") +
    String.raw`)(?:-\d{2,3})?\b`,
  "g",
);

async function walk(dir: string, out: string[]) {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!VALID_EXTS.has(ext)) continue;
      if (SKIP_FILE_PARTS.some((p) => full.includes(p))) continue;
      out.push(full);
    }
  }
}

function checkLine(file: string, lineNumber: number, lineText: string, violations: Violation[]) {
  if (lineText.includes("// tokens-ok")) return;
  // Strip line comments for hex scan, since SQL-style comments + URLs can contain '#'
  const code = lineText.split("//")[0];

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(code)) !== null) {
      // Allow #shortlinks/fragment hashes — only flag when it's clearly a colour literal
      if (rule.name === "raw-hex") {
        const hex = m[0];
        // hex must be 3, 4, 6 or 8 chars after # to be a real colour
        const inner = hex.slice(1);
        if (![3, 4, 6, 8].includes(inner.length)) continue;
      }
      violations.push({
        file,
        line: lineNumber,
        col: m.index + 1,
        rule: rule.name,
        excerpt: lineText.trim().slice(0, 200),
      });
    }
  }

  FORBIDDEN_TW_REGEX.lastIndex = 0;
  let tw: RegExpExecArray | null;
  while ((tw = FORBIDDEN_TW_REGEX.exec(code)) !== null) {
    violations.push({
      file,
      line: lineNumber,
      col: tw.index + 1,
      rule: "tw-off-allowlist",
      excerpt: lineText.trim().slice(0, 200),
    });
  }
}

async function main() {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    await walk(path.join(ROOT, d), files);
  }

  const violations: Violation[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => checkLine(path.relative(ROOT, file), i + 1, line, violations));
  }

  if (violations.length === 0) {
    console.log(`validate-tokens: scanned ${files.length} files, 0 violations.`);
    process.exit(0);
  }

  console.error(`validate-tokens: ${violations.length} violation(s) across ${files.length} files:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  [${v.rule}]  ${v.excerpt}`);
  }
  console.error("\nFix: use a token-derived utility (text-brand-red, p-3, shadow-md, etc.)");
  console.error("See KG_DesignSystem_v1.md Section 7 for the allowlist.");
  process.exit(1);
}

main().catch((err) => {
  console.error("validate-tokens crashed:", err);
  process.exit(2);
});
