import { detectMediaKind, type MediaAsset } from "../core/media";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov";

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
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      onError(`Could not decode image: ${file.name}`);
    };
    img.src = objectUrl;
    return;
  }

  // Video: a single persistent <video> element decodes and plays
  // continuously in a hidden host; every render frame just samples
  // whatever frame it's currently on via drawImage. Nothing here ever
  // reloads or seeks it, so playback is never reset from the render loop.
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  videoHost.appendChild(video);

  video.addEventListener(
    "loadedmetadata",
    () => {
      onLoad({
        kind: "video",
        source: video,
        naturalW: video.videoWidth,
        naturalH: video.videoHeight,
        label: file.name,
        videoEl: video,
        objectUrl,
      });
      void video.play().catch(() => {
        /* Autoplay can be rejected by the browser; the element still
         * decodes frames once the user interacts with the page again. */
      });
    },
    { once: true }
  );
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

  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) loadFile(file, videoHost, onLoad, onError);
    input.value = "";
  });

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file, videoHost, onLoad, onError);
  });
}
