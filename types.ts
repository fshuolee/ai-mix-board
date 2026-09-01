
export type NodeType = 'text' | 'image';

export interface BaseNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  content: string; // ID for IndexedDB
}

export type CanvasNode = TextNode | ImageNode;