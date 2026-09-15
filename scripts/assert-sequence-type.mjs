#!/usr/bin/env node
import {
  sequenceTypeApplies,
  sequenceTypeCopyForPair,
  sequenceTypeEnvelope,
  sequenceTypeHasCopy,
  sequenceTypeReadability,
  sequenceTypeWindows,
  sequenceTypeDraw,
  applySequenceCopyChange,
  applySequenceFieldChange,
  clampSequenceCopies,
  clampTypeSystemMode,
  productSequenceTypeApplies,
} from "../src/core/sequenceTypeTiming.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

const a = sequenceTypeEnvelope(0.4, 3);
const b = sequenceTypeEnvelope(0.4, 3);
if (JSON.stringify(a) !== JSON.stringify(b)) fail("envelope is not deterministic");
if (sequenceTypeEnvelope(0.08, 3).stage !== "arrive") fail("0.08 should arrive");
if (sequenceTypeEnvelope(0.4, 3).stage !== "hold") fail("0.40 should hold");
if (sequenceTypeEnvelope(0.86, 3).stage !== "resolve") fail("0.86 should resolve");
if (sequenceTypeEnvelope(0.72, 3).stage !== "resolve") fail("resolve must start at Envelope B hold 0.72");

if (sequenceTypeCopyForPair(["A", "B", "C", "D"], 0) !== "A") fail("slot 0");
if (sequenceTypeCopyForPair(["A", "B", "C", "D"], 3) !== "D") fail("slot 3");
if (sequenceTypeCopyForPair(["A", "B", "C", "D"], 2) !== sequenceTypeCopyForPair(["A", "B", "C", "D"], 2)) {
  fail("copy assignment must be deterministic");
}
if (sequenceTypeHasCopy(["Hello", ""], 1)) fail("blank slot must be silent");
if (!sequenceTypeHasCopy(["Hello", ""], 0)) fail("filled slot must be active");

if (sequenceTypeApplies("pingpong", { untreated: false, aIndex: 0, bIndex: 1, localPhase: 0.4, pairIndex: 0, pairCount: 2 })) {
  fail("Pulse must not apply Sequence Type");
}
if (!sequenceTypeApplies("loop", { untreated: false, aIndex: 0, bIndex: 1, localPhase: 0.4, pairIndex: 0, pairCount: 2 })) {
  fail("Loop must apply Sequence Type");
}

if (sequenceTypeCopyForPair(["A", "B"], 0) !== sequenceTypeCopyForPair(["A", "B"], 0)) fail("duration-independent copy");
const w12 = sequenceTypeWindows(12 / 4);
const w8 = sequenceTypeWindows(8 / 4);
if (sequenceTypeCopyForPair(["x", "y", "z", "w"], 2) !== "z") fail("slot copy does not depend on duration");
if (w12.arriveEnd === w8.arriveEnd && w8.compressed) fail("shorter events should be allowed to compress windows");

if (sequenceTypeEnvelope(0.995, 3).presence >= 0.08) fail("outgoing presence must be near 0 at pair end");
if (sequenceTypeEnvelope(0.005, 3).presence >= 0.08) fail("incoming presence must be near 0 at pair start");

const r12_4 = sequenceTypeReadability(12, 4);
if (r12_4.warn) fail("12s / 4 pairs should remain readable");
if (r12_4.holdSeconds < 1.05) fail("HOLD must stay readable at 12s / 4");
const r8_5 = sequenceTypeReadability(8, 5);
if (!r8_5.warn) fail("8s / 5 pairs should be the warn threshold");

const resolveEnv = sequenceTypeEnvelope(0.86, 3);
const holdEnv = sequenceTypeEnvelope(0.4, 3);
const arriveEnv = sequenceTypeEnvelope(0.08, 3);
const rSilent = JSON.stringify(sequenceTypeDraw(resolveEnv, "connected", 360, "near-silent"));
const rSoft = JSON.stringify(sequenceTypeDraw(resolveEnv, "connected", 360, "soft-crop"));
const rCurrent = JSON.stringify(sequenceTypeDraw(resolveEnv, "connected", 360, "current"));
if (rSilent !== rSoft || rSoft !== rCurrent) fail("CONNECTED resolve must be identical across arrivals");
const hSilent = JSON.stringify(sequenceTypeDraw(holdEnv, "connected", 360, "near-silent"));
const hCurrent = JSON.stringify(sequenceTypeDraw(holdEnv, "connected", 360, "current"));
if (hSilent !== hCurrent) fail("CONNECTED hold must be identical across arrivals");
const startEnv = sequenceTypeEnvelope(0, 3);
const aSilent = sequenceTypeDraw(arriveEnv, "connected", 360, "near-silent");
const aCurrent = sequenceTypeDraw(arriveEnv, "connected", 360, "current");
const aStart = sequenceTypeDraw(startEnv, "connected", 360, "current");
if (aSilent.cropB >= aCurrent.cropB) fail("NEAR-SILENT arrival crop must be shallower than CURRENT");
if (aStart.cropB < 0.99) fail("CURRENT arrival must keep the full crop reference at pair start");

if (clampTypeSystemMode(undefined) !== "global") fail("old state must default to Global");
if (clampTypeSystemMode(null) !== "global") fail("null typeMode must default to Global");
if (clampTypeSystemMode("sequence") !== "sequence") fail("sequence typeMode must persist");
if (clampSequenceCopies(undefined).length !== 0) fail("old state must not invent Sequence copies");
const keptCopies = clampSequenceCopies(["ONE", "TWO"]);
const afterSwitch = {
  typeMode: clampTypeSystemMode("sequence"),
  globalText: "LEGACY",
  sequenceCopies: keptCopies,
};
const backGlobal = {
  typeMode: clampTypeSystemMode("global"),
  globalText: afterSwitch.globalText,
  sequenceCopies: afterSwitch.sequenceCopies.slice(),
};
if (afterSwitch.globalText !== "LEGACY") fail("Global copy must survive Sequence switch");
if (afterSwitch.sequenceCopies.join("|") !== "ONE|TWO") fail("Sequence copies must survive Sequence switch");
if (backGlobal.typeMode !== "global" || backGlobal.globalText !== "LEGACY") fail("mode switch must restore Global");
if (backGlobal.sequenceCopies.join("|") !== "ONE|TWO") fail("Sequence copies must survive return to Global");

const added = applySequenceCopyChange(["A", "B"], 3, { kind: "add" });
if (added.join("|") !== "A|B|") fail("add source must append a blank slot");
const removed = applySequenceCopyChange(["A", "B", "C"], 2, { kind: "remove", index: 1 });
if (removed.join("|") !== "A|C") fail("remove source must drop that slot copy");
const reordered = applySequenceCopyChange(["A", "B", "C"], 3, { kind: "resize" });
if (reordered.join("|") !== "A|B|C") fail("resize must leave copies in place");
const replaced = applySequenceCopyChange(["A", "B"], 2, { kind: "resize" });
if (replaced.join("|") !== "A|B") fail("replace source must keep slot copy");
const grown = applySequenceCopyChange(["KEEP"], 4);
if (grown.join("|") !== "KEEP|||") fail("growing the sequence must keep existing copy");
const grownModes = applySequenceFieldChange(["manual"], 3, { kind: "add" }, "auto");
const grownPos = applySequenceFieldChange(["tl"], 3, { kind: "add" }, "inherit");
if (grownModes.join(",") !== "manual,auto,auto") fail("add must pad AUTO size mode");
if (grownPos.join(",") !== "tl,inherit,inherit") fail("add must pad INHERIT position");
if (applySequenceFieldChange([], 2, { kind: "resize" }, "auto").join(",") !== "auto,auto") {
  fail("old composition must resolve AUTO");
}

const mapping = { untreated: false, pairCount: 4 };
const seqState = { enabled: true, typeMode: "sequence", sequenceCopies: ["A", "", "C", "D"] };
if (!productSequenceTypeApplies(seqState, "loop", mapping)) fail("Loop Sequence Type must apply when enabled");
if (productSequenceTypeApplies(seqState, "pingpong", mapping)) fail("Pulse must isolate Sequence Type");
if (productSequenceTypeApplies({ ...seqState, typeMode: "global" }, "loop", mapping)) {
  fail("Global mode must not use Sequence Type");
}
if (productSequenceTypeApplies({ ...seqState, enabled: false }, "loop", mapping)) {
  fail("disabled Type must not use Sequence Type");
}
if (sequenceTypeHasCopy(seqState.sequenceCopies, 1)) fail("blank Sequence slot must stay silent");
if (sequenceTypeCopyForPair(seqState.sequenceCopies, 0) !== "A") fail("pair-local copy must follow the slot");
if (sequenceTypeCopyForPair(seqState.sequenceCopies, 4) !== "A") fail("wrap must reuse slot 01 copy");

if (failures.length) {
  console.error("SEQUENCE TYPE FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("12s/4", r12_4);
console.log("8s/5", r8_5);
console.log("SEQUENCE TYPE PASS");
