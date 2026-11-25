/**
 * Compresses shelf photos client-side on an offscreen canvas (WebP with JPEG fallback)
 * so images fit comfortably inside the shared family Firestore document.
 */
export async function compressShelfPhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let source: CanvasImageSource;
  let srcW = 0;
  let srcH = 0;

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
        source = bitmap;
        srcW = bitmap.width;
        srcH = bitmap.height;
      } catch {
        bitmap = null;
      }
    }

    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('לא הצלחנו לקרוא את התמונה'));
        el.src = objectUrl!;
      });
      source = img;
      srcW = img.naturalWidth || img.width;
      srcH = img.naturalHeight || img.height;
    }

    if (!srcW || !srcH) {
      throw new Error('לא הצלחנו לקרוא את התמונה');
    }

    const render = (maxEdge: number, webpQuality: number, jpegQuality: number): string => {
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('שגיאה בעיבוד התמונה במכשיר');
      }
      ctx.drawImage(source, 0, 0, w, h);

      const webp = canvas.toDataURL('image/webp', webpQuality);
      if (webp.startsWith('data:image/webp')) {
        return webp;
      }
      return canvas.toDataURL('image/jpeg', jpegQuality);
    };

    let dataUrl = render(720, 0.68, 0.72);
    if (dataUrl.length > 115_000) {
      dataUrl = render(540, 0.52, 0.56);
    }
    if (dataUrl.length > 180_000) {
      throw new Error('התמונה גדולה מדי — נסו לצלם שוב');
    }
    return dataUrl;
  } finally {
    bitmap?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
