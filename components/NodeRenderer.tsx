import React, { useRef, useState, useEffect } from 'react';
import { Loader2, Copy, Trash2, ExternalLink, HardDrive, Download, Sparkles, AlertCircle, X, RotateCw, Info, Film } from 'lucide-react';
import type { CanvasNode, TextNode, ImageNode, VideoNode } from '../types';
import { getImage } from '../services/dbService';
import { getAssetBlobFromDrive } from '../services/googleDriveService';
import { getAccessToken } from '../services/googleAuthService';

interface NodeRendererProps {
  node: CanvasNode;
  zoom: number;
  isSelected: boolean;
  isCut?: boolean;
  onNodeUpdate: (id: string, updates: Partial<CanvasNode>) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onDragStart: (e: React.PointerEvent, nodeId: string) => void;
  onDuplicateNode?: (node: CanvasNode) => void;
  onDeleteNode?: (nodeId: string) => void;
  onDownloadNode?: (node: CanvasNode) => void;
  onRetryNode?: (nodeId: string) => void;
  onShowInfo?: (node: CanvasNode) => void;
  isDeleting?: boolean;
  isMultiSelecting?: boolean;
  onContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
  isSpacePressed?: boolean;
}

// Session-level in-memory ObjectURL cache to prevent GC thrashing and image flicker
export const nodeObjectUrlCache = new Map<string, string>();

const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  zoom,
  isSelected,
  isCut = false,
  onNodeUpdate,
  onSelect,
  onDragStart,
  onDuplicateNode,
  onDeleteNode,
  onDownloadNode,
  onRetryNode,
  onShowInfo,
  isDeleting = false,
  isMultiSelecting,
  onContextMenu,
  isSpacePressed = false,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const isMedia = node.type === 'image' || node.type === 'video';
  const mediaNode = isMedia ? (node as ImageNode | VideoNode) : null;
  const targetFileId = isMedia ? (mediaNode?.driveFileId || mediaNode?.content || node.id) : null;
  const [imageUrl, setImageUrl] = useState<string | null>(targetFileId ? nodeObjectUrlCache.get(targetFileId) || null : null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (isMedia && node.status !== 'generating' && node.status !== 'error') {
      if (!targetFileId) return;

      if (nodeObjectUrlCache.has(targetFileId)) {
        setImageUrl(nodeObjectUrlCache.get(targetFileId)!);
        return;
      }

      // If targetFileId is already a direct URL
      if (targetFileId.startsWith('http://') || targetFileId.startsWith('https://') || targetFileId.startsWith('data:')) {
        nodeObjectUrlCache.set(targetFileId, targetFileId);
        setImageUrl(targetFileId);
        setIsLoadingImage(false);
        return;
      }

      setIsLoadingImage(true);

      const loadImage = async () => {
        try {
          // 1. Try local IndexedDB cache across all candidate keys
          let blob = await getImage(targetFileId);
          if (!blob && mediaNode?.driveFileId && mediaNode.driveFileId !== targetFileId) {
            blob = await getImage(mediaNode.driveFileId);
          }
          if (!blob && mediaNode?.content && mediaNode.content !== targetFileId) {
            blob = await getImage(mediaNode.content);
          }
          if (!blob && node.id && node.id !== targetFileId) {
            blob = await getImage(node.id);
          }

          // 2. If not found locally, fetch from Google Drive
          if (!blob && mediaNode?.driveFileId) {
            const token = getAccessToken();
            if (token) {
              blob = await getAssetBlobFromDrive(token, mediaNode.driveFileId);
            }
          }
          if (!blob && mediaNode?.content && mediaNode.content !== mediaNode?.driveFileId) {
            const token = getAccessToken();
            if (token) {
              blob = await getAssetBlobFromDrive(token, mediaNode.content);
            }
          }

          if (isCancelled) return;

          if (blob) {
            const url = URL.createObjectURL(blob);
            nodeObjectUrlCache.set(targetFileId, url);
            if (mediaNode?.driveFileId && mediaNode.driveFileId !== targetFileId) {
              nodeObjectUrlCache.set(mediaNode.driveFileId, url);
            }
            setImageUrl(url);
          } else {
            const directUrl =
              (mediaNode?.content && (mediaNode.content.startsWith('http://') || mediaNode.content.startsWith('https://') || mediaNode.content.startsWith('data:')) ? mediaNode.content : null) ||
              (mediaNode?.driveViewLink && (mediaNode.driveViewLink.startsWith('http://') || mediaNode.driveViewLink.startsWith('https://')) ? mediaNode.driveViewLink : null);

            if (directUrl) {
              nodeObjectUrlCache.set(targetFileId, directUrl);
              setImageUrl(directUrl);
            } else {
              setImageUrl(null);
            }
          }
        } catch (err) {
          console.error('Failed to load media for node:', node.id, err);
          if (!isCancelled) setImageUrl(null);
        } finally {
          if (!isCancelled) setIsLoadingImage(false);
        }
      };

      loadImage();

      return () => {
        isCancelled = true;
      };
    }
  }, [node.id, mediaNode?.driveFileId, mediaNode?.content, node.type, node.status, targetFileId, isMedia]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isSpacePressed) return;
    e.stopPropagation();
    onSelect(node.id, e.shiftKey);
    onDragStart(e, node.id);
  };

  const handleDoubleClick = () => {
    if (isSpacePressed) return;
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

  type ResizeDirection = 'se' | 's' | 'e' | 'sw' | 'w' | 'ne' | 'n' | 'nw';

  const startResize = (e: React.PointerEvent, dir: ResizeDirection) => {
    if (isSpacePressed) return;
    e.stopPropagation();
    onSelect(node.id, e.shiftKey);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWidth = node.width;
    const startHeight = node.height;
    const startNodeX = node.x;
    const startNodeY = node.y;

    const doResize = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startNodeX;
      let newY = startNodeY;

      // Horizontal resize
      if (dir === 'se' || dir === 'e' || dir === 'ne') {
        newWidth = Math.max(60, startWidth + dx);
      } else if (dir === 'sw' || dir === 'w' || dir === 'nw') {
        newWidth = Math.max(60, startWidth - dx);
        newX = startNodeX + (startWidth - newWidth);
      }

      // Vertical resize
      if (dir === 'se' || dir === 's' || dir === 'sw') {
        newHeight = Math.max(40, startHeight + dy);
      } else if (dir === 'ne' || dir === 'n' || dir === 'nw') {
        newHeight = Math.max(40, startHeight - dy);
        newY = startNodeY + (startHeight - newHeight);
      }

      onNodeUpdate(node.id, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      });
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', doResize);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', doResize);
    window.addEventListener('pointerup', stopResize);
  };

  const outlineWidth = Math.max(1.5, Math.min(5, 2 / zoom));
  const outlineOffset = Math.max(1, Math.min(4, 2 / zoom));

  const commonStyle: React.CSSProperties = {
    width: `${node.width}px`,
    height: `${node.height}px`,
    transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
    willChange: isSelected ? 'transform' : 'auto',
    contain: 'layout style',
    outline: isCut
      ? `${outlineWidth}px dashed #60a5fa`
      : isSelected
      ? `${outlineWidth}px solid #3b82f6`
      : node.status === 'generating' || node.status === 'error'
      ? 'none'
      : '1px solid rgba(75, 85, 99, 0.4)',
    outlineOffset: `${outlineOffset}px`,
    transition: 'box-shadow 0.15s ease',
  };

  const imageNode = node.type === 'image' ? (node as ImageNode) : null;

  return (
    <div
      ref={nodeRef}
      className={`node-renderer absolute rounded-xl shadow-xl group select-none transition-shadow hover:shadow-2xl ${
        isCut
          ? 'opacity-40 border-2 border-dashed border-blue-400'
          : node.status === 'generating'
          ? 'bg-gray-900/95 border-2 border-blue-500/50 border-dashed overflow-hidden'
          : node.status === 'error'
          ? 'bg-gray-900/95 border-2 border-red-500/50 border-dashed overflow-hidden'
          : 'bg-gray-800/95 border border-gray-700/80'
      } ${
        isDeleting ? 'opacity-70 pointer-events-none scale-[0.98]' : isSpacePressed ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'
      }`}
      style={commonStyle}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={e => {
        if (isSpacePressed) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, node.id);
      }}
      data-node-id={node.id}
    >
      {/* Deleting In-Progress Overlay */}
      {isDeleting && (
        <div className="absolute inset-0 z-50 bg-gray-950/85 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 rounded-xl text-red-400 select-none pointer-events-auto animate-fadeIn">
          <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/30 shadow-inner">
            <Loader2 className="w-5 h-5 animate-spin text-red-400" />
          </div>
          <span className="text-xs font-semibold text-white tracking-wide">正在刪除...</span>
        </div>
      )}

      {/* 1. Generating Placeholder State */}
      {node.status === 'generating' && (
        <div className="w-full h-full relative flex flex-col justify-between p-3.5 overflow-hidden select-none">
          {/* Shimmer gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent -translate-x-full animate-shimmer pointer-events-none" />

          {/* Top Bar: Model Badge & Cancel Button */}
          <div className="flex items-center justify-between gap-2 z-10">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[10px] font-medium backdrop-blur-sm shadow-sm">
              <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
              <span className="truncate max-w-[130px]">{node.generationModel || 'Gemini'}</span>
            </div>

            {onDeleteNode && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800/80 transition-colors pointer-events-auto"
                title="取消此生成任務"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Center: Spinner and Status Text */}
          <div className="flex flex-col items-center gap-2.5 my-auto text-center px-2 z-10">
            <div className="relative flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500/20 border-t-blue-400 animate-spin" />
              <Sparkles className="w-4 h-4 text-blue-400 absolute animate-pulse" />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-white flex items-center justify-center gap-1">
                <span>AI 生成處理中</span>
                <span className="flex gap-0.5 ml-0.5">
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" />
                </span>
              </div>
              <p className="text-[10px] text-blue-300/70 font-medium">
                可繼續在畫布上進行操作
              </p>
            </div>
          </div>

          {/* Bottom Bar: Prompt Snippet */}
          {node.generationPrompt ? (
            <div className="w-full pt-1.5 border-t border-gray-800/80 z-10">
              <p
                className="text-[10px] text-gray-400 truncate text-center font-sans px-1"
                title={node.generationPrompt}
              >
                "{node.generationPrompt}"
              </p>
            </div>
          ) : (
            <div className="h-2" />
          )}
        </div>
      )}

      {/* 2. Error State */}
      {node.status === 'error' && (
        <div className="w-full h-full relative flex flex-col items-center justify-between p-3.5 overflow-hidden select-none bg-red-950/20 border-2 border-red-500/40 rounded-2xl">
          <div className="w-full flex items-center justify-between z-10">
            <span className="text-[10px] font-mono text-red-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span>生成失敗</span>
            </span>
            {onDeleteNode && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800/80 transition-colors pointer-events-auto cursor-pointer"
                title="清除此錯誤節點"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 my-auto text-center px-2 z-10 w-full">
            <div className="p-2.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 shadow-inner">
              <AlertCircle className="w-6 h-6" />
            </div>
            {node.generationPrompt && (
              <div
                className="text-[11px] text-gray-300 line-clamp-2 max-w-[220px] bg-gray-900/80 px-2.5 py-1 rounded-lg border border-gray-700/60 font-sans"
                title={node.generationPrompt}
              >
                "{node.generationPrompt}"
              </div>
            )}
            <p
              className="text-[10px] text-red-300/90 line-clamp-3 max-w-[220px] leading-relaxed break-words font-mono"
              title={node.errorMessage}
            >
              {node.errorMessage || '請檢查網路連線或 API Key 設定。'}
            </p>
          </div>

          <div className="w-full flex items-center justify-center gap-2 z-10">
            {onRetryNode && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRetryNode(node.id);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer pointer-events-auto"
                title="重新發送此節點的生成任務"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>重試生成</span>
              </button>
            )}
            {onDeleteNode && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
                className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800/90 hover:bg-gray-700/90 rounded-xl border border-gray-700/80 transition-colors pointer-events-auto cursor-pointer"
              >
                移除
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Normal Text Node Content */}
      {(!node.status || node.status === 'idle') && node.type === 'text' &&
        (isEditing ? (
          <textarea
            value={(node as TextNode).content}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            onKeyDown={e => {
              // Prevent spacebar or backspace from bubbling to canvas shortcuts while typing
              e.stopPropagation();
            }}
            autoFocus
            onFocus={e => e.target.select()}
            className="w-full h-full p-3 text-white bg-transparent border-0 rounded-xl resize-none focus:ring-0 focus:outline-none font-sans text-sm leading-relaxed"
          />
        ) : (
          <div className="w-full h-full p-3 overflow-hidden whitespace-pre-wrap text-gray-100 text-sm leading-relaxed font-sans">
            {(node as TextNode).content}
          </div>
        ))}

      {/* 4. Normal Image Node Content */}
      {(!node.status || node.status === 'idle') && node.type === 'image' && (
        <div className="w-full h-full relative flex items-center justify-center overflow-hidden rounded-xl bg-gray-950/60">
          {isLoadingImage ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-[11px]">載入 Drive 資源...</span>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={mediaNode?.originalFileName || 'Asset'}
              className="w-full h-full object-contain rounded-xl"
              draggable={false}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="text-gray-500 text-xs text-center p-3 flex flex-col items-center justify-center gap-2">
              <span className="font-medium text-gray-400">無法載入圖像資源</span>
              {mediaNode?.originalFileName && (
                <span className="text-[10px] text-gray-500 font-mono truncate max-w-[180px]" title={mediaNode.originalFileName}>
                  {mediaNode.originalFileName}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (targetFileId) nodeObjectUrlCache.delete(targetFileId);
                  setIsLoadingImage(true);
                  const token = getAccessToken();
                  if (token && mediaNode?.driveFileId) {
                    getAssetBlobFromDrive(token, mediaNode.driveFileId)
                      .then((b) => {
                        if (b) {
                          const url = URL.createObjectURL(b);
                          nodeObjectUrlCache.set(targetFileId, url);
                          setImageUrl(url);
                        }
                      })
                      .finally(() => setIsLoadingImage(false));
                  } else {
                    setIsLoadingImage(false);
                  }
                }}
                className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-300 transition-colors border border-gray-700"
              >
                重試載入
              </button>
            </div>
          )}

          {/* Quick Download Hover Button for Images */}
          {onDownloadNode && (
            <button
              onClick={e => {
                e.stopPropagation();
                onDownloadNode(node);
              }}
              className="absolute bottom-1.5 right-1.5 p-1 rounded bg-gray-900/85 hover:bg-gray-800 backdrop-blur-sm border border-gray-700 text-emerald-400 hover:text-emerald-300 transition-all opacity-0 group-hover:opacity-100 shadow-md"
              title="快速下載此圖片檔案"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 5. Normal Video Node Content */}
      {(!node.status || node.status === 'idle') && node.type === 'video' && (
        <div className="w-full h-full relative flex items-center justify-center overflow-hidden rounded-xl bg-black">
          {isLoadingImage ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
              <span className="text-[11px]">載入影片資源...</span>
            </div>
          ) : imageUrl ? (
            <video
              src={imageUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain rounded-xl"
              onPointerDown={e => {
                // Only stop propagation if clicking in the native bottom control bar area (~44px from bottom)
                // This preserves playback scrubbing/volume while allowing the entire upper video body to drag/select the node!
                const rect = e.currentTarget.getBoundingClientRect();
                if (e.clientY >= rect.bottom - 44) {
                  e.stopPropagation();
                }
              }}
            />
          ) : (
            <div className="text-gray-500 text-xs text-center p-3 flex flex-col items-center justify-center gap-2">
              <span className="font-medium text-gray-400">無法載入影片資源</span>
              {mediaNode?.originalFileName && (
                <span className="text-[10px] text-gray-500 font-mono truncate max-w-[180px]" title={mediaNode.originalFileName}>
                  {mediaNode.originalFileName}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (targetFileId) nodeObjectUrlCache.delete(targetFileId);
                  setIsLoadingImage(true);
                  const token = getAccessToken();
                  if (token && mediaNode?.driveFileId) {
                    getAssetBlobFromDrive(token, mediaNode.driveFileId)
                      .then((b) => {
                        if (b) {
                          const url = URL.createObjectURL(b);
                          nodeObjectUrlCache.set(targetFileId, url);
                          setImageUrl(url);
                        }
                      })
                      .finally(() => setIsLoadingImage(false));
                  } else {
                    setIsLoadingImage(false);
                  }
                }}
                className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-300 transition-colors border border-gray-700"
              >
                重試載入
              </button>
            </div>
          )}

          {/* Top Video Header & Drag Handle (Allows easy dragging without interfering with video controls) */}
          <div
            className="absolute top-0 left-0 right-0 h-9 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between px-2.5 z-20 cursor-grab active:cursor-grabbing pointer-events-auto"
            title="按住此處可拖曳影片節點"
          >
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-rose-500/30 text-[10px] text-rose-300 font-medium select-none shadow-sm pointer-events-none">
              <Film className="w-3 h-3 text-rose-400" />
              <span>MP4 影片</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-300/80 bg-black/50 px-1.5 py-0.5 rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
                按住此處可拖曳
              </span>
              {onDownloadNode && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDownloadNode(node);
                  }}
                  className="p-1 rounded bg-black/60 hover:bg-black/90 backdrop-blur-sm border border-gray-700 text-rose-400 hover:text-rose-300 transition-all opacity-0 group-hover:opacity-100 shadow-md"
                  title="快速下載此影片檔案 (.mp4)"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Menu when Single Node Selected - Inverse scaled so it stays 100% constant size */}
      {isSelected && !isMultiSelecting && node.status !== 'generating' && node.status !== 'error' && (
        <div
          className="absolute -top-3 left-0 flex items-center gap-0.5 bg-gray-900/95 backdrop-blur-md border border-gray-700/80 p-1 rounded-xl shadow-2xl z-30 pointer-events-auto"
          style={{
            transform: `translateY(-100%) scale(${1 / zoom})`,
            transformOrigin: 'bottom left',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          {onShowInfo && (
            <button
              onClick={() => onShowInfo(node)}
              className="p-1.5 text-gray-300 hover:text-blue-300 hover:bg-gray-800 rounded-lg transition-colors"
              title="檢視節點詳細資訊 (Info)"
            >
              <Info className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}

          {onDownloadNode && (
            <button
              onClick={() => onDownloadNode(node)}
              className="p-1.5 text-gray-300 hover:text-emerald-300 hover:bg-gray-800 rounded-lg transition-colors"
              title={node.type === 'video' ? '下載影片檔案 (.mp4)' : node.type === 'image' ? '下載原始圖片' : '下載文字內容 (.txt)'}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          )}

          {onDuplicateNode && (
            <button
              onClick={() => onDuplicateNode(node)}
              className="p-1.5 text-gray-300 hover:text-blue-300 hover:bg-gray-800 rounded-lg transition-colors"
              title="在畫布上製作複本"
            >
              <Copy className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}

          {mediaNode?.driveViewLink && (
            <a
              href={mediaNode.driveViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-300 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="在 Google Drive 開啟此檔案"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            </a>
          )}

          {onDeleteNode && (
            <button
              onClick={() => onDeleteNode(node.id)}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="刪除節點 (Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Seamless Frame Resize Zones (Corners & Edges without bulky circle handle) */}
      {node.status !== 'generating' && !isEditing && (
        <>
          {/* 4 Corners */}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 cursor-nwse-resize z-20"
            onPointerDown={e => startResize(e, 'se')}
          />
          <div
            className="absolute -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize z-20"
            onPointerDown={e => startResize(e, 'sw')}
          />
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize z-20"
            onPointerDown={e => startResize(e, 'ne')}
          />
          <div
            className="absolute -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize z-20"
            onPointerDown={e => startResize(e, 'nw')}
          />

          {/* 4 Edges */}
          <div
            className="absolute top-2.5 bottom-2.5 -right-1 w-2.5 cursor-ew-resize z-20"
            onPointerDown={e => startResize(e, 'e')}
          />
          <div
            className="absolute top-2.5 bottom-2.5 -left-1 w-2.5 cursor-ew-resize z-20"
            onPointerDown={e => startResize(e, 'w')}
          />
          <div
            className="absolute -bottom-1 left-2.5 right-2.5 h-2.5 cursor-ns-resize z-20"
            onPointerDown={e => startResize(e, 's')}
          />
          <div
            className="absolute -top-1 left-2.5 right-2.5 h-2.5 cursor-ns-resize z-20"
            onPointerDown={e => startResize(e, 'n')}
          />
        </>
      )}
    </div>
  );
};

export default React.memo(NodeRenderer, (prevProps, nextProps) => {
  // Only re-render if the node properties we care about changed
  // (Ignoring x/y changes here lets us use direct DOM manipulation for drag without re-rendering)
  const isNodeEqual =
    prevProps.node.id === nextProps.node.id &&
    prevProps.node.type === nextProps.node.type &&
    prevProps.node.width === nextProps.node.width &&
    prevProps.node.height === nextProps.node.height &&
    prevProps.node.content === nextProps.node.content &&
    prevProps.node.status === nextProps.node.status &&
    prevProps.node.errorMessage === nextProps.node.errorMessage &&
    (prevProps.node as ImageNode).driveFileId === (nextProps.node as ImageNode).driveFileId &&
    (prevProps.node as ImageNode).originalFileName === (nextProps.node as ImageNode).originalFileName &&
    // Check if x/y changed by something OTHER than dragging (e.g. alignment or undo)
    // If we're dragging, the App component isn't passing down new x/y until pointerUp.
    // However, if the props.x/y differ, we still should render if it's a significant change.
    prevProps.node.x === nextProps.node.x &&
    prevProps.node.y === nextProps.node.y;

  return (
    isNodeEqual &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isCut === nextProps.isCut &&
    prevProps.isDeleting === nextProps.isDeleting &&
    prevProps.isMultiSelecting === nextProps.isMultiSelecting &&
    prevProps.isSpacePressed === nextProps.isSpacePressed &&
    prevProps.zoom === nextProps.zoom
  );
});