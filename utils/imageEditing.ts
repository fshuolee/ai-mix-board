import type { ImageCrop, ImageEdits, ImagePoint } from '../types';

export const IMAGE_EDITOR_CONFIG = {
  defaultColor: '#ef4444',
  defaultBrushWidth: 0.025,
  minBrushWidth: 0.005,
  maxBrushWidth: 0.2,
  brushStep: 0.005,
  minPointDistance: 0.001,
  coordinatePrecision: 5,
  minCropSize: 0.01,
  // Leave room below Sheets' per-cell limit for serialization and future metadata.
  maxSerializedLength: 45000,
  cropRatios: [
    { value: 'free', label: '自由比例', ratio: undefined },
    { value: '1:1', label: '1:1', ratio: 1 },
    { value: '4:3', label: '4:3', ratio: 4 / 3 },
    { value: '3:4', label: '3:4', ratio: 3 / 4 },
    { value: '16:9', label: '16:9', ratio: 16 / 9 },
    { value: '9:16', label: '9:16', ratio: 9 / 16 },
  ],
};

export const hasImageEdits = (edits?: ImageEdits): boolean => Boolean(edits?.crop || edits?.strokes?.length);
export const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
export const roundCoordinate = (value: number) => Number(value.toFixed(IMAGE_EDITOR_CONFIG.coordinatePrecision));

/** A fixed ratio is expressed in image pixels; normalized x/y use different scales. */
export function cropFromDrag(start: ImagePoint, end: ImagePoint, imageWidth: number, imageHeight: number, ratio?: number): ImageCrop {
  let width = Math.abs(end.x - start.x);
  let height = Math.abs(end.y - start.y);
  if (ratio) {
    const normalizedRatio = ratio * imageHeight / imageWidth;
    width = Math.min(width, height * normalizedRatio);
    height = width / normalizedRatio;
  }
  return { x: roundCoordinate(Math.min(start.x, start.x + Math.sign(end.x - start.x) * width)),
    y: roundCoordinate(Math.min(start.y, start.y + Math.sign(end.y - start.y) * height)),
    width: roundCoordinate(width), height: roundCoordinate(height) };
}

export function loadEditableImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('無法載入可編輯的圖片，請重新載入或將圖片上傳後再試。'));
    image.src = url;
  });
}

/** One renderer for editor, board preview and generation. Erasure affects the source AND annotations. */
export function renderEditedImage(image: HTMLImageElement, edits?: ImageEdits, applyCrop = true): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width || !canvas.height) throw new Error('無法建立圖片編輯畫布');
  ctx.drawImage(image, 0, 0);
  for (const stroke of edits?.strokes || []) {
    if (!stroke.points.length) continue;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width * Math.min(canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const first = stroke.points[0];
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x * canvas.width, first.y * canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      stroke.points.slice(1).forEach(point => ctx.lineTo(point.x * canvas.width, point.y * canvas.height));
      ctx.stroke();
    }
    ctx.restore();
  }
  if (!applyCrop || !edits?.crop) return canvas;
  const crop = edits.crop;
  const x = Math.min(canvas.width - 1, Math.round(clampUnit(crop.x) * canvas.width));
  const y = Math.min(canvas.height - 1, Math.round(clampUnit(crop.y) * canvas.height));
  const result = document.createElement('canvas');
  result.width = Math.max(1, Math.min(canvas.width - x, Math.round(crop.width * canvas.width)));
  result.height = Math.max(1, Math.min(canvas.height - y, Math.round(crop.height * canvas.height)));
  const resultCtx = result.getContext('2d');
  if (!resultCtx) throw new Error('無法裁切圖片');
  resultCtx.drawImage(canvas, x, y, result.width, result.height, 0, 0, result.width, result.height);
  return result;
}

export async function getEditedImageBlob(original: Blob, edits?: ImageEdits): Promise<Blob> {
  if (!hasImageEdits(edits)) return original;
  const url = URL.createObjectURL(original);
  try {
    const image = await loadEditableImage(url);
    const canvas = renderEditedImage(image, edits);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('無法匯出修改後的圖片')), 'image/png'
    ));
  } finally { URL.revokeObjectURL(url); }
}

/** Project files are data; reject malformed edits rather than feeding invalid coordinates to Canvas. */
export function parseImageEdits(value: unknown): ImageEdits | undefined {
  if (!value) return undefined;
  try {
    const edits = typeof value === 'string' ? JSON.parse(value) : value;
    const unit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
    const point = (p: ImagePoint) => p && unit(p.x) && unit(p.y);
    if (!Array.isArray(edits.strokes) || !edits.strokes.every(stroke =>
      stroke && ['pen', 'eraser'].includes(stroke.tool) && typeof stroke.color === 'string' && /^#[\da-f]{6}$/i.test(stroke.color) &&
      unit(stroke.width) && stroke.width > 0 && Array.isArray(stroke.points) && stroke.points.every(point))) return undefined;
    if (edits.crop && !(point(edits.crop) && unit(edits.crop.width) && edits.crop.width > 0 && unit(edits.crop.height) && edits.crop.height > 0 &&
      edits.crop.x + edits.crop.width <= 1.00001 && edits.crop.y + edits.crop.height <= 1.00001)) return undefined;
    return hasImageEdits(edits) ? edits : undefined;
  } catch { return undefined; }
}
