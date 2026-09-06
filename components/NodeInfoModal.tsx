import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Type,
  Sparkles,
  AlertCircle,
  Sliders,
  Layers,
  HardDrive,
  RotateCw,
} from 'lucide-react';
import { CanvasNode, ImageNode, TextNode } from '../types';

interface NodeInfoModalProps {
  isOpen: boolean;
  node: CanvasNode | null;
  onClose: () => void;
  onRetryNode?: (nodeId: string) => void;
  onSelectSources?: (sourceIds: string[]) => void;
}

export const NodeInfoModal: React.FC<NodeInfoModalProps> = ({
  isOpen,
  node,
  onClose,
  onRetryNode,
  onSelectSources,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !node) return null;

  const isImage = node.type === 'image';
  const imageNode = isImage ? (node as ImageNode) : null;
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleCopy = (text: string, key: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopiedKey(key);
          setTimeout(() => {
            setCopiedKey(null);
          }, 2000);
        }).catch(() => {});
      }
    } catch {}
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '無紀錄';
    return new Date(timestamp).toLocaleString('zh-TW', {
      hour12: false,
    });
  };

  const driveFileId = imageNode?.driveFileId;
  const hasGenerationInfo = Boolean(
    node.generationPrompt ||
    node.generationModel ||
    (node.generationSourceIds && node.generationSourceIds.length > 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              {isImage ? <ImageIcon className="w-5 h-5" /> : <Type className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                <span>{isImage ? '圖片節點詳細資訊' : '文字節點詳細資訊'}</span>
                {node.status === 'generating' && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                    生成中
                  </span>
                )}
                {node.status === 'error' && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded-full border border-red-500/30">
                    生成失敗
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-400 font-mono">ID: {node.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Basic Properties */}
          <div className="bg-gray-950/60 rounded-xl p-3.5 border border-gray-800 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span>節點屬性</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-900/60 px-3 py-2 rounded-lg border border-gray-800/80">
                <span className="text-gray-400 block text-[11px]">畫布尺寸</span>
                <span className="font-mono text-gray-200 font-medium">
                  {Math.round(node.width)} × {Math.round(node.height)} px
                </span>
              </div>
              <div className="bg-gray-900/60 px-3 py-2 rounded-lg border border-gray-800/80">
                <span className="text-gray-400 block text-[11px]">位置座標</span>
                <span className="font-mono text-gray-200 font-medium">
                  X: {Math.round(node.x)}, Y: {Math.round(node.y)}
                </span>
              </div>
              <div className="bg-gray-900/60 px-3 py-2 rounded-lg border border-gray-800/80">
                <span className="text-gray-400 block text-[11px]">建立時間</span>
                <span className="text-gray-300 font-mono text-[11px]">{formatDate(node.createdAt)}</span>
              </div>
              <div className="bg-gray-900/60 px-3 py-2 rounded-lg border border-gray-800/80">
                <span className="text-gray-400 block text-[11px]">所屬畫布</span>
                <span className="text-gray-300 font-mono text-[11px] truncate block" title={node.boardId}>
                  {node.boardId || '預設'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Google Drive Cloud Asset Info (For Images) */}
          {isImage && (
            <div className="bg-gray-950/60 rounded-xl p-3.5 border border-gray-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Google Drive 雲端檔案</span>
                </div>
                {driveFileId && (
                  <a
                    href={`https://drive.google.com/file/d/${driveFileId}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    <span>在 Drive 中開啟</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="space-y-2 text-xs">
                {imageNode?.originalFileName && (
                  <div className="flex items-center justify-between bg-gray-900/60 px-3 py-2 rounded-lg border border-gray-800/80">
                    <span className="text-gray-400 text-[11px]">原始檔名</span>
                    <span className="text-gray-200 font-mono truncate max-w-[240px]" title={imageNode.originalFileName}>
                      {imageNode.originalFileName}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between bg-gray-900/60 px-3 py-2 rounded-lg border border-gray-800/80">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Drive 檔案 ID</span>
                    <span className="text-gray-200 font-mono text-[11px]">
                      {driveFileId || '本機快取尚未同步至雲端'}
                    </span>
                  </div>
                  {driveFileId && (
                    <button
                      onClick={() => handleCopy(driveFileId, 'driveId')}
                      className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors ml-2"
                      title="複製檔案 ID"
                    >
                      {copiedKey === 'driveId' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. AI Generation Lineage & Prompt Info */}
          {hasGenerationInfo && (
            <div className="bg-gray-950/60 rounded-xl p-3.5 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>AI 生成資訊</span>
                </div>
                {node.generationModel && (
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-full">
                    {node.generationModel}
                  </span>
                )}
              </div>

              {/* Generation Prompt */}
              {node.generationPrompt && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">提示詞 (Prompt)</span>
                    <button
                      onClick={() => handleCopy(node.generationPrompt!, 'prompt')}
                      className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                    >
                      {copiedKey === 'prompt' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">已複製</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>複製提示詞</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-3 bg-gray-900/90 rounded-xl border border-gray-800 text-xs text-gray-200 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap font-sans select-text">
                    {node.generationPrompt}
                  </div>
                </div>
              )}

              {/* Source Reference Inputs */}
              {node.generationSourceIds && node.generationSourceIds.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-gray-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-blue-400" />
                      <span>參考來源輸入 ({node.generationSourceIds.length} 個物件)</span>
                    </span>
                    {onSelectSources && (
                      <button
                        onClick={() => {
                          onSelectSources(node.generationSourceIds!);
                          onClose();
                        }}
                        className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        在畫布上選取來源
                      </button>
                    )}
                  </div>

                  {/* List of source items if sourceDetails exists */}
                  {node.generationSourceDetails && node.generationSourceDetails.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {node.generationSourceDetails.map((src, idx) => (
                        <div
                          key={src.id || idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-gray-900/60 border border-gray-800/60 text-[11px]"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {src.type === 'image' ? (
                              <ImageIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            ) : (
                              <Type className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                            )}
                            <span className="text-gray-300 truncate">
                              {src.originalFileName || src.content || `物件 ${src.id}`}
                            </span>
                          </div>
                          {src.driveFileId && (
                            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[80px]">
                              {src.driveFileId.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500 font-mono bg-gray-900/40 p-2 rounded-lg">
                      來源 ID: {node.generationSourceIds.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Error Message if Failed */}
          {node.errorMessage && (
            <div className="bg-red-950/30 rounded-xl p-3.5 border border-red-500/30 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span>錯誤訊息</span>
              </div>
              <p className="text-xs text-red-300 leading-relaxed font-mono whitespace-pre-wrap select-text">
                {node.errorMessage}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-gray-800 bg-gray-900/80 flex items-center justify-between">
          <div>
            {hasGenerationInfo && onRetryNode && (
              <button
                onClick={() => {
                  onRetryNode(node.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>重新生成</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors border border-gray-700"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
