// =============================================================================
// Shared ESLint base for the TaskSync monorepo.
//
// Design rules:
//   1. This file is FRAMEWORK-AGNOSTIC. It only ships rules that apply equally
//      to Node (NestJS) and browser (React) TypeScript code.
//
//   2. Each workspace's local `eslint.config.*` imports the named exports below
//      and composes them with framework-specific plugins (react-hooks for the
//      frontend, type-aware Nest rules for the backend).
//
//   3. Plugins are NOT instantiated here. That would force the repo root to
//      depend on every plugin used by every workspace and turn the root into
//      a maintenance burden. The base only ships rule *values*, which are
//      pure data and have zero install footprint.
//
// Senior rationale:
//   The base is intentionally small. Every rule below is one a senior reviewer
//   would flag in a PR anyway — encoding them as lint rules just shifts the
//   feedback loop from "after review" to "while typing". Subjective rules
//   (line length, ternary nesting style, etc.) are left to Prettier or to the
//   project-local config so this file never causes inter-team bike-shedding.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Universal code-quality rules
//    Plain ESLint rules that apply to any JavaScript or TypeScript codebase.
// -----------------------------------------------------------------------------
export const baseCodeQualityRules = {
  // === Bug-class errors — never want these in production code ===

  // Triple-equals always, except when comparing to `null` (the standard idiom
  // for "null OR undefined"). Loose equality is a footgun.
  eqeqeq: ['error', 'always', { null: 'ignore' }],

  // `var` has function scope and hoisting bugs. Use `let`/`const`.
  'no-var': 'error',

  // Anything that isn't reassigned should be `const` — communicates intent.
  'prefer-const': ['error', { destructuring: 'all' }],

  // Always `throw new Error(msg)`, never `throw "msg"`. Bare strings have no
  // stack trace and break `instanceof Error` checks downstream.
  'no-throw-literal': 'error',

  // The classic "string-as-code" sinks — never legitimate in app code.
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',

  // `return await x` is redundant inside an async function (the runtime
  // unwraps for you) AND it can swallow stack frames in some engines.
  'no-return-await': 'error',

  // === Style / intent — warnings, not errors ===

  // `console.log` is fine in tests and CLIs but should never ship in app code.
  // `warn`/`error` are allowed because they're how legitimate diagnostics work.
  'no-console': ['warn', { allow: ['warn', 'error'] }],

  // Reassigning a parameter mutates the caller's binding in surprising ways.
  // Mutating a property of an object param is allowed (`{ props: false }`)
  // because that's a common, intentional pattern.
  'no-param-reassign': ['warn', { props: false }],

  // Nested ternaries are usually a sign that the expression should be a
  // function or an `if`. Warn so you notice; don't error so you can override.
  'no-nested-ternary': 'warn',
  'no-unneeded-ternary': 'warn',

  // === Readability — easy to fix, big payoff ===

  // Always use braces, even for one-line `if`s. Prevents the Apple `goto fail`
  // class of bug and makes diffs cleaner when adding a second statement.
  curly: ['error', 'all'],

  // `{ foo }` instead of `{ foo: foo }`. Less noise, same meaning.
  'object-shorthand': ['error', 'always'],

  // Template literals over `'a' + b + 'c'`. Easier to read, no implicit coercion.
  'prefer-template': 'error',

  // `arr.map((x) => x)` over `arr.map(function (x) { return x; })`.
  'prefer-arrow-callback': 'error',
};

// -----------------------------------------------------------------------------
// 2. TypeScript-specific rules
//    Require @typescript-eslint to be installed and registered in the
//    consuming project's local config.
// -----------------------------------------------------------------------------
export const baseTypeScriptRules = {
  // `any` defeats the type system. Warn (not error) so legitimate uses can
  // be marked with an eslint-disable comment that also documents WHY.
  '@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true }],

  // Unused variables are dead code. Underscore prefix is the universal escape
  // hatch for "I have to declare it but I'm intentionally not using it"
  // (e.g. ignored callback params, ignored destructured fields).
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
    },
  ],

  // Force `import type { Foo }` for type-only imports. Smaller emitted bundles
  // and a clear signal to readers that the import has no runtime side effect.
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],

  // Non-null assertions (`x!`) silently bypass the type checker. Warn so they
  // surface in review; allow them with a disable comment when truly justified.
  '@typescript-eslint/no-non-null-assertion': 'warn',

  // `// @ts-ignore` is opaque and never expires. `// @ts-expect-error` is
  // self-deleting (lint error if the underlying issue gets fixed) AND we
  // require a description so the reader knows the trade-off.
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 10,
    },
  ],
};

// -----------------------------------------------------------------------------
// 3. Universal ignore patterns
// -----------------------------------------------------------------------------
export const baseIgnores = [
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/node_modules/**',
  '**/*.min.js',
  '**/*.d.ts',
];
