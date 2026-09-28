import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import configPrettier from 'eslint-config-prettier';
import pluginDepend from 'eslint-plugin-depend';
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import pluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

type Config = ReturnType<typeof defineConfig>;

const config: Config = defineConfig(
  {
    // .claude/worktrees/ and .worktrees/ hold other checkouts of this repo.
    ignores: ['.claude/**', '.worktrees/**', 'dist/**'],
  },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  pluginUnicorn.configs.unopinionated,
  // Before the house rules rather than after them: it turns `curly` off, and
  // `curly: 'error'` (the "all" option) does not conflict with Prettier.
  configPrettier,

  {
    plugins: {
      depend: pluginDepend,
      'simple-import-sort': pluginSimpleImportSort,
    },

    extends: ['depend/flat/recommended'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    rules: {
      // https://typescript-eslint.io/rules/array-type
      '@typescript-eslint/array-type': ['error', { default: 'generic', readonly: 'generic' }],

      // https://typescript-eslint.io/rules/no-unused-vars
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // https://eslint.org/docs/latest/rules/curly
      curly: 'error',

      // https://eslint.org/docs/latest/rules/prefer-template
      'prefer-template': 'error',

      // https://github.com/lydell/eslint-plugin-simple-import-sort
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
);

export default config;
