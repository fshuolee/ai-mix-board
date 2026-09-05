import { CanvasNode, ImageNode, TextNode } from '../types';
import { getImage } from '../services/dbService';
import { getAssetBlobFromDrive } from '../services/googleDriveService';
import { getAccessToken } from '../services/googleAuthService';

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Trigger native browser file download for a Blob
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
};

/**
 * Helper to download raw text as a .txt or .md file
 */
export const downloadText = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
};

/**
 * Helper to determine file extension from mime type
 */
function getExtensionFromMime(mimeType?: string): string {
  if (!mimeType) return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('svg')) return '.svg';
  return '.png';
}

/**
 * Resolve node data to a Blob with filename and mimeType
 */
export async function getNodeBlob(
  node: CanvasNode,
  token?: string
): Promise<{ blob: Blob; filename: string; mimeType: string } | null> {
  if (node.type === 'text') {
    const textNode = node as TextNode;
    const blob = new Blob([textNode.content], { type: 'text/plain;charset=utf-8' });
    const filename = `text_${node.id.slice(-6)}.txt`;
    return { blob, filename, mimeType: 'text/plain' };
  }

  if (node.type === 'image') {
    const imgNode = node as ImageNode;
    const fileId = imgNode.driveFileId || imgNode.content || node.id;
    const authToken = token || getAccessToken() || undefined;

    // 1. Try local IndexedDB cache first
    let blob: Blob | null = null;
    try {
      blob = await getImage(fileId);
    } catch (err) {
      console.warn('Failed to retrieve image from IndexedDB:', err);
    }

    // 2. Try fetching from Google Drive if driveFileId is available
    if (!blob && imgNode.driveFileId && authToken) {
      try {
        blob = await getAssetBlobFromDrive(authToken, imgNode.driveFileId);
      } catch (err) {
        console.warn('Failed to retrieve image from Drive:', err);
      }
    }

    // 3. Try fetching from content URL if it is a data URL, blob URL, or web link
    if (!blob && imgNode.content && (imgNode.content.startsWith('blob:') || imgNode.content.startsWith('data:') || imgNode.content.startsWith('http'))) {
      try {
        const res = await fetch(imgNode.content);
        if (res.ok) {
          blob = await res.blob();
        }
      } catch (err) {
        console.warn('Failed to fetch image from content URL:', err);
      }
    }

    if (!blob) {
      return null;
    }

    const mime = blob.type || imgNode.mimeType || 'image/png';
    const ext = getExtensionFromMime(mime);
    let filename = imgNode.originalFileName;
    if (!filename) {
      filename = `image_${node.id.slice(-6)}${ext}`;
    } else if (!filename.toLowerCase().endsWith(ext)) {
      // Ensure has extension
      if (!filename.includes('.')) {
        filename = `${filename}${ext}`;
      }
    }

    return { blob, filename, mimeType: mime };
  }

  return null;
}

/**
 * Download a single node asset
 */
export async function downloadSingleNode(node: CanvasNode, token?: string): Promise<boolean> {
  const result = await getNodeBlob(node, token);
  if (!result) return false;
  downloadBlob(result.blob, result.filename);
  return true;
}

/**
 * Batch download multiple nodes with a small stagger delay to avoid browser popup blocking
 */
export async function batchDownloadNodes(
  nodes: CanvasNode[],
  token?: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ successCount: number; failCount: number }> {
  let successCount = 0;
  let failCount = 0;
  const total = nodes.length;

  for (let i = 0; i < total; i++) {
    const node = nodes[i];
    try {
      const res = await getNodeBlob(node, token);
      if (res) {
        downloadBlob(res.blob, res.filename);
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      console.error('Failed to download node asset:', node.id, err);
      failCount++;
    }

    onProgress?.(i + 1, total);

    // Stagger downloads by 200ms so browsers do not drop or block subsequent downloads
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { successCount, failCount };
}

/**
 * Helper to draw rounded rectangle on Canvas 2D
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Helper to split text into lines fitting within maxWidth
 */
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    // Check characters for CJK or space-separated for western
    let currentLine = '';
    for (let i = 0; i < para.length; i++) {
      const char = para[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = char;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

export interface ExportBoardOptions {
  padding?: number;
  backgroundColor?: string;
  projectName?: string;
  token?: string;
}

/**
 * Export the current canvas / board nodes as a unified high-resolution PNG image
 */
export async function exportBoardToPng(
  nodes: CanvasNode[],
  boardName: string,
  options?: ExportBoardOptions
): Promise<boolean> {
  if (!nodes || nodes.length === 0) {
    return false;
  }

  const padding = options?.padding ?? 80;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const contentWidth = Math.max(200, maxX - minX);
  const contentHeight = Math.max(200, maxY - minY);
  const totalWidth = contentWidth + padding * 2;
  const totalHeight = contentHeight + padding * 2;

  // Scale up for high DPI retina quality, cap to 8192px
  const scale = Math.min(2, 8192 / Math.max(totalWidth, totalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalWidth * scale);
  canvas.height = Math.round(totalHeight * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.scale(scale, scale);

  // 1. Draw Background
  const bgGrad = ctx.createLinearGradient(0, 0, totalWidth, totalHeight);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Subtle dot grid background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let x = 0; x < totalWidth; x += 32) {
    for (let y = 0; y < totalHeight; y += 32) {
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  // 2. Watermark / Header badge in top-left
  const headerText = `${options?.projectName ? `${options.projectName} / ` : ''}${boardName || 'Canvas'}`;
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(headerText, padding, padding / 2 + 6);

  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.fillText(`AI MIX BOARD · ${new Date().toLocaleDateString()}`, padding, padding / 2 + 22);

  // 3. Pre-load all image assets
  const imageElements = new Map<string, HTMLImageElement>();
  const authToken = options?.token || getAccessToken() || undefined;

  await Promise.all(
    nodes.map(async node => {
      if (node.type === 'image') {
        const res = await getNodeBlob(node, authToken);
        if (res && res.blob) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const objUrl = URL.createObjectURL(res.blob);
          await new Promise<void>(resolve => {
            img.onload = () => {
              imageElements.set(node.id, img);
              URL.revokeObjectURL(objUrl);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(objUrl);
              resolve();
            };
            img.src = objUrl;
          });
        }
      }
    })
  );

  // 4. Render all nodes in order
  for (const node of nodes) {
    const drawX = node.x - minX + padding;
    const drawY = node.y - minY + padding;
    const w = node.width;
    const h = node.height;
    const cornerRadius = 14;

    ctx.save();

    // Node drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;

    // Node background container
    drawRoundedRect(ctx, drawX, drawY, w, h, cornerRadius);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Reset shadow for inner content
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Node border
    drawRoundedRect(ctx, drawX, drawY, w, h, cornerRadius);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (node.type === 'image') {
      const img = imageElements.get(node.id);
      if (img && img.width > 0 && img.height > 0) {
        // Clip to rounded rect
        ctx.save();
        drawRoundedRect(ctx, drawX, drawY, w, h, cornerRadius);
        ctx.clip();

        // Calculate aspect ratio fit (object-contain)
        const imgAspect = img.width / img.height;
        const cardAspect = w / h;
        let renderW = w;
        let renderH = h;
        let offX = 0;
        let offY = 0;

        if (imgAspect > cardAspect) {
          renderW = w;
          renderH = w / imgAspect;
          offY = (h - renderH) / 2;
        } else {
          renderH = h;
          renderW = h * imgAspect;
          offX = (w - renderW) / 2;
        }

        ctx.drawImage(img, drawX + offX, drawY + offY, renderW, renderH);
        ctx.restore();
      } else {
        // Placeholder text if image cannot be rendered
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('圖像資源', drawX + w / 2, drawY + h / 2);
      }
    } else if (node.type === 'text') {
      const textNode = node as TextNode;
      // Draw text card inner styling
      ctx.save();
      drawRoundedRect(ctx, drawX, drawY, w, h, cornerRadius);
      ctx.clip();

      const textPadding = 14;
      const maxTextWidth = w - textPadding * 2;
      const lineHeight = 18;
      ctx.font = '13px Inter, -apple-system, system-ui, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const lines = wrapCanvasText(ctx, textNode.content || '', maxTextWidth);
      let curY = drawY + textPadding;
      for (const line of lines) {
        if (curY + lineHeight > drawY + h - textPadding) break;
        ctx.fillText(line, drawX + textPadding, curY);
        curY += lineHeight;
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // 5. Convert offscreen canvas to PNG blob and trigger download
  return new Promise<boolean>(resolve => {
    canvas.toBlob(blob => {
      if (!blob) {
        resolve(false);
        return;
      }
      const safeBoardName = (boardName || 'board').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
      const filename = `${safeBoardName}_${new Date().toISOString().slice(0, 10)}.png`;
      downloadBlob(blob, filename);
      resolve(true);
    }, 'image/png');
  });
}