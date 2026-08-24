export type ImageLoaded = (img: CanvasImageSource, w: number, h: number) => void;

/** Wires drag/drop + click-to-browse file loading onto `zone`, calling
 * `onLoad` with a decoded image and its natural pixel size. */
export function wireImageInput(zone: HTMLElement, onLoad: ImageLoaded): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  zone.appendChild(input);

  let lastObjectUrl: string | null = null;

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onLoad(img, img.naturalWidth, img.naturalHeight);
      if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = url;
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) loadFile(file);
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
    if (file) loadFile(file);
  });
}
