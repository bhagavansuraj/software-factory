import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["enforcement/test/**/*.test.ts"], environment: "node" } });
