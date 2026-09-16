/**
 * Sequence Type composition — authored STATIC SIGNATURE pairing.
 *
 * Identity datum (STATIC SIGNATURE): MC
 * Content datum (Sequence INHERIT):  BC
 *
 * INHERIT means "use the authored composition's Type datum".
 * For the current STATIC SIGNATURE composition that datum is BC.
 * It is not a global synonym for BC, not a copy of the Global Type
 * anchor, and not collision avoidance.
 *
 * Manual TL…BR bypass this resolver.
 * Signature On/Off does not rewrite the Type datum.
 * Global Type does not use this resolver.
 */

import type { TypeAnchor } from "./typeState";
import type { SequenceTypeAnchor } from "./typeState";

export const SEQUENCE_TYPE_COMPOSITION_ID = "static-signature" as const;

/** STATIC SIGNATURE identity datum. Not a Type control. */
export const SEQUENCE_IDENTITY_DATUM: TypeAnchor = "mc";

/** Sequence Type content datum for the current identity composition. */
export const SEQUENCE_CONTENT_DATUM: TypeAnchor = "bc";

export function resolveSequenceTypePosition(raw: SequenceTypeAnchor | undefined): TypeAnchor {
  if (raw && raw !== "inherit") return raw;
  return SEQUENCE_CONTENT_DATUM;
}
