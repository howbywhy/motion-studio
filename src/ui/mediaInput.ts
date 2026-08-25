import { defaultTransform, detectMediaKind, type MediaAsset } from "../core/media";

  const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov";

export function loadMediaFile(
  file: File,
  videoHost: HTMLElement,
  onLoad: (asset: MediaAsset) => void,
  onError: (message: string) => void
): void {
  loadFile(file, videoHost, onLoad, onError);
}

function loadFile(
  file: File,
  videoHost: HTMLElement,
  onLoad: (asset: MediaAsset) => void,
  onError: (message: string) => void
): void {
  const kind = detectMediaKind(file);
  if (!kind) {
    onError(`Unsupported file type: ${file.name}`);
    return;
  }
  const objectUrl = URL.createObjectURL(file);

  if (kind === "image") {
    const img = new Image();
    img.onload = () => {
      onLoad({
        kind: "image",
        source: img,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        label: file.name,
        objectUrl,
        transform: defaultTransform(),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      onError(`Could not decode image: ${file.name}`);
    };
    img.src = objectUrl;
    return;
  }

  // Video: a single persistent <video> element decodes in a hidden host;
  // every render frame samples whatever frame it's on via drawImage.
  // Playback is owned by Renderer.play/pause — this loader must not call
  // play(), or a file loaded while paused would start moving on its own.
  // muted=true is the load-time autoplay-safe default. Renderer.syncAudio
  // unmutes the current audio owner after a user Play/Audio gesture.
  const video = document.createElement("video");
  video.muted = true;
  video.volume = 1;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = false;
  video.preload = "auto";
  videoHost.appendChild(video);

  const commit = (): void => {
    if (video.videoWidth < 1 || video.videoHeight < 1) return;
    onLoad({
      kind: "video",
      source: video,
      naturalW: video.videoWidth,
      naturalH: video.videoHeight,
      label: file.name,
      videoEl: video,
      objectUrl,
      transform: defaultTransform(),
    });
  };
  video.addEventListener("loadeddata", commit, { once: true });
  video.addEventListener(
    "error",
    () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
      onError(`Could not decode video: ${file.name} (this browser may not support this format)`);
    },
    { once: true }
  );
  video.src = objectUrl;
}

/** Wires `zone` as both a click-to-browse target and a drag/drop target
 * for a single media slot, accepting images and videos alike. */
export function wireMediaDropZone(
  zone: HTMLElement,
  videoHost: HTMLElement,
  onLoad: (asset: MediaAsset) => void,
  onError: (message: string) => void
): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPT;
  input.style.display = "none";
  zone.appendChild(input);

  zone.addEventListener("click", (e) => {
    if (zone.dataset.filePick === "off") return;
    const t = e.target as HTMLElement;
    if (t.closest(".seg-toggle, input, textarea, .graphic-slot-ui")) return;
    input.click();
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) loadFile(file, videoHost, onLoad, onError);
    input.value = "";
  });

  zone.addEventListener("dragover", (e) => {
    if (zone.dataset.filePick === "off") return;
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (zone.dataset.filePick === "off") return;
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file, videoHost, onLoad, onError);
  });
}
