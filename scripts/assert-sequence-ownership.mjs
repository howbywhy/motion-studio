#!/usr/bin/env node
import {
  advanceBloomOwnership,
  BLOOM_OWNERSHIP_THRESHOLD,
  coverageFromAlpha,
  dilateMaskAlpha,
  emptyBloomOwnershipLatch,
  sequenceCopyIndexForOwner,
} from "../src/core/sequenceOwnership.ts";
import { variantIdForPair, variantSequence } from "../src/core/bloomPairVariant.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

if (BLOOM_OWNERSHIP_THRESHOLD !== 0.5) fail("initial ownership hypothesis is 50% B contribution");

const half = new Uint8ClampedArray(8);
half[3] = 255;
half[7] = 0;
if (Math.abs(coverageFromAlpha(half) - 0.5) > 1e-9) fail("mean alpha 50/50");
const empty = new Uint8ClampedArray(4);
if (coverageFromAlpha(empty) !== 0) fail("empty mask is A");
const full = new Uint8ClampedArray(4);
full[3] = 255;
if (coverageFromAlpha(full) !== 1) fail("full mask is B");
if (coverageFromAlpha(new Uint8ClampedArray(0)) !== 0) fail("zero-length coverage");

if (sequenceCopyIndexForOwner(0, 5, "A") !== 0) fail("A owns slot copy");
if (sequenceCopyIndexForOwner(4, 5, "B") !== 0) fail("wrap B is slot 01");
if (sequenceCopyIndexForOwner(0, 5, "B") !== 1) fail("B owns next slot copy");

let latch = emptyBloomOwnershipLatch();
let own = advanceBloomOwnership(latch, 0, 5, 0.02, 0.08);
if (own.ownership.owner !== "A" || own.ownership.copyIndex !== 0) fail("owner begins A");
latch = own.latch;

own = advanceBloomOwnership(latch, 0, 5, 0.4, 0.49);
if (own.ownership.owner !== "A") fail("below threshold stays A");
latch = own.latch;

own = advanceBloomOwnership(latch, 0, 5, 0.55, 0.51);
if (own.ownership.owner !== "B" || own.ownership.copyIndex !== 1) fail("owner changes to B once");
latch = own.latch;

own = advanceBloomOwnership(latch, 0, 5, 0.7, 0.22);
if (own.ownership.owner !== "B") fail("mask dip must not chatter back to A");
latch = own.latch;

own = advanceBloomOwnership(latch, 0, 5, 0.98, 0.9);
if (own.ownership.owner !== "B") fail("owner ends B");
latch = own.latch;

own = advanceBloomOwnership(latch, 1, 5, 0.02, 0.1);
if (own.ownership.owner !== "A" || own.ownership.copyIndex !== 1) {
  fail("next pair begins with the same semantic state (previous B is new A)");
}
latch = own.latch;

own = advanceBloomOwnership(latch, 4, 5, 0.8, 0.7);
latch = own.latch;
own = advanceBloomOwnership(latch, 0, 5, 0.01, 0.05);
if (own.ownership.copyIndex !== 0) fail("wrap uses the same ownership logic");
if (own.ownership.owner !== "A") fail("wrap pair starts as A");

latch = emptyBloomOwnershipLatch();
const slow = advanceBloomOwnership(latch, 3, 5, 0.6, 0.62);
const fast = advanceBloomOwnership(emptyBloomOwnershipLatch(), 3, 5, 0.6, 0.62);
if (slow.ownership.owner !== fast.ownership.owner) {
  fail("duration must not change ownership at equivalent pair-local Bloom state");
}

latch = advanceBloomOwnership(emptyBloomOwnershipLatch(), 2, 5, 0.9, 0.8).latch;
own = advanceBloomOwnership(latch, 2, 5, 0.1, 0.12);
if (own.ownership.owner !== "A") fail("seek backward inside the pair re-evaluates from the current mask");

const five = variantSequence(5);
if (five[0] !== "A") fail("pair 0 is the golden variant A");
if (five[1] === "A") fail("later pairs must still vary spatially");
if (variantIdForPair(0, 2) !== variantIdForPair(0, 5)) fail("adding slots must not change pair-0 variant");

const a = new Uint8ClampedArray(4);
a[3] = 80;
dilateMaskAlpha(a, 0.5);
if (a[3] <= 80) fail("resolve dilation must increase mask alpha");

if (sequenceCopyIndexForOwner(1, 5, "A") !== 1) fail("pair 2 owner A is copy 02");
if (sequenceCopyIndexForOwner(1, 5, "B") !== 2) fail("pair 2 owner B is copy 03");
if (sequenceCopyIndexForOwner(4, 5, "B") !== 0) fail("wrap owner B is copy 01");

for (const n of [2, 3, 4, 5]) {
  if (sequenceCopyIndexForOwner(0, n, "A") !== 0) fail(`n=${n} pair 0 owner A must stay copy 01`);
  if (sequenceCopyIndexForOwner(0, n, "B") !== 1) fail(`n=${n} pair 0 owner B must stay copy 02`);
  const last = n - 1;
  if (sequenceCopyIndexForOwner(last, n, "A") !== last) fail(`n=${n} last pair owner A is last copy`);
  if (sequenceCopyIndexForOwner(last, n, "B") !== 0) fail(`n=${n} last pair owner B wraps to 01`);
}

if (failures.length) {
  console.error("SEQUENCE OWNERSHIP FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("SEQUENCE OWNERSHIP PASS");
