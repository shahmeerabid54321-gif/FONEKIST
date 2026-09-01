import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * eslint-config-next 16 exports flat config arrays directly, so no FlatCompat shim is
 * needed (and the shim in fact fails against ESLint 9 with a circular-structure error).
 */
export default [
  { ignores: [".next/**", "node_modules/**", "tests/e2e/**", "next-env.d.ts", "src/lib/pk/**"] },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // Structured JSON logging writes to stdout deliberately; `lib/log.ts` is the only
      // place that should, and it carries an inline disable.
      "no-console": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
];
