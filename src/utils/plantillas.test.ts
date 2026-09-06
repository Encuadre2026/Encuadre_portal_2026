import { describe, it, expect } from 'vitest';
import {
  bannerEstado,
  estadoDe,
  vistaSoloDatos,
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

  // La asamblea de ENCUADRE llega siempre con `pago_aprobado = 1` porque no
  // debe nada, y anunciarle «Pago aprobado» le cuenta un pago que nunca hizo.
  it('un registro sin cuota no dice que se le aprobó un pago', () => {
    const estado = estadoDe(true, false, { requierePago: false });
    expect(estado.clase).toBe('aprobado');
    expect(estado.titulo).toBe('Registro confirmado');
    expect(estado.desc).toContain('no hay nada que pagar');
  });

  // Mientras nadie ha revisado su oficio, un asambleísta llega con
  // `pago_aprobado = 0`, que en su caso no es una deuda. Ni «Pendiente de
  // comprobante» ni «Pago aprobado» dicen la verdad sobre él.
  it('sin cuota y sin aprobar, la acreditación está en revisión', () => {
    const estado = estadoDe(false, false, { requierePago: false });
    expect(estado.clase).toBe('revision');
    expect(estado.titulo).toBe('Acreditación en revisión');
    expect(estado.desc).toContain('No tienes que pagar nada');
    expect(estado.desc).not.toContain('comprobante de pago');
  });

  it('a quien no asiste no se le habla de gafete', () => {
    const estado = estadoDe(true, false, { requierePago: false, asiste: false });
    expect(estado.desc).toContain('no asistirás');
    expect(estado.desc).not.toContain('gafete');
  });

  it('sin opciones se comporta igual que antes', () => {
    expect(estadoDe(true, false)).toEqual(estadoDe(true, false, {}));
    expect(estadoDe(true, false).titulo).toBe('Pago Aprobado');
  });
});

// ── Registros de la asamblea ────────────────────────────────────
describe('taller de la asamblea', () => {
  const ASAMBLEA: Participante = {
    ...P,
    perfil: 'Asambleísta Encuadre',
    taller: 'Sin taller · Asamblea',
    pago_aprobado: 1,
    requiere_pago: 0,
    asiste_encuentro: 1,
  };

  // `taller` trae la fila centinela del Worker, que existe solo porque esa
  // columna no admite nulos. Enseñarla como «Taller asignado» diría dos cosas
  // falsas: que hay taller y que está inscrito en él.
  it('no enseña el taller centinela del Worker', () => {
    const html = tarjetaDatos({ ...ASAMBLEA, taller_preferencia: 'Futurología aplicada al diseño' });
    expect(html).not.toContain('Sin taller');
    expect(html).toContain('Taller de tu interés');
    expect(html).toContain('Futurología aplicada al diseño');
  });

  it('sin taller elegido dice «No aplica», no el centinela', () => {
    const html = tarjetaDatos({ ...ASAMBLEA, taller_preferencia: null });
    expect(html).not.toContain('Sin taller');
    expect(html).toContain('No aplica');
  });

  // El campo llega por la red: un valor que no sea 0 o 1 no puede acabar
  // escondiéndole la cola de cobro a quien sí tiene que pagar.
  it('un requiere_pago ausente o nulo se trata como que sí paga', () => {
    expect(tarjetaDatos({ ...ASAMBLEA, requiere_pago: undefined })).toContain('Taller asignado');
    expect(tarjetaDatos({ ...ASAMBLEA, requiere_pago: null as unknown as number })).toContain('Taller asignado');
  });

  it('a los demás perfiles les sigue enseñando su taller asignado', () => {
    const html = tarjetaDatos(P);
    expect(html).toContain('Taller asignado');
    expect(html).toContain('Futurología aplicada al diseño');
  });

  it('quien espera aprobación tampoco recibe QR ni formulario de pago', () => {
    const estado = estadoDe(false, false, { requierePago: false });
    const html = vistaSoloDatos({ ...ASAMBLEA, pago_aprobado: 0 }, estado);
    expect(html).not.toContain('qr-img');
    expect(html).not.toContain('id="comp-input"');
    expect(html).toContain('Acreditación en revisión');
  });

  it('quien no asiste no recibe QR ni gafete', () => {
    const estado = estadoDe(true, false, { requierePago: false, asiste: false });
    const html = vistaSoloDatos({ ...ASAMBLEA, asiste_encuentro: 0 }, estado);
    expect(html).not.toContain('qr-img');
    expect(html).not.toContain('gafete');
    expect(html).toContain('Datos de tu registro');
  });

  it('la vista de la asamblea mantiene su forma', () => {
    const estado = estadoDe(true, false, { requierePago: false });
    expect(
      vistaAprobado({ ...ASAMBLEA, taller_preferencia: 'Futurología aplicada al diseño' }, estado, '[QR]', ''),
    ).toMatchSnapshot();
  });
});

// ── Datos del registro ──────────────────────────────────────────
describe('tarjetaDatos', () => {
  // Estaba escrita dos veces, una por rama de estado, y las copias divergieron:
  // cada vista enseñaba los mismos datos con adornos distintos. Con una sola
  // definición eso no puede repetirse, y esto lo afirma.
  it('enseña el ID de participante sea cual sea el estado', () => {
    const aprobado = vistaAprobado(P, estadoDe(true, true), '', '');
    const pendiente = vistaPendiente(P, estadoDe(false, false), false);
    const revision = vistaPendiente(P, estadoDe(false, true), true);

    for (const vista of [aprobado, pendiente, revision]) {
      expect(vista).toContain('<span class="dato-valor id-participante">ENC-042</span>');
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
    // Cadena vacía: es lo que vale la base cuando el portal se sirve en la raíz
    // de su dominio, y es el caso que puede generar `//logo…` si alguien
    // deshace la normalización.
    expect(vistaAprobado(P, estadoDe(true, true), '[QR]', '')).toMatchSnapshot();
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

  it('con una fecha de expiración ilegible tampoco', () => {
    // No basta con que la fecha esté: si no se puede parsear, lo que salía era
    // el rótulo «Tiempo restante» encima de un contador de `NaN`.
    const fechaRota = { ...P, fecha_expiracion: 'no-es-una-fecha' };
    const html = vistaPendiente(fechaRota, estadoDe(false, false), false);
    expect(html).not.toContain('countdown-wrapper');
    expect(html).not.toContain('cd-inner');
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

// ── QR que no se pudo generar ───────────────────────────────────
describe('cuando el código QR no se pudo generar', () => {
  // `getQrUrl` devuelve una cadena vacía si la biblioteca falla. Un `src=""` no
  // es un hueco: el navegador lo resuelve contra la URL actual, así que pedía
  // otra vez la propia página —con el token dentro— para pintarla como imagen,
  // y el enlace de descarga bajaba ese HTML renombrado a `.png`.
  const sinQr = () => vistaAprobado(P, estadoDe(true, false), '', '/base');

  it('no deja ningún src ni href vacío', () => {
    expect(sinQr()).not.toContain('src=""');
    expect(sinQr()).not.toContain('href=""');
  });

  it('explica qué pasó y deja a la vista el ID, que es lo que sirve en el acceso', () => {
    expect(sinQr()).toContain('qr-no-disponible');
    expect(sinQr()).toContain('ENC-042');
  });

  it('no ofrece descargar algo que no existe', () => {
    expect(sinQr()).not.toContain('download=');
  });

  it('con código sí lo pinta y lo ofrece', () => {
    const html = vistaAprobado(P, estadoDe(true, false), 'data:image/png;base64,AAAA', '/base');
    expect(html).toContain('download="QR_ENC-042.png"');
    // Uno en la tarjeta y otro en el gafete: el mismo dibujo, generado una vez.
    expect(html.split('data:image/png;base64,AAAA')).toHaveLength(4); // tres apariciones
  });
});

// ── Perfil ──────────────────────────────────────────────────────
describe('el perfil no viaja como nombre de clase', () => {
  // Antes era `class="perfil-badge ${p.perfil}"`: el texto del servidor acababa
  // dentro de un atributo, y bastaba con que llegara en minúsculas para que el
  // badge perdiera el color sin que nada fallara.
  it('normaliza el perfil aunque cambie la forma de escribirlo', () => {
    for (const escrito of ['Estudiante', 'estudiante', '  ESTUDIANTE  ']) {
      expect(tarjetaDatos({ ...P, perfil: escrito })).toContain('data-perfil="estudiante"');
    }
  });

  it('un perfil desconocido cae en el genérico, no en un atributo arbitrario', () => {
    const html = tarjetaDatos({ ...P, perfil: 'Ponente invitado' });
    expect(html).toContain('data-perfil="generico"');
  });

  it('el gafete y la tarjeta usan el mismo perfil', () => {
    const html = vistaAprobado({ ...P, perfil: 'Profesor' }, estadoDe(true, true), '[QR]', '');
    // Uno en la tarjeta de datos y otro en el gafete.
    expect(html.match(/data-perfil="profesor"/g)).toHaveLength(2);
  });
});
