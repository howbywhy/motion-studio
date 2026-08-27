#!/usr/bin/env node
/** Source-lock for REGISTRATION GOLDEN MASTER (commit 728ff08). */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function mustContain(rel, needle, label = needle) {
  const src = read(rel);
  if (!src.includes(needle)) failures.push(`${rel} missing ${label}`);
}

function mustNotContain(rel, needle, label = needle) {
  const src = read(rel);
  if (src.includes(needle)) failures.push(`${rel} still contains DEAD ${label}`);
}

if (existsSync(join(root, "src/core/registrationFieldInk.ts"))) {
  failures.push("DEAD src/core/registrationFieldInk.ts still exists");
}

mustContain("src/core/globalRegistration.ts", "728ff088b3ee01e6b1ee968a6388fa6c4fc56200");
mustContain("src/core/globalRegistration.ts", "paintRegistrationSurface");
mustContain("src/core/globalRegistration.ts", "paintGoldenMasterRegistration");
mustContain("src/core/registrationInk.ts", 'tctx.filter = "grayscale(1) contrast(1.3)"');
mustContain("src/core/registrationInk.ts", 'sctx.filter = "grayscale(1) contrast(1.55)"');
mustContain("src/core/registrationInk.ts", "sctx.globalAlpha = 0.8");
mustContain("src/core/registrationInk.ts", "sctx.globalAlpha = 0.6");
mustContain("src/core/registrationInk.ts", "sctx.globalAlpha = 0.22");
mustContain("src/core/registrationInk.ts", "tile.width = 8");
mustContain("src/core/registrationInk.ts", "export const BLOOM_REGISTRATION_AMOUNT = 0.4");
mustContain("src/behaviors/bloom/treatments.ts", "const off = 2 + amount * 5");
mustContain("src/behaviors/bloom/treatments.ts", "true,");
mustContain("src/core/renderer.ts", "paintGoldenMasterRegistration");
mustContain("src/core/renderer.ts", "lastBloomFieldMap()");
mustContain("src/core/renderer.ts", "this.bwMode === \"both\"");
mustContain("src/core/globalRegistration.ts", "export const REGISTRATION_AMOUNT_DEFAULT = 50");
mustContain("src/core/globalRegistration.ts", "registrationPaintAmount");
mustContain("src/core/globalRegistration.ts", "(clampRegistrationAmount(uiAmount) / 100) * (BLOOM_REGISTRATION_AMOUNT * 2)");
mustContain("src/core/renderer.ts", "this.registrationAmount");
mustContain("src/core/endBehaviour.ts", 'if (raw === "flicker" || raw === "fracture") return "flicker"');

mustNotContain("src/ui/endBehaviourPanel.ts", "Fracture");
mustNotContain("src/core/endBehaviour.ts", 'kind: "fracture"');

mustNotContain("src/core/renderer.ts", "prepareFieldPrintInk");
mustNotContain("src/core/renderer.ts", "paintLockedGlobalRegistration");
mustNotContain("src/core/globalRegistration.ts", "prepareFieldPrintInk");
mustNotContain("src/core/globalRegistration.ts", "paintFieldPersistent");
mustNotContain("src/core/registrationInk.ts", "paintLockedPersistent");

if (failures.length) {
  console.error("REGISTRATION GOLDEN MASTER source lock FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("REGISTRATION GOLDEN MASTER source lock PASS");
