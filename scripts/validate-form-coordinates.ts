#!/usr/bin/env tsx
/**
 * validate-form-coordinates.ts — KG Recruit App AI Output Validation Gate
 *
 * Addendum v1.3 Gap 9: tick-box value columns in `applications` (race,
 * gender, marital_status, housing_type, highest_edu, monthly_income) MUST
 * match the form-coordinates.ts tick-group keys byte-for-byte. A misspelt
 * value at write time would look up to `undefined` in the coord map and
 * stamp the tick at NaN.
 *
 * This script asserts:
 *   1. Every key in formCoordinates.pageN.<group> appears in FORM_TICK_VALUES[group]
 *   2. Every value in FORM_TICK_VALUES[group] appears as a key in the coord map
 *   3. Migration CHECK constraint strings match FORM_TICK_VALUES values
 *
 * Runs in CI and pre-commit. Fails if any mismatch.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { formCoordinates } from "../lib/pdf/form-coordinates";
import { FORM_TICK_VALUES } from "../lib/pdf/form-coordinates-keys";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260513000001_init_schema.sql",
);

interface KeyCheck {
  group: string;
  expectedFromCanonical: readonly string[];
  actualFromCoords: string[];
}

const checks: KeyCheck[] = [
  {
    group: "page1.race",
    expectedFromCanonical: FORM_TICK_VALUES.race,
    actualFromCoords: Object.keys(formCoordinates.page1.race),
  },
  {
    group: "page1.gender",
    expectedFromCanonical: FORM_TICK_VALUES.gender,
    actualFromCoords: Object.keys(formCoordinates.page1.gender),
  },
  {
    group: "page1.maritalStatus",
    expectedFromCanonical: FORM_TICK_VALUES.maritalStatus,
    actualFromCoords: Object.keys(formCoordinates.page1.maritalStatus),
  },
  {
    group: "page1.housing",
    expectedFromCanonical: FORM_TICK_VALUES.housing,
    actualFromCoords: Object.keys(formCoordinates.page1.housing),
  },
  {
    group: "page1.education",
    expectedFromCanonical: FORM_TICK_VALUES.education,
    actualFromCoords: Object.keys(formCoordinates.page1.education),
  },
  {
    group: "page1.languages.written",
    expectedFromCanonical: FORM_TICK_VALUES.language,
    actualFromCoords: Object.keys(formCoordinates.page1.languages.written),
  },
  {
    group: "page1.languages.spoken",
    expectedFromCanonical: FORM_TICK_VALUES.language,
    actualFromCoords: Object.keys(formCoordinates.page1.languages.spoken),
  },
  {
    group: "page2.monthlyIncome",
    expectedFromCanonical: FORM_TICK_VALUES.monthlyIncome,
    actualFromCoords: Object.keys(formCoordinates.page2.monthlyIncome),
  },
];

function setEquals(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

async function checkMigrationCheckConstraints(): Promise<string[]> {
  const errors: string[] = [];
  let sql: string;
  try {
    sql = await fs.readFile(MIGRATION_PATH, "utf8");
  } catch {
    return [`Migration not found at ${MIGRATION_PATH}`];
  }

  // For each enum group, assert every canonical value appears as a quoted
  // literal in the migration. We don't try to parse SQL — a substring scan
  // is enough to catch the common drift (renamed value, missing one).
  const groups: { group: string; values: readonly string[] }[] = [
    { group: "race", values: FORM_TICK_VALUES.race },
    { group: "gender", values: FORM_TICK_VALUES.gender },
    { group: "maritalStatus", values: FORM_TICK_VALUES.maritalStatus },
    { group: "housing", values: FORM_TICK_VALUES.housing },
    { group: "education", values: FORM_TICK_VALUES.education },
    { group: "monthlyIncome", values: FORM_TICK_VALUES.monthlyIncome },
  ];

  for (const { group, values } of groups) {
    for (const v of values) {
      // Match the value as a single-quoted SQL literal (escape any apostrophes).
      const escaped = v.replace(/'/g, "''");
      const needle = `'${escaped}'`;
      if (!sql.includes(needle)) {
        errors.push(
          `[migration] CHECK for ${group} is missing the value ${needle}. ` +
            `FORM_TICK_VALUES.${group} requires it — add it to the CHECK in ` +
            `${path.relative(process.cwd(), MIGRATION_PATH)}.`,
        );
      }
    }
  }
  return errors;
}

async function main() {
  const errors: string[] = [];

  for (const c of checks) {
    if (!setEquals(c.expectedFromCanonical, c.actualFromCoords)) {
      const missingInCoords = c.expectedFromCanonical.filter(
        (k) => !c.actualFromCoords.includes(k),
      );
      const extraInCoords = c.actualFromCoords.filter(
        (k) => !(c.expectedFromCanonical as readonly string[]).includes(k),
      );
      errors.push(
        `[coords] ${c.group}: keys do not match FORM_TICK_VALUES.\n` +
          (missingInCoords.length ? `    missing in coords: ${JSON.stringify(missingInCoords)}\n` : "") +
          (extraInCoords.length ? `    extra in coords:   ${JSON.stringify(extraInCoords)}` : ""),
      );
    }
  }

  errors.push(...(await checkMigrationCheckConstraints()));

  if (errors.length === 0) {
    console.log(
      `validate-form-coordinates: ${checks.length} groups + migration CHECKs verified, 0 violations.`,
    );
    process.exit(0);
  }
  console.error(`validate-form-coordinates: ${errors.length} violation(s):\n`);
  for (const err of errors) console.error(`  ${err}\n`);
  console.error(
    "Fix: edit lib/pdf/form-coordinates-keys.ts (canonical) — then propagate to coord map and migration CHECK.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("validate-form-coordinates crashed:", err);
  process.exit(2);
});
