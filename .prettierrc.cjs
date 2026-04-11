// =============================================================================
// Prettier — single config for the entire TaskSync monorepo.
//
// Why .cjs and not .json?
//   JSON disallows comments. We want every style choice to carry rationale so
//   future contributors don't second-guess "why 100 cols?" or "why semicolons?".
//
// How is it picked up by frontend/ and backend/?
//   Prettier walks from the file being formatted UPWARD looking for a config.
//   Both workspaces inherit this file with zero per-project setup.
// =============================================================================

/** @type {import("prettier").Config} */
module.exports = {
  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  // 100 cols: wide enough for typed signatures and JSX, narrow enough for
  // side-by-side diffs on a 13" laptop. Matches our .editorconfig.
  printWidth: 100,

  // 2-space indent — JS/TS ecosystem default.
  tabWidth: 2,
  useTabs: false,

  // -------------------------------------------------------------------------
  // Punctuation
  // -------------------------------------------------------------------------

  // Always emit semicolons. Avoids ASI footguns when refactoring (e.g. a line
  // beginning with `[` or `(` after a return statement).
  semi: true,

  // Single quotes for JS/TS code, double quotes for JSX (mirrors HTML).
  singleQuote: true,
  jsxSingleQuote: false,

  // Quote object keys only when required by the grammar.
  quoteProps: 'as-needed',

  // Trailing commas EVERYWHERE — required for clean diffs when adding params
  // or array items, and supported in all modern targets (>= ES2017).
  trailingComma: 'all',

  // -------------------------------------------------------------------------
  // Whitespace inside literals
  // -------------------------------------------------------------------------

  // `{ foo: 1 }` not `{foo: 1}`.
  bracketSpacing: true,

  // Closing `>` of a multi-line JSX element goes on its own line — easier to
  // scan attribute lists and to diff prop changes.
  bracketSameLine: false,

  // Always parenthesize arrow params: `(x) => x`. Makes it trivial to add a
  // type annotation or a second parameter without rewriting punctuation.
  arrowParens: 'always',

  // -------------------------------------------------------------------------
  // Cross-platform safety
  // -------------------------------------------------------------------------

  // Force LF — kills CRLF/LF churn on mixed Win/macOS/Linux teams.
  endOfLine: 'lf',

  // Format embedded code blocks (Markdown code fences, template literals with
  // styled-components tags, etc.) using the appropriate parser.
  embeddedLanguageFormatting: 'auto',
};
