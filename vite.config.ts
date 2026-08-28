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
      },
    },
  },
});
