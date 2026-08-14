import { describe, it, expect } from 'vitest';
import {
  bannerEstado,
  estadoDe,
  formularioComprobante,
  paginaError,
  tarjetaDatos,
  vistaAprobado,
  vistaPendiente,
} from './plantillas';
import type { Participante } from './api';

/**
 * Las plantillas son funciones puras, así que se pueden fijar con instantáneas
 * sin navegador ni DOM. Sirven para lo mismo que sirvieron en el Worker con las
 * plantillas de correo: al reorganizar el código, la instantánea demuestra que
 * lo que se envía a la pantalla no cambió. Un cambio deliberado se acepta con
 * `vitest -u` y queda revisable en el diff del pull request.
 */

const P: Participante = {
  id_participante: 'ENC-042',
  nombre: 'Ana Victoria de la Rosa García',
  perfil: 'Estudiante',
  taller: 'Futurología aplicada al diseño',
  institucion: 'UAA · Universidad Autónoma de Aguascalientes',
  fecha_registro: '2026-08-01 10:00:00',
  fecha_expiracion: '2026-08-20 10:00:00',
  pago_aprobado: 0,
  tiene_comprobante: 0,
};

// ── Estado ──────────────────────────────────────────────────────
describe('estadoDe', () => {
  it('el pago aprobado manda sobre el comprobante', () => {
    expect(estadoDe(true, false).clase).toBe('aprobado');
    expect(estadoDe(true, true).clase).toBe('aprobado');
  });

  it('con comprobante y sin aprobar, está en revisión', () => {
    expect(estadoDe(false, true).clase).toBe('revision');
  });

  it('sin comprobante, está pendiente', () => {
    expect(estadoDe(false, false).clase).toBe('pendiente');
  });

  it('cada estado lleva su propio texto', () => {
    const clases = [estadoDe(true, true), estadoDe(false, true), estadoDe(false, false)];
    const titulos = clases.map((e) => e.titulo);
    expect(new Set(titulos).size).toBe(3);
  });
});

// ── Datos del registro ──────────────────────────────────────────
describe('tarjetaDatos', () => {
  // Estaba escrita dos veces, una por rama de estado, y las copias divergieron:
  // el botón de copiar existía solo en la vista de pago aprobado. Con una sola
  // definición eso no puede repetirse, y esto lo afirma.
  it('ofrece el botón de copiar el ID sea cual sea el estado', () => {
    const aprobado = vistaAprobado(P, estadoDe(true, true), { grande: '', pequeno: '', descarga: '' }, '');
    const pendiente = vistaPendiente(P, estadoDe(false, false), false);
    const revision = vistaPendiente(P, estadoDe(false, true), true);

    for (const vista of [aprobado, pendiente, revision]) {
      expect(vista).toContain('class="btn-copiar" data-copiar="ENC-042"');
    }
  });

  it('no vuelve a escapar lo que ya llegó escapado', () => {
    // `renderPortal` escapa antes de llamar. Escapar dos veces convertiría
    // «Martínez &amp; Co» en «Martínez &amp;amp; Co» en pantalla.
    const html = tarjetaDatos({ ...P, institucion: 'Martínez &amp; Co' });
    expect(html).toContain('Martínez &amp; Co');
    expect(html).not.toContain('&amp;amp;');
  });

  it('mantiene su forma', () => {
    expect(tarjetaDatos(P)).toMatchSnapshot();
  });
});

// ── Vistas completas ────────────────────────────────────────────
describe('vistas completas', () => {
  it('la de pago aprobado mantiene su forma', () => {
    const qr = { grande: '[QR-280]', pequeno: '[QR-150]', descarga: '[QR-500]' };
    expect(vistaAprobado(P, estadoDe(true, true), qr, '/Encuadre_portal_2026')).toMatchSnapshot();
  });

  it('la de comprobante pendiente mantiene su forma', () => {
    expect(vistaPendiente(P, estadoDe(false, false), false)).toMatchSnapshot();
  });

  it('la de comprobante en revisión mantiene su forma', () => {
    expect(vistaPendiente(P, estadoDe(false, true), true)).toMatchSnapshot();
  });

  it('sin fecha de expiración no se pinta la cuenta atrás', () => {
    const sinFecha = { ...P, fecha_expiracion: undefined };
    expect(vistaPendiente(sinFecha, estadoDe(false, false), false)).not.toContain('countdown-wrapper');
  });

  it('quien ya envió comprobante no ve el formulario de subida', () => {
    const html = vistaPendiente(P, estadoDe(false, true), true);
    expect(html).not.toContain('id="comp-input"');
    expect(html).toContain('Comprobante recibido exitosamente');
  });
});

// ── Otras plantillas ────────────────────────────────────────────
describe('plantillas sueltas', () => {
  it('el banner refleja la clase del estado', () => {
    expect(bannerEstado(estadoDe(false, true))).toContain('estado-banner revision');
  });

  it('la página de error solo ofrece reintentar cuando procede', () => {
    expect(paginaError('Título', 'Descripción', true)).toContain('id="btn-reintentar"');
    expect(paginaError('Título', 'Descripción', false)).not.toContain('id="btn-reintentar"');
  });

  it('el formulario anuncia el mismo límite que se aplica', () => {
    expect(formularioComprobante()).toContain('Máximo 5 MB');
  });
});
