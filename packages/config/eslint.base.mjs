import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint config for the non-Next packages.
 *
 * Deliberately small: TypeScript's `strict` mode already carries most of the load, so this
 * covers the things the compiler does not — unused code, unsafe escapes, and console
 * output that should have gone through a structured logger.
 */
export default [
  { ignores: ["dist/**", "node_modules/**", "**/*.test.ts", "**/__tests__/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      "no-console": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],

      // `any` defeats the strict typing the TRD asks for; an explicit `unknown` plus a
      // narrowing check is always available instead.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
