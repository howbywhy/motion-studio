import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        typeStates: resolve(root, "eval/type-states.html"),
        bloomPulse: resolve(root, "eval/bloom-pulse.html"),
        transport: resolve(root, "eval/transport.html"),
        holdExport: resolve(root, "eval/hold-export.html"),
        resolveLimit: resolve(root, "eval/resolve-limit.html"),
        registrationGolden: resolve(root, "eval/registration-golden.html"),
        registrationRebase: resolve(root, "eval/registration-rebase.html"),
        subtitle: resolve(root, "eval/subtitle.html"),
        typeSheet: resolve(root, "eval/type-sheet.html"),
        transitionFlicker: resolve(root, "eval/transition-flicker.html"),
        mark: resolve(root, "eval/mark.html"),
        loopBloom: resolve(root, "eval/loop-bloom.html"),
        sequenceType: resolve(root, "eval/sequence-type.html"),
        sequenceRhythm: resolve(root, "eval/sequence-rhythm.html"),
        sequenceUnity: resolve(root, "eval/sequence-unity.html"),
        sequenceOwnership: resolve(root, "eval/sequence-ownership.html"),
        identityUnity: resolve(root, "eval/identity-unity.html"),
        typeBloomRender: resolve(root, "eval/type-bloom-render.html"),
        identityFinal: resolve(root, "eval/identity-final.html"),
        finalUnity: resolve(root, "eval/final-unity.html"),
        typeOccupancy: resolve(root, "eval/type-occupancy.html"),
        printTexture: resolve(root, "eval/print-texture.html"),
      },
    },
  },
});
