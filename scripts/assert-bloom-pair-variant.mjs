#!/usr/bin/env node
/** Deterministic Loop Bloom pair-variant rules. No renderer. */
import {
  bloomFieldBiasForPair,
  bloomFieldBiasForVariant,
  CANONICAL_OWNERSHIP_VARIANT,
  loopBloomOwnershipBias,
  loopBloomRenderBias,
  variantIdForPair,
  variantSequence,
} from "../src/core/bloomPairVariant.ts";

const failures = [];

function fail(msg) {
  failures.push(msg);
}

function hasCycleAdjacentDuplicate(ids) {
  const n = ids.length;
  if (n < 2) return false;
  for (let i = 0; i < n; i++) if (ids[i] === ids[(i + 1) % n]) return true;
  return false;
}

for (let n = 2; n <= 8; n++) {
  const a = variantSequence(n);
  const b = variantSequence(n);
  if (a.join("") !== b.join("")) fail(`n=${n} assignment is not deterministic`);
  if (a.length !== n) fail(`n=${n} length ${a.length}`);
  if (hasCycleAdjacentDuplicate(a)) fail(`n=${n} adjacent duplicate ${a.join(" ")}`);
  if (a[0] === a[n - 1]) fail(`n=${n} wrap first==last ${a.join(" ")}`);
  for (let i = 0; i < n; i++) {
    if (variantIdForPair(i, n) !== a[i]) fail(`n=${n} p${i} index mismatch`);
  }
}

const two = variantSequence(2);
if (two[0] !== "A" || two[1] !== "C") fail(`2-source must be A C, got ${two.join(" ")}`);

const biasA = JSON.stringify(bloomFieldBiasForPair(0, "medium", 2));
const biasA2 = JSON.stringify(bloomFieldBiasForPair(0, "medium", 2));
if (biasA !== biasA2) fail("same pair/count/strength must return the same bias");
if (bloomFieldBiasForPair(0, "current", 2) !== null) fail("current strength must be identity");
if (JSON.stringify(bloomFieldBiasForPair(0, "medium", 2)) === JSON.stringify(bloomFieldBiasForPair(1, "medium", 2))) {
  fail("2-source A and C must differ at MEDIUM");
}

if (loopBloomRenderBias("bloom", "pingpong", 0, 2) !== null) fail("Pulse must receive no bias");
if (loopBloomRenderBias("shift", "loop", 0, 2) !== null) fail("non-Bloom must receive no bias");
if (loopBloomRenderBias("bloom", "loop", 0, 2) === null) fail("Loop Bloom must receive MEDIUM bias");

const loop0 = JSON.stringify(loopBloomRenderBias("bloom", "loop", 0, 4));
const loop0again = JSON.stringify(loopBloomRenderBias("bloom", "loop", 0, 4));
if (loop0 !== loop0again) fail("Loop bias must not depend on call order");
// Duration is not an input — assignment is pairIndex/pairCount only.
if (variantIdForPair(3, 8) !== "D") fail("slot 3 of 8 must stay D regardless of duration");
if (JSON.stringify(bloomFieldBiasForPair(1, "medium", 2)) !== JSON.stringify(loopBloomRenderBias("bloom", "loop", 1, 2))) {
  fail("export and preview must share loopBloomRenderBias");
}
const own = JSON.stringify(loopBloomOwnershipBias());
if (CANONICAL_OWNERSHIP_VARIANT !== "A") fail("canonical ownership field is authored as A");
if (own !== JSON.stringify(bloomFieldBiasForVariant("A", "medium"))) {
  fail("ownership sample must stay the canonical A field");
}
if (own !== JSON.stringify(bloomFieldBiasForPair(0, "medium", 4))) {
  fail("canonical A must remain numerically identical to today's first-pair field");
}
if (own === JSON.stringify(loopBloomRenderBias("bloom", "loop", 1, 5))) {
  fail("ownership sample must not follow variant C");
}

if (failures.length) {
  console.error("BLOOM PAIR VARIANT FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

for (let n = 2; n <= 8; n++) {
  console.log(`${n}  ${variantSequence(n).join(" ")}  wrap ${variantSequence(n).at(-1)}→${variantSequence(n)[0]}`);
}
console.log("BLOOM PAIR VARIANT PASS");
