import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.svelte-kit/**",
      "**/coverage/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  eslintConfigPrettier,
  ...svelte.configs.prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly"
      }
    }
  },
  {
    // Plain-JS scripts served directly to the browser (e.g. app.html's
    // pre-hydration theme script), outside the TS/Svelte toolchain that
    // already gets browser globals via the overrides below.
    files: ["client/static/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly"
      }
    }
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".svelte"]
      }
    },
    rules: {
      // Browser globals (window, fetch, document) are not modeled by
      // no-undef; TypeScript inside <script lang="ts"> already catches
      // real typos, same rationale as the eslint-recommended override
      // that disables no-undef for **/*.ts.
      "no-undef": "off"
    }
  }
);
