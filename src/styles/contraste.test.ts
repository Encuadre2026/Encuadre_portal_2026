import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contraste de los textos del portal.
 *
 * Existe por tres colores que llevaban tiempo escritos a pelo y que nadie podía
 * ver que estuvieran mal: `.upload-nota` en #555 sobre el fondo elevado de la
 * tarjeta daba 2,33:1, y `.gafete-taller-label` en #999 sobre blanco daba
 * 2,85:1, cuando la WCAG AA pide 4,5:1 para texto pequeño. Los tres miden entre
 * 8 y 11 px, así que no hay excepción de «texto grande» que valga.
 *
 * Un contraste insuficiente no se nota en la pantalla propia: se nota en otra
 * pantalla, con más luz, o con otros ojos. Por eso lo comprueba una prueba y no
 * la revisión, igual que `verificar-salida.mjs` comprueba lo que solo se ve en
 * `dist/`.
 *
 * Al añadir un texto nuevo, añade aquí su par de colores.
 */

const css = readFileSync(join(import.meta.dirname, 'portal.css'), 'utf8');

/**
 * Las reglas del archivo, por selector.
 *
 * Se queda con la primera aparición a propósito: la de `@media print` es para
 * papel, donde el fondo es blanco pase lo que pase y estas cuentas no aplican.
 */
const reglas = new Map<string, string>();
for (const regla of css.matchAll(/(?:^|\n)([^{}\n]+?)\s*\{([^}]*)\}/g)) {
  const selector = regla[1].trim();
  if (!reglas.has(selector)) reglas.set(selector, regla[2]);
}

/** Los tokens de `:root`, para resolver `var(--loquesea)`. */
const tokens = new Map(
  [...(reglas.get(':root') ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

/** El valor declarado de una propiedad, con `var()` ya resuelto. */
function valorDe([selector, propiedad]: readonly [string, string]): string {
  const cuerpo = reglas.get(selector);
  if (cuerpo === undefined) throw new Error(`portal.css no declara la regla ${selector}`);

  for (const declaracion of cuerpo.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const dosPuntos = declaracion.indexOf(':');
    if (dosPuntos === -1) continue;
    if (declaracion.slice(0, dosPuntos).trim() !== propiedad) continue;

    const valor = declaracion.slice(dosPuntos + 1).trim();
    const variable = valor.match(/^var\((--[\w-]+)\)$/);
    return variable ? (tokens.get(variable[1]) ?? valor) : valor;
  }
  throw new Error(`${selector} no declara ${propiedad}`);
}

/**
 * Luminancia relativa de un color hexadecimal, según la fórmula de la WCAG.
 *
 * Acepta las dos formas porque el archivo usa las dos. Cuando solo entendía
 * `#rrggbb`, un `#999` no fallaba con su razón de contraste: daba `NaN`, que
 * también hace fallar la prueba pero sin decir por cuánto se pasa.
 */
function luminancia(hex: string): number {
  const largo = hex.replace('#', '');
  const rgb = largo.length === 3 ? [...largo].map((c) => c + c).join('') : largo;
  if (!/^[0-9a-f]{6}$/i.test(rgb)) throw new Error(`No sé leer el color ${hex}`);

  const canales = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(colorA: string, colorB: string): number {
  const [claro, oscuro] = [luminancia(colorA), luminancia(colorB)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const TEXTO_PEQUENO = 4.5;

/** Cada texto con el fondo sobre el que se pinta, y por qué importa. */
const PARES = [
  { texto: ['.upload-nota', 'color'], fondo: ['.card', 'background'], nota: 'qué hacer si el comprobante no sube' },
  { texto: ['.upload-hint', 'color'], fondo: ['.card', 'background'], nota: 'el formato y el límite de tamaño' },
  { texto: ['.dato-valor', 'color'], fondo: ['.card', 'background'], nota: 'los datos del registro' },
  { texto: ['.countdown-expired', 'color'], fondo: ['.card', 'background'], nota: 'el aviso de plazo vencido' },
  { texto: ['.gafete-fecha', 'color'], fondo: ['.gafete-top', 'background'], nota: 'la fecha del evento en el gafete' },
  { texto: ['.gafete-id-label', 'color'], fondo: ['.gafete-top', 'background'], nota: 'la etiqueta del ID del gafete' },
  {
    texto: ['.gafete-taller-label', 'color'],
    fondo: ['.gafete-body', 'background'],
    nota: 'la etiqueta del taller en el gafete',
  },
] as const;

describe('contraste de los textos pequeños (WCAG AA pide 4,5:1)', () => {
  for (const { texto, fondo, nota } of PARES) {
    it(`${texto[0]} — ${nota}`, () => {
      const razon = contraste(valorDe(texto), valorDe(fondo));
      expect(Number(razon.toFixed(2))).toBeGreaterThanOrEqual(TEXTO_PEQUENO);
    });
  }
});
