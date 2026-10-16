import type { CanvasNode, SourceDetail } from '../types';
import { expandImageVariantNodes, getImageVariants, removeImageVariant } from '../utils/imageVariants';
import { deleteAssetFromDrive } from './googleDriveService';
import type { AssetDeletionFile } from '../types';

/** A file may still be used by a different board, variant, or a saved generation recipe. */
function referencedFileIds(nodes: CanvasNode[], aliases: Map<string, Set<string>>): Set<string> {
  const ids = new Set<string>();
  const addSource = (source: SourceDetail) => {
    if (source.type === 'image' || source.type === 'video') {
      for (const key of [source.id, source.driveFileId, source.content]) {
        if (!key) continue;
        ids.add(key);
        aliases.get(key)?.forEach(fileId => ids.add(fileId));
      }
    }
  };
  for (const node of expandImageVariantNodes(nodes)) {
    if (node.type === 'image' || node.type === 'video') {
      // Current assets have exact storage IDs. Only historical recipes need alias resolution;
      // a legacy variant ID may equal a board ID now showing a different representative.
      if (node.driveFileId) ids.add(node.driveFileId);
      if (node.content) ids.add(node.content);
    }
    node.generationSourceDetails?.forEach(addSource);
  }
  return ids;
}

export function getVariantOrphanFiles(nodes: CanvasNode[], nodeId: string, variantId: string): AssetDeletionFile[] {
  const target = nodes.find(node => node.id === nodeId);
  if (target?.type !== 'image') return [];
  const variants = getImageVariants(target);
  const variant = variants.find(item => item.id === variantId);
  if (variants.length <= 1 || !variant?.driveFileId) return [];
  // Saved recipes can retain the local key from before upload. Build this map BEFORE
  // excluding the deleted version, while its local-ID-to-Drive association is still known.
  const aliases = new Map<string, Set<string>>();
  for (const asset of [...nodes, ...expandImageVariantNodes(nodes)]) {
    if ((asset.type !== 'image' && asset.type !== 'video') || !asset.driveFileId) continue;
    for (const key of [asset.id, asset.content, asset.driveFileId]) {
      if (!key) continue;
      const files = aliases.get(key) || new Set<string>();
      files.add(asset.driveFileId); aliases.set(key, files);
    }
  }
  const remaining = nodes.map(node => node.id === nodeId ? removeImageVariant(target, variantId) : node);
  if (referencedFileIds(remaining, aliases).has(variant.driveFileId)) return [];
  return [{ fileId: variant.driveFileId, fileName: variant.originalFileName || variant.driveFileId }];
}

/** Never remove the version if Drive refuses the trash request. The caller commits removal only after success. */
export async function trashVariantFiles(nodes: CanvasNode[], nodeId: string, variantId: string, token?: string | null): Promise<void> {
  const files = getVariantOrphanFiles(nodes, nodeId, variantId);
  if (!files.length) return;
  if (!token) throw new Error('請先登入 Google 帳號，再移至雲端垃圾桶。');
  for (const file of files) await deleteAssetFromDrive(token, file.fileId);
}
