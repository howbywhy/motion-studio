/**
 * Authored sequence state — media, duration, and Sequence Type travel together.
 *
 * Arrays may stay separate. Every structural move goes through these helpers
 * so media / weights / copies / Type composition cannot drift.
 */

import type { SequenceTypeAnchor, SequenceTypeSizeMode } from "./typeState";

export function reorderAttached<T>(values: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= values.length || to >= values.length) {
    return values.slice();
  }
  const next = values.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return values.slice();
  next.splice(to, 0, item);
  return next;
}

export function reverseAttached<T>(values: readonly T[]): T[] {
  return values.slice().reverse();
}

export function reorderAuthoredSequence<T>(
  media: readonly T[],
  weights: readonly number[],
  copies: readonly string[],
  from: number,
  to: number,
  sizeModes: readonly SequenceTypeSizeMode[] = [],
  sizes: readonly number[] = [],
  anchors: readonly SequenceTypeAnchor[] = [],
): {
  media: T[];
  weights: number[];
  copies: string[];
  sizeModes: SequenceTypeSizeMode[];
  sizes: number[];
  anchors: SequenceTypeAnchor[];
} {
  return {
    media: reorderAttached(media, from, to),
    weights: reorderAttached(weights, from, to),
    copies: reorderAttached(copies, from, to),
    sizeModes: reorderAttached(sizeModes, from, to),
    sizes: reorderAttached(sizes, from, to),
    anchors: reorderAttached(anchors, from, to),
  };
}

export function reverseAuthoredSequence<T>(
  media: readonly T[],
  weights: readonly number[],
  copies: readonly string[],
  sizeModes: readonly SequenceTypeSizeMode[] = [],
  sizes: readonly number[] = [],
  anchors: readonly SequenceTypeAnchor[] = [],
): {
  media: T[];
  weights: number[];
  copies: string[];
  sizeModes: SequenceTypeSizeMode[];
  sizes: number[];
  anchors: SequenceTypeAnchor[];
} {
  return {
    media: reverseAttached(media),
    weights: reverseAttached(weights),
    copies: reverseAttached(copies),
    sizeModes: reverseAttached(sizeModes),
    sizes: reverseAttached(sizes),
    anchors: reverseAttached(anchors),
  };
}
