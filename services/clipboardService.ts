import { CanvasNode, ClipboardPayload, ImageNode, TextNode } from '../types';
import { getImage } from './dbService';

export const STORAGE_KEY_CLIPBOARD = 'ai_mix_board_clipboard';
export const AIMIX_CLIPBOARD_MARKER = '__aimix_copy_id';

let inMemoryLastClipPayload: ClipboardPayload | null = null;

export function getInternalClipboardPayload(): ClipboardPayload | null {
  if (inMemoryLastClipPayload) {
    return inMemoryLastClipPayload;
  }
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_CLIPBOARD);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return {
          clipId: 'legacy',
          timestamp: Date.now(),
          nodes: parsed,
          isCut: false,
        };
      }
      if (parsed && Array.isArray(parsed.nodes)) {
        return parsed as ClipboardPayload;
      }
    }
  } catch {}
  return null;
}

export function clearInternalCutState(): void {
  const current = getInternalClipboardPayload();
  if (current && current.isCut) {
    current.isCut = false;
    inMemoryLastClipPayload = current;
    try {
      sessionStorage.setItem(STORAGE_KEY_CLIPBOARD, JSON.stringify(current));
    } catch {}
  }
}

export function isInternalNodeClipboardText(text: string | null | undefined): boolean {
  if (!text) return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed && parsed[AIMIX_CLIPBOARD_MARKER]);
  } catch {
    return false;
  }
}

/**
 * Convert any image Blob (JPEG, WebP, GIF, SVG, etc.) to a standard image/png Blob
 * necessary for navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
 */
export async function convertToPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(pngBlob => {
        resolve(pngBlob || blob);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

/**
 * Retrieve blob for an image node from IndexedDB, DOM element, or URL
 */
export async function getImageBlobForNode(node: ImageNode): Promise<Blob | null> {
  const fileId = node.driveFileId || node.content || node.id;

  // 1. Try loading from IndexedDB cache
  try {
    const blob = await getImage(fileId);
    if (blob) return blob;
  } catch (err) {
    console.warn('Error reading image from IndexedDB:', err);
  }

  // 2. Try fetching from DOM <img> element if already rendered
  const imgEl = document.querySelector(`[data-node-id="${node.id}"] img`) as HTMLImageElement | null;
  if (imgEl && imgEl.src) {
    try {
      if (imgEl.src.startsWith('blob:') || imgEl.src.startsWith('data:')) {
        const res = await fetch(imgEl.src);
        const blob = await res.blob();
        if (blob) return blob;
      }
    } catch {}

    // Fallback: draw imgEl directly to canvas
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth || imgEl.width;
      canvas.height = imgEl.naturalHeight || imgEl.height;
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(imgEl, 0, 0);
        return new Promise(resolve => {
          canvas.toBlob(blob => resolve(blob), 'image/png');
        });
      }
    } catch {}
  }

  // 3. Try fetching content directly if it's a URL or base64
  if (node.content && (node.content.startsWith('http') || node.content.startsWith('data:'))) {
    try {
      const res = await fetch(node.content);
      return await res.blob();
    } catch {}
  }

  return null;
}

/**
 * Copy canvas nodes to system clipboard and internal sessionStorage
 */
export async function copyNodesToClipboard(
  nodes: CanvasNode[],
  meta?: Partial<ClipboardPayload>
): Promise<{
  success: boolean;
  message: string;
  payload: ClipboardPayload;
}> {
  const clipId = meta?.clipId || `aimix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const payload: ClipboardPayload = {
    clipId,
    timestamp: Date.now(),
    nodes: nodes || [],
    isCut: Boolean(meta?.isCut),
    sourceProjectId: meta?.sourceProjectId,
    sourceSpreadsheetId: meta?.sourceSpreadsheetId,
    sourceNodeIds: meta?.sourceNodeIds || (nodes ? nodes.map(n => n.id) : []),
  };

  if (!nodes || nodes.length === 0) {
    return { success: false, message: '未選取任何物件', payload };
  }

  inMemoryLastClipPayload = payload;

  // 1. Save to internal sessionStorage for cross-board / internal canvas paste
  try {
    sessionStorage.setItem(STORAGE_KEY_CLIPBOARD, JSON.stringify(payload));
  } catch {}

  const markerData = {
    [AIMIX_CLIPBOARD_MARKER]: clipId,
    timestamp: payload.timestamp,
    isCut: payload.isCut,
    count: nodes.length,
    sourceProjectId: payload.sourceProjectId,
  };
  const markerString = JSON.stringify(markerData);

  // 2. If single image node: copy real PNG image into system clipboard
  if (nodes.length === 1 && nodes[0].type === 'image') {
    const imageNode = nodes[0] as ImageNode;
    try {
      const rawBlob = await getImageBlobForNode(imageNode);
      if (rawBlob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const pngBlob = await convertToPngBlob(rawBlob);
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': pngBlob,
              'text/plain': new Blob([markerString], { type: 'text/plain' }),
            }),
          ]);
        } catch {
          // Fallback: system may only allow 1 mime type
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob }),
          ]);
        }
        return {
          success: true,
          message: payload.isCut ? '已剪下圖片到剪貼簿' : '已複製圖片到剪貼簿',
          payload,
        };
      }
    } catch (err) {
      console.warn('Writing image to clipboard failed:', err);
    }
  }

  // 3. If single text node: copy text content to system clipboard
  if (nodes.length === 1 && nodes[0].type === 'text') {
    const textNode = nodes[0] as TextNode;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textNode.content || '');
        return {
          success: true,
          message: payload.isCut ? '已剪下文字到剪貼簿' : '已複製文字到剪貼簿',
          payload,
        };
      }
    } catch (err) {
      console.warn('Writing text to clipboard failed:', err);
    }
  }

  // 4. Multiple nodes: copy combined marker or JSON summary
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(markerString);
    } catch {}
  }

  return {
    success: true,
    message: payload.isCut ? `已剪下 ${nodes.length} 個物件` : `已複製 ${nodes.length} 個物件`,
    payload,
  };
}
