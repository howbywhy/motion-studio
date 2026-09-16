#!/usr/bin/env node
import { resolveActivePair } from "../src/core/sequence.ts";
import {
  applySequenceWeightChange,
  clampSequenceWeights,
  equalSequenceWeights,
  masterPhaseFromSlotLocal,
  minSlotSeconds,
  resetSequenceWeights,
  resolveSequenceTiming,
  sequenceSpans,
  sequenceVideoTime,
  transferSequenceWeight,
  sequenceWeightsAreUniform,
  transitionCutsFromWeights,
  weightedPairMapping,
  SEQUENCE_SLOT_MIN_SECONDS,
  SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE,
  SEQUENCE_TYPE_READABILITY_SECONDS,
} from "../src/core/sequenceRhythm.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

if (!SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE) fail("every authored state must show its duration");
if (clampSequenceWeights(undefined, 4).join(",") !== "1,1,1,1") fail("old state must default to equal weights");
if (clampSequenceWeights([2, -1, 0], 3).join(",") !== "2,1,1") fail("invalid weights must become 1");

const phases = [0, 0.01, 0.24, 0.25, 1 / 3, 0.5, 0.749, 0.75, 0.99, 1];
for (const n of [2, 3, 4, 5, 8]) {
  const weights = equalSequenceWeights(n);
  for (const p of phases) {
    const a = weightedPairMapping(n, p, "loop", weights, 12);
    const b = resolveActivePair(n, p, "loop");
    if (a.pairIndex !== b.pairIndex) fail(`equal pairIndex mismatch n=${n} p=${p} ${a.pairIndex}≠${b.pairIndex}`);
    if (Math.abs(a.localPhase - b.localPhase) > 1e-9) {
      fail(`equal localPhase mismatch n=${n} p=${p} ${a.localPhase}≠${b.localPhase}`);
    }
  }
}

const punch = resolveSequenceTiming(0.5, [1, 1, 1, 6], 12);
const even = resolveSequenceTiming(0.5, [1, 1, 1, 1], 12);
if (punch.index === even.index && Math.abs(punch.localPhase - even.localPhase) < 0.01) {
  fail("weighted 0.50 must leave the equal-slot pair");
}
if (resolveSequenceTiming(0.995, [1, 1, 1, 6], 12).index !== 3) fail("wrap must stay in the last weighted slot");
if (resolveSequenceTiming(0, [1, 2, 3], 12).index !== 0) fail("phase 0 is slot 01");

const twelve = resolveSequenceTiming(0.1, [1, 2, 1], 12);
const eight = resolveSequenceTiming(0.1, [1, 2, 1], 8);
if (twelve.index !== eight.index || Math.abs(twelve.localPhase - eight.localPhase) > 1e-9) {
  fail("master duration must not change slot index or local phase");
}
if (Math.abs(twelve.durationSeconds / eight.durationSeconds - 12 / 8) > 1e-9) {
  fail("seconds must scale with master duration");
}

const added = applySequenceWeightChange([1, 2, 1], 4, { kind: "add" });
if (added.length !== 4 || added[0] !== 1 || added[1] !== 2) fail("add must keep existing weights and append an equal-ish slot");
const removed = applySequenceWeightChange([1, 2, 3, 4], 3, { kind: "remove", index: 1 });
if (removed.join(",") !== "1,3,4") fail("remove must drop that slot weight and leave the others");
const resized = applySequenceWeightChange([2, 2], 2, { kind: "resize" });
if (resized.join(",") !== "2,2") fail("resize/replace must leave weights in place");
if (resetSequenceWeights(3).join(",") !== "1,1,1") fail("reset timing must restore equal weights");

const moved = transferSequenceWeight([1, 1, 1, 1], 0, 0.5, 12);
if (moved[0] + moved[1] !== 2) fail("boundary drag must preserve the pair total");
if (moved.reduce((s, w) => s + w, 0) !== 4) fail("boundary drag must preserve the master total");

const min12_4 = minSlotSeconds(12, 4);
if (min12_4 !== SEQUENCE_SLOT_MIN_SECONDS) fail("12s/4 should use the 0.5s technical floor");
if (minSlotSeconds(8, 8) >= SEQUENCE_SLOT_MIN_SECONDS) fail("tight loops must allow a shorter technical minimum");
if (SEQUENCE_TYPE_READABILITY_SECONDS !== 2) fail("document the 2s Type readability threshold");

const videoHold = sequenceVideoTime(1, 4, 1.2);
const videoMid = sequenceVideoTime(0.5, 4, 1.2);
const videoEarly = sequenceVideoTime(0.1, 4, 1.2);
const videoLong = sequenceVideoTime(1, 2, 8);
const videoStart = sequenceVideoTime(0, 3, 8);
if (Math.abs(videoHold - (1.2 - 1 / 120)) > 1e-9) fail("short video must hold its last frame");
if (Math.abs(videoMid - (1.2 - 1 / 120)) > 1e-9) fail("once the clip ends the slot holds the last frame");
if (Math.abs(videoEarly - 0.4) > 1e-9) fail("before the clip ends video time follows the slot");
if (Math.abs(videoLong - 2) > 1e-9) fail("long video must play only the slot length");
if (videoStart !== 0) fail("slot start and wrap must restart video at 0");

const equalCuts = [0.25, 0.5, 0.75].join(",");
const uniformCuts = transitionCutsFromWeights([3, 3, 3, 3]).map((n) => n.toFixed(6)).join(",");
if (!sequenceWeightsAreUniform([3, 3, 3, 3])) fail("uniform detector");
if (uniformCuts !== [0.25, 0.5, 0.75].map((n) => n.toFixed(6)).join(",")) fail("uniform weights must keep i/n flicker cuts");
if (equalCuts !== "0.25,0.5,0.75") fail("legacy equal cuts");
const weightedCuts = transitionCutsFromWeights([1, 1, 1, 5]);
if (weightedCuts.length !== 3) fail("internal flicker cuts only");
if (Math.abs(weightedCuts[2] - sequenceSpans([1, 1, 1, 5])[2].end) > 1e-9) fail("flicker must use weighted boundaries");
if (weightedCuts[2] === 0.75) fail("punch rhythm must not flicker at 3/4");

const local = 0.4;
for (const n of [2, 3, 5]) {
  const equal = equalSequenceWeights(n);
  const fromLocal = masterPhaseFromSlotLocal(1, local, equal);
  const expected = n <= 1 ? local : (1 + local) / n;
  if (Math.abs(fromLocal - expected) > 1e-9) fail(`equal slot-local master phase n=${n}`);
}
const punchHold = masterPhaseFromSlotLocal(3, 0.5, [1, 1, 1, 5]);
if (punchHold < 0.375 || punchHold >= 1) fail("weighted randomise HOLD must land inside the long last slot");
if (Math.abs(punchHold - (3 + 0.5) / 4) < 1e-9) fail("weighted HOLD must not use equal-slot (i+local)/n");

if (failures.length) {
  console.error("SEQUENCE RHYTHM FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("min 12/4", min12_4, "min 8/8", minSlotSeconds(8, 8));
console.log("SEQUENCE RHYTHM PASS");
