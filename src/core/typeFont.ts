export const SWITZER_FAMILY = "Switzer";

let loadPromise: Promise<boolean> | null = null;
let loaded = false;

export function switzerReady(): boolean {
  return loaded;
}

export function loadSwitzer(): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const face = new FontFace(SWITZER_FAMILY, 'url("/fonts/Switzer-Variable.woff2") format("woff2"), url("/fonts/Switzer-Variable.ttf") format("truetype")', {
        weight: "100 900",
        style: "normal",
        display: "block",
      });
      const ok = await face.load();
      document.fonts.add(ok);
      await document.fonts.load(`500 48px "${SWITZER_FAMILY}"`);
      loaded = document.fonts.check(`500 48px "${SWITZER_FAMILY}"`);
      return loaded;
    } catch {
      loaded = false;
      return false;
    }
  })();
  return loadPromise;
}

export function switzerFont(weight: number, sizePx: number): string {
  const w = Math.round(Math.min(900, Math.max(100, weight)));
  const s = Math.max(1, sizePx);
  return `${w} ${s}px "${SWITZER_FAMILY}"`;
}
