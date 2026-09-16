#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  incomingTypeBFormation,
  incomingTypeBPresent,
  PRODUCT_SEQUENCE_TYPE_FORMATION,
  PRODUCT_SEQUENCE_TYPE_INCOMING,
  secondsUntilCut,
  TYPE_INCOMING_ANTICIPATION_SEC,
  TYPE_INCOMING_SHORT_END,
  typeIncomingTimeline,
} from "../src/core/sequenceTypeIncoming.ts";
import { BLOOM_OWNERSHIP_THRESHOLD } from "../src/core/sequenceOwnership.ts";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const textureSrc = readFileSync(join(root, "src/core/identityTexture.ts"), "utf8");
if (!textureSrc.includes('IDENTITY_TEXTURE_COMMIT = "e9e49f92ff0590ab3ba780bd64ba019a6be0b005"')) {
  fail("Texture must restore the e9e49f9 plate engine");
}
if (!textureSrc.includes("IDENTITY_TEXTURE_PERSISTENT = 0.1")) fail("persistent amount is 0.1");
if (!textureSrc.includes("IDENTITY_TEXTURE_REACTIVE = 0.4")) fail("reactive amount is 0.4");
if (!textureSrc.includes("return true")) fail("product Texture is ON unless eval binds OFF");
if (BLOOM_OWNERSHIP_THRESHOLD !== 0.5) fail("ownership latch stays 50%");
const markSrc = readFileSync(join(root, "src/core/markState.ts"), "utf8");
if (!markSrc.includes("MARK_SCALE_DEFAULT = 40")) fail("STATIC SIGNATURE scale default stays 40");
const flickerSrc = readFileSync(join(root, "src/core/transitionFlicker.ts"), "utf8");
if (!flickerSrc.includes("SEQUENCE_HANDOFF_ENERGY = 0.11")) fail("handoff energy stays 0.11");
if (!flickerSrc.includes("TRANSITION_FLICKER_ENERGY = 0.28")) fail("flicker energy stays 0.28");

if (incomingTypeBPresent({
  strategy: "current",
  ownedB: true,
  masterPhase: 0.49,
  cut: 0.5,
  loopSeconds: 12,
})) fail("CURRENT must not introduce Type B before the cut");

if (!incomingTypeBPresent({
  strategy: "ownership",
  ownedB: true,
  masterPhase: 0.4,
  cut: 0.5,
  loopSeconds: 12,
})) fail("OWNERSHIP must present Type B at the semantic flip");

if (incomingTypeBPresent({
  strategy: "ownership",
  ownedB: false,
  masterPhase: 0.4,
  cut: 0.5,
  loopSeconds: 12,
})) fail("OWNERSHIP must wait for owned B");

if (Math.abs(TYPE_INCOMING_ANTICIPATION_SEC - 2 / 30) > 1e-9) fail("anticipation is 2 frames at 30fps");
if (secondsUntilCut(0.5 - (2 / 30) / 12, 0.5, 12) > TYPE_INCOMING_ANTICIPATION_SEC + 1e-6) {
  fail("secondsUntilCut should reach the anticipation window");
}
if (!incomingTypeBPresent({
  strategy: "anticipated",
  ownedB: false,
  masterPhase: 0.5 - (2 / 30) / 12,
  cut: 0.5,
  loopSeconds: 12,
})) fail("ANTICIPATED must present Type B 2 frames before the peak");
if (incomingTypeBPresent({
  strategy: "anticipated",
  ownedB: false,
  masterPhase: 0.5 - (4 / 30) / 12,
  cut: 0.5,
  loopSeconds: 12,
})) fail("ANTICIPATED must not jump a whole beat early");
if (incomingTypeBPresent({
  strategy: "anticipated",
  ownedB: false,
  masterPhase: 0.5 + (1 / 30) / 12,
  cut: 0.5,
  loopSeconds: 12,
})) fail("ANTICIPATED must not keep Type B after the cut");

if (!incomingTypeBPresent({
  strategy: "anticipated",
  ownedB: false,
  masterPhase: 1 - (1 / 30) / 12,
  cut: 0,
  loopSeconds: 12,
})) fail("ANTICIPATED must include the hostile wrap cut");

for (const slot of [1.2, 2.0, 2.8, 4.0]) {
  const current = typeIncomingTimeline({
    strategy: "current",
    slotSeconds: slot,
    ownershipFlipLocal: 0.58,
    typeAGoneLocal: 0.72,
  });
  const own = typeIncomingTimeline({
    strategy: "ownership",
    slotSeconds: slot,
    ownershipFlipLocal: 0.58,
    typeAGoneLocal: 0.72,
  });
  if (!(current.emptyGapFrames > 0)) fail(`${slot}s CURRENT must report the empty-thought gap`);
  if (own.emptyGapFrames > 0) fail(`${slot}s OWNERSHIP must close the empty-thought gap`);
  if (own.typeBFirstLocal !== 0.58) fail(`${slot}s OWNERSHIP B appears at the flip`);
  if (current.typeBFirstLocal !== 1) fail(`${slot}s CURRENT B waits for the cut`);
}

function mustContain(rel, needle) {
  const text = readFileSync(join(root, rel), "utf8");
  if (!text.includes(needle)) fail(`${rel} must contain ${needle}`);
}
function mustNotContain(rel, needle) {
  const text = readFileSync(join(root, rel), "utf8");
  if (text.includes(needle)) fail(`${rel} must not contain ${needle}`);
}

mustContain("src/core/renderer.ts", "prepareIdentityTexture");
mustContain("src/core/renderer.ts", "paintIdentityTexture");
mustContain("src/core/renderer.ts", "this.composedLayer");
mustContain("src/core/renderer.ts", "if (mapping.untreated)");
mustContain("src/core/sequenceType.ts", "destination-out");
mustContain("src/core/sequenceType.ts", "formation.present && hasB");
mustContain("src/core/sequenceType.ts", "SEQUENCE_TYPE_REVEAL_THRESHOLD = 0.42");
mustContain("src/core/sequenceTypeIncoming.ts", 'PRODUCT_SEQUENCE_TYPE_INCOMING: TypeIncomingStrategy = "ownership"');
mustNotContain("src/core/globalRegistration.ts", "prepareFieldPrintInk");
mustNotContain("src/core/globalRegistration.ts", "paintFieldPersistent");
mustNotContain("src/core/globalRegistration.ts", "identityTexture");
mustNotContain("src/core/identityTexture.ts", "paintGoldenMasterRegistration");
mustNotContain("src/core/renderer.ts", "prepareFieldPrintInk");

const rendererSrc = readFileSync(join(root, "src/core/renderer.ts"), "utf8");
const prepAt = rendererSrc.indexOf("prepareIdentityTexture(");
const paintAt = rendererSrc.indexOf("paintIdentityTexture(");
const typeCallAt = rendererSrc.indexOf("if (!this.typeBeforeRegistration) paintType()");
const regAt = rendererSrc.indexOf("paintGoldenMasterRegistration(");
if (!(prepAt > 0 && paintAt > prepAt && typeCallAt > paintAt && regAt > paintAt)) {
  fail("Texture must prepare from the composed frame and paint before Type");
}
if (!rendererSrc.includes("this.finalizeOutput(") || rendererSrc.split("this.finalizeOutput(").length < 3) {
  fail("hold/untreated and Bloom frames must share finalizeOutput Texture");
}

for (const pair of [0, 1, 2, 3, 4]) {
  void pair;
  if (!incomingTypeBPresent({
    strategy: "ownership",
    ownedB: true,
    masterPhase: 0.4,
    cut: 0.5,
    loopSeconds: 12,
  })) fail("incoming Type B is ownership, not pair-local variant");
  if (incomingTypeBPresent({
    strategy: "ownership",
    ownedB: false,
    masterPhase: 0.4,
    cut: 0.5,
    loopSeconds: 12,
  })) fail("incoming Type B must stay off while A owns");
}
if (PRODUCT_SEQUENCE_TYPE_INCOMING !== "ownership") {
  fail("product incoming must lock OWNERSHIP after the empty-thought gap closed");
}
if (TYPE_INCOMING_SHORT_END !== 0.4) fail("SHORT finishes on Envelope B resolve 0.40");

const beforeOwn = incomingTypeBFormation({ treatment: "short", ownedB: false, resolve: 0.9 });
if (beforeOwn.present) fail("formation must not start before ownership");
const atOwn = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.12 });
if (!atOwn.present || atOwn.full || atOwn.amount > 0.25) fail("SHORT must begin incomplete at ownership");
const currentAtOwn = incomingTypeBFormation({ treatment: "current", ownedB: true, resolve: 0 });
if (!currentAtOwn.full) fail("CURRENT must still be complete at ownership");
const shortMid = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.28 });
const materialMid = incomingTypeBFormation({ treatment: "material", ownedB: true, resolve: 0.28 });
if (!(shortMid.amount > materialMid.amount)) fail("SHORT must resolve faster than MATERIAL on the same Envelope B");
const beforeFlick = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.4 });
if (!beforeFlick.full) fail("SHORT must be complete at Envelope B resolve 0.40, before Flicker");
const lateHold = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.9 });
if (!lateHold.full) fail("long slots must stay complete once Envelope B has settled");
const coverMustNotDrive = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.12 });
if (coverMustNotDrive.full) fail("semantic cover must not complete SHORT");
const short07 = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.12 });
const short40 = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.12 });
if (short07.amount !== short40.amount) fail("uneven Rhythm must not change the Envelope B formation relationship");
for (const variant of [0, 1, 2, 3]) {
  void variant;
  const a = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.2 });
  const b = incomingTypeBFormation({ treatment: "short", ownedB: true, resolve: 0.2 });
  if (a.amount !== b.amount) fail("visible Bloom variant must not change semantic SHORT grammar");
}
if (PRODUCT_SEQUENCE_TYPE_FORMATION !== "short") {
  fail("product incoming formation must lock SHORT after the ownership pop");
}
mustContain("src/core/sequenceType.ts", "destination-in");
mustContain("src/core/sequenceType.ts", "buildSafeTypeMatte");
mustContain("src/core/sequenceType.ts", "destination-out");
mustNotContain("src/core/sequenceTypeIncoming.ts", "TYPE_INCOMING_FULL_BEFORE_CUT_SEC");
mustNotContain("src/core/sequenceTypeIncoming.ts", "cover > 0.68");
mustContain("src/core/bloomPulse.ts", "inert");
mustContain("src/core/sequenceType.ts", "formation.present && hasB");

const incomingSrc = readFileSync(join(root, "src/core/sequenceTypeIncoming.ts"), "utf8");
if (incomingSrc.includes("secondsUntilCut") && incomingSrc.includes("let amount")) {
  fail("SHORT amount must not use a second wall-clock timeline");
}

if (failures.length) {
  console.error("assert-identity-texture FAILED");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("assert-identity-texture PASS");
