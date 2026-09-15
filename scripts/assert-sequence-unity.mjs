#!/usr/bin/env node
import { sequenceTypeEnvelope, sequenceTypeDraw } from "../src/core/sequenceTypeTiming.ts";
import {
  connectionUsesBloom,
  connectionUsesFlicker,
  sequenceTypeConnectionDraw,
  sequenceTypeCopyIndex,
  typeBloomPresence,
  TYPE_BLOOM_ARRIVE_END,
  TYPE_BLOOM_RESOLVE_START,
  TYPE_BLOOM_FLICKER_RESOLVE_START,
} from "../src/core/sequenceTypeConnection.ts";
import { transitionCutsFromWeights } from "../src/core/sequenceRhythm.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

if (connectionUsesFlicker("soft") || connectionUsesBloom("soft")) fail("SOFT must be exclusive");
if (!connectionUsesFlicker("flicker") || connectionUsesBloom("flicker")) fail("FLICKER is flicker-only");
if (connectionUsesFlicker("bloom") || !connectionUsesBloom("bloom")) fail("BLOOM is bloom-only");
if (!connectionUsesFlicker("bloom-flicker") || !connectionUsesBloom("bloom-flicker")) fail("combined uses both");

const flickerResolve = sequenceTypeConnectionDraw(sequenceTypeEnvelope(0.9, 3), "flicker", 360);
const softResolve = sequenceTypeDraw(sequenceTypeEnvelope(0.9, 3), "connected", 360, "soft-crop");
if (flickerResolve.cropT !== 0 || flickerResolve.cropB !== 0) fail("FLICKER must not crop-resolve");
if (flickerResolve.opacity !== 1) fail("FLICKER outgoing type stays present for the shared cut");
if (!(softResolve.cropT > 0.2)) fail("SOFT baseline must still crop-resolve");

const flickerArrive = sequenceTypeConnectionDraw(sequenceTypeEnvelope(0.05, 3), "flicker", 360);
if (flickerArrive.cropB !== 0 || flickerArrive.opacity !== 1) fail("FLICKER arrival is a hold, not a crop");

const hold = typeBloomPresence(0.4, "bloom");
if (hold.stage !== "hold" || hold.presence !== 1) fail("Type Bloom HOLD must be fully clean");
if (typeBloomPresence(TYPE_BLOOM_ARRIVE_END - 0.01, "bloom").stage !== "arrive") fail("Type Bloom arrive window");
if (typeBloomPresence(TYPE_BLOOM_RESOLVE_START + 0.01, "bloom").stage !== "resolve") fail("Type Bloom resolve window");
if (typeBloomPresence(0.8, "bloom-flicker").stage !== "hold") fail("combined Type Bloom must still be holding at 0.80");
if (TYPE_BLOOM_FLICKER_RESOLVE_START <= TYPE_BLOOM_RESOLVE_START) fail("combined resolve must stay later so Flicker owns the cut");
if (TYPE_BLOOM_ARRIVE_END >= 0.18) fail("Type Bloom should settle before image 0.18");

const internal = transitionCutsFromWeights([1, 1, 1, 1]);
if (internal.map((n) => n.toFixed(2)).join(",") !== "0.25,0.50,0.75") fail("equal flicker cuts stay 1/n");
const punch = [0, ...transitionCutsFromWeights([1, 1, 1, 6])];
if (punch[0] !== 0) fail("eval wrap cut is 0");
if (Math.abs(punch[3] - 1 / 3) > 1e-9) fail("weighted internal cuts must stay cumulative");
const wrapDist = Math.min(Math.abs(0.995 - 0), 1 - Math.abs(0.995 - 0));
if (wrapDist > 0.01) fail("wrap distance must be circular");

const half = 0.12 / 12 / 2;
if (sequenceTypeCopyIndex(0, 4, 0.25 - half * 0.2, 0.25, 1, "early", half) !== 1) {
  fail("EARLY must swap before the cut");
}
if (sequenceTypeCopyIndex(1, 4, 0.25 + half * 0.2, 0.25, 1, "late", half) !== 0) {
  fail("LATE must keep the outgoing copy after the cut");
}
if (sequenceTypeCopyIndex(1, 4, 0.25 + half * 0.2, 0.25, 1, "centre", half) !== 1) {
  fail("CENTRE must swap at the cut");
}

if (failures.length) {
  console.error("SEQUENCE UNITY FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("SEQUENCE UNITY PASS");
