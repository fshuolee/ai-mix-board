export type NodeType = 'text' | 'image';

export interface BaseNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  boardId?: string; // Links node to specific board/canvas within project
  createdAt?: number;
  updatedAt?: number;
}

export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  content: string; // Used as display ID or driveFileId
  driveFileId?: string; // Google Drive File ID (Points to asset without cloning file)
  originalFileName?: string;
  mimeType?: string;
  driveViewLink?: string;
}

export type CanvasNode = TextNode | ImageNode;

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardMetadata {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BoardCanvasData {
  boardId: string;
  nodes: CanvasNode[];
  viewport: ViewportState;
  selectedModel?: string;
}

export interface ProjectMetadata {
  id: string; // Folder ID in Google Drive
  name: string;
  folderId: string;
  spreadsheetId: string;
  assetsFolderId?: string;
  webViewLink?: string;
  sheetViewLink?: string;
  boards?: BoardMetadata[];
  activeBoardId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type SyncStatus = 'saved' | 'saving' | 'error' | 'offline';

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  expiresAt: number;
}

export interface ModelCapability {
  supportsImageOutput: boolean;
  supportsImageInput: boolean;
  supportsText: boolean;
  isFast: boolean;
  isPro: boolean;
  isRecommended: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  category: 'recommended' | 'image' | 'fast' | 'reasoning';
  description: string;
  capabilities: ModelCapability;
  badge: string;
  tag: string;
}