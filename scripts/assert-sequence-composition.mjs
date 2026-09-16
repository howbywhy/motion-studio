#!/usr/bin/env node
import { productSequenceTypeApplies } from "../src/core/sequenceTypeTiming.ts";
import {
  resolveSequenceTypePosition,
  SEQUENCE_CONTENT_DATUM,
  SEQUENCE_IDENTITY_DATUM,
  SEQUENCE_TYPE_COMPOSITION_ID,
} from "../src/core/sequenceTypeComposition.ts";
import { sequenceCopyPatch, sequenceModePatch } from "../src/core/typeAuthoring.ts";
import { SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE } from "../src/core/sequenceRhythm.ts";
import { applySequenceCopyChange, applySequenceFieldChange } from "../src/core/sequenceTypeTiming.ts";
import { applySequenceWeightChange } from "../src/core/sequenceRhythm.ts";
import { reorderAuthoredSequence, reverseAuthoredSequence } from "../src/core/sequenceState.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

if (SEQUENCE_TYPE_COMPOSITION_ID !== "static-signature") fail("composition id must name STATIC SIGNATURE");
if (SEQUENCE_IDENTITY_DATUM !== "mc") fail("identity datum must stay MC");
if (SEQUENCE_CONTENT_DATUM !== "bc") fail("content datum must be BC");

if (resolveSequenceTypePosition("inherit") !== "bc") fail("Sequence INHERIT must resolve through composition datum BC");
if (resolveSequenceTypePosition(undefined) !== "bc") fail("missing Sequence position must inherit the composition datum");
if (resolveSequenceTypePosition("inherit") === "mc") {
  fail("INHERIT must not be hardcoded as a synonym for the Global headline MC");
}

const manuals = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
for (const raw of manuals) {
  if (resolveSequenceTypePosition(raw) !== raw) fail(`manual ${raw} must bypass the composition datum`);
}
if (resolveSequenceTypePosition("tl") !== "tl") fail("Editorial hold this TL must stay TL");
if (resolveSequenceTypePosition("tc") !== "tc") fail("Fast CUT TC must stay TC");
if (resolveSequenceTypePosition("bl") !== "bl") fail("Fast GO BL must stay BL");
if (resolveSequenceTypePosition("bc") !== "bc") fail("Quiet soft light BC must stay BC");

const seqOn = sequenceModePatch("sequence");
if (seqOn.typeMode !== "sequence" || seqOn.enabled !== true) fail("choosing Sequence must enable Typography");
const globalPatch = sequenceModePatch("global");
if (globalPatch.typeMode !== "global" || globalPatch.enabled !== undefined) {
  fail("choosing Global must not auto-enable Typography");
}

const copySeq = sequenceCopyPatch("sequence", 0, "STAY");
if (copySeq.enabled !== true || copySeq.sequenceCopyAt.text !== "STAY") {
  fail("Sequence copy authoring must enable Typography");
}
const copyGlobal = sequenceCopyPatch("global", 0, "STAY");
if (copyGlobal.enabled !== undefined) fail("Global copy authoring must not enable Typography");

const off = { enabled: false, typeMode: "sequence" };
if (productSequenceTypeApplies(off, "loop", { untreated: false, pairCount: 2 })) {
  fail("explicit Typography Off must hide Sequence Type");
}
const globalOn = { enabled: true, typeMode: "global" };
if (productSequenceTypeApplies(globalOn, "loop", { untreated: false, pairCount: 2 })) {
  fail("Global Type must not take the Sequence Type path");
}
if (sequenceModePatch("global").enabled !== undefined) fail("Global patch must leave master enabled alone");

if (!SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE) fail("all rhythm-strip durations must stay visible");

const media = ["A", "B", "C"];
const weights = [1, 3, 2];
const copies = ["Stay", "She turns", "Reserved"];
const sizeModes = ["auto", "manual", "auto"];
const sizes = [48, 36, 64];
const anchors = ["inherit", "tl", "br"];
const moved = reorderAuthoredSequence(media, weights, copies, 1, 0, sizeModes, sizes, anchors);
if (moved.anchors.join(",") !== "tl,inherit,br") fail("reorder must keep composition inherit with the state");
if (resolveSequenceTypePosition(moved.anchors[1]) !== "bc") fail("reordered inherit still resolves to composition datum");
if (resolveSequenceTypePosition(moved.anchors[0]) !== "tl") fail("reordered manual must stay exact");

const replacedA = applySequenceFieldChange(moved.anchors, 3, { kind: "resize" }, "inherit");
if (replacedA.join(",") !== moved.anchors.join(",")) fail("replace must preserve composition position");

const addedPos = applySequenceFieldChange(["tl"], 2, { kind: "add" }, "inherit");
if (addedPos.join(",") !== "tl,inherit") fail("add must default INHERIT composition position");
if (applySequenceCopyChange(["Stay"], 2, { kind: "add" }).join("|") !== "Stay|") fail("add must pad blank copy");
if (applySequenceFieldChange(["auto"], 2, { kind: "add" }, "auto").join(",") !== "auto,auto") fail("add must pad AUTO");
if (applySequenceWeightChange([3], 2, { kind: "add" }).length !== 2) fail("add must pad duration");

const removedA = applySequenceFieldChange(["inherit", "tl", "br"], 2, { kind: "remove", index: 1 }, "inherit");
if (removedA.join(",") !== "inherit,br") fail("remove must drop the whole authored position");

const rev = reverseAuthoredSequence(["1", "2", "3"], [1, 3, 2], ["a", "b", "c"], ["auto", "manual", "auto"], [40, 50, 60], ["inherit", "tl", "br"]);
if (rev.anchors.join(",") !== "br,tl,inherit") fail("reverse must reverse composition positions");

const oldAnchors = ["inherit", "tl"];
if (resolveSequenceTypePosition(oldAnchors[0]) !== "bc") fail("old inherit must resolve through the new composition datum");
if (resolveSequenceTypePosition(oldAnchors[1]) !== "tl") fail("old manual must stay exact");
if (productSequenceTypeApplies({ enabled: false, typeMode: "sequence" }, "loop", { untreated: false, pairCount: 5 })) {
  fail("old saved Sequence + Off must stay hidden");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("assert-sequence-composition ok");
