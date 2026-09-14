/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Pruebas de la parte que toca el DOM.
 *
 * Hasta ahora las pruebas corrían todas en `node` y cubrían el transporte, las
 * plantillas y el escapado. Quedaba fuera justo lo que más partes móviles
 * tiene: el repintado, el temporizador y el formulario de subida —estado
 * mutable, tres ramas de error y un intervalo global—. El intervalo huérfano de
 * la cuenta atrás vivió ahí sin que nada lo viera.
 */

// El QR se dibuja sobre un `<canvas>`, que jsdom no implementa. Lo que se
// comprueba aquí es el cableado de la vista, no la biblioteca de códigos QR.
vi.mock('./portal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./portal')>()),
  getQrUrl: vi.fn(async () => '[QR]'),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  subirComprobante: vi.fn(),
}));

import { renderPortal, setupUpload, renderError } from './vistas';
import { getQrUrl, iniciarCountdown, detenerCountdown } from './portal';
import { ErrorApi, subirComprobante, MAX_PDF_BYTES, type Participante } from './api';

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

/** Fecha de expiración a `horas` vista, en el formato que manda D1. */
function dentroDe(horas: number): string {
  return new Date(Date.now() + horas * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Simula la elección de un archivo, que no se puede asignar a `input.files`.
 *
 * Se imita también `value`, que jsdom deja vacío y el navegador rellena con la
 * ruta del archivo. Sin eso, comprobar que el portal lo vacía —lo que permite
 * volver a elegir el mismo archivo tras cancelar o tras un rechazo— pasaría
 * solo, sin ejercer nada.
 */
function elegir(input: HTMLInputElement, archivo: File) {
  Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
  let valor = `C:\\fakepath\\${archivo.name}`;
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => valor,
    set: (nuevo: string) => (valor = nuevo),
  });
  input.dispatchEvent(new Event('change'));
}

function pdf(nombre = 'comprobante.pdf', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nombre, { type: 'application/pdf' });
}

const hueco = () => document.getElementById('portal-main') as HTMLElement;

beforeEach(() => {
  document.body.innerHTML =
    '<main id="portal-main"></main>' + '<div id="toast-container" role="status" aria-live="polite"></div>';
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('print', vi.fn());
  // jsdom no implementa `matchMedia`, y el repintado la consulta para respetar
  // `prefers-reduced-motion`. Se responde que no hay preferencia, que es el
  // caso normal; la rama contraria tiene su propia prueba más abajo.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.mocked(subirComprobante).mockReset();
  vi.mocked(getQrUrl).mockClear();
});

afterEach(() => {
  detenerCountdown();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Cuenta atrás ────────────────────────────────────────────────
describe('cuenta atrás', () => {
  it('pinta los cuatro pares de dígitos y los actualiza cada segundo', () => {
    vi.useFakeTimers();
    hueco().innerHTML = '<div id="cd-inner"></div>';

    iniciarCountdown(dentroDe(25));
    const seg = () => document.querySelector('[data-unidad="s"]')?.textContent;
    const primero = seg();

    vi.advanceTimersByTime(1000);
    expect(seg()).not.toBe(primero);
    expect(document.querySelector('[data-unidad="d"]')?.textContent).toBe('01');
  });

  it('no programa nada si el plazo ya venció', () => {
    // El `tick()` inicial corría antes de que se asignara el intervalo, así que
    // su `clearInterval` no limpiaba nada: el aviso de vencimiento se reescribía
    // una vez por segundo para siempre.
    vi.useFakeTimers();
    hueco().innerHTML = '<div id="cd-inner"></div>';

    iniciarCountdown(dentroDe(-1));

    expect(document.getElementById('cd-inner')?.textContent).toContain('El plazo ha vencido');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('con una fecha ilegible no pinta nada ni deja un intervalo corriendo', () => {
    // `parsearFechaAPI` devuelve `NaN` y la resta también, pero `NaN <= 0` es
    // falso: la rama de «plazo vencido» nunca se tomaba y el contador quedaba
    // en «NaN días : NaN horas : NaN min : NaN seg», actualizándose para siempre.
    vi.useFakeTimers();
    hueco().innerHTML = '<div id="cd-inner"></div>';

    iniciarCountdown('no-es-una-fecha');

    expect(document.getElementById('cd-inner')?.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dos arranques seguidos no dejan dos intervalos vivos', () => {
    vi.useFakeTimers();
    hueco().innerHTML = '<div id="cd-inner"></div>';

    iniciarCountdown(dentroDe(5));
    iniciarCountdown(dentroDe(5));

    expect(vi.getTimerCount()).toBe(1);
  });
});

// ── Repintado ───────────────────────────────────────────────────
describe('renderPortal', () => {
  it('para la cuenta atrás al pasar a una vista que ya no la tiene', async () => {
    // Este es el intervalo huérfano: al subir el comprobante el portal pasa a
    // «En revisión», que no vuelve a llamar a `iniciarCountdown`, así que el
    // intervalo anterior seguía corriendo contra un elemento fuera del
    // documento, un tick por segundo, indefinidamente.
    vi.useFakeTimers();

    await renderPortal({ ...P, fecha_expiracion: dentroDe(48) }, 'https://api.test');
    expect(vi.getTimerCount()).toBe(1);

    await renderPortal({ ...P, tiene_comprobante: 1 }, 'https://api.test');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la vista de pago aprobado no deja temporizadores corriendo', async () => {
    vi.useFakeTimers();

    await renderPortal({ ...P, fecha_expiracion: dentroDe(48) }, 'https://api.test');
    await renderPortal({ ...P, pago_aprobado: 1 }, 'https://api.test');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('cablea el botón de imprimir sin manejador en línea', async () => {
    await renderPortal({ ...P, pago_aprobado: 1 }, 'https://api.test');

    const btn = document.getElementById('btn-imprimir') as HTMLElement;
    expect(btn.getAttribute('onclick')).toBeNull();

    btn.dispatchEvent(new MouseEvent('click'));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it('usa un solo código QR para la tarjeta, el gafete y la descarga', async () => {
    await renderPortal({ ...P, pago_aprobado: 1 }, 'https://api.test');

    expect(getQrUrl).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('img[src="[QR]"]')).toHaveLength(2);
    expect(document.querySelector('a[download]')?.getAttribute('href')).toBe('[QR]');
  });

  it('el enlace de descarga no abre una pestaña nueva', async () => {
    await renderPortal({ ...P, pago_aprobado: 1 }, 'https://api.test');
    expect(document.querySelector('a[download]')?.getAttribute('target')).toBeNull();
  });
});

// ── Pantalla de error ───────────────────────────────────────────
// ── Registros de la asamblea ────────────────────────────────────
//
// Llegan con `pago_aprobado = 1` porque no deben nada, así que caen en la misma
// rama que quien ya pagó. Lo que estas pruebas fijan es que no se les cuente un
// pago que nunca hicieron, y que a quien dijo que no viene no se le entregue la
// llave de la puerta.
describe('renderPortal con un registro de asamblea', () => {
  const ASAMBLEA: Participante = {
    ...P,
    perfil: 'Asambleísta Encuadre',
    taller: 'Sin taller · Asamblea',
    institucion: 'Universidad de Prueba',
    fecha_expiracion: undefined,
    pago_aprobado: 1,
    requiere_pago: 0,
    asiste_encuentro: 1,
    taller_preferencia: 'Futurología aplicada al diseño',
  };

  it('no le anuncia un pago aprobado, y sí su registro y su QR', async () => {
    await renderPortal(ASAMBLEA, 'https://api.test');

    expect(hueco().textContent).toContain('Registro confirmado');
    expect(hueco().textContent).not.toContain('Pago Aprobado');
    expect(hueco().querySelector('#qr-img')).not.toBeNull();
    // Ni cola de cobro ni formulario de subida: no hay nada que pagar.
    expect(hueco().querySelector('#comp-input')).toBeNull();
  });

  it('enseña el taller que prefiere y no el centinela del Worker', async () => {
    await renderPortal(ASAMBLEA, 'https://api.test');

    expect(hueco().textContent).toContain('Taller de tu interés');
    expect(hueco().textContent).toContain('Futurología aplicada al diseño');
    expect(hueco().textContent).not.toContain('Sin taller');
  });

  it('no deja ninguna cuenta atrás corriendo', async () => {
    vi.useFakeTimers();
    await renderPortal(ASAMBLEA, 'https://api.test');
    expect(vi.getTimerCount()).toBe(0);
  });

  // El caso recién dado de alta: la organización todavía no ha mirado su
  // oficio. No debe dinero, así que tampoco puede verse como una cola de cobro.
  it('mientras espera aprobación no ve QR, ni gafete, ni formulario de pago', async () => {
    await renderPortal({ ...ASAMBLEA, pago_aprobado: 0 }, 'https://api.test');

    expect(hueco().textContent).toContain('Acreditación en revisión');
    expect(hueco().textContent).not.toContain('Pendiente de Comprobante');
    expect(hueco().querySelector('#qr-img')).toBeNull();
    expect(hueco().querySelector('#btn-imprimir')).toBeNull();
    expect(hueco().querySelector('#comp-input')).toBeNull();
    // Y sus datos siguen a la vista, que es a lo que entró.
    expect(hueco().textContent).toContain('Datos de tu registro');
  });

  it('a quien dijo que no asiste no le entrega el QR ni el gafete', async () => {
    await renderPortal({ ...ASAMBLEA, asiste_encuentro: 0 }, 'https://api.test');

    expect(hueco().textContent).toContain('no asistirás');
    expect(hueco().querySelector('#qr-img')).toBeNull();
    expect(hueco().querySelector('#btn-imprimir')).toBeNull();
    // Sus datos sí quedan a la vista, que es a lo que entra al portal.
    expect(hueco().textContent).toContain('Datos de tu registro');
  });

  it('el perfil llega al atributo con su etiqueta, no con el texto del servidor', async () => {
    await renderPortal(ASAMBLEA, 'https://api.test');

    const insignia = hueco().querySelector('.perfil-badge');
    expect(insignia?.getAttribute('data-perfil')).toBe('asambleista');
    expect(insignia?.textContent).toBe('Asambleísta Encuadre');
  });
});

describe('renderError', () => {
  it('solo cablea el reintento cuando se le pasa uno', () => {
    const reintentar = vi.fn();

    renderError('Vaya', 'Algo pasó', reintentar);
    document.getElementById('btn-reintentar')?.dispatchEvent(new MouseEvent('click'));
    expect(reintentar).toHaveBeenCalledOnce();

    renderError('Vaya', 'Algo pasó');
    expect(document.getElementById('btn-reintentar')).toBeNull();
  });
});

// ── Subida del comprobante ──────────────────────────────────────
describe('setupUpload', () => {
  async function prepararFormulario(extra: Partial<Participante> = {}) {
    await renderPortal({ ...P, fecha_expiracion: dentroDe(48), ...extra }, 'https://api.test', '', 'TOK-123');
    return {
      input: document.getElementById('comp-input') as HTMLInputElement,
      boton: document.getElementById('btn-subir') as HTMLButtonElement,
    };
  }

  const textoDeLosToasts = () =>
    [...document.querySelectorAll('#toast-container .toast')].map((t) => t.textContent).join(' | ');

  it('acepta un PDF y habilita el botón', async () => {
    const { input, boton } = await prepararFormulario();
    expect(boton.disabled).toBe(true);

    elegir(input, pdf());

    expect(boton.disabled).toBe(false);
    expect(document.getElementById('file-info')?.textContent).toContain('comprobante.pdf');
  });

  it('rechaza lo que no es PDF sin habilitar el botón', async () => {
    const { input, boton } = await prepararFormulario();

    elegir(input, new File(['x'], 'foto.png', { type: 'image/png' }));

    expect(boton.disabled).toBe(true);
    expect(textoDeLosToasts()).toContain('Solo se aceptan archivos PDF');
  });

  it('rechaza en el navegador lo que el Worker rechazaría por tamaño', async () => {
    const { input, boton } = await prepararFormulario();

    elegir(input, pdf('grande.pdf', MAX_PDF_BYTES + 1));

    expect(boton.disabled).toBe(true);
    expect(textoDeLosToasts()).toContain('supera los 5 MB');
  });

  it('escapa el nombre del archivo, que lo elige quien sube', async () => {
    const { input } = await prepararFormulario();

    elegir(input, pdf('<img src=x onerror=alert(1)>.pdf'));

    const info = document.getElementById('file-info') as HTMLElement;
    expect(info.innerHTML).not.toContain('<img src=x');
    expect(info.querySelector('img')).toBeNull();
  });

  it('manda el token, no el id_participante', async () => {
    // El `id_participante` va impreso en el gafete y en el QR: es público y no
    // autentica a nadie. Cuando se enviaba como credencial, bastaba con leer el
    // gafete ajeno para reemplazar el comprobante de otra persona.
    const { input, boton } = await prepararFormulario();
    vi.mocked(subirComprobante).mockResolvedValue('Recibido');

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));
    await vi.waitFor(() => expect(subirComprobante).toHaveBeenCalled());

    const credencial = vi.mocked(subirComprobante).mock.calls[0][1];
    expect(credencial).toBe('TOK-123');
    expect(credencial).not.toBe(P.id_participante);
  });

  it('enseña el motivo real del servidor, no «error de conexión»', async () => {
    const { input, boton } = await prepararFormulario();
    vi.mocked(subirComprobante).mockRejectedValue(new ErrorApi('El archivo debe ser un PDF', 'ARCHIVO_INVALIDO', 400));

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(textoDeLosToasts()).toContain('El archivo debe ser un PDF'));
    // Y deja intentarlo otra vez.
    await vi.waitFor(() => expect(boton.disabled).toBe(false));
    expect(boton.textContent).toBe('Subir comprobante');
  });

  it('un pago ya aprobado deja de ser un callejón sin salida', async () => {
    // Reintentar no iba a funcionar nunca. En vez de un error, se repinta con
    // el acceso que la persona ya tiene.
    const { input, boton } = await prepararFormulario();
    vi.mocked(subirComprobante).mockRejectedValue(new ErrorApi('Tu pago ya fue aprobado', 'PAGO_YA_APROBADO', 409));

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(document.getElementById('btn-imprimir')).not.toBeNull());
    expect(document.querySelector('.estado-banner')?.className).toContain('aprobado');
  });

  it('tras subir con éxito pasa a «En revisión» sin recargar', async () => {
    const { input, boton } = await prepararFormulario();
    vi.mocked(subirComprobante).mockResolvedValue('Comprobante recibido.');

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(document.body.textContent).toContain('Comprobante recibido exitosamente'));
    // El formulario sigue en la página para poder sustituir el comprobante,
    // pero plegado: lo que se ve es la confirmación.
    expect(document.getElementById('zona-reemplazo')?.className).toContain('oculto');
    expect(document.querySelector('.estado-banner')?.className).toContain('revision');
  });

  it('no escapa dos veces lo que ya escapó al repintar tras la subida', async () => {
    // `renderPortal` escapa en la frontera, y el repintado vuelve a entrar por
    // ella. Cuando se le devolvía el participante ya saneado, cada subida con
    // éxito convertía «Martínez & Co» en «Martínez &amp; Co» en pantalla.
    const { input, boton } = await prepararFormulario({
      nombre: 'Martínez & Co',
      institucion: 'Facultad de Arquitectura & Diseño',
    });
    vi.mocked(subirComprobante).mockResolvedValue('Comprobante recibido.');
    expect(hueco().textContent).toContain('Martínez & Co');

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(document.body.textContent).toContain('Comprobante recibido exitosamente'));
    expect(hueco().textContent).toContain('Martínez & Co');
    expect(hueco().textContent).toContain('Facultad de Arquitectura & Diseño');
    expect(hueco().innerHTML).not.toContain('&amp;amp;');
  });

  it('sigue escapando el nombre después de repintar', async () => {
    // El arreglo del doble escapado no puede haber abierto la puerta contraria:
    // lo que se repinta viene sin sanear y tiene que volver a pasar por la
    // frontera de escapado, no saltársela.
    const { input, boton } = await prepararFormulario({ nombre: '<img src=x onerror=alert(1)>' });
    vi.mocked(subirComprobante).mockResolvedValue('Comprobante recibido.');

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(document.body.textContent).toContain('Comprobante recibido exitosamente'));
    expect(hueco().querySelector('img')).toBeNull();
    expect(hueco().innerHTML).not.toContain('<img src=x');
  });

  it('no envía dos veces si se pulsa el botón repetidamente', async () => {
    const { input, boton } = await prepararFormulario();
    vi.mocked(subirComprobante).mockImplementation(() => new Promise((r) => setTimeout(() => r('ok'), 50)));

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));
    boton.dispatchEvent(new MouseEvent('click'));
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(subirComprobante).toHaveBeenCalled());
    expect(subirComprobante).toHaveBeenCalledOnce();
  });

  it('respeta a quien pide menos movimiento', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
    } as unknown as MediaQueryList);

    const { input, boton } = await prepararFormulario();
    vi.mocked(subirComprobante).mockResolvedValue('Comprobante recibido.');

    elegir(input, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(document.body.textContent).toContain('Comprobante recibido exitosamente'));
    // Sin fundido no debe quedar una transición pegada al elemento, y el salto
    // al principio de la página es instantáneo.
    expect(hueco().style.transition).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('un archivo rechazado deja el campo libre para reintentarlo', async () => {
    // Quien lee «supera los 5 MB» vuelve a exportar su comprobante, casi
    // siempre con el mismo nombre. Si el campo conserva el valor anterior, el
    // navegador no emite «change» y esa segunda elección no hace nada.
    const { input, boton } = await prepararFormulario();

    elegir(input, pdf('comprobante.pdf', MAX_PDF_BYTES + 1));

    expect(textoDeLosToasts()).toContain('supera los 5 MB');
    expect(boton.disabled).toBe(true);
    expect(input.value).toBe('');
  });

  it('lo mismo cuando no es un PDF', async () => {
    const { input } = await prepararFormulario();

    elegir(input, new File([new Uint8Array(8)], 'foto.png', { type: 'image/png' }));

    expect(textoDeLosToasts()).toContain('Solo se aceptan archivos PDF');
    expect(input.value).toBe('');
  });

  it('no explota si el formulario no está en pantalla', () => {
    hueco().innerHTML = '';
    expect(() => setupUpload(P, 'https://api.test', '', 'TOK')).not.toThrow();
  });
});

// ── Reemplazo de un comprobante ya enviado ──────────────────────
//
// Antes, recibirlo cerraba la puerta: la vista dejaba de pintar el formulario y
// la única salida era escribir a la organización. Pero el pago puede volver
// atrás —a un participante se lo devolvió el banco y tuvo que pagar de nuevo— y
// el archivo puede ser el equivocado.
describe('reemplazar el comprobante', () => {
  /** Pinta el portal de quien ya envió comprobante y el pago sigue sin aprobar. */
  async function prepararRevision() {
    await renderPortal(
      { ...P, tiene_comprobante: 1, fecha_expiracion: dentroDe(48) },
      'https://api.test',
      '',
      'TOK-123',
    );
    return document.getElementById('btn-reemplazar') as HTMLButtonElement;
  }

  it('nace plegado para no parecer que el envío falló', async () => {
    await prepararRevision();

    expect(document.getElementById('zona-reemplazo')?.className).toContain('oculto');
    expect(document.getElementById('btn-reemplazar')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('el botón despliega los campos y mueve el foco a la zona de arrastre', async () => {
    const btn = await prepararRevision();

    btn.dispatchEvent(new MouseEvent('click'));

    expect(document.getElementById('zona-reemplazo')?.className).not.toContain('oculto');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    // El botón que se acaba de pulsar desaparece: sin mover el foco, quien
    // navega con teclado se queda en un elemento que ya no está.
    expect(document.getElementById('aviso-reemplazo')?.className).toContain('oculto');
    expect(document.activeElement).toBe(document.getElementById('upload-area'));
  });

  it('cancelar vuelve a plegar y devuelve el foco al botón', async () => {
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));

    document.getElementById('btn-cancelar-reemplazo')?.dispatchEvent(new MouseEvent('click'));

    expect(document.getElementById('zona-reemplazo')?.className).toContain('oculto');
    expect(document.getElementById('aviso-reemplazo')?.className).not.toContain('oculto');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('cancelar descarta el archivo que se había elegido', async () => {
    // Sin esto, al reabrir seguía en pantalla la ficha del archivo anterior y
    // el botón listo para enviarlo, que es justo lo que se acaba de cancelar.
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    const boton = document.getElementById('btn-subir') as HTMLButtonElement;
    elegir(document.getElementById('comp-input') as HTMLInputElement, pdf('el-que-no-era.pdf'));
    expect(boton.disabled).toBe(false);

    document.getElementById('btn-cancelar-reemplazo')?.dispatchEvent(new MouseEvent('click'));
    btn.dispatchEvent(new MouseEvent('click'));

    expect(boton.disabled).toBe(true);
    const info = document.getElementById('file-info') as HTMLElement;
    expect(info.className).toContain('oculto');
    expect(info.textContent).not.toContain('el-que-no-era.pdf');
  });

  it('cancelar vacía el campo, para poder reelegir el mismo archivo', async () => {
    // El navegador solo emite «change» cuando el valor cambia. Con el anterior
    // todavía puesto, volver a elegir EL MISMO archivo —lo más probable si se
    // canceló por error— no avisaba a nadie: ni ficha, ni botón, ni error.
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    const input = document.getElementById('comp-input') as HTMLInputElement;
    elegir(input, pdf());

    document.getElementById('btn-cancelar-reemplazo')?.dispatchEvent(new MouseEvent('click'));

    expect(input.value).toBe('');
  });

  it('tras cancelar no se envía nada', async () => {
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    elegir(document.getElementById('comp-input') as HTMLInputElement, pdf());
    document.getElementById('btn-cancelar-reemplazo')?.dispatchEvent(new MouseEvent('click'));

    document.getElementById('btn-subir')?.dispatchEvent(new MouseEvent('click'));

    expect(subirComprobante).not.toHaveBeenCalled();
  });

  it('no deja cancelar una subida que ya va en camino', async () => {
    // La petición no se puede retirar: plegar el formulario a media subida
    // prometía «dejar el comprobante que ya envié» cuando el archivo nuevo
    // estaba llegando igualmente.
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    vi.mocked(subirComprobante).mockImplementation(() => new Promise((r) => setTimeout(() => r('ok'), 50)));

    elegir(document.getElementById('comp-input') as HTMLInputElement, pdf());
    document.getElementById('btn-subir')?.dispatchEvent(new MouseEvent('click'));

    const cancelar = document.getElementById('btn-cancelar-reemplazo') as HTMLButtonElement;
    await vi.waitFor(() => expect(cancelar.disabled).toBe(true));
  });

  it('un fallo devuelve la salida a quien la necesita', async () => {
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    vi.mocked(subirComprobante).mockRejectedValue(new ErrorApi('Error al subir el archivo', 'ERROR_SERVIDOR', 500));

    elegir(document.getElementById('comp-input') as HTMLInputElement, pdf());
    document.getElementById('btn-subir')?.dispatchEvent(new MouseEvent('click'));

    const cancelar = document.getElementById('btn-cancelar-reemplazo') as HTMLButtonElement;
    await vi.waitFor(() => expect(cancelar.disabled).toBe(false));
  });

  it('sube el comprobante nuevo con el token, no con el id_participante', async () => {
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    vi.mocked(subirComprobante).mockResolvedValue('Comprobante recibido.');

    const input = document.getElementById('comp-input') as HTMLInputElement;
    elegir(input, pdf('el-bueno.pdf'));
    document.getElementById('btn-subir')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(subirComprobante).toHaveBeenCalled());
    const [, credencial, archivo] = vi.mocked(subirComprobante).mock.calls[0];
    expect(credencial).toBe('TOK-123');
    expect(credencial).not.toBe(P.id_participante);
    expect(archivo.name).toBe('el-bueno.pdf');
  });

  it('tras un fallo repone el rótulo de esta pantalla, no el de la otra', async () => {
    // `permitirOtroIntento` reponía «Subir comprobante» escrito a mano, así que
    // un error de red rebautizaba el botón a mitad del flujo.
    const btn = await prepararRevision();
    btn.dispatchEvent(new MouseEvent('click'));
    vi.mocked(subirComprobante).mockRejectedValue(new ErrorApi('Error al subir el archivo', 'ERROR_SERVIDOR', 500));

    const boton = document.getElementById('btn-subir') as HTMLButtonElement;
    elegir(document.getElementById('comp-input') as HTMLInputElement, pdf());
    boton.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => expect(boton.disabled).toBe(false));
    expect(boton.textContent).toBe('Reemplazar comprobante');
  });

  it('con el pago ya aprobado no se ofrece reemplazo', async () => {
    // Ahí no hay nada que sustituir, y el Worker lo rechazaría con 409.
    await renderPortal({ ...P, tiene_comprobante: 1, pago_aprobado: 1 }, 'https://api.test', '', 'TOK-123');

    expect(document.getElementById('btn-reemplazar')).toBeNull();
    expect(document.getElementById('comp-input')).toBeNull();
  });
});
