import type { CanvasNode, ImageNode, ImageVariant } from '../types';
import { parseImageEdits } from './imageEditing';

/** Copy every optional field explicitly so switching cannot inherit another variant's recipe/overlay. */
export function snapshotImageVariant(node: ImageNode, id = node.activeVariantId || node.id, createdAt = node.createdAt || Date.now()): ImageVariant {
  return { id, content: node.content, driveFileId: node.driveFileId, driveViewLink: node.driveViewLink,
    originalFileName: node.originalFileName, mimeType: node.mimeType, imageEdits: node.imageEdits,
    width: node.width, height: node.height, createdAt,
    generationPrompt: node.generationPrompt, generationModel: node.generationModel, generationModelId: node.generationModelId,
    generationParams: node.generationParams, generationSourceIds: node.generationSourceIds, generationSourceDetails: node.generationSourceDetails };
}

export function getImageVariants(node: ImageNode): ImageVariant[] {
  if (!node.variants?.length) return node.content ? [snapshotImageVariant(node)] : [];
  // The representative's latest edits live on the board node until the next snapshot/save.
  return node.variants.map(variant => variant.id === node.activeVariantId
    ? { ...snapshotImageVariant(node, variant.id, variant.createdAt), syncError: variant.syncError } : variant);
}

export function applyImageVariant(node: ImageNode, variant: ImageVariant): ImageNode {
  const { id: _variantId, createdAt: _variantCreatedAt, ...fields } = snapshotImageVariant(variant as ImageNode, variant.id, variant.createdAt);
  return { ...node, ...fields, activeVariantId: variant.id, status: 'idle', errorMessage: undefined };
}

export function selectImageVariant(node: ImageNode, id: string): ImageNode {
  const variants = getImageVariants(node);
  const variant = variants.find(item => item.id === id);
  return variant ? applyImageVariant({ ...node, variants }, variant) : node;
}

/** Remove the version reference only; original assets may still serve another node or generation recipe. */
export function removeImageVariant(node: ImageNode, id: string): ImageNode {
  const variants = getImageVariants(node);
  if (variants.length <= 1 || !variants.some(variant => variant.id === id)) return node;
  const remaining = variants.filter(variant => variant.id !== id);
  const activeId = node.activeVariantId || variants[0].id;
  if (activeId !== id) return { ...node, variants: remaining, activeVariantId: activeId };
  const next = remaining[remaining.length - 1];
  return applyImageVariant({ ...node, variants: remaining }, next);
}

export function appendImageVariant(node: ImageNode, variant: ImageVariant): ImageNode {
  const variants = getImageVariants(node);
  if (variants.some(item => item.id === variant.id)) return node;
  const next = { ...node, variants: [...variants, variant], activeVariantId: node.activeVariantId || variants[0]?.id,
    variantStatus: undefined, variantError: undefined, status: 'idle' as const, errorMessage: undefined };
  return variants.length ? next : applyImageVariant(next, variant);
}

/** Flatten only for asset operations; variants remain one visible board node. */
export function expandImageVariantNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.flatMap(node => node.type === 'image' && node.variants?.length
    ? getImageVariants(node).map(variant => ({ ...node, ...variant, type: 'image' as const, variants: undefined, activeVariantId: undefined,
      variantStatus: undefined, variantError: undefined, status: variant.syncError ? 'error' as const : 'idle' as const, errorMessage: variant.syncError })) : [node]);
}

export function restoreImageVariantNodes(nodes: CanvasNode[], assets: CanvasNode[]): CanvasNode[] {
  let index = 0;
  return nodes.map(node => {
    if (node.type !== 'image' || !node.variants?.length) return assets[index++];
    const variants = getImageVariants(node).map(variant => {
      const asset = assets[index++] as ImageNode;
      return { ...snapshotImageVariant(asset, variant.id, variant.createdAt),
        syncError: asset.status === 'error' ? asset.errorMessage || '圖片尚未同步至 Google Drive' : undefined };
    });
    const active = variants.find(variant => variant.id === node.activeVariantId) || variants[0];
    return applyImageVariant({ ...node, variants }, active);
  });
}

/** Upload completion merges asset references into current state, preserving newer edits, variants and selection. */
export function mergeSyncedImageAssets(current: CanvasNode[], before: CanvasNode[], after: CanvasNode[]): CanvasNode[] {
  const original = new Map(expandImageVariantNodes(before).map(asset => [asset.id, asset]));
  const uploaded = new Map(expandImageVariantNodes(after).map(asset => [asset.id, asset]));
  const assets = expandImageVariantNodes(current).map(asset => {
    const old = original.get(asset.id), next = uploaded.get(asset.id);
    if (!old || !next || asset.content !== old.content || asset.status === 'generating') return asset;
    if (next.content === old.content && next.status === old.status && next.errorMessage === old.errorMessage) return asset;
    return { ...asset, content: next.content, status: next.status, errorMessage: next.errorMessage,
      ...('driveFileId' in next ? { driveFileId: next.driveFileId, driveViewLink: next.driveViewLink } : {}) };
  });
  return restoreImageVariantNodes(current, assets);
}

export function parseImageVariants(value: unknown): ImageVariant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const variants = value.filter(variant => variant && typeof variant.id === 'string' && typeof variant.content === 'string' &&
    variant.content && Number.isFinite(variant.width) && variant.width > 0 && Number.isFinite(variant.height) && variant.height > 0 &&
    !ids.has(variant.id) && ids.add(variant.id)).map(variant => ({ ...variant, imageEdits: parseImageEdits(variant.imageEdits) }));
  return variants.length ? variants : undefined;
}
