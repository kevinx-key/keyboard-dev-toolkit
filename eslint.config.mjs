import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build artifacts — minified/binary files cause parsing errors
    "src-tauri/target/**",
    ".gitnexus/**",
  ]),
  // Custom rules
  {
    plugins: {
      local: {
        rules: {
          "no-empty-catch": {
            meta: {
              type: "suggestion",
              docs: { description: "Disallow empty catch blocks" },
              messages: { unexpected: "Empty catch block — log the error or handle it." },
            },
            create(context) {
              return {
                CatchClause(node) {
                  if (node.body.body.length === 0) {
                    context.report({ node, messageId: "unexpected" });
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: {
      "local/no-empty-catch": "error",
      // 代码库约定：_ 前缀 = 有意省略的参数/变量（stub 签名对齐等场景）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "Literal[value=/^#[0-9a-fA-F]{3,6}$/]", message: "Use CSS variables instead of inline color strings" },
      ],
    },
  },
  // Test file overrides: allow inline colors (they are expected test values)
  // — placed AFTER custom rules so they take precedence in flat config
  {
    files: ["tests/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
