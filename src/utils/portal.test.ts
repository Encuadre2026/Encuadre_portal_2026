import { describe, it, expect } from 'vitest';
import { escapeHTML, formatFecha, perfilColor } from './portal';

// ── escapeHTML ──────────────────────────────────────────────────
describe('escapeHTML', () => {
  it('escapa caracteres HTML peligrosos', () => {
    expect(escapeHTML('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapa ampersands', () => {
    expect(escapeHTML('A & B')).toBe('A &amp; B');
  });

  it('escapa comillas simples', () => {
    expect(escapeHTML("it's")).toBe("it&#39;s");
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

// ── perfilColor ────────────────────────────────────────────────
describe('perfilColor', () => {
  it('retorna azul para Estudiante', () => {
    expect(perfilColor('Estudiante')).toBe('#0a84ff');
  });

  it('retorna verde para Profesor', () => {
    expect(perfilColor('Profesor')).toBe('#30d158');
  });

  it('retorna naranja para Profesional', () => {
    expect(perfilColor('Profesional')).toBe('#ff9f0a');
  });

  it('retorna morado para Investigador', () => {
    expect(perfilColor('Investigador')).toBe('#bf5af2');
  });

  it('retorna gris para perfiles desconocidos', () => {
    expect(perfilColor('Otro')).toBe('#6b7280');
  });

  it('retorna gris para cadena vacía', () => {
    expect(perfilColor('')).toBe('#6b7280');
  });
});
