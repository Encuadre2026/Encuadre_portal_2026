import { describe, it, expect } from 'vitest';
import { sanearParticipante } from './vistas';
import { tarjetaDatos, vistaAprobado, vistaPendiente, estadoDe } from './plantillas';
import type { Participante } from './api';

/**
 * Guardia contra inyección de HTML.
 *
 * Las plantillas construyen HTML con cadenas y lo insertan con `innerHTML`. Lo
 * único que impide una inyección es que todo campo de texto del participante
 * pase por `sanearParticipante` antes de llegar a ellas. Eso era una
 * disciplina: ni el compilador ni el linter ven que falta escapar un campo
 * nuevo, y el fallo no se nota hasta que alguien lo aprovecha.
 *
 * Esta prueba lo convierte en una comprobación, y lo hace por dos vías a la vez:
 *
 * 1. El tipo `CampoDeTexto` se deriva de `Participante`, así que al añadir un
 *    campo de texto a la interfaz el objeto `CARGAS` deja de compilar hasta que
 *    se le dé una carga maliciosa.
 * 2. El recorrido de abajo mete esa carga en un campo cada vez y comprueba que
 *    no sale viva en el HTML.
 */

// Todas las claves de `Participante` cuyo valor es una cadena. Las de tipo
// número o booleano no pueden inyectar nada y quedan fuera automáticamente.
type CampoDeTexto = {
  [K in keyof Participante]-?: Participante[K] extends string | undefined ? K : never;
}[keyof Participante];

// Cierra la etiqueta y el atributo en curso antes de abrir la suya, que es lo
// que hace falta para escapar tanto de un cuerpo de elemento como de un
// atributo entrecomillado.
const CARGA = `"><img src=x onerror="alert(1)">`;

const CARGAS: Record<CampoDeTexto, string> = {
  id_participante: CARGA,
  nombre: CARGA,
  perfil: CARGA,
  taller: CARGA,
  institucion: CARGA,
  fecha_registro: CARGA,
  fecha_expiracion: CARGA,
};

const BASE: Participante = {
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

const campos = Object.keys(CARGAS) as CampoDeTexto[];

// Pinta el participante por los tres caminos que existen hacia `innerHTML`, de
// modo que la prueba no dependa de cuál de ellos toque el campo.
function todoElHtml(p: Participante): string {
  const estado = estadoDe(false, false);
  const qr = { grande: '', pequeno: '', descarga: '' };
  return [
    tarjetaDatos(p),
    vistaPendiente(p, estado, false),
    vistaPendiente(p, estado, true),
    vistaAprobado(p, estadoDe(true, true), qr, ''),
  ].join('\n');
}

describe('frontera de escapado', () => {
  it.each(campos)('neutraliza una inyección en %s', (campo) => {
    const p = sanearParticipante({ ...BASE, [campo]: CARGAS[campo] });
    const html = todoElHtml(p);

    // Lo que importa no es que la cadena aparezca —puede aparecer escapada—,
    // sino que no quede un `<img` que el navegador ejecute.
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="alert(1)"');
  });

  it('escapa los cinco campos que se pintan en crudo', () => {
    const p = sanearParticipante({
      ...BASE,
      nombre: '<b>x</b>',
      id_participante: '<b>x</b>',
      perfil: '<b>x</b>',
      taller: '<b>x</b>',
      institucion: '<b>x</b>',
    });

    const esperado = '&lt;b&gt;x&lt;/b&gt;';
    expect(p.nombre).toBe(esperado);
    expect(p.id_participante).toBe(esperado);
    expect(p.perfil).toBe(esperado);
    expect(p.taller).toBe(esperado);
    expect(p.institucion).toBe(esperado);
  });

  it('las fechas son seguras porque el formateador nunca devuelve su entrada', () => {
    // `fecha_registro` no pasa por `escapeHTML`: llega a la plantilla a través
    // de `formatFecha`, que siempre devuelve lo que produce
    // `toLocaleDateString`. Esta prueba fija esa dependencia, para que quede
    // roja si alguien añade a `formatFecha` un respaldo que devuelva el ISO
    // original cuando no lo sabe interpretar.
    const p = sanearParticipante({ ...BASE, fecha_registro: CARGA });
    expect(tarjetaDatos(p)).not.toContain('<img src=x');
  });

  it('los valores por defecto también salen escapados', () => {
    // La cadena vacía activa el respaldo (`'Participante sin nombre'`), y ese
    // camino no debe saltarse el escapado del resto.
    const p = sanearParticipante({ ...BASE, nombre: '', taller: CARGA });
    expect(p.nombre).toBe('Participante sin nombre');
    expect(todoElHtml(p)).not.toContain('<img src=x');
  });
});
