import { ProjectMetadata } from '../types';
import { getImage, storeImage, deleteImage, calculateBlobHash, getFileIdByHash } from './dbService';
import { createProjectSpreadsheet } from './googleSheetsService';
import { refreshGoogleToken } from './googleAuthService';

const ROOT_FOLDER_NAME = 'ai-mix-board';

/**
 * Helper to call Google Drive API with Bearer token authentication
 */
async function driveFetch(
  url: string,
  token: string,
  options: RequestInit = {},
  hasRetried = false
): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });

  // If unauthorized and hasn't retried, attempt silent token refresh and retry
  if (response.status === 401 && !hasRetried) {
    try {
      const refreshedToken = await refreshGoogleToken();
      if (refreshedToken) {
        return driveFetch(url, refreshedToken, options, true);
      }
    } catch (refreshErr) {
      console.warn('Failed to refresh token after 401 in driveFetch:', refreshErr);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson: any;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // not json
    }
    const message =
      errorJson?.error?.message ||
      `Google Drive API Error (${response.status}): ${response.statusText}`;
    throw new Error(message);
  }
  return response;
}

/**
 * Ensure root folder 'ai-mix-board' exists in user's Drive.
 */
export async function ensureRootFolder(token: string): Promise<string> {
  const query = `name = '${ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id, name, webViewLink)&spaces=drive`;

  const res = await driveFetch(url, token);
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create root folder if not found
  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    }),
  });

  const created = await createRes.json();
  return created.id;
}

/**
 * List all projects under 'ai-mix-board/'
 */
export async function listProjects(token: string): Promise<ProjectMetadata[]> {
  const rootFolderId = await ensureRootFolder(token);

  const query = `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id, name, webViewLink, createdTime, modifiedTime)&orderBy=modifiedTime desc`;

  const res = await driveFetch(url, token);
  const data = await res.json();

  const folders: any[] = data.files || [];
  const projects: ProjectMetadata[] = [];

  for (const folder of folders) {
    // Find spreadsheet and assets folder in this project folder
    const childQuery = `'${folder.id}' in parents and trashed = false`;
    const childUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      childQuery
    )}&fields=files(id, name, mimeType, webViewLink)`;

    try {
      const childRes = await driveFetch(childUrl, token);
      const childData = await childRes.json();
      const children: any[] = childData.files || [];

      const sheetFile = children.find(
        f => f.mimeType === 'application/vnd.google-apps.spreadsheet'
      );
      const assetsFolder = children.find(
        f =>
          f.mimeType === 'application/vnd.google-apps.folder' && f.name.toLowerCase() === 'assets'
      );

      projects.push({
        id: folder.id,
        name: folder.name,
        folderId: folder.id,
        spreadsheetId: sheetFile ? sheetFile.id : '',
        assetsFolderId: assetsFolder ? assetsFolder.id : undefined,
        webViewLink: folder.webViewLink,
        sheetViewLink: sheetFile ? sheetFile.webViewLink : undefined,
        createdAt: folder.createdTime,
        updatedAt: folder.modifiedTime,
      });
    } catch (e) {
      console.warn(`Error loading contents for folder ${folder.name}:`, e);
      projects.push({
        id: folder.id,
        name: folder.name,
        folderId: folder.id,
        spreadsheetId: '',
        webViewLink: folder.webViewLink,
        createdAt: folder.createdTime,
        updatedAt: folder.modifiedTime,
      });
    }
  }

  return projects;
}

/**
 * Ensure a project has an assets folder
 */
export async function ensureAssetsFolder(token: string, projectFolderId: string): Promise<string> {
  const query = `'${projectFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = 'assets' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id, name)`;

  const res = await driveFetch(url, token);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'assets',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [projectFolderId],
    }),
  });

  const created = await createRes.json();
  return created.id;
}

/**
 * Create a new project folder + assets folder + Google Sheet
 */
export async function createProject(
  token: string,
  projectName: string
): Promise<ProjectMetadata> {
  const cleanName = projectName.trim() || '未命名畫布專案';
  const rootFolderId = await ensureRootFolder(token);

  // 1. Create project folder under ai-mix-board/
  const folderRes = await driveFetch('https://www.googleapis.com/drive/v3/files', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }),
  });
  const projectFolder = await folderRes.json();

  // 2. Create assets folder inside project folder
  const assetsFolderId = await ensureAssetsFolder(token, projectFolder.id);

  // 3. Create Google Sheet inside project folder
  const { spreadsheetId, sheetViewLink } = await createProjectSpreadsheet(
    token,
    projectFolder.id,
    cleanName
  );

  return {
    id: projectFolder.id,
    name: cleanName,
    folderId: projectFolder.id,
    spreadsheetId,
    assetsFolderId,
    webViewLink: projectFolder.webViewLink,
    sheetViewLink,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Upload an image asset to Google Drive under the project's assets folder.
 * Uses binary multipart/related to optimize memory and upload throughput.
 */
export async function uploadAssetToDrive(
  token: string,
  targetFolderId: string,
  blob: Blob,
  fileName: string
): Promise<{ fileId: string; name: string; webViewLink?: string; thumbnailLink?: string }> {
  // Check if identical asset already exists by SHA-256 fingerprint
  const blobHash = await calculateBlobHash(blob);
  const existingFileId = await getFileIdByHash(blobHash);
  if (existingFileId) {
    return {
      fileId: existingFileId,
      name: fileName,
      webViewLink: `https://drive.google.com/file/d/${existingFileId}/view`,
    };
  }

  const boundary = `-------AIMixBoard${Date.now()}`;
  const mimeType = blob.type || 'image/png';

  const metadata = {
    name: fileName,
    mimeType,
    parents: [targetFolderId],
  };

  const headerPart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;

  const footerPart = `\r\n--${boundary}--`;

  const multipartBlob = new Blob([headerPart, blob, footerPart], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink',
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBlob,
    }
  );

  const fileData = await res.json();

  // Cache locally in IndexedDB with hash for deduplication
  await storeImage(fileData.id, blob, blobHash);

  return {
    fileId: fileData.id,
    name: fileData.name,
    webViewLink: fileData.webViewLink,
    thumbnailLink: fileData.thumbnailLink,
  };
}

/**
 * Fetch image asset blob from Google Drive API, with local IndexedDB caching.
 */
export async function getAssetBlobFromDrive(token: string, fileId: string): Promise<Blob | null> {
  // Check local IndexedDB cache first
  try {
    const cached = await getImage(fileId);
    if (cached) {
      return cached;
    }
  } catch (e) {
    console.warn('Cache lookup failed for fileId', fileId, e);
  }

  // Fetch from Google Drive API
  try {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      token
    );
    const blob = await res.blob();
    // Cache in IndexedDB for subsequent requests
    await storeImage(fileId, blob);
    return blob;
  } catch (err) {
    console.error(`Failed to download asset ${fileId} from Drive:`, err);
    return null;
  }
}

/**
 * Delete image asset file from Google Drive and remove from local cache.
 */
export async function deleteAssetFromDrive(token: string, fileId: string): Promise<void> {
  try {
    // Delete/trash from Google Drive
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, token, {
      method: 'DELETE',
    });
  } catch (err: any) {
    console.warn(`Failed to delete asset ${fileId} from Google Drive:`, err.message);
  }

  // Remove from IndexedDB cache
  try {
    await deleteImage(fileId);
  } catch (e) {
    console.warn(`Failed to delete local cached asset ${fileId}:`, e);
  }
}

/**
 * Rename project folder & spreadsheet
 */
export async function renameProject(
  token: string,
  folderId: string,
  newName: string,
  spreadsheetId?: string
): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });

  if (spreadsheetId) {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
  }
}

/**
 * Delete / trash project folder
 */
export async function deleteProject(token: string, folderId: string): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}
