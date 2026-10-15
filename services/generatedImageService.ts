import type { ImageNode, ImageVariant, ProjectMetadata } from '../types';
import type { GenerationResult } from './geminiService';
import { storeImage } from './dbService';
import { getAccessToken, getValidAccessToken } from './googleAuthService';
import { ensureAssetsFolder, getFileParentFolderId, uploadAssetToDrive } from './googleDriveService';
import { fetchImageBlob } from './atlasCloudService';
import { snapshotImageVariant } from '../utils/imageVariants';
import { getDefaultNodeSize, fitDimensions } from './nodeSizingService';

/** Each result gets a fresh cache/Drive asset ID, never the board node's ID or a previous variant's ID. */
export async function saveGeneratedImage(result: Extract<GenerationResult, { type: 'image' }>, recipe: ImageNode, project?: ProjectMetadata | null): Promise<ImageVariant> {
  const id = `gen_${crypto.randomUUID()}`;
  let blob = result.blob;
  if (!blob && result.url) blob = await fetchImageBlob(result.url) || undefined;
  if (!blob) throw new Error('無法保存生成的圖片，請重試。');
  await storeImage(id, blob);
  let content = id;
  let driveFileId: string | undefined;
  let driveViewLink: string | undefined;
  const originalFileName = `generated_${id}.png`;
  const token = await getValidAccessToken() || getAccessToken();
  if (token && project) {
    try {
      const folderId = project.folderId || await getFileParentFolderId(token, project.spreadsheetId);
      if (folderId) {
        const assetsFolder = project.assetsFolderId || await ensureAssetsFolder(token, folderId);
        const uploaded = await uploadAssetToDrive(token, assetsFolder, blob, originalFileName);
        content = uploaded.fileId; driveFileId = uploaded.fileId; driveViewLink = uploaded.webViewLink;
        await storeImage(driveFileId, blob, undefined, true);
        await storeImage(id, blob, undefined, true);
      }
    } catch (error) { console.warn('Generated variant saved locally; Drive sync will retry:', error); }
  }
  const bitmap = await createImageBitmap(blob);
  const defaultSize = getDefaultNodeSize();
  const fitted = fitDimensions(bitmap.width, bitmap.height, defaultSize.width, defaultSize.height, false);
  bitmap.close();
  return snapshotImageVariant({ ...recipe, ...fitted, content, driveFileId, driveViewLink, originalFileName, mimeType: blob.type,
    imageEdits: undefined, variants: undefined, activeVariantId: undefined }, id, Date.now());
}
