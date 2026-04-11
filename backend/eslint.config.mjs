// =============================================================================
// Backend ESLint config (NestJS + Node + TypeScript)
//
// Composes the shared monorepo base with Node-specific globals AND enables
// TYPE-AWARE linting (slower, but catches a class of bugs that pure-syntax
// linting can't — e.g. floating promises, misused promises in conditionals).
//
// NOTE: This file is staged ahead of the actual NestJS scaffold (Phase 1.1 in
// PLAN.md). It will become live as soon as `backend/tsconfig.json` exists and
// `npm install` has been run inside `backend/`.
//
// Senior rationale: type-aware linting is too slow to enable on a large
// frontend (Vite SWC builds want sub-second feedback), but a backend service
// is the *exact* place where unhandled promises and misused awaits cause
// production incidents. Trade the lint-time cost for the runtime safety.
// =============================================================================

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import {
  baseCodeQualityRules,
  baseTypeScriptRules,
  baseIgnores,
} from '../eslint.config.base.mjs';

export default tseslint.config(
  // -------------------------------------------------------------------------
  // Ignore patterns — shared base + Nest build output
  // -------------------------------------------------------------------------
  { ignores: [...baseIgnores, 'dist'] },

  // -------------------------------------------------------------------------
  // Main config block — applies to every TS file in the backend
  // -------------------------------------------------------------------------
  {
    // `recommendedTypeChecked` enables the rules that need a TS Program — they
    // catch real bugs that the syntax-only ruleset can't see.
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.ts'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        // Project-aware parsing — enables the type-checked rules below.
        // `tsconfigRootDir` makes the path resolution independent of CWD,
        // so the lint command works the same from any directory.
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // 1. Universal rules from the shared monorepo base
      ...baseCodeQualityRules,
      ...baseTypeScriptRules,

      // 2. NestJS-specific accommodations
      //    Nest uses constructor injection heavily, which means lots of
      //    "empty constructor with only param properties". That's idiomatic,
      //    not a code smell.
      '@typescript-eslint/no-useless-constructor': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],

      // 3. Type-aware safety rules — only available with `parserOptions.project`
      //    These are the highest-value rules in this whole file.

      // Unhandled promise rejections crash Node silently. This catches them
      // at lint time before they ever ship.
      '@typescript-eslint/no-floating-promises': 'error',

      // Catches `if (asyncFn())` and `array.forEach(async () => ...)` style
      // mistakes where the promise is dropped on the floor.
      '@typescript-eslint/no-misused-promises': 'error',

      // `await x` where x isn't a Promise is almost always a bug.
      '@typescript-eslint/await-thenable': 'error',

      // Prefer `??` over `||` when the intent is "fall back on null/undefined"
      // — `||` also matches `0`, `''`, and `false`, which causes subtle bugs.
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // `obj?.foo?.bar` over `obj && obj.foo && obj.foo.bar`.
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // Force consistent use of `interface` vs `type` — interfaces compose
      // better with declaration merging which Nest decorators rely on.
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    },
  },

  // -------------------------------------------------------------------------
  // Test files — relax type-safety rules so test setup stays expressive
  // -------------------------------------------------------------------------
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-console': 'off',
    },
  },
);
