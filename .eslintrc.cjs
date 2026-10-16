module.exports = {
  root: true,
  env: { es2022: true, node: true },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: [
    "dist",
    "node_modules",
    "test-results",
    "playwright-report",
    "coverage",
    "scripts",
    "*.config.ts",
    "*.config.js",
    "*.mjs",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "no-constant-condition": "off",
  },
  overrides: [
    {
      files: ["packages/client/**/*.ts", "packages/client/**/*.tsx", "e2e/**/*.ts"],
      env: { browser: true },
    },
    {
      files: ["**/*.test.ts", "e2e/**/*.ts"],
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
};
