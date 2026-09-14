import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [".next/**", ".next-e2e/**", "node_modules/**", "next-env.d.ts", "test-results/**", "playwright-report/**", "lib/api.gen.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "plugin:jsx-a11y/recommended"),
];

export default config;
