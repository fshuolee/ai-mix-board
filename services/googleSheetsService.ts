import { BoardMetadata, CanvasNode, ImageNode, TextNode, ViewportState } from '../types';
import { refreshGoogleToken } from './googleAuthService';
import { isDriveFileId } from './dbService';

let rateLimitCooldownUntil = 0;

export function isSheetsRateLimited(): boolean {
  return Date.now() < rateLimitCooldownUntil;
}

export function getSheetsRateLimitRemainingSeconds(): number {
  return Math.max(0, Math.ceil((rateLimitCooldownUntil - Date.now()) / 1000));
}

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
    if (response.status === 429) {
      rateLimitCooldownUntil = Date.now() + 30000;
    }
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

const verifiedSpreadsheets = new Set<string>();

export function markSpreadsheetVerified(id: string) {
  verifiedSpreadsheets.add(id);
}

interface SheetRowCounts {
  boards: number;
  nodes: number;
  viewport: number;
  assets: number;
}
const previousSheetRowCounts = new Map<string, SheetRowCounts>();

/**
 * Ensure all required sheets ('Boards', 'Nodes', 'Viewport', 'AssetReferences') exist
 */
async function ensureSheetsStructure(token: string, spreadsheetId: string) {
  if (verifiedSpreadsheets.has(spreadsheetId)) return;
  try {
    const metaRes = await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`,
      token
    );
    const meta = await metaRes.json();
    const sheetTitles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title || '');

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
    if (!sheetTitles.includes('Nodes')) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Nodes',
            gridProperties: { rowCount: 500, columnCount: 14, frozenRowCount: 1 },
          },
        },
      });
    }
    if (!sheetTitles.includes('Viewport')) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Viewport',
            gridProperties: { rowCount: 50, columnCount: 8, frozenRowCount: 1 },
          },
        },
      });
    }
    if (!sheetTitles.includes('AssetReferences')) {
      requests.push({
        addSheet: {
          properties: {
            title: 'AssetReferences',
            gridProperties: { rowCount: 200, columnCount: 8, frozenRowCount: 1 },
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
    verifiedSpreadsheets.add(spreadsheetId);
  } catch (err) {
    console.warn('Could not verify/add sheets structure:', err);
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
  modelsMap?: Record<string, string>,
  allowEmptyNodes: boolean = false
): Promise<void> {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is missing for this project');
  }

  // Critical safety check: Never wipe a project with 0 nodes without explicit permission
  if (nodes.length === 0 && !allowEmptyNodes) {
    console.warn('saveGraphToSheet skipped: 0 nodes provided and allowEmptyNodes is false.');
    return;
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

  if (isSheetsRateLimited()) {
    console.warn(`[Google Sheets] Auto-save skipped: rate limit cooldown active (${getSheetsRateLimitRemainingSeconds()}s remaining).`);
    return;
  }

  // Ensure sheets structure exists (cached in-memory, zero overhead on repeated saves)
  await ensureSheetsStructure(token, spreadsheetId);

  // 5. Write updated data FIRST in batchUpdate (Never clear beforehand to avoid data loss on failure)
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

  // 6. Safely clear trailing rows ONLY if row count decreased (e.g. nodes/boards deleted)
  // Uses a single batchClear request with bounded ranges, completely eliminating 400 & 429 errors!
  const prev = previousSheetRowCounts.get(spreadsheetId);
  const clearRanges: string[] = [];

  if (prev) {
    if (boardRows.length < prev.boards) {
      clearRanges.push(`Boards!A${boardRows.length + 1}:D${prev.boards}`);
    }
    if (nodeRows.length < prev.nodes) {
      clearRanges.push(`Nodes!A${nodeRows.length + 1}:M${prev.nodes}`);
    }
    if (viewportRows.length < prev.viewport) {
      clearRanges.push(`Viewport!A${viewportRows.length + 1}:F${prev.viewport}`);
    }
    if (assetRows.length < prev.assets) {
      clearRanges.push(`AssetReferences!A${assetRows.length + 1}:E${prev.assets}`);
    }
  }

  // Record current row counts for subsequent saves
  previousSheetRowCounts.set(spreadsheetId, {
    boards: boardRows.length,
    nodes: nodeRows.length,
    viewport: viewportRows.length,
    assets: assetRows.length,
  });

  if (clearRanges.length > 0) {
    try {
      await sheetsFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ranges: clearRanges }),
        }
      );
    } catch (clearErr) {
      console.warn('Non-fatal error clearing leftover trailing rows via batchClear:', clearErr);
    }
  }
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
  // Query metadata first to find existing sheet names
  let existingSheets: string[] = [];
  try {
    const metaRes = await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      token
    );
    const meta = await metaRes.json();
    existingSheets = (meta.sheets || []).map((s: any) => s.properties?.title || '');
  } catch (metaErr) {
    console.warn('Could not query sheet metadata, falling back to standard names:', metaErr);
  }

  // Identify which sheet contains nodes: preferably 'Nodes', or fallback to first sheet
  const hasBoards = existingSheets.length === 0 || existingSheets.includes('Boards');
  const hasViewport = existingSheets.length === 0 || existingSheets.includes('Viewport');
  const nodesSheet = existingSheets.includes('Nodes')
    ? 'Nodes'
    : (existingSheets.length > 0 ? existingSheets[0] : 'Nodes');

  const rangesToFetch: string[] = [];
  let boardsIdx = -1;
  let nodesIdx = -1;
  let viewportIdx = -1;

  if (hasBoards) {
    boardsIdx = rangesToFetch.length;
    rangesToFetch.push('Boards!A1:D100');
  }
  if (nodesSheet) {
    nodesIdx = rangesToFetch.length;
    rangesToFetch.push(`${nodesSheet}!A1:M3000`);
  }
  if (hasViewport) {
    viewportIdx = rangesToFetch.length;
    rangesToFetch.push('Viewport!A1:F50');
  }

  let boardValues: any[][] = [];
  let nodeValues: any[][] = [];
  let viewportValues: any[][] = [];

  if (rangesToFetch.length > 0) {
    try {
      const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesToFetch
        .map(r => `ranges=${encodeURIComponent(r)}`)
        .join('&')}`;
      const res = await sheetsFetch(batchUrl, token);
      const data = await res.json();
      const valueRanges = data.valueRanges || [];

      if (boardsIdx >= 0) boardValues = valueRanges[boardsIdx]?.values || [];
      if (nodesIdx >= 0) nodeValues = valueRanges[nodesIdx]?.values || [];
      if (viewportIdx >= 0) viewportValues = valueRanges[viewportIdx]?.values || [];
    } catch (fetchErr) {
      console.warn('Error during batchGet, attempting single sheet fallback:', fetchErr);
      // Fallback: try fetching only the nodes sheet
      try {
        const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(nodesSheet || 'Nodes')}!A1:M3000`;
        const res = await sheetsFetch(fallbackUrl, token);
        const data = await res.json();
        nodeValues = data.values || [];
      } catch (fallbackErr) {
        console.error('All sheet fetch attempts failed:', fallbackErr);
        throw fallbackErr;
      }
    }
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
        const rawDriveId = driveFileId ? String(driveFileId) : undefined;
        const rawContent = content ? String(content) : undefined;
        const validDriveId =
          rawDriveId && isDriveFileId(rawDriveId) && rawDriveId !== String(id)
            ? rawDriveId
            : rawContent && isDriveFileId(rawContent) && rawContent !== String(id)
            ? rawContent
            : undefined;

        const imageNode: ImageNode = {
          id: String(id),
          type: 'image',
          x,
          y,
          width,
          height,
          rotation,
          boardId: nodeBoardId,
          content: validDriveId || rawContent || String(id),
          driveFileId: validDriveId,
          originalFileName: origFileName || undefined,
          driveViewLink: validDriveId ? `https://drive.google.com/file/d/${validDriveId}/view` : undefined,
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

  // Auto-register any boards referenced by nodes that aren't in the boards list
  // so no nodes are EVER hidden from the user!
  nodes.forEach(n => {
    if (n.boardId && !boards.some(b => b.id === n.boardId)) {
      boards.push({
        id: n.boardId,
        name: n.boardId === 'board_main' ? 'MAIN' : `Board ${boards.length + 1}`,
        createdAt: new Date().toISOString(),
      });
    }
  });

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

  if (existingSheets.length > 0) {
    verifiedSpreadsheets.add(spreadsheetId);
  }
  previousSheetRowCounts.set(spreadsheetId, {
    boards: boardValues.length,
    nodes: nodeValues.length,
    viewport: viewportValues.length,
    assets: 0,
  });

  return {
    boards,
    nodes,
    viewports,
    selectedModels,
    viewport: primaryViewport,
    selectedModel: primaryModel,
  };
}

