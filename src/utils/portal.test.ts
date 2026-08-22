import { describe, it, expect } from 'vitest';
import { escapeHTML, formatFecha, normalizarPerfil } from './portal';

// ── escapeHTML ──────────────────────────────────────────────────
describe('escapeHTML', () => {
  it('escapa caracteres HTML peligrosos', () => {
    expect(escapeHTML('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapa ampersands', () => {
    expect(escapeHTML('A & B')).toBe('A &amp; B');
  });

  it('escapa comillas simples', () => {
    expect(escapeHTML("it's")).toBe('it&#39;s');
  });

  it('retorna cadena vacía para null y undefined', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  it('convierte números a cadena sin escapar', () => {
    expect(escapeHTML(42)).toBe('42');
  });

  it('no modifica texto seguro', () => {
    expect(escapeHTML('Hola Mundo 123')).toBe('Hola Mundo 123');
  });
});

// ── formatFecha ────────────────────────────────────────────────
describe('formatFecha', () => {
  it('formatea fecha ISO a español mexicano', () => {
    const resultado = formatFecha('2026-10-29T12:00:00Z');
    expect(resultado).toContain('29');
    expect(resultado.toLowerCase()).toContain('octubre');
    expect(resultado).toContain('2026');
  });

  it('retorna guión largo para undefined', () => {
    expect(formatFecha()).toBe('—');
  });

  it('retorna guión largo para cadena vacía', () => {
    expect(formatFecha('')).toBe('—');
  });

  it('maneja formato SQL con espacio en lugar de T', () => {
    const resultado = formatFecha('2026-10-29 12:00:00');
    expect(resultado).toContain('2026');
    expect(resultado.toLowerCase()).toContain('octubre');
  });

  it('respeta fechas que ya traen zona horaria', () => {
    const resultado = formatFecha('2026-05-15T08:00:00-06:00');
    expect(resultado).toContain('2026');
    expect(resultado.toLowerCase()).toContain('mayo');
  });
});

// ── normalizarPerfil ───────────────────────────────────────────
//
// Sustituye a `perfilColor`, que devolvía un hexadecimal. El color ahora vive
// solo en `portal.css`; aquí únicamente se decide de qué perfil se trata.
describe('normalizarPerfil', () => {
  it('reconoce los cuatro perfiles del evento', () => {
    expect(normalizarPerfil('Estudiante')).toBe('estudiante');
    expect(normalizarPerfil('Profesor')).toBe('profesor');
    expect(normalizarPerfil('Profesional')).toBe('profesional');
    expect(normalizarPerfil('Investigador')).toBe('investigador');
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    // El valor viene de captura manual. Con el nombre de clase antiguo, un
    // «estudiante» en minúsculas perdía el color en silencio.
    expect(normalizarPerfil('ESTUDIANTE')).toBe('estudiante');
    expect(normalizarPerfil('  Profesor  ')).toBe('profesor');
    expect(normalizarPerfil('pRoFeSiOnAl')).toBe('profesional');
  });

  it('ignora los acentos', () => {
    expect(normalizarPerfil('Investigadór')).toBe('investigador');
  });

  it('cae en el genérico cuando no reconoce el perfil', () => {
    expect(normalizarPerfil('Ponente invitado')).toBe('generico');
    expect(normalizarPerfil('')).toBe('generico');
    expect(normalizarPerfil(null)).toBe('generico');
    expect(normalizarPerfil(undefined)).toBe('generico');
  });

  it('nunca devuelve algo que pueda escapar de un atributo', () => {
    // Lo que sale es siempre una de cinco etiquetas conocidas, así que el texto
    // del servidor ya no puede acabar dentro de `data-perfil`.
    expect(normalizarPerfil('"><img src=x onerror="alert(1)">')).toBe('generico');
  });
});
