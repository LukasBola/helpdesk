import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'

export default tseslint.config(
  // --- Ignored paths ---
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.js'],
  },

  // --- Base JS rules ---
  js.configs.recommended,

  // --- Shared TS strict rules (client + server) ---
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'server/vitest.config.ts',
            'server/prisma/seed.ts',
            'server/prisma/e2e-fixtures.ts',
            'server/scripts/ai-try.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },

  // --- Server-specific (Node globals) ---
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // --- E2E: every assertion needs a description (second argument of expect) ---
  // It is shown in the step log, the HTML report and the error when the assertion fails.
  {
    files: ['e2e/{tests,api,pages,fixtures}/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='expect'][arguments.length<2]",
          message: "Describe the assertion: expect(value, 'what is checked')",
        },
        {
          selector:
            "CallExpression[callee.object.name='expect'][callee.property.name=/^(soft|poll)$/][arguments.length<2]",
          message: "Describe the assertion: expect.soft(value, 'what is checked')",
        },
        {
          // The options overload, e.g. expect.poll(fn, { timeout }), needs a message too.
          selector:
            "CallExpression:matches([callee.name='expect'], [callee.object.name='expect'][callee.property.name=/^(soft|poll)$/]) > ObjectExpression.arguments:nth-child(2):not(:has(> Property[key.name='message']))",
          message:
            "Describe the assertion: expect.poll(fn, { message: 'what is checked', timeout })",
        },
      ],
    },
  },

  // --- Client-specific (React + browser globals) ---
  {
    files: ['client/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: '18.3' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
)
