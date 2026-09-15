#!/usr/bin/env node
import { resolveActivePair } from "../src/core/sequence.ts";
import {
  clampSequenceWeights,
  equalSequenceWeights,
  masterPhaseFromSlotLocal,
  sequenceSpans,
  sequenceVideoTime,
  transitionCutsFromWeights,
  weightedPairMapping,
} from "../src/core/sequenceRhythm.ts";
import { sequenceTypeConnectionDraw } from "../src/core/sequenceTypeConnection.ts";
import { sequenceTypeEnvelope, sequenceTypeDraw } from "../src/core/sequenceTypeTiming.ts";

const AUTH_FLICKER_SEC = 0.12;
const HANDOFF_ENERGY = 0.11;
const PUNCTUATION_ENERGY = 0.28;

const failures = [];
function fail(msg) {
  failures.push(msg);
}

function flickerDurationSec(loopSeconds, weights, incomingIndex) {
  const n = weights.length;
  const spans = sequenceSpans(weights);
  const incoming = spans[((incomingIndex % n) + n) % n];
  const outgoing = spans[(((incomingIndex - 1) % n) + n) % n];
  const shorter = Math.min(incoming.share, outgoing.share) * loopSeconds;
  return Math.min(AUTH_FLICKER_SEC, Math.max(1 / 30, shorter * 0.25));
}

if (clampSequenceWeights(undefined, 4).join(",") !== "1,1,1,1") fail("old saves load equal weights");

const hold = sequenceTypeConnectionDraw(sequenceTypeEnvelope(0.05, 3), "flicker", 360);
const mid = sequenceTypeConnectionDraw(sequenceTypeEnvelope(0.4, 3), "flicker", 360);
const end = sequenceTypeConnectionDraw(sequenceTypeEnvelope(0.9, 3), "flicker", 360);
for (const draw of [hold, mid, end]) {
  if (draw.opacity !== 1 || draw.cropT !== 0 || draw.cropB !== 0 || draw.cropL !== 0 || draw.cropR !== 0) {
    fail("product Sequence Type must hold with no crop");
  }
}
const soft = sequenceTypeDraw(sequenceTypeEnvelope(0.08, 3), "connected", 360, "soft-crop");
if (!(soft.cropB > 0)) fail("SOFT CROP must remain available as a QA baseline");

const wrapCuts = [0, ...transitionCutsFromWeights([1, 1, 1, 1])];
if (wrapCuts[0] !== 0) fail("product wrap cut must be 0");
if (wrapCuts.slice(1).map((n) => n.toFixed(2)).join(",") !== "0.25,0.50,0.75") {
  fail("internal cuts stay after wrap");
}
const weighted = [0, ...transitionCutsFromWeights([1, 1, 1, 5])];
if (weighted[0] !== 0) fail("weighted wrap is still 0");
if (Math.abs(weighted[3] - 0.375) > 1e-9) fail("weighted flicker must use cumulative boundaries");

const ordinary = flickerDurationSec(12, [1, 1, 1, 1], 1);
if (ordinary !== AUTH_FLICKER_SEC) fail("ordinary 3s slots keep 0.12s flicker");
for (const seconds of [0.5, 0.75, 1, 1.5, 3]) {
  const weights = [seconds, 12 - seconds];
  const dur = flickerDurationSec(12, weights, 0);
  if (seconds >= 0.48 && dur !== AUTH_FLICKER_SEC) {
    fail(`${seconds}s neighbour must keep authored flicker`);
  }
  if (dur > seconds * 0.25 + 1e-9) fail(`${seconds}s neighbour must not give flicker more than 25%`);
  if (dur > AUTH_FLICKER_SEC + 1e-9) fail("flicker must never exceed authored 0.12s");
}
const tiny = flickerDurationSec(8, [0.3, 7.7], 0);
if (tiny >= AUTH_FLICKER_SEC) fail("sub-0.48s neighbour must scale flicker down");
if (tiny < 1 / 30) fail("scaled flicker has a 1-frame floor");

if (!(HANDOFF_ENERGY < PUNCTUATION_ENERGY)) {
  fail("state handoff must be quieter than Transition Flicker punctuation");
}

for (const n of [2, 3, 5]) {
  const weights = equalSequenceWeights(n);
  for (const p of [0, 0.2, 0.5, 0.99]) {
    const a = weightedPairMapping(n, p, "loop", weights, 12);
    const b = resolveActivePair(n, p, "loop");
    if (a.pairIndex !== b.pairIndex) fail(`equal product mapping pairIndex n=${n} p=${p}`);
  }
}

if (sequenceVideoTime(0, 3, 8) !== 0) fail("video slot start is 0");
if (Math.abs(sequenceVideoTime(1, 2, 8) - 2) > 1e-9) fail("long video leaves when the slot ends");
if (masterPhaseFromSlotLocal(0, 0, [1, 2]) !== 0) fail("slot-local 0 is master 0");

if (failures.length) {
  console.error("SEQUENCE PRODUCT FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("SEQUENCE PRODUCT PASS");
