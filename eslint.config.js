import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist/**', 'dist-mockup/**', '.codex-temp/**', '.claude/**', 'docs/**', 'legacy/**', 'src-tauri/target/**', 'src-tauri/gen/**', 'src-tauri/plugins/**/android/.tauri/**', 'src-tauri/plugins/**/android/build/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'no-irregular-whitespace': ['error', {
        skipComments: true,
        skipStrings: true,
        skipTemplates: true,
        skipJSXText: true,
        skipRegExps: true,
      }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: js.configs.recommended.rules,
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: { globals: globals.node },
  },
]
