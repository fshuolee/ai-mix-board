import React, { useRef, useState, useEffect } from 'react';
import { Loader2, Copy, Trash2, ExternalLink, HardDrive } from 'lucide-react';
import type { CanvasNode, TextNode, ImageNode } from '../types';
import { getImage } from '../services/dbService';
import { getAssetBlobFromDrive } from '../services/googleDriveService';
import { getAccessToken } from '../services/googleAuthService';

interface NodeRendererProps {
  node: CanvasNode;
  zoom: number;
  isSelected: boolean;
  onNodeUpdate: (id: string, updates: Partial<CanvasNode>) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onDragStart: (e: React.PointerEvent, nodeId: string) => void;
  onDuplicateNode?: (node: CanvasNode) => void;
  onDeleteNode?: (nodeId: string) => void;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  zoom,
  isSelected,
  onNodeUpdate,
  onSelect,
  onDragStart,
  onDuplicateNode,
  onDeleteNode,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isCancelled = false;

    if (node.type === 'image') {
      const imageNode = node as ImageNode;
      const fileId = imageNode.driveFileId || imageNode.content || node.id;

      setIsLoadingImage(true);

      const loadImage = async () => {
        try {
          // 1. Try local cache first
          let blob = await getImage(fileId);

          // 2. If not found locally and we have driveFileId + token, fetch from Google Drive
          if (!blob && imageNode.driveFileId) {
            const token = getAccessToken();
            if (token) {
              blob = await getAssetBlobFromDrive(token, imageNode.driveFileId);
            }
          }

          if (isCancelled) return;

          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
          } else {
            setImageUrl(null);
          }
        } catch (err) {
          console.error('Failed to load image for node:', node.id, err);
          if (!isCancelled) setImageUrl(null);
        } finally {
          if (!isCancelled) setIsLoadingImage(false);
        }
      };

      loadImage();

      return () => {
        isCancelled = true;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }
  }, [node.id, node.content, (node as ImageNode).driveFileId, node.type]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target === resizeHandleRef.current) return;
    e.stopPropagation();
    onSelect(node.id, e.shiftKey);
    onDragStart(e, node.id);
  };

  const handleDoubleClick = () => {
    if (node.type === 'text') {
      setIsEditing(true);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onNodeUpdate(node.id, { content: e.target.value });
  };

  const handleTextBlur = () => {
    setIsEditing(false);
  };

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = node.width;
    const startHeight = node.height;

    const doResize = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;
      onNodeUpdate(node.id, {
        width: Math.max(50, startWidth + dx),
        height: Math.max(40, startHeight + dy),
      });
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', doResize);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', doResize);
    window.addEventListener('pointerup', stopResize);
  };

  const commonStyle: React.CSSProperties = {
    width: `${node.width}px`,
    height: `${node.height}px`,
    transform: `translate(${node.x}px, ${node.y}px)`,
    outline: isSelected ? '2px solid #3b82f6' : '1px solid rgba(75, 85, 99, 0.4)',
    outlineOffset: '2px',
  };

  const imageNode = node.type === 'image' ? (node as ImageNode) : null;

  return (
    <div
      ref={nodeRef}
      className="absolute bg-gray-800/95 border border-gray-700/80 rounded-xl shadow-xl cursor-grab active:cursor-grabbing group select-none transition-shadow hover:shadow-2xl"
      style={commonStyle}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      data-node-id={node.id}
    >
      {/* Node Content */}
      {node.type === 'text' &&
        (isEditing ? (
          <textarea
            value={(node as TextNode).content}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            autoFocus
            onFocus={e => e.target.select()}
            className="w-full h-full p-3 text-white bg-transparent border-0 rounded-xl resize-none focus:ring-0 focus:outline-none font-sans"
            style={{ fontSize: `${Math.max(12, 16 / Math.sqrt(zoom))}px` }}
          />
        ) : (
          <div className="w-full h-full p-3 overflow-hidden whitespace-pre-wrap text-gray-100 text-sm leading-relaxed">
            {(node as TextNode).content}
          </div>
        ))}

      {node.type === 'image' && (
        <div className="w-full h-full relative flex items-center justify-center overflow-hidden rounded-xl bg-gray-950/60">
          {isLoadingImage ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-[11px]">載入 Drive 資源...</span>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={imageNode?.originalFileName || 'Asset'}
              className="w-full h-full object-contain rounded-xl"
              draggable={false}
            />
          ) : (
            <div className="text-gray-500 text-xs text-center p-2">
              無法載入圖像資源
            </div>
          )}

          {/* Drive Asset Indicator */}
          {imageNode?.driveFileId && (
            <div
              className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-[10px] text-emerald-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title={`Google Drive 檔案: ${imageNode.driveFileId}`}
            >
              <HardDrive className="w-3 h-3" />
              <span className="font-mono text-[9px] truncate max-w-[80px]">
                {imageNode.driveFileId.slice(0, 8)}...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Floating Action Menu when Selected */}
      {isSelected && (
        <div
          className="absolute -top-10 left-0 flex items-center gap-1 bg-gray-900/90 backdrop-blur-md border border-gray-700 px-2 py-1 rounded-lg shadow-lg z-30"
          onPointerDown={e => e.stopPropagation()}
        >
          {onDuplicateNode && (
            <button
              onClick={() => onDuplicateNode(node)}
              className="p-1 text-gray-300 hover:text-white hover:bg-gray-800 rounded transition-colors flex items-center gap-1 text-[11px]"
              title="複製節點 (指向同一個 Drive Asset)"
            >
              <Copy className="w-3.5 h-3.5 text-blue-400" />
              <span>複製 (指向)</span>
            </button>
          )}

          {imageNode?.driveViewLink && (
            <a
              href={imageNode.driveViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-gray-300 hover:text-emerald-400 hover:bg-gray-800 rounded transition-colors text-[11px] flex items-center gap-1"
              title="在 Google Drive 開啟此檔案"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            </a>
          )}

          {onDeleteNode && (
            <button
              onClick={() => onDeleteNode(node.id)}
              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
              title="刪除節點"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Resize Handle */}
      {isSelected && (
        <div
          ref={resizeHandleRef}
          className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 border-2 border-gray-950 rounded-full cursor-nwse-resize shadow-md"
          onPointerDown={startResize}
        />
      )}
    </div>
  );
};

export default NodeRenderer;