#!/usr/bin/env node
import { reorderAuthoredSequence, reverseAuthoredSequence, reorderAttached } from "../src/core/sequenceState.ts";
import { applySequenceCopyChange, applySequenceFieldChange } from "../src/core/sequenceTypeTiming.ts";
import { applySequenceWeightChange } from "../src/core/sequenceRhythm.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

const media = ["A", "B", "C"];
const weights = [1, 3, 2];
const copies = ["Stay", "She turns", "Reserved"];
const sizeModes = ["auto", "manual", "auto"];
const sizes = [48, 36, 64];
const anchors = ["inherit", "tl", "br"];
const moved = reorderAuthoredSequence(media, weights, copies, 1, 0, sizeModes, sizes, anchors);
if (moved.media.join(",") !== "B,A,C") fail("reorder must move media");
if (moved.weights.join(",") !== "3,1,2") fail("reorder must move duration with the state");
if (moved.copies.join("|") !== "She turns|Stay|Reserved") fail("reorder must move Sequence Type with the state");
if (moved.sizeModes.join(",") !== "manual,auto,auto") fail("reorder must move Type Size mode");
if (moved.sizes.join(",") !== "36,48,64") fail("reorder must move Type Size value");
if (moved.anchors.join(",") !== "tl,inherit,br") fail("reorder must move position");

const replaced = applySequenceCopyChange(moved.copies, 3, { kind: "resize" });
const replacedW = applySequenceWeightChange(moved.weights, 3, { kind: "resize" });
const replacedM = applySequenceFieldChange(moved.sizeModes, 3, { kind: "resize" }, "auto");
const replacedS = applySequenceFieldChange(moved.sizes, 3, { kind: "resize" }, 48);
const replacedA = applySequenceFieldChange(moved.anchors, 3, { kind: "resize" }, "inherit");
if (replaced.join("|") !== moved.copies.join("|")) fail("replace must keep the slot copy");
if (replacedW.join(",") !== moved.weights.join(",")) fail("replace must keep the slot duration");
if (replacedM.join(",") !== moved.sizeModes.join(",")) fail("replace must keep Type Size mode");
if (replacedS.join(",") !== moved.sizes.join(",")) fail("replace must keep Type Size value");
if (replacedA.join(",") !== moved.anchors.join(",")) fail("replace must keep position");

const again = reorderAuthoredSequence(moved.media, moved.weights, moved.copies, 2, 1, moved.sizeModes, moved.sizes, moved.anchors);
if (again.media.join(",") !== "B,C,A") fail("second reorder media");
if (again.weights.join(",") !== "3,2,1") fail("second reorder duration");
if (again.copies.join("|") !== "She turns|Reserved|Stay") fail("second reorder copy");
if (again.sizes.join(",") !== "36,64,48") fail("second reorder size");

const rev = reverseAuthoredSequence(["1", "2", "3"], [1, 3, 2], ["a", "b", "c"], ["auto", "manual", "auto"], [40, 50, 60], ["inherit", "tl", "br"]);
if (rev.media.join(",") !== "3,2,1") fail("reverse media");
if (rev.weights.join(",") !== "2,3,1") fail("reverse duration");
if (rev.copies.join("|") !== "c|b|a") fail("reverse copy");
if (rev.sizeModes.join(",") !== "auto,manual,auto") fail("reverse size mode");
if (rev.sizes.join(",") !== "60,50,40") fail("reverse size");
if (rev.anchors.join(",") !== "br,tl,inherit") fail("reverse position");

if (reorderAttached(["x", "y"], 0, 0).join(",") !== "x,y") fail("no-op reorder");

const added = applySequenceFieldChange(["auto"], 2, { kind: "add" }, "auto");
const addedSize = applySequenceFieldChange([36], 2, { kind: "add" }, 48);
const addedPos = applySequenceFieldChange(["tl"], 2, { kind: "add" }, "inherit");
if (added.join(",") !== "auto,auto") fail("add must pad AUTO");
if (addedSize.join(",") !== "36,48") fail("add must pad preferred size");
if (addedPos.join(",") !== "tl,inherit") fail("add must pad INHERIT");

const addedCopy = applySequenceCopyChange(["Stay"], 2, { kind: "add" });
const addedWeight = applySequenceWeightChange([3], 2, { kind: "add" });
if (addedCopy.join("|") !== "Stay|") fail("add must pad blank Sequence Type");
if (addedWeight.length !== 2) fail("add must pad a duration");

const removed = applySequenceCopyChange(["Stay", "Listen", "Room"], 2, { kind: "remove", index: 1 });
const removedW = applySequenceWeightChange([1, 3, 2], 2, { kind: "remove", index: 1 });
const removedM = applySequenceFieldChange(["auto", "manual", "auto"], 2, { kind: "remove", index: 1 }, "auto");
const removedS = applySequenceFieldChange([48, 32, 62], 2, { kind: "remove", index: 1 }, 48);
const removedA = applySequenceFieldChange(["inherit", "tl", "br"], 2, { kind: "remove", index: 1 }, "inherit");
if (removed.join("|") !== "Stay|Room") fail("remove must drop the whole state copy");
if (removedW.join(",") !== "1,2") fail("remove must drop the whole state duration");
if (removedM.join(",") !== "auto,auto") fail("remove must drop Type Size mode");
if (removedS.join(",") !== "48,62") fail("remove must drop Type Size value");
if (removedA.join(",") !== "inherit,br") fail("remove must drop position");

if (failures.length) {
  console.error("SEQUENCE STATE FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("SEQUENCE STATE PASS");
