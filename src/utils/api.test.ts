import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorApi, MAX_PDF_BYTES, obtenerParticipante, subirComprobante } from './api';

/**
 * El portal se comía todo lo que decía el Worker: la subida rechazaba cualquier
 * respuesta que no fuese 2xx y quien la llamaba enseñaba «Error de conexión»
 * pasara lo que pasara. Un pago ya aprobado, un archivo que no era PDF y un
 * enlace inválido se veían los tres igual, y el participante reintentaba sin
 * saber qué corregir.
 *
 * Estas pruebas afirman lo contrario: que el motivo real llega.
 */

const PARTICIPANTE = {
  id_participante: 'ENC-001',
  nombre: 'Ana Victoria de la Rosa García',
  perfil: 'Estudiante',
  taller: 'Futurología aplicada al diseño',
  institucion: 'UAA · Universidad Autónoma de Aguascalientes',
  fecha_registro: '2026-08-01 10:00:00',
  pago_aprobado: 0,
  tiene_comprobante: 0,
};

/** Respuesta falsa con el cuerpo y el estado que se quieran. */
function respuesta(status: number, cuerpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as Response;
}

/**
 * XMLHttpRequest mínimo: no existe en Node y la subida lo necesita para poder
 * informar del avance, que es justo lo que `fetch` no ofrece.
 */
function fingirXhr(status: number, cuerpo: unknown, { falloDeRed = false } = {}) {
  class XhrFalso {
    status = 0;
    responseText = '';
    timeout = 0;
    upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    send() {
      queueMicrotask(() => {
        if (falloDeRed) {
          this.onerror?.();
          return;
        }
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        this.status = status;
        this.responseText = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
        this.onload?.();
      });
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrFalso);
}

const pdf = () => new File([new Uint8Array([1, 2, 3])], 'comprobante.pdf', { type: 'application/pdf' });

afterEach(() => vi.unstubAllGlobals());

// ── Consulta del registro ───────────────────────────────────────
describe('obtenerParticipante', () => {
  it('devuelve el participante cuando el enlace es válido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { ok: true, encontrado: true, participante: PARTICIPANTE })),
    );

    await expect(obtenerParticipante('https://api', 'abc123')).resolves.toEqual(PARTICIPANTE);
  });

  it('distingue un enlace inexistente por su código, no por el texto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(404, {
          ok: false,
          codigo: 'NO_ENCONTRADO',
          mensaje: 'Registro no encontrado o enlace no válido.',
          encontrado: false,
        }),
      ),
    );

    const fallo = await obtenerParticipante('https://api', 'abc123').catch((e) => e);
    expect(fallo).toBeInstanceOf(ErrorApi);
    expect(fallo.codigo).toBe('NO_ENCONTRADO');
    expect(fallo.esDeRed).toBe(false);
  });

  it('marca como fallo de red lo que no llegó a responder', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed to fetch');
      }),
    );

    const fallo = await obtenerParticipante('https://api', 'abc123').catch((e) => e);
    expect(fallo.esDeRed).toBe(true);
  });

  it('no da por bueno un 200 que no trae participante', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { ok: true })),
    );

    const fallo = await obtenerParticipante('https://api', 'abc123').catch((e) => e);
    expect(fallo.codigo).toBe('NO_ENCONTRADO');
  });
});

// ── Subida del comprobante ──────────────────────────────────────
describe('subirComprobante', () => {
  it('devuelve el mensaje de confirmación del servidor', async () => {
    fingirXhr(200, { ok: true, mensaje: 'Comprobante recibido. Tu registro ahora está en revisión.' });

    await expect(subirComprobante('https://api', 'abc123', pdf(), () => {})).resolves.toBe(
      'Comprobante recibido. Tu registro ahora está en revisión.',
    );
  });

  it('informa del avance mientras sube', async () => {
    fingirXhr(200, { ok: true, mensaje: 'Listo.' });
    const avances: number[] = [];

    await subirComprobante('https://api', 'abc123', pdf(), (pct) => avances.push(pct));

    expect(avances).toContain(50);
  });

  // Esta es la prueba que habría atrapado el fallo: antes, cualquier respuesta
  // que no fuese 2xx se convertía en «Error de HTTP: 409» y acababa mostrada
  // como un problema de conexión.
  it('deja pasar el motivo real de un pago ya aprobado, con su código', async () => {
    fingirXhr(409, {
      ok: false,
      codigo: 'PAGO_YA_APROBADO',
      mensaje: 'Tu pago ya fue aprobado, no es necesario subir otro comprobante.',
    });

    const fallo = await subirComprobante('https://api', 'abc123', pdf(), () => {}).catch((e) => e);
    expect(fallo).toBeInstanceOf(ErrorApi);
    expect(fallo.codigo).toBe('PAGO_YA_APROBADO');
    expect(fallo.message).toBe('Tu pago ya fue aprobado, no es necesario subir otro comprobante.');
    expect(fallo.esDeRed).toBe(false);
  });

  it('deja pasar el motivo de un archivo rechazado', async () => {
    fingirXhr(400, { ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'El archivo debe ser un PDF.' });

    const fallo = await subirComprobante('https://api', 'abc123', pdf(), () => {}).catch((e) => e);
    expect(fallo.message).toBe('El archivo debe ser un PDF.');
  });

  it('deja pasar el motivo de un enlace no válido', async () => {
    fingirXhr(403, {
      ok: false,
      codigo: 'PROHIBIDO',
      mensaje: 'Enlace no válido. Usa el que recibiste por correo.',
    });

    const fallo = await subirComprobante('https://api', 'abc123', pdf(), () => {}).catch((e) => e);
    expect(fallo.message).toBe('Enlace no válido. Usa el que recibiste por correo.');
  });

  it('sigue distinguiendo un fallo de red de un error del servidor', async () => {
    fingirXhr(0, null, { falloDeRed: true });

    const fallo = await subirComprobante('https://api', 'abc123', pdf(), () => {}).catch((e) => e);
    expect(fallo.esDeRed).toBe(true);
  });

  it('no se atraganta con un error sin cuerpo JSON', async () => {
    fingirXhr(502, 'Bad Gateway');

    const fallo = await subirComprobante('https://api', 'abc123', pdf(), () => {}).catch((e) => e);
    expect(fallo.status).toBe(502);
    expect(fallo.message).toBeTruthy();
    expect(fallo.esDeRed).toBe(false);
  });
});

// ── Límite de tamaño ────────────────────────────────────────────
describe('MAX_PDF_BYTES', () => {
  it('coincide con el límite que aplica el Worker', () => {
    // El Worker rechaza por encima de 5 MB. Con 3 MB aquí, un comprobante de
    // 4 MB se rechazaba en el navegador aunque el servidor lo habría aceptado.
    expect(MAX_PDF_BYTES).toBe(5 * 1024 * 1024);
  });
});
