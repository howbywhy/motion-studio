import type { MediaAsset, MediaTransform } from "./media";
import { asGraphic } from "../sources/graphicAsset";
import { DEFAULT_FIELD, type FieldParams } from "../sources/field";
import { loadMediaFile } from "../ui/mediaInput";
import type { SavedSource, SavedStateInput } from "./savedStates";

/** A downloadable, reopenable snapshot of the whole working session --
 * every param, the global toggles, Type/Mark/End Behaviour, and the
 * source media itself (embedded as bytes, not referenced), so the file is
 * self-contained: it can be reopened on another machine, or after the tab
 * that made it is long gone, with nothing to re-attach.
 *
 * This is a different thing from Saved States (core/savedStates.ts), which
 * stays in-memory for the session and references live MediaAsset objects
 * directly -- cheap, but gone on reload. A project file trades that
 * cheapness for portability: media is fetched back from its blob URL and
 * base64-embedded on save, and rebuilt into fresh MediaAsset objects
 * (via the same loadMediaFile() used for a manual upload) on open. */
export const PROJECT_FILE_VERSION = 1;

export type ProjectSourceData =
  | { id: string; label: string; transform: MediaTransform; kind: "image" | "video"; mimeType: string; fileName: string; dataBase64: string }
  | { id: string; label: string; transform: MediaTransform; kind: "graphic"; field: FieldParams }
  | { id: string; label: string; transform: MediaTransform; kind: "placeholder" };

export interface ProjectFileData {
  formatVersion: number;
  savedAt: number;
  state: Omit<SavedStateInput, "sources" | "name">;
  sources: ProjectSourceData[];
}

// btoa/atob work on binary strings, not raw bytes, and String.fromCharCode
// can't take an arbitrarily large arg list in one call (stack-limited) --
// chunking is the standard safe pattern for base64-encoding a real file.
const CHUNK = 0x8000;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sourceToProjectData(src: SavedSource): Promise<ProjectSourceData> {
  const { id, asset, transform, label } = src;
  if (asset.kind === "graphic") {
    const driver = asGraphic(asset);
    return { id, label, transform, kind: "graphic", field: driver ? { ...driver.getField() } : { ...DEFAULT_FIELD } };
  }
  if (asset.placeholder || !asset.objectUrl) {
    // The built-in demo texture, not a real uploaded file -- nothing to embed.
    return { id, label, transform, kind: "placeholder" };
  }
  // Read the ORIGINAL bytes back from the blob URL the file was loaded
  // through, rather than re-encoding via canvas -- exact fidelity, and the
  // only way that works for video at all.
  const res = await fetch(asset.objectUrl);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  return {
    id,
    label,
    transform,
    kind: asset.kind === "video" ? "video" : "image",
    mimeType: blob.type || (asset.kind === "video" ? "video/mp4" : "image/png"),
    fileName: label,
    dataBase64: arrayBufferToBase64(buf),
  };
}

export async function buildProjectFile(state: SavedStateInput): Promise<ProjectFileData> {
  const { sources, name, ...rest } = state;
  void name;
  const projectSources = await Promise.all(sources.map(sourceToProjectData));
  return {
    formatVersion: PROJECT_FILE_VERSION,
    savedAt: Date.now(),
    state: rest,
    sources: projectSources,
  };
}

export function serializeProjectFile(file: ProjectFileData): string {
  return JSON.stringify(file);
}

export function parseProjectFile(text: string): ProjectFileData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as ProjectFileData).formatVersion !== "number" ||
    !Array.isArray((data as ProjectFileData).sources) ||
    !(data as ProjectFileData).state
  ) {
    throw new Error("Not a recognised Motion Studio project file.");
  }
  return data as ProjectFileData;
}

export interface ResolvedProjectSource {
  id: string;
  label: string;
  transform: MediaTransform;
  asset: MediaAsset;
}

/** Rebuilds one source's live MediaAsset from its portable record. Image
 * and video go back through loadMediaFile() -- the exact same decode path
 * a manual upload takes -- so behavior never diverges between "loaded a
 * file" and "reopened a project containing that file". */
export async function resolveProjectSource(
  src: ProjectSourceData,
  videoHost: HTMLElement,
  makeGraphic: (label: string, field: FieldParams) => MediaAsset,
  makePlaceholder: (label: string) => MediaAsset,
): Promise<ResolvedProjectSource> {
  if (src.kind === "graphic") {
    return { id: src.id, label: src.label, transform: src.transform, asset: makeGraphic(src.label, src.field) };
  }
  if (src.kind === "placeholder") {
    return { id: src.id, label: src.label, transform: src.transform, asset: makePlaceholder(src.label) };
  }
  const bytes = base64ToBytes(src.dataBase64);
  // Uint8Array's `buffer` is typed ArrayBufferLike (which also covers
  // SharedArrayBuffer), narrower than what BlobPart accepts -- this bytes
  // array is always backed by a plain ArrayBuffer (freshly allocated by
  // base64ToBytes), so the cast is safe.
  const file = new File([bytes as unknown as BlobPart], src.fileName || src.label, { type: src.mimeType });
  const asset = await new Promise<MediaAsset>((resolve, reject) => {
    loadMediaFile(
      file,
      videoHost,
      (loaded) => resolve(loaded),
      (message) => reject(new Error(message)),
    );
  });
  return { id: src.id, label: src.label, transform: src.transform, asset };
}
