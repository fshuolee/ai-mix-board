import { CanvasNode, ImageNode, TextNode } from '../types';
import { getImage } from './dbService';

export const STORAGE_KEY_CLIPBOARD = 'ai_mix_board_clipboard';

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
export async function copyNodesToClipboard(nodes: CanvasNode[]): Promise<{
  success: boolean;
  message: string;
}> {
  if (!nodes || nodes.length === 0) {
    return { success: false, message: '未選取任何物件' };
  }

  // 1. Save to internal sessionStorage for cross-board / internal canvas paste
  try {
    sessionStorage.setItem(STORAGE_KEY_CLIPBOARD, JSON.stringify(nodes));
  } catch {}

  // 2. If single image node: copy real PNG image into system clipboard
  if (nodes.length === 1 && nodes[0].type === 'image') {
    const imageNode = nodes[0] as ImageNode;
    try {
      const rawBlob = await getImageBlobForNode(imageNode);
      if (rawBlob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const pngBlob = await convertToPngBlob(rawBlob);
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        return { success: true, message: '已複製圖片到剪貼簿' };
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
        return { success: true, message: '已複製文字到剪貼簿' };
      }
    } catch (err) {
      console.warn('Writing text to clipboard failed:', err);
    }
  }

  // 4. Multiple nodes: copy combined text or JSON summary
  const textContents = nodes
    .filter(n => n.type === 'text')
    .map(n => (n as TextNode).content)
    .filter(Boolean);

  if (textContents.length > 0 && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(textContents.join('\n\n'));
    } catch {}
  } else if (navigator.clipboard?.writeText) {
    try {
      const summary = JSON.stringify(nodes.map(n => ({
        id: n.id,
        type: n.type,
        width: n.width,
        height: n.height,
        ...(n.type === 'text' ? { content: (n as TextNode).content } : { fileName: (n as ImageNode).originalFileName })
      })), null, 2);
      await navigator.clipboard.writeText(summary);
    } catch {}
  }

  return { success: true, message: `已複製 ${nodes.length} 個物件到剪貼簿` };
}
