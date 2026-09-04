import { BoardMetadata, CanvasNode, ImageNode, TextNode, ViewportState } from '../types';
import { refreshGoogleToken } from './googleAuthService';

async function sheetsFetch(
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
        return sheetsFetch(url, refreshedToken, options, true);
      }
    } catch (refreshErr) {
      console.warn('Failed to refresh token after 401 in sheetsFetch:', refreshErr);
    }
  }

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
 * Create a new Google Spreadsheet configured for AI Mix Board multi-board storage
 */
export async function createProjectSpreadsheet(
  token: string,
  projectFolderId: string,
  projectName: string,
  initialBoards: BoardMetadata[] = [{ id: 'board_main', name: 'MAIN', createdAt: new Date().toISOString() }]
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
          title: 'Boards',
          gridProperties: { rowCount: 50, columnCount: 6, frozenRowCount: 1 },
        },
      },
      {
        properties: {
          sheetId: 1,
          title: 'Nodes',
          gridProperties: { rowCount: 200, columnCount: 14, frozenRowCount: 1 },
        },
      },
      {
        properties: {
          sheetId: 2,
          title: 'Viewport',
          gridProperties: { rowCount: 50, columnCount: 8, frozenRowCount: 1 },
        },
      },
      {
        properties: {
          sheetId: 3,
          title: 'AssetReferences',
          gridProperties: { rowCount: 200, columnCount: 8, frozenRowCount: 1 },
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
  await initializeSheetHeaders(token, spreadsheetId, initialBoards);

  return {
    spreadsheetId,
    sheetViewLink: moveData.webViewLink || createdSheet.spreadsheetUrl,
  };
}

/**
 * Initialize headers and initial styling
 */
async function initializeSheetHeaders(
  token: string,
  spreadsheetId: string,
  initialBoards: BoardMetadata[] = [{ id: 'board_main', name: 'MAIN', createdAt: new Date().toISOString() }]
) {
  const boardHeaders = ['BoardId', 'Name', 'CreatedAt', 'UpdatedAt'];
  const boardRows = [
    boardHeaders,
    ...initialBoards.map(b => [b.id, b.name, b.createdAt || new Date().toISOString(), new Date().toISOString()]),
  ];

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
    'BoardId',
  ];

  const viewportHeaders = ['BoardId', 'PanX', 'PanY', 'Zoom', 'SelectedModel', 'UpdatedAt'];
  const viewportRows = [
    viewportHeaders,
    ...initialBoards.map(b => [b.id, 0, 0, 1, 'gemini-2.5-flash-image', new Date().toISOString()]),
  ];

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
            range: `Boards!A1:D${boardRows.length}`,
            values: boardRows,
          },
          {
            range: 'Nodes!A1:M1',
            values: [nodeHeaders],
          },
          {
            range: `Viewport!A1:F${viewportRows.length}`,
            values: viewportRows,
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
 * Ensure 'Boards' sheet exists in a spreadsheet (for backward compatibility)
 */
async function ensureSheetsStructure(token: string, spreadsheetId: string) {
  try {
    const metaRes = await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`,
      token
    );
    const meta = await metaRes.json();
    const sheetTitles = (meta.sheets || []).map((s: any) => s.properties?.title);

    const requests: any[] = [];
    if (!sheetTitles.includes('Boards')) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Boards',
            gridProperties: { rowCount: 50, columnCount: 6, frozenRowCount: 1 },
          },
        },
      });
    }

    if (requests.length > 0) {
      await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });
    }
  } catch (err) {
    console.warn('Could not verify/add Boards sheet structure:', err);
  }
}

/**
 * Save full multi-board canvas graph to Google Sheet
 */
export async function saveGraphToSheet(
  token: string,
  spreadsheetId: string,
  nodes: CanvasNode[],
  boardsOrViewport: BoardMetadata[] | ViewportState,
  viewportsOrModel?: Record<string, ViewportState> | string,
  modelsMap?: Record<string, string>
): Promise<void> {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is missing for this project');
  }

  // Handle single-board legacy call signature vs multi-board signature
  let boards: BoardMetadata[] = [];
  let viewports: Record<string, ViewportState> = {};
  let selectedModels: Record<string, string> = {};

  if (Array.isArray(boardsOrViewport)) {
    boards = boardsOrViewport;
    viewports = (viewportsOrModel as Record<string, ViewportState>) || {};
    selectedModels = modelsMap || {};
  } else {
    // Legacy single-board invocation: saveGraphToSheet(token, spreadsheetId, nodes, viewport, selectedModel)
    const singleViewport = boardsOrViewport as ViewportState;
    const singleModel = (viewportsOrModel as string) || 'gemini-2.5-flash-image';
    boards = [{ id: 'board_main', name: 'MAIN', createdAt: new Date().toISOString() }];
    viewports = { board_main: singleViewport };
    selectedModels = { board_main: singleModel };
  }

  if (boards.length === 0) {
    boards = [{ id: 'board_main', name: 'MAIN', createdAt: new Date().toISOString() }];
  }

  const defaultBoardId = boards[0].id;

  // 1. Prepare Boards Rows
  const boardHeaders = ['BoardId', 'Name', 'CreatedAt', 'UpdatedAt'];
  const boardRows: any[][] = [boardHeaders];
  boards.forEach(b => {
    boardRows.push([b.id, b.name, b.createdAt || new Date().toISOString(), new Date().toISOString()]);
  });

  // 2. Prepare Nodes Rows (with BoardId at col M / index 12)
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
    'BoardId',
  ];

  const nodeRows: any[][] = [nodeHeaders];
  const assetRefMap = new Map<string, { count: number; name?: string }>();

  nodes.forEach(node => {
    const isImage = node.type === 'image';
    const imageNode = isImage ? (node as ImageNode) : null;
    const driveFileId = imageNode?.driveFileId || (isImage ? node.content : '');
    const nodeBoardId = node.boardId || defaultBoardId;

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
      nodeBoardId,
    ]);
  });

  // 3. Prepare Viewport Rows
  const viewportHeaders = ['BoardId', 'PanX', 'PanY', 'Zoom', 'SelectedModel', 'UpdatedAt'];
  const viewportRows: any[][] = [viewportHeaders];
  boards.forEach(b => {
    const vp = viewports[b.id] || { x: 0, y: 0, zoom: 1 };
    const mod = selectedModels[b.id] || 'gemini-2.5-flash-image';
    viewportRows.push([
      b.id,
      Math.round(vp.x),
      Math.round(vp.y),
      parseFloat(vp.zoom.toFixed(3)),
      mod,
      new Date().toISOString(),
    ]);
  });

  // 4. Prepare Asset References Rows
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

  // Ensure Boards sheet exists
  await ensureSheetsStructure(token, spreadsheetId);

  // Clear existing content first so deleted items aren't left behind
  try {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Boards!A1:Z100:clear`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Nodes!A1:Z2000:clear`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Viewport!A1:Z50:clear`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/AssetReferences!A1:Z1000:clear`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
  } catch (e) {
    console.warn('Error clearing sheet rows', e);
  }

  // Write updated data in batch
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
            range: `Boards!A1:D${boardRows.length}`,
            values: boardRows,
          },
          {
            range: `Nodes!A1:M${nodeRows.length}`,
            values: nodeRows,
          },
          {
            range: `Viewport!A1:F${viewportRows.length}`,
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
 * Load canvas graph and all boards from Google Sheet
 */
export async function loadGraphFromSheet(
  token: string,
  spreadsheetId: string
): Promise<{
  boards: BoardMetadata[];
  nodes: CanvasNode[];
  viewports: Record<string, ViewportState>;
  selectedModels: Record<string, string>;
  viewport: ViewportState;
  selectedModel: string;
}> {
  // Query Boards, Nodes, Viewport
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Boards!A1:D100&ranges=Nodes!A1:M2000&ranges=Viewport!A1:F50`;

  let res: Response;
  try {
    res = await sheetsFetch(url, token);
  } catch (e) {
    // If Boards sheet doesn't exist yet (legacy sheet), fallback to legacy ranges
    const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Nodes!A1:L500&ranges=Viewport!A1:E5`;
    res = await sheetsFetch(fallbackUrl, token);
  }

  const data = await res.json();
  const valueRanges = data.valueRanges || [];

  let boardValues: any[][] = [];
  let nodeValues: any[][] = [];
  let viewportValues: any[][] = [];

  if (valueRanges.length === 3) {
    boardValues = valueRanges[0]?.values || [];
    nodeValues = valueRanges[1]?.values || [];
    viewportValues = valueRanges[2]?.values || [];
  } else if (valueRanges.length === 2) {
    nodeValues = valueRanges[0]?.values || [];
    viewportValues = valueRanges[1]?.values || [];
  }

  // 1. Parse Boards
  const boards: BoardMetadata[] = [];
  if (boardValues.length > 1) {
    for (let i = 1; i < boardValues.length; i++) {
      const row = boardValues[i];
      if (!row || !row[0]) continue;
      boards.push({
        id: String(row[0]),
        name: String(row[1] || `Board ${i}`),
        createdAt: row[2] ? String(row[2]) : undefined,
        updatedAt: row[3] ? String(row[3]) : undefined,
      });
    }
  }

  // Default board if none found in sheet
  if (boards.length === 0) {
    boards.push({
      id: 'board_main',
      name: 'MAIN',
      createdAt: new Date().toISOString(),
    });
  }

  const defaultBoardId = boards[0].id;

  // 2. Parse Nodes
  const nodes: CanvasNode[] = [];
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
        ,
        boardIdCol,
      ] = row;

      const x = Number(xStr) || 0;
      const y = Number(yStr) || 0;
      const width = Number(widthStr) || 200;
      const height = Number(heightStr) || 100;
      const rotation = Number(rotStr) || 0;
      const nodeBoardId = boardIdCol ? String(boardIdCol) : defaultBoardId;

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
          boardId: nodeBoardId,
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
          boardId: nodeBoardId,
          content: content ? String(content) : '',
          createdAt: Number(createdAtStr) || undefined,
        };
        nodes.push(textNode);
      }
    }
  }

  // 3. Parse Viewports & Selected Models
  const viewports: Record<string, ViewportState> = {};
  const selectedModels: Record<string, string> = {};

  if (viewportValues.length > 1) {
    for (let i = 1; i < viewportValues.length; i++) {
      const row = viewportValues[i];
      if (!row || row.length === 0) continue;

      // Handle legacy format [PanX, PanY, Zoom, SelectedModel, UpdatedAt]
      // vs new format [BoardId, PanX, PanY, Zoom, SelectedModel, UpdatedAt]
      let boardId = defaultBoardId;
      let panX = 0;
      let panY = 0;
      let zoom = 1;
      let model = 'gemini-2.5-flash-image';

      if (row.length >= 6 || isNaN(Number(row[0]))) {
        boardId = String(row[0]);
        panX = Number(row[1]) || 0;
        panY = Number(row[2]) || 0;
        zoom = Math.max(0.1, Math.min(5, Number(row[3]) || 1));
        if (row[4]) model = String(row[4]);
      } else {
        // Legacy 5-column row
        panX = Number(row[0]) || 0;
        panY = Number(row[1]) || 0;
        zoom = Math.max(0.1, Math.min(5, Number(row[2]) || 1));
        if (row[3]) model = String(row[3]);
      }

      viewports[boardId] = { x: panX, y: panY, zoom };
      selectedModels[boardId] = model;
    }
  }

  const primaryViewport = viewports[defaultBoardId] || { x: 0, y: 0, zoom: 1 };
  const primaryModel = selectedModels[defaultBoardId] || 'gemini-2.5-flash-image';

  return {
    boards,
    nodes,
    viewports,
    selectedModels,
    viewport: primaryViewport,
    selectedModel: primaryModel,
  };
}

