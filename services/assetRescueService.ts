import { CanvasNode, ImageNode } from '../types';
import { getAllLocalImages, storeImage, isDriveFileId } from './dbService';
import {
  listAllDriveProjectAssets,
  getAssetBlobFromDrive,
  uploadAssetToDrive,
  ensureAssetsFolder,
  getFileParentFolderId,
} from './googleDriveService';
import { getDefaultNodeSize } from './nodeSizingService';
import { nodeObjectUrlCache } from '../components/NodeRenderer';

export interface RescuableAsset {
  id: string; // Unique key for selection
  source: 'local' | 'drive';
  name: string;
  blob?: Blob;
  previewUrl?: string;
  driveFileId?: string;
  driveViewLink?: string;
  size?: number;
  createdAt?: number;
}

/**
 * Scan both local IndexedDB and Google Drive to discover image assets
 * that exist in storage but are NOT currently represented on any canvas board.
 */
export async function scanForLostAssets(
  currentNodes: CanvasNode[],
  token?: string | null,
  projectFolderId?: string,
  spreadsheetId?: string,
  assetsFolderId?: string
): Promise<RescuableAsset[]> {
  // 1. Collect all IDs and Drive File IDs currently in use on canvas
  const usedIdentifiers = new Set<string>();
  currentNodes.forEach(node => {
    if (node.type === 'image') {
      const img = node as ImageNode;
      if (img.id) usedIdentifiers.add(img.id);
      if (img.content) usedIdentifiers.add(img.content);
      if (img.driveFileId) usedIdentifiers.add(img.driveFileId);
    }
  });

  const discoveredAssets: RescuableAsset[] = [];
  const seenKeys = new Set<string>();

  // 2. We NO LONGER scan Local IndexedDB for lost assets.
  // Because IndexedDB is global per origin, scanning it pulls in "lost" assets from ALL OTHER projects,
  // causing exponential cache duplication when switching projects.
  // Lost assets should ONLY be recovered from the project's specific Google Drive folder.

  // 3. Scan Google Drive (if token and project folders available)
  if (token) {
    try {
      let resolvedFolderId = projectFolderId;
      if (!resolvedFolderId && spreadsheetId) {
        resolvedFolderId = (await getFileParentFolderId(token, spreadsheetId)) || undefined;
      }

      if (resolvedFolderId || assetsFolderId) {
        const driveRecords = await listAllDriveProjectAssets(
          token,
          resolvedFolderId,
          assetsFolderId
        );

        for (const driveFile of driveRecords) {
          // Ignore automatic Drive cache files to avoid exponential duplication across projects
          if (driveFile.name?.startsWith('Drive快取檔案')) {
            continue;
          }

          // If not currently used in nodes and not duplicate of local record
          if (!usedIdentifiers.has(driveFile.id) && !seenKeys.has(driveFile.id)) {
            const asset: RescuableAsset = {
              id: `drive_${driveFile.id}`,
              source: 'drive',
              name: driveFile.name || `Drive圖片 (${driveFile.id.slice(0, 8)}...)`,
              driveFileId: driveFile.id,
              driveViewLink: driveFile.webViewLink,
              previewUrl: driveFile.thumbnailLink,
              size: driveFile.size,
              createdAt: driveFile.createdTime ? new Date(driveFile.createdTime).getTime() : undefined,
            };
            seenKeys.add(driveFile.id);
            discoveredAssets.push(asset);
          }
        }
      }
    } catch (driveErr) {
      console.warn('Error scanning Google Drive for lost assets:', driveErr);
    }
  }

  return discoveredAssets;
}

/**
 * Restore selected rescued assets onto the canvas in a clean grid arrangement.
 */
export async function restoreAssetsToCanvas(
  assetsToRestore: RescuableAsset[],
  currentBoardNodes: CanvasNode[],
  boardId: string,
  canvasCenter: { x: number; y: number },
  token?: string | null,
  projectFolderId?: string,
  assetsFolderId?: string
): Promise<{ restoredNodes: ImageNode[] }> {
  if (assetsToRestore.length === 0) {
    return { restoredNodes: [] };
  }

  const defaultSize = getDefaultNodeSize();
  const cardWidth = defaultSize.width || 384;
  const cardHeight = defaultSize.height || 384;
  const gap = 40;
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(assetsToRestore.length))));

  // Determine starting coordinate (offset to the right or below existing content)
  let startX = canvasCenter.x - ((cols * (cardWidth + gap)) - gap) / 2;
  let startY = canvasCenter.y - cardHeight / 2;

  if (currentBoardNodes.length > 0) {
    const maxX = Math.max(...currentBoardNodes.map(n => n.x + n.width));
    const minY = Math.min(...currentBoardNodes.map(n => n.y));
    startX = maxX + 80;
    startY = minY;
  }

  // Ensure assets folder in Drive is ready if token is available
  let resolvedAssetsFolderId = assetsFolderId;
  if (token && projectFolderId && !resolvedAssetsFolderId) {
    try {
      resolvedAssetsFolderId = await ensureAssetsFolder(token, projectFolderId);
    } catch {}
  }

  const restoredNodes: ImageNode[] = [];

  for (let i = 0; i < assetsToRestore.length; i++) {
    const asset = assetsToRestore[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = startX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);
    const newNodeId = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6);

    let driveFileId = asset.driveFileId;
    let driveViewLink = asset.driveViewLink;
    let blob = asset.blob;

    // If source is drive and we don't have local blob, fetch it in background
    if (!blob && driveFileId && token) {
      try {
        blob = (await getAssetBlobFromDrive(token, driveFileId)) || undefined;
      } catch (fetchErr) {
        console.warn(`Could not preload blob for restored asset ${driveFileId}:`, fetchErr);
      }
    }

    // If source is local and we have token + assetsFolder, upload to Drive!
    if (blob && (!driveFileId || !isDriveFileId(driveFileId)) && token && resolvedAssetsFolderId) {
      try {
        const uploaded = await uploadAssetToDrive(
          token,
          resolvedAssetsFolderId,
          blob,
          asset.name || `rescued_${newNodeId}.png`
        );
        driveFileId = uploaded.fileId;
        driveViewLink = uploaded.webViewLink;
      } catch (uploadErr) {
        console.warn(`Could not upload local rescued asset ${newNodeId} to Drive:`, uploadErr);
      }
    }

    const finalFileId = driveFileId || newNodeId;

    if (blob) {
      await storeImage(finalFileId, blob, undefined, isDriveFileId(finalFileId));
      if (finalFileId !== newNodeId) {
        await storeImage(newNodeId, blob, undefined, false);
      }
      try {
        const objectUrl = URL.createObjectURL(blob);
        nodeObjectUrlCache.set(finalFileId, objectUrl);
        nodeObjectUrlCache.set(newNodeId, objectUrl);
      } catch {}
    }

    const node: ImageNode = {
      id: newNodeId,
      type: 'image',
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      rotation: 0,
      boardId,
      content: finalFileId,
      driveFileId: isDriveFileId(finalFileId) ? finalFileId : undefined,
      originalFileName: asset.name,
      driveViewLink,
      status: 'idle',
      createdAt: asset.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    restoredNodes.push(node);
  }

  return { restoredNodes };
}
