import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import prettier from "eslint-config-prettier";
import { FORBIDDEN_APIS, FORBIDDEN_RE } from "./scripts/never-sign.mjs";

// WalletLens never signs or sends: any of these APIs in app code is a lint error.
const neverSign = {
  files: ["server/src/**/*.ts", "client/src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...["Identifier", "Literal", "TemplateElement"].map((node) => ({
        selector:
          node === "Identifier"
            ? `Identifier[name=${FORBIDDEN_RE}]`
            : node === "Literal"
              ? `Literal[value=${FORBIDDEN_RE}]`
              : `TemplateElement[value.raw=${FORBIDDEN_RE}]`,
        message: "WalletLens is read-only: signing/sending wallet APIs are forbidden.",
      })),
    ],
    "no-restricted-imports": [
      "error",
      { paths: [{ name: "viem/accounts", message: "No key material in WalletLens." }], patterns: [] },
    ],
  },
};
void FORBIDDEN_APIS;

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  { files: ["server/**/*.ts"], languageOptions: { globals: globals.node } },
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  neverSign,
  prettier,
);
