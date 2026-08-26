import { defaultTransform, detectMediaKind, isAnimatedWebP, type MediaAsset } from "../core/media";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

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
  if (file.size > MAX_UPLOAD_BYTES) {
    onError(`File is too large to load in the browser (${file.name}). Try a smaller export.`);
    return;
  }
  const kind = detectMediaKind(file);
  if (!kind) {
    onError(`Unsupported file type: ${file.name}`);
    return;
  }

  if (kind === "image") {
    const loadStill = (): void => {
      const objectUrl = URL.createObjectURL(file);
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
    };
    const looksWebp = file.type.toLowerCase().includes("webp") || /\.webp$/i.test(file.name);
    if (looksWebp) {
      void file.arrayBuffer().then(
        (buf) => {
          if (isAnimatedWebP(buf)) {
            onError(
              `Animated WebP is not supported as a timed source (${file.name}). Use a still WebP, MP4, or WebM.`,
            );
            return;
          }
          loadStill();
        },
        () => onError(`Could not read image: ${file.name}`),
      );
      return;
    }
    loadStill();
    return;
  }

  const objectUrl = URL.createObjectURL(file);
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

  let committed = false;
  const commit = (): void => {
    if (committed) return;
    if (video.videoWidth < 1 || video.videoHeight < 1) return;
    committed = true;
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
  video.addEventListener("loadeddata", commit);
  video.addEventListener("loadedmetadata", commit);
  video.addEventListener(
    "error",
    () => {
      if (committed) return;
      URL.revokeObjectURL(objectUrl);
      video.remove();
      onError(`Could not decode video: ${file.name} (this browser may not support this format)`);
    },
    { once: true }
  );
  video.src = objectUrl;
}
