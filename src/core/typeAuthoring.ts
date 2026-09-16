/**
 * Sequence authoring interactions. Not saved-state migration.
 * clampTypeState must not auto-enable Typography.
 */

import type { TypeSystemMode } from "./typeState";

export function sequenceModePatch(mode: TypeSystemMode): {
  typeMode: TypeSystemMode;
  enabled?: true;
} {
  if (mode === "sequence") return { typeMode: "sequence", enabled: true };
  return { typeMode: mode };
}

export function sequenceCopyPatch(
  typeMode: TypeSystemMode,
  index: number,
  text: string,
): {
  sequenceCopyAt: { index: number; text: string };
  enabled?: true;
} {
  const sequenceCopyAt = { index, text };
  if (typeMode === "sequence") return { sequenceCopyAt, enabled: true };
  return { sequenceCopyAt };
}
