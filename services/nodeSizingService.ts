import { CanvasNode, ImageNode } from '../types';
import { getImage } from './dbService';

export const STORAGE_KEY_DEFAULT_NODE_SIZE = 'ai_mix_board_default_node_size';

export interface NodeSizeSetting {
  width: number;
  height: number;
}

// Optimal default size (width 360px, height 480px, perfectly suited for modern AI generation & illustrations)
export const DEFAULT_OPTIMAL_SIZE: NodeSizeSetting = {
  width: 360,
  height: 480,
};

/**
 * Get the user's preferred default node dimensions
 */
export function getDefaultNodeSize(): NodeSizeSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEFAULT_NODE_SIZE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.width && parsed.height) {
        return {
          width: Math.max(80, Math.min(1920, Math.round(Number(parsed.width)))),
          height: Math.max(80, Math.min(1920, Math.round(Number(parsed.height)))),
        };
      }
    }
  } catch {}
  return DEFAULT_OPTIMAL_SIZE;
}

/**
 * Save user's preferred default node dimensions
 */
export function setDefaultNodeSize(size: NodeSizeSetting): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_DEFAULT_NODE_SIZE,
      JSON.stringify({
        width: Math.round(size.width),
        height: Math.round(size.height),
      })
    );
  } catch {}
}

/**
 * Inspect natural image dimensions from DOM or Blob cache
 */
export async function getNaturalImageDimensions(
  node: ImageNode
): Promise<{ width: number; height: number } | null> {
  // 1. Check DOM image element if already loaded
  const imgEl = document.querySelector(`[data-node-id="${node.id}"] img`) as HTMLImageElement | null;
  if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
    return { width: imgEl.naturalWidth, height: imgEl.naturalHeight };
  }

  // 2. Otherwise load blob from IndexedDB cache
  const fileId = node.driveFileId || node.content || node.id;
  try {
    const blob = await getImage(fileId);
    if (blob) {
      return new Promise(resolve => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    }
  } catch {}

  return null;
}

/**
 * Reset selected nodes to their original image aspect ratio
 */
export async function resetNodesAspectRatio(
  nodes: CanvasNode[],
  onUpdateNodes: (updates: { id: string; updates: Partial<CanvasNode> }[]) => void
): Promise<number> {
  const updates: { id: string; updates: Partial<CanvasNode> }[] = [];

  for (const node of nodes) {
    if (node.type === 'image') {
      const natural = await getNaturalImageDimensions(node as ImageNode);
      if (natural && natural.width > 0 && natural.height > 0) {
        // Keep current width, recalculate height preserving native ratio
        const targetHeight = Math.max(50, Math.round((node.width / natural.width) * natural.height));
        if (targetHeight !== node.height) {
          updates.push({
            id: node.id,
            updates: { height: targetHeight },
          });
        }
      }
    }
  }

  if (updates.length > 0) {
    onUpdateNodes(updates);
  }
  return updates.length;
}

/**
 * Proportionally fit dimensions within bounding box [maxWidth, maxHeight]
 * preserving the natural aspect ratio.
 */
export function fitDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  allowUpscale: boolean = true
): { width: number; height: number } {
  if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: Math.round(maxWidth), height: Math.round(maxHeight) };
  }
  let scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  if (!allowUpscale && scale > 1) {
    scale = 1;
  }
  return {
    width: Math.max(50, Math.round(naturalWidth * scale)),
    height: Math.max(50, Math.round(naturalHeight * scale)),
  };
}

/**
 * Apply optimal default size to selected nodes, constraining both width and height
 */
export async function applyOptimalSizeToNodes(
  nodes: CanvasNode[],
  onUpdateNodes: (updates: { id: string; updates: Partial<CanvasNode> }[]) => void
): Promise<void> {
  const defaultSize = getDefaultNodeSize();
  const updates: { id: string; updates: Partial<CanvasNode> }[] = [];

  for (const node of nodes) {
    if (node.type === 'image') {
      const natural = await getNaturalImageDimensions(node as ImageNode);
      if (natural && natural.width > 0 && natural.height > 0) {
        // Fit within both width and height bounds preserving aspect ratio
        const fitted = fitDimensions(natural.width, natural.height, defaultSize.width, defaultSize.height, true);
        updates.push({
          id: node.id,
          updates: { width: fitted.width, height: fitted.height },
        });
      } else {
        // Fallback using node's current aspect ratio
        const fitted = fitDimensions(node.width, node.height, defaultSize.width, defaultSize.height, true);
        updates.push({
          id: node.id,
          updates: { width: fitted.width, height: fitted.height },
        });
      }
    } else {
      // Text node standard size, bounded by defaultSize
      updates.push({
        id: node.id,
        updates: {
          width: Math.min(node.width, Math.max(180, defaultSize.width)),
          height: Math.max(60, Math.min(node.height, Math.round(defaultSize.height * 0.4))),
        },
      });
    }
  }

  if (updates.length > 0) {
    onUpdateNodes(updates);
  }
}

/**
 * Automatically arrange selected nodes neatly into a grid, row, or column
 */
export function autoArrangeNodes(
  nodes: CanvasNode[],
  layout: 'grid' | 'horizontal' | 'vertical',
  onUpdateNodes: (updates: { id: string; updates: Partial<CanvasNode> }[]) => void
): void {
  if (nodes.length <= 1) return;

  // Sort nodes primarily by Y, then X to preserve intuitive reading/creation order
  const sorted = [...nodes].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 60) return a.y - b.y;
    return a.x - b.x;
  });

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const gap = 24;

  const updates: { id: string; updates: Partial<CanvasNode> }[] = [];

  if (layout === 'horizontal') {
    let curX = minX;
    sorted.forEach(node => {
      updates.push({ id: node.id, updates: { x: Math.round(curX), y: Math.round(minY) } });
      curX += node.width + gap;
    });
  } else if (layout === 'vertical') {
    let curY = minY;
    sorted.forEach(node => {
      updates.push({ id: node.id, updates: { x: Math.round(minX), y: Math.round(curY) } });
      curY += node.height + gap;
    });
  } else {
    // Grid layout: intelligently choose number of columns based on count
    const count = sorted.length;
    let cols = 2;
    if (count >= 10) cols = 4;
    else if (count >= 5) cols = 3;
    else if (count <= 3) cols = count;

    let curX = minX;
    let curY = minY;
    let rowMaxHeight = 0;
    let colIndex = 0;

    sorted.forEach(node => {
      if (colIndex >= cols) {
        colIndex = 0;
        curX = minX;
        curY += rowMaxHeight + gap;
        rowMaxHeight = 0;
      }

      updates.push({ id: node.id, updates: { x: Math.round(curX), y: Math.round(curY) } });
      curX += node.width + gap;
      rowMaxHeight = Math.max(rowMaxHeight, node.height);
      colIndex++;
    });
  }

  if (updates.length > 0) {
    onUpdateNodes(updates);
  }
}
