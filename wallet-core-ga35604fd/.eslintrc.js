module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "preact",
  ],
  rules: {
    "no-constant-condition": ["error", { "checkLoops": false }],
    "prefer-const": ["warn", { destructuring: "all" }],
    "no-prototype-builtins": "off",
    "@typescript-eslint/camelcase": "off",
    "@typescript-eslint/ban-ts-ignore": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
    "@typescript-eslint/explicit-function-return-type": [
      "warn",
      { allowExpressions: true },
    ],
    "@typescript-eslint/no-use-before-define": [
      "error",
      { functions: false, classes: false },
    ],
  },
};
