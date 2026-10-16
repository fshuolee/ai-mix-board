export type NodeType = 'text' | 'image' | 'video';

/** Coordinates and stroke widths are relative to the original image, not its board size. */
export interface ImagePoint { x: number; y: number }
export interface ImageCrop extends ImagePoint { width: number; height: number }
export interface ImageStroke {
  tool: 'pen' | 'eraser';
  color: string;
  width: number; // Fraction of the original image's shorter side
  points: ImagePoint[];
}
export interface ImageEdits {
  strokes: ImageStroke[];
  crop?: ImageCrop;
}

export interface SourceDetail {
  id: string;
  type: 'text' | 'image' | 'video';
  content?: string;
  driveFileId?: string;
  originalFileName?: string;
  imageEdits?: ImageEdits;
}

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
  status?: 'idle' | 'generating' | 'error';
  errorMessage?: string;
  generationPrompt?: string;
  generationModel?: string;
  generationModelId?: string;
  generationSourceIds?: string[];
  generationSourceDetails?: SourceDetail[];
  generationParams?: Record<string, any>;
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
  imageEdits?: ImageEdits; // Non-destructive overlay; content/driveFileId always reference the original.
  variants?: ImageVariant[];
  activeVariantId?: string;
  variantStatus?: 'generating';
  variantError?: string;
}

/** Every successful generation owns immutable asset IDs and its own editable overlay and recipe. */
export interface ImageVariant extends Pick<ImageNode,
  'content' | 'driveFileId' | 'originalFileName' | 'mimeType' | 'driveViewLink' | 'imageEdits' |
  'generationPrompt' | 'generationModel' | 'generationModelId' | 'generationParams' | 'generationSourceIds' | 'generationSourceDetails'> {
  id: string;
  width: number;
  height: number;
  createdAt: number;
  syncError?: string;
}

export interface VideoNode extends BaseNode {
  type: 'video';
  content: string; // Used as display ID or driveFileId
  driveFileId?: string; // Google Drive File ID
  originalFileName?: string;
  mimeType?: string;
  driveViewLink?: string;
  duration?: number;
}

export type CanvasNode = TextNode | ImageNode | VideoNode;

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
  isCensored?: boolean; // If true, canvas requires project password to view
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
  password?: string; // Plaintext project password stored in Google Sheet
  createdAt?: string;
  updatedAt?: string;
}

export type SyncStatus = 'saved' | 'saving' | 'error' | 'offline' | 'loading';

export interface ClipboardPayload {
  clipId: string;
  timestamp: number;
  nodes: CanvasNode[];
  isCut?: boolean;
  sourceProjectId?: string;
  sourceSpreadsheetId?: string;
  sourceNodeIds?: string[];
}

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  expiresAt: number;
  isExpired?: boolean;
  authMethod?: 'gis' | 'gcloud' | 'oauth' | 'manual';
}

export interface RawApiModelInfo {
  name: string;
  version?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTemperature?: number;
  thinking?: boolean;
}

export interface ModelCapability {
  supportsImageOutput: boolean;
  supportsImageInput: boolean;
  supportsVideoOutput?: boolean;
  supportsText: boolean;
  isFast: boolean;
  isPro: boolean;
  isRecommended: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  category: 'recommended' | 'image' | 'video' | 'fast' | 'reasoning' | 'atlascloud';
  provider?: 'gemini' | 'atlascloud';
  description: string;
  capabilities: ModelCapability;
  badge: string;
  tag: string;
  apiData?: any;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  version?: string;
  thinking?: boolean;
}

export type ParamFieldType =
  | 'slider'
  | 'number'
  | 'text'
  | 'textarea'
  | 'select'
  | 'aspect_ratio'
  | 'segmented'
  | 'boolean'
  | 'seed'
  | 'json';

export interface ParamOption {
  label: string;
  value: any;
  description?: string;
  badge?: string;
  icon?: string;
}

export type ModalityType = 'text' | 'image' | 'video' | 'audio' | 'model';

export interface ModelParamField {
  id: string;
  label: string;
  description: string;
  type: ParamFieldType;
  defaultValue: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  options?: ParamOption[];
  group: 'basic' | 'dimensions' | 'sampling' | 'creative' | 'video' | 'audio' | 'advanced';
  dependsOn?: (params: Record<string, any>, model: ModelInfo) => boolean;
}

export interface ModelParamGroup {
  id: 'basic' | 'dimensions' | 'sampling' | 'creative' | 'video' | 'audio' | 'advanced';
  title: string;
  icon: string;
  description?: string;
  defaultExpanded?: boolean;
}

export interface ModelParamPreset {
  id: string;
  name: string;
  description: string;
  badge?: string;
  modality: 'image' | 'video' | 'text' | 'audio' | 'all';
  params: Record<string, any>;
}

/** Shared by node and variant deletion dialogs. */
export interface AssetDeletionFile { fileId: string; fileName: string }
export type AssetDeletionChoice = 'keep' | 'trash' | null;
