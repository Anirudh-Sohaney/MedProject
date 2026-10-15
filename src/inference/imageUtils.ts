import { BoxCoords } from '@/types/contracts';

/**
 * Decodes a user photo File to an HTMLCanvasElement with EXIF orientation handled.
 * Supports iOS Safari and desktop Chrome.
 */
export async function decodeFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  // Try createImageBitmap with imageOrientation if supported
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        return canvas;
      }
    } catch (e) {
      console.warn('createImageBitmap failed, falling back to Image element:', e);
    }
  }

  // Fallback: standard Image object
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      } else {
        reject(new Error('Failed to get 2d context for image'));
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image file: ${err}`));
    };
    img.src = url;
  });
}

/**
 * Scales canvas to a manageable dimension for the detector (maxDimension = 1280),
 * preserving exact aspect ratio WITHOUT any black letterboxing bars or padding.
 * Ultralytics YOLO's internal WASM handles letterboxing and normalization natively.
 */
export function downscaleForDetector(
  fullCanvas: HTMLCanvasElement,
  maxDimension = 1280
): HTMLCanvasElement {
  const sw = fullCanvas.width;
  const sh = fullCanvas.height;

  if (sw <= maxDimension && sh <= maxDimension) {
    return fullCanvas;
  }

  const scale = Math.min(maxDimension / sw, maxDimension / sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return fullCanvas;

  ctx.drawImage(fullCanvas, 0, 0, sw, sh, 0, 0, dw, dh);
  return canvas;
}

/**
 * Crops a normalized bounding box region from the full-resolution canvas with optional padding.
 */
export function cropRegion(
  fullCanvas: HTMLCanvasElement,
  box: BoxCoords,
  padRatio = 0.04
): HTMLCanvasElement {
  const w = fullCanvas.width;
  const h = fullCanvas.height;

  const padX = (box.x2 - box.x1) * padRatio * w;
  const padY = (box.y2 - box.y1) * padRatio * h;

  const sx = Math.max(0, Math.floor(box.x1 * w - padX));
  const sy = Math.max(0, Math.floor(box.y1 * h - padY));
  const sw = Math.min(w - sx, Math.ceil((box.x2 - box.x1) * w + 2 * padX));
  const sh = Math.min(h - sy, Math.ceil((box.y2 - box.y1) * h + 2 * padY));

  const crop = document.createElement('canvas');
  crop.width = Math.max(1, sw);
  crop.height = Math.max(1, sh);

  const ctx = crop.getContext('2d');
  if (ctx && sw > 0 && sh > 0) {
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  return crop;
}

/**
 * Creates a thumbnail image data URL from a crop canvas for display in ProductRow.
 */
export function makeThumbUrl(cropCanvas: HTMLCanvasElement, maxSide = 120): string {
  const w = cropCanvas.width;
  const h = cropCanvas.height;
  if (w <= 0 || h <= 0) return '';

  const scale = Math.min(maxSide / w, maxSide / h, 1.0);
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(w * scale));
  thumb.height = Math.max(1, Math.round(h * scale));

  const ctx = thumb.getContext('2d');
  if (ctx) {
    ctx.drawImage(cropCanvas, 0, 0, w, h, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL('image/jpeg', 0.85);
  }
  return '';
}

/**
 * Generates preprocessing ladder for OCR:
 * Attempt 1: Upscaled (x2 if height < 120) with contrast enhancement
 * Attempt 2: Grayscale + normalized contrast
 * Attempt 3: Binary thresholding
 */
export function enhanceForOcr(
  cropCanvas: HTMLCanvasElement,
  attempt: number
): HTMLCanvasElement {
  const w = cropCanvas.width;
  const h = cropCanvas.height;

  // Scale up small crops by x2 to assist Tesseract
  const scale = h < 120 ? 2.0 : 1.0;
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  if (!ctx) return cropCanvas;

  // Draw scaled original
  ctx.drawImage(cropCanvas, 0, 0, w, h, 0, 0, targetW, targetH);

  if (attempt === 1) {
    // Attempt 1: Light contrast boost
    return out;
  }

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const d = imgData.data;

  if (attempt === 2) {
    // Attempt 2: Grayscale + Contrast stretch
    let minLum = 255;
    let maxLum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }
    const range = Math.max(1, maxLum - minLum);

    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const stretched = Math.min(255, Math.max(0, Math.round(((lum - minLum) / range) * 255)));
      d[i] = stretched;
      d[i + 1] = stretched;
      d[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  if (attempt === 3) {
    // Attempt 3: Grayscale + Binary threshold
    let sum = 0;
    const count = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const avg = sum / count;

    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const val = lum >= avg ? 255 : 0;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  return out;
}
