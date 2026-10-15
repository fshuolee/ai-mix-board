import type { ImageNode } from '../types';
import { getNodeBlob } from '../utils/canvasUtils';
import { getEditedImageBlob, loadEditableImage } from '../utils/imageEditing';

type RemoteImageFetcher = (url: string) => Promise<Blob | null>;

/** Shared fallback for remote references whose pixels require the configured CORS proxy. */
export async function getOriginalImageBlob(node: ImageNode, token?: string, fetchRemote?: RemoteImageFetcher): Promise<Blob> {
  const source = await getNodeBlob(node, token);
  if (source) return source.blob;
  const url = [node.content, node.driveViewLink].find(value => value && /^https?:/.test(value));
  if (url && fetchRemote) {
    const blob = await fetchRemote(url);
    if (blob) return blob;
  }
  throw new Error('無法讀取參考圖片，請重新載入圖片後再生成。');
}

/** Original assets stay in their existing cache/Drive location; composites are request-local. */
export async function prepareImageForGeneration(node: ImageNode, token?: string, fetchRemote?: RemoteImageFetcher): Promise<Blob> {
  const source = await getOriginalImageBlob(node, token, fetchRemote);
  return getEditedImageBlob(source, node.imageEdits);
}

/** Canvas needs CORS-readable pixels even when an ordinary <img> can display the remote asset. */
export async function loadNodeImage(node: ImageNode, sourceUrl: string, fetchRemote?: RemoteImageFetcher): Promise<{ image: HTMLImageElement; release: () => void }> {
  try { return { image: await loadEditableImage(sourceUrl), release: () => {} }; }
  catch {
    const original = await getOriginalImageBlob(node, undefined, fetchRemote);
    const url = URL.createObjectURL(original);
    try { return { image: await loadEditableImage(url), release: () => URL.revokeObjectURL(url) }; }
    catch (error) { URL.revokeObjectURL(url); throw error; }
  }
}
