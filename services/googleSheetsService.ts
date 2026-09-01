import { CanvasNode, ImageNode, TextNode, ViewportState } from '../types';

async function sheetsFetch(url: string, token: string, options: RequestInit = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {}
    const message =
      errorJson?.error?.message ||
      `Google Sheets API Error (${response.status}): ${response.statusText}`;
    throw new Error(message);
  }
  return response;
}

/**
 * Find spreadsheet in a folder
 */
export async function findProjectSpreadsheet(
  token: string,
  projectFolderId: string
): Promise<{ spreadsheetId: string; sheetViewLink?: string } | null> {
  const query = `'${projectFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id, name, webViewLink)`;

  const res = await sheetsFetch(url, token);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return {
      spreadsheetId: data.files[0].id,
      sheetViewLink: data.files[0].webViewLink,
    };
  }
  return null;
}

/**
 * Create a new Google Spreadsheet configured for AI Mix Board graph storage
 */
export async function createProjectSpreadsheet(
  token: string,
  projectFolderId: string,
  projectName: string
): Promise<{ spreadsheetId: string; sheetViewLink?: string }> {
  // 1. Create Spreadsheet with predefined sheets
  const createPayload = {
    properties: {
      title: `${projectName}`,
    },
    sheets: [
      {
        properties: {
          sheetId: 0,
          title: 'Nodes',
          gridProperties: { rowCount: 100, columnCount: 12, frozenRowCount: 1 },
        },
      },
      {
        properties: {
          sheetId: 1,
          title: 'Viewport',
          gridProperties: { rowCount: 10, columnCount: 6, frozenRowCount: 1 },
        },
      },
      {
        properties: {
          sheetId: 2,
          title: 'AssetReferences',
          gridProperties: { rowCount: 100, columnCount: 8, frozenRowCount: 1 },
        },
      },
    ],
  };

  const createRes = await sheetsFetch('https://sheets.googleapis.com/v4/spreadsheets', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });

  const createdSheet = await createRes.json();
  const spreadsheetId = createdSheet.spreadsheetId;

  // 2. Move spreadsheet to project folder
  const moveRes = await sheetsFetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${projectFolderId}&removeParents=root&fields=id,parents,webViewLink`,
    token,
    {
      method: 'PATCH',
    }
  );
  const moveData = await moveRes.json();

  // 3. Initialize Headers in Sheets
  await initializeSheetHeaders(token, spreadsheetId);

  return {
    spreadsheetId,
    sheetViewLink: moveData.webViewLink || createdSheet.spreadsheetUrl,
  };
}

/**
 * Initialize headers and initial styling
 */
async function initializeSheetHeaders(token: string, spreadsheetId: string) {
  const nodeHeaders = [
    'NodeId',
    'Type',
    'X',
    'Y',
    'Width',
    'Height',
    'Rotation',
    'Content',
    'DriveFileId',
    'OriginalFileName',
    'CreatedAt',
    'UpdatedAt',
  ];

  const viewportHeaders = ['PanX', 'PanY', 'Zoom', 'SelectedModel', 'UpdatedAt'];

  const assetHeaders = [
    'DriveFileId',
    'FileName',
    'ReferenceCount',
    'DriveViewLink',
    'CreatedAt',
  ];

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Nodes!A1:L1',
            values: [nodeHeaders],
          },
          {
            range: 'Viewport!A1:E2',
            values: [viewportHeaders, [0, 0, 1, 'gemini-2.5-flash-image', new Date().toISOString()]],
          },
          {
            range: 'AssetReferences!A1:E1',
            values: [assetHeaders],
          },
        ],
      }),
    }
  );
}

/**
 * Save full canvas graph to Google Sheet
 */
export async function saveGraphToSheet(
  token: string,
  spreadsheetId: string,
  nodes: CanvasNode[],
  viewport: ViewportState,
  selectedModel: string
): Promise<void> {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is missing for this project');
  }

  // 1. Prepare Nodes Rows
  const nodeHeaders = [
    'NodeId',
    'Type',
    'X',
    'Y',
    'Width',
    'Height',
    'Rotation',
    'Content',
    'DriveFileId',
    'OriginalFileName',
    'CreatedAt',
    'UpdatedAt',
  ];

  const nodeRows: any[][] = [nodeHeaders];
  const assetRefMap = new Map<string, { count: number; name?: string }>();

  nodes.forEach(node => {
    const isImage = node.type === 'image';
    const imageNode = isImage ? (node as ImageNode) : null;
    const driveFileId = imageNode?.driveFileId || (isImage ? node.content : '');

    if (isImage && driveFileId) {
      const existing = assetRefMap.get(driveFileId) || { count: 0, name: imageNode?.originalFileName };
      existing.count += 1;
      assetRefMap.set(driveFileId, existing);
    }

    nodeRows.push([
      node.id,
      node.type,
      Math.round(node.x),
      Math.round(node.y),
      Math.round(node.width),
      Math.round(node.height),
      node.rotation || 0,
      node.type === 'text' ? (node as TextNode).content : driveFileId,
      driveFileId,
      imageNode?.originalFileName || '',
      node.createdAt || '',
      new Date().toISOString(),
    ]);
  });

  // 2. Prepare Viewport Rows
  const viewportHeaders = ['PanX', 'PanY', 'Zoom', 'SelectedModel', 'UpdatedAt'];
  const viewportRows = [
    viewportHeaders,
    [
      Math.round(viewport.x),
      Math.round(viewport.y),
      parseFloat(viewport.zoom.toFixed(3)),
      selectedModel,
      new Date().toISOString(),
    ],
  ];

  // 3. Prepare Asset References Rows (Asset Deduplication Index)
  const assetHeaders = [
    'DriveFileId',
    'FileName',
    'ReferenceCount',
    'DriveViewLink',
    'CreatedAt',
  ];
  const assetRows: any[][] = [assetHeaders];
  assetRefMap.forEach((meta, fileId) => {
    assetRows.push([
      fileId,
      meta.name || `asset_${fileId}`,
      meta.count,
      `https://drive.google.com/file/d/${fileId}/view`,
      new Date().toISOString(),
    ]);
  });

  // Clear existing nodes content first so deleted nodes aren't left behind
  try {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Nodes!A1:Z500:clear`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/AssetReferences!A1:Z500:clear`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
  } catch (e) {
    console.warn('Error clearing sheet rows', e);
  }

  // Write updated data
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `Nodes!A1:L${nodeRows.length}`,
            values: nodeRows,
          },
          {
            range: 'Viewport!A1:E2',
            values: viewportRows,
          },
          {
            range: `AssetReferences!A1:E${assetRows.length}`,
            values: assetRows,
          },
        ],
      }),
    }
  );
}

/**
 * Load canvas graph from Google Sheet
 */
export async function loadGraphFromSheet(
  token: string,
  spreadsheetId: string
): Promise<{
  nodes: CanvasNode[];
  viewport: ViewportState;
  selectedModel?: string;
}> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Nodes!A1:L500&ranges=Viewport!A1:E5`;

  const res = await sheetsFetch(url, token);
  const data = await res.json();

  const valueRanges = data.valueRanges || [];
  const nodeValues: any[][] = valueRanges[0]?.values || [];
  const viewportValues: any[][] = valueRanges[1]?.values || [];

  const nodes: CanvasNode[] = [];

  // Parse Nodes (skip row 0 header)
  if (nodeValues.length > 1) {
    for (let i = 1; i < nodeValues.length; i++) {
      const row = nodeValues[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const [
        id,
        type,
        xStr,
        yStr,
        widthStr,
        heightStr,
        rotStr,
        content,
        driveFileId,
        origFileName,
        createdAtStr,
      ] = row;

      const x = Number(xStr) || 0;
      const y = Number(yStr) || 0;
      const width = Number(widthStr) || 200;
      const height = Number(heightStr) || 100;
      const rotation = Number(rotStr) || 0;

      if (type === 'image') {
        const fileId = driveFileId || content || id;
        const imageNode: ImageNode = {
          id: String(id),
          type: 'image',
          x,
          y,
          width,
          height,
          rotation,
          content: fileId,
          driveFileId: fileId,
          originalFileName: origFileName || undefined,
          driveViewLink: fileId ? `https://drive.google.com/file/d/${fileId}/view` : undefined,
          createdAt: Number(createdAtStr) || undefined,
        };
        nodes.push(imageNode);
      } else {
        const textNode: TextNode = {
          id: String(id),
          type: 'text',
          x,
          y,
          width,
          height,
          rotation,
          content: content ? String(content) : '',
          createdAt: Number(createdAtStr) || undefined,
        };
        nodes.push(textNode);
      }
    }
  }

  // Parse Viewport
  let viewport: ViewportState = { x: 0, y: 0, zoom: 1 };
  let selectedModel = 'gemini-2.5-flash-image';

  if (viewportValues.length > 1 && viewportValues[1]) {
    const row = viewportValues[1];
    viewport = {
      x: Number(row[0]) || 0,
      y: Number(row[1]) || 0,
      zoom: Math.max(0.1, Math.min(5, Number(row[2]) || 1)),
    };
    if (row[3]) {
      selectedModel = String(row[3]);
    }
  }

  return { nodes, viewport, selectedModel };
}
