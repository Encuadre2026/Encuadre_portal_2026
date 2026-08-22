// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettierConfig from 'eslint-config-prettier';

/**
 * Configuración de ESLint.
 *
 * Se usa `defineConfig` de `eslint/config` en vez de `tseslint.config()`, que
 * está deprecado desde typescript-eslint 8.60 y salía como aviso en cada
 * `astro check`.
 *
 * Lo importante de este archivo es que ahora incluye los `.astro`. Antes
 * `npm run lint` solo miraba `.ts`, así que las sesenta líneas de TypeScript
 * que viven dentro del `<script>` de `mi-registro.astro` —incluida la
 * validación del token, que `SECURITY.md` documenta como control de
 * seguridad— no las revisaba nadie. `astro check` les mira los tipos, pero
 * los tipos no son las reglas.
 */
export default defineConfig([
  globalIgnores(['dist/', '.astro/', 'node_modules/']),

  eslint.configs.recommended,
  tseslint.configs.recommended,
  astro.configs['flat/recommended'],
  prettierConfig,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  {
    // Los scripts de compilación corren en Node, no en el navegador: sin esto
    // el linter no conoce `process` ni `console`.
    files: ['scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: { globals: globals.nodeBuiltin },
  },
]);
