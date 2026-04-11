// =============================================================================
// Frontend ESLint config (React + Vite + TypeScript)
//
// This file does TWO things and nothing more:
//   1. Pull in the shared monorepo base (`../eslint.config.base.mjs`) for all
//      language-level rules — code quality, TS hygiene, ignore patterns.
//   2. Layer React-specific rules on top: hooks correctness and Vite Fast-Refresh.
//
// Senior rationale: keeping framework-specific config as a thin shim over a
// shared base means the backend and frontend can never silently disagree on
// "what counts as bad code". Bumping a rule once in the base updates both.
// =============================================================================

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

import {
  baseCodeQualityRules,
  baseTypeScriptRules,
  baseIgnores,
} from '../eslint.config.base.mjs';

export default tseslint.config(
  // -------------------------------------------------------------------------
  // Ignore patterns — shared base + Vite build output
  // -------------------------------------------------------------------------
  { ignores: [...baseIgnores, 'dist', 'public'] },

  // -------------------------------------------------------------------------
  // Main config block — applies to all source TS/TSX files
  // -------------------------------------------------------------------------
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },

    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },

    rules: {
      // 1. Universal rules from the shared monorepo base
      ...baseCodeQualityRules,
      ...baseTypeScriptRules,

      // 2. React Hooks correctness — non-negotiable in any React codebase.
      //    Catches missing deps, conditional hook calls, etc.
      ...reactHooks.configs.recommended.rules,

      // 3. Vite Fast-Refresh hint: a module that exports a component must
      //    export ONLY components for HMR to work cleanly. The "constant
      //    export" exception covers `export const PROFILE = ...` style files.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Test files — relax a few rules to keep tests expressive
  // -------------------------------------------------------------------------
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      'src/test/**/*.{ts,tsx}',
    ],
    rules: {
      // Tests legitimately use `any` for mocks and stubs.
      '@typescript-eslint/no-explicit-any': 'off',
      // Tests legitimately log diagnostic info.
      'no-console': 'off',
    },
  },
);
