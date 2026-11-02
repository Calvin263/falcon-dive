import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tests/**/*.js', '*.js'], languageOptions: { globals: globals.node } },
  { files: ['tests/browser/**/*.js'], languageOptions: { globals: globals.browser } },
  {
    files: ['**/*.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];