# Plan 00: Code Quality Tooling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure Prettier, ESLint (strict TypeScript), Husky, lint-staged, and tsc --noEmit CI check at the monorepo root before any application code is written.

**Architecture:** Single root-level config for Prettier and ESLint — both client and server inherit from it. Husky installs git hooks automatically via `prepare` script. lint-staged runs only on staged files so pre-commit is fast. tsc --noEmit runs in CI as a separate job.

**Tech Stack:** Prettier 3, ESLint 9 (flat config), @typescript-eslint/strict, eslint-plugin-react-hooks, Husky 9, lint-staged

**Prerequisite:** None — this is the first plan to execute.

---

## File Map

```
helpdesk/
├── .prettierrc                  # Prettier config
├── .prettierignore
├── eslint.config.js             # ESLint flat config (shared root)
├── .husky/
│   └── pre-commit               # runs lint-staged
├── package.json                 # adds prepare + lint-staged config (modify)
└── .github/workflows/
    └── ci.yml                   # lint + typecheck + test pipeline
```

---

### Task 1: Prettier

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Install Prettier**

Run: `pnpm add -D -w prettier`

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "avoid"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
node_modules
dist
build
.next
coverage

# Playwright output
playwright-report
test-results

# Prisma — auto-generated migrations and client
prisma/migrations/
prisma/generated/

# Fixtures — recorded API responses, do not reformat
**/__fixtures__/

# promptfoo eval datasets
evals/datasets/

# Husky shell scripts
.husky/

# Env files
.env*

# Lockfile
pnpm-lock.yaml
```

- [ ] **Step 4: Format entire repo to establish baseline**

Run: `npx prettier --write .`

- [ ] **Step 5: Commit**

```bash
git add .prettierrc .prettierignore
git commit -m "chore: add prettier config"
```

---

### Task 2: ESLint (strict)

**Files:**
- Create: `eslint.config.js`

- [ ] **Step 1: Install ESLint and plugins**

Run:
```bash
pnpm add -D -w \
  eslint \
  @eslint/js \
  typescript-eslint \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-simple-import-sort \
  globals
```

- [ ] **Step 2: Create `eslint.config.js`**

```javascript
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
        projectService: true,
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
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
)
```

- [ ] **Step 3: Add lint script to root `package.json`**

```json
"lint": "eslint . --max-warnings 0",
"lint:fix": "eslint . --fix",
"typecheck": "pnpm --filter server tsc --noEmit && pnpm --filter client tsc --noEmit"
```

- [ ] **Step 4: Run lint to verify config is valid**

Run: `pnpm lint`
Expected: exits 0 (or shows only real errors to fix, not config errors).

- [ ] **Step 5: Fix any lint errors surfaced**

Run: `pnpm lint:fix`
Then manually fix remaining errors reported by `pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js package.json
git commit -m "chore: add eslint strict config with typescript-eslint and react-hooks"
```

---

### Task 3: Husky + lint-staged

**Files:**
- Modify: `package.json`
- Create: `.husky/pre-commit`

- [ ] **Step 1: Install Husky and lint-staged**

Run: `pnpm add -D -w husky lint-staged`

- [ ] **Step 2: Initialise Husky**

Run: `npx husky init`

Expected: `.husky/pre-commit` file created.

- [ ] **Step 3: Replace `.husky/pre-commit` content**

```bash
#!/bin/sh
npx lint-staged
pnpm typecheck
```

- [ ] **Step 4: Add lint-staged config and prepare script to root `package.json`**

```json
"scripts": {
  "prepare": "husky"
},
"lint-staged": {
  "*.{ts,tsx}": [
    "prettier --write",
    "eslint --max-warnings 0"
  ],
  "*.{json,md,yaml,yml,css}": [
    "prettier --write"
  ]
}
```

- [ ] **Step 5: Verify pre-commit hook fires**

Stage a file with a formatting issue, attempt to commit:

```bash
# introduce a formatting issue
echo "const x=1" >> server/src/db.ts
git add server/src/db.ts
git commit -m "test hook"
```

Expected: commit is **blocked** with a lint/format error. Then revert:

```bash
git restore server/src/db.ts
```

- [ ] **Step 6: Commit**

```bash
git add .husky/ package.json
git commit -m "chore: husky pre-commit hook with lint-staged"
```

---

### Task 4: CI pipeline (lint + typecheck + test)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    name: Lint & format check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm lint
      - run: npx prettier --check .

  typecheck:
    name: TypeScript check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm typecheck

  test:
    name: Unit & integration tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - name: Run server tests
        run: pnpm --filter server test
      - name: Run client tests
        run: pnpm --filter client test
```

- [ ] **Step 2: Verify workflow file is valid YAML**

Run: `npx js-yaml .github/workflows/ci.yml`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck, and test pipeline"
```
