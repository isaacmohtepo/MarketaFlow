/**
 * Genera un thumbnail (JPG) extraído del primer segundo de un video,
 * usando un <video> oculto + canvas. Todo client-side, sin pasar por
 * el server.
 *
 * Funciona porque la fuente es un Blob local (URL.createObjectURL del
 * File del usuario), no una URL cross-origin — así no hay CORS taint
 * en el canvas.
 *
 * Devuelve un File listo para subir al mismo endpoint de upload, o
 * null si la extracción falló (ej. codec sin soporte, video corrupto).
 */
export async function extractVideoThumbnail(
  videoFile: File,
  opts: { atSeconds?: number; quality?: number } = {},
): Promise<File | null> {
  const { atSeconds = 1, quality = 0.85 } = opts;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;

    let resolved = false;
    function cleanup() {
      URL.revokeObjectURL(objectUrl);
    }
    function done(result: File | null) {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    }

    // Timeout defensivo — si el video tarda más de 10s en abrir, salimos.
    const timeoutId = setTimeout(() => done(null), 10_000);

    video.addEventListener("loadedmetadata", () => {
      // Buscamos a un punto representativo del video. Cap a la mitad
      // del video si es muy corto (ej. video de 0.5s).
      const target = Math.min(atSeconds, Math.max(0, video.duration / 2));
      try {
        video.currentTime = target;
      } catch {
        done(null);
      }
    });

    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          done(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            clearTimeout(timeoutId);
            if (!blob) {
              done(null);
              return;
            }
            // Nombre derivado del original (por trazabilidad)
            const baseName = videoFile.name.replace(/\.[^.]+$/, "");
            const thumbFile = new File(
              [blob],
              `${baseName}-thumb.jpg`,
              { type: "image/jpeg" },
            );
            done(thumbFile);
          },
          "image/jpeg",
          quality,
        );
      } catch {
        done(null);
      }
    });

    video.addEventListener("error", () => done(null));
  });
}
