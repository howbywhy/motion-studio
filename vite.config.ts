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
      },
    },
  },
});
