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
  async function prepararFormulario() {
    await renderPortal({ ...P, fecha_expiracion: dentroDe(48) }, 'https://api.test', '', 'TOK-123');
    return {
      input: document.getElementById('comp-input') as HTMLInputElement,
      boton: document.getElementById('btn-subir') as HTMLButtonElement,
    };
  }

  /** Simula la elección de un archivo, que no se puede asignar a `input.files`. */
  function elegir(input: HTMLInputElement, archivo: File) {
    Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
    input.dispatchEvent(new Event('change'));
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
    expect(document.getElementById('comp-input')).toBeNull();
    expect(document.querySelector('.estado-banner')?.className).toContain('revision');
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

  it('no explota si el formulario no está en pantalla', () => {
    hueco().innerHTML = '';
    expect(() => setupUpload(P, 'https://api.test', '', 'TOK')).not.toThrow();
  });
});
