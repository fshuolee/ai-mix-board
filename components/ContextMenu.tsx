import React, { useEffect, useRef } from 'react';
import {
  LayoutGrid,
  Maximize2,
  Minimize2,
  Ruler,
  Bookmark,
  Copy,
  ClipboardCopy,
  Clipboard,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Type,
  Image as ImageIcon,
  CheckSquare,
  Focus,
  Eraser,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Download,
  ShieldCheck,
  RotateCw,
  Scissors,
  Info,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { CanvasNode } from '../types';
import { getDefaultNodeSize } from '../services/nodeSizingService';

export interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  targetType: 'node' | 'canvas';
  selectedNodes: CanvasNode[];
  onClose: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onAutoArrange: (layout: 'grid' | 'horizontal' | 'vertical') => void;
  onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute?: (type: 'horizontal' | 'vertical') => void;
  onResetAspect: () => void;
  onApplyDefaultSize: () => void;
  onSaveAsDefaultSize: () => void;
  onCut?: () => void;
  onCopyToClipboard: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onGenerate: () => void;
  onPaste?: () => void;
  onAddText: () => void;
  onUploadImage: () => void;
  onSelectAll: () => void;
  onFitToScreen: () => void;
  onClearCanvas: () => void;
  onDownloadNode?: () => void;
  onExportBoardImage?: () => void;
  onDownloadAllBoardImages?: () => void;
  onRescueAssets?: () => void;
  onRetryNode?: () => void;
  onShowInfo?: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  position,
  targetType,
  selectedNodes,
  onClose,
  onAutoArrange,
  onAlign,
  onDistribute,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onResetAspect,
  onApplyDefaultSize,
  onSaveAsDefaultSize,
  onCut,
  onCopyToClipboard,
  onDuplicate,
  onDelete,
  onBringToFront,
  onSendToBack,
  onGenerate,
  onPaste,
  onAddText,
  onUploadImage,
  onSelectAll,
  onFitToScreen,
  onClearCanvas,
  onDownloadNode,
  onExportBoardImage,
  onDownloadAllBoardImages,
  onRescueAssets,
  onRetryNode,
  onShowInfo,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const defaultSize = getDefaultNodeSize();

  // Close on outside click or Esc
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate smart positioned coordinates so it never overflows offscreen
  const menuWidth = 240;
  const menuHeight = targetType === 'node' ? 490 : 360;
  const safeX = Math.min(position.x, window.innerWidth - menuWidth - 12);
  const safeY = Math.min(position.y, window.innerHeight - menuHeight - 12);

  const hasImageSelected = selectedNodes.some(n => n.type === 'image');
  const count = selectedNodes.length;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-900/95 backdrop-blur-xl border border-gray-700/80 rounded-2xl shadow-2xl p-1.5 min-w-[210px] text-xs text-gray-200 select-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${Math.max(12, safeX)}px`, top: `${Math.max(12, safeY)}px` }}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={e => e.stopPropagation()}
    >
      {targetType === 'node' ? (
        <>
          {/* Header indicator */}
          <div className="px-3 py-1.5 border-b border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400 font-medium">
            <span>{count > 1 ? `${count} 個物件` : (selectedNodes[0]?.type === 'image' ? '圖片物件' : '文字物件')}</span>
            <span className="text-[10px] text-gray-500 font-mono">選單</span>
          </div>

          {/* Alignment & Arrangement */}
          <div className="py-1">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              排版
            </div>
            <button
              onClick={() => {
                onAutoArrange('grid');
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-blue-600/20 hover:text-blue-300 transition-colors group text-left"
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
                <span>網格排列</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Alt+G</span>
            </button>

            {count > 1 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1 px-1">
                  <button
                    onClick={() => {
                      onAutoArrange('horizontal');
                      onClose();
                    }}
                    className="flex-1 px-2 py-1 rounded-md bg-gray-800/60 hover:bg-gray-800 text-[11px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                    title="向右水平排列一列"
                  >
                    <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                    <span>水平</span>
                  </button>
                  <button
                    onClick={() => {
                      onAutoArrange('vertical');
                      onClose();
                    }}
                    className="flex-1 px-2 py-1 rounded-md bg-gray-800/60 hover:bg-gray-800 text-[11px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                    title="向下垂直排列一行"
                  >
                    <AlignVerticalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                    <span>垂直</span>
                  </button>
                </div>

                {onAlign && (
                  <div className="pt-1 border-t border-gray-800/60">
                    <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">對齊</div>
                    <div className="grid grid-cols-3 gap-1 px-1">
                      <button
                        onClick={() => {
                          onAlign('left');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="靠左對齊"
                      >
                        <AlignLeft className="w-3 h-3 text-blue-400" />
                        <span>靠左</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('center');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="水平置中"
                      >
                        <AlignCenter className="w-3 h-3 text-blue-400" />
                        <span>置中</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('right');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="靠右對齊"
                      >
                        <AlignRight className="w-3 h-3 text-blue-400" />
                        <span>靠右</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1 px-1 pt-1">
                      <button
                        onClick={() => {
                          onAlign('top');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                        title="靠頂對齊"
                      >
                        <span>靠頂</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('middle');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                        title="垂直置中"
                      >
                        <span>垂直中</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('bottom');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                        title="靠底對齊"
                      >
                        <span>靠底</span>
                      </button>
                    </div>
                  </div>
                )}

                {onDistribute && count > 2 && (
                  <div className="pt-1 border-t border-gray-800/60">
                    <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">等距分佈</div>
                    <div className="flex items-center gap-1 px-1">
                      <button
                        onClick={() => {
                          onDistribute('horizontal');
                          onClose();
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="水平等距分佈"
                      >
                        <AlignHorizontalDistributeCenter className="w-3 h-3 text-blue-400" />
                        <span>水平等距</span>
                      </button>
                      <button
                        onClick={() => {
                          onDistribute('vertical');
                          onClose();
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="垂直等距分佈"
                      >
                        <AlignVerticalDistributeCenter className="w-3 h-3 text-blue-400" />
                        <span>垂直等距</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          {/* Size & Aspect Ratio */}
          <div className="py-1">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              尺寸
            </div>

            {hasImageSelected && (
              <button
                onClick={() => {
                  onResetAspect();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-emerald-400" />
                  <span>原圖比例</span>
                </div>
                <span className="text-[10px] text-emerald-400/80 font-mono">Aspect</span>
              </button>
            )}

            <button
              onClick={() => {
                onApplyDefaultSize();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-purple-600/20 hover:text-purple-300 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-purple-400" />
                <span>套用預設尺寸</span>
              </div>
              <span className="text-[10px] text-gray-400 font-mono">{defaultSize.width}×{defaultSize.height}</span>
            </button>

            {count === 1 && (
              <button
                onClick={() => {
                  onSaveAsDefaultSize();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-amber-600/20 hover:text-amber-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-amber-400" />
                  <span>設為預設尺寸</span>
                </div>
                <span className="text-[10px] text-amber-400 font-mono">
                  {Math.round(selectedNodes[0].width)}×{Math.round(selectedNodes[0].height)}
                </span>
              </button>
            )}
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          {/* Layer Order */}
          <div className="py-1">
            <button
              onClick={() => {
                onBringToFront();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <ArrowUp className="w-4 h-4 text-gray-400" />
                <span>移至頂層</span>
              </div>
            </button>
            <button
              onClick={() => {
                onSendToBack();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <ArrowDown className="w-4 h-4 text-gray-400" />
                <span>移至底層</span>
              </div>
            </button>
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          {/* Standard Actions */}
          <div className="py-1">
            {onDownloadNode && (
              <button
                onClick={() => {
                  onDownloadNode();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>
                    {count === 1
                      ? selectedNodes[0]?.type === 'image'
                        ? '下載圖片'
                        : '下載文字 (.txt)'
                      : `下載所選 (${count})`}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400/80 font-mono">Download</span>
              </button>
            )}

            {count === 1 && onShowInfo && (
              <button
                onClick={() => {
                  onShowInfo();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-blue-600/20 hover:text-blue-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span>檢視詳細資訊</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">Info</span>
              </button>
            )}

            {onCut && (
              <button
                onClick={() => {
                  onCut();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-blue-600/20 hover:text-blue-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-blue-400" />
                  <span>剪下物件</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">Cmd+X</span>
              </button>
            )}

            <button
              onClick={() => {
                onCopyToClipboard();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-blue-600/20 hover:text-blue-300 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <ClipboardCopy className="w-4 h-4 text-blue-400" />
                <span>
                  {count === 1
                    ? selectedNodes[0]?.type === 'image'
                      ? '複製圖片'
                      : '複製文字'
                    : '複製物件'}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 font-mono">Ctrl+C</span>
            </button>

            <button
              onClick={() => {
                onDuplicate();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Copy className="w-4 h-4 text-gray-400" />
                <span>製作複本</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Ctrl+D</span>
            </button>

            <button
              onClick={() => {
                onGenerate();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gradient-to-r hover:from-blue-600/30 hover:to-indigo-600/30 text-blue-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Gemini 生成</span>
              </div>
              <span className="text-[10px] text-amber-400 font-mono">Shift+Enter</span>
            </button>

            {selectedNodes.some(n => n.status === 'error') && onRetryNode && (
              <button
                onClick={() => {
                  onRetryNode();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 hover:text-white transition-colors text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-blue-400" />
                  <span>重試失敗節點</span>
                </div>
                <span className="text-[10px] text-blue-400 font-mono">
                  {selectedNodes.filter(n => n.status === 'error').length} 個失敗
                </span>
              </button>
            )}

            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>刪除</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Delete</span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Canvas context menu */}
          <div className="px-3 py-1.5 border-b border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400 font-medium">
            <span>畫布</span>
            <span className="text-[10px] text-gray-500 font-mono">AI Mix</span>
          </div>

          <div className="py-1">
            {onUndo && (
              <button
                onClick={() => {
                  onUndo();
                  onClose();
                }}
                disabled={!canUndo}
                className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors text-left ${
                  !canUndo
                    ? 'opacity-40 cursor-not-allowed text-gray-500'
                    : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Undo2 className="w-4 h-4 text-blue-400" />
                  <span>復原</span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">⌘Z</span>
              </button>
            )}

            {onRedo && (
              <button
                onClick={() => {
                  onRedo();
                  onClose();
                }}
                disabled={!canRedo}
                className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors text-left ${
                  !canRedo
                    ? 'opacity-40 cursor-not-allowed text-gray-500'
                    : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Redo2 className="w-4 h-4 text-blue-400" />
                  <span>重做</span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">⌘⇧Z</span>
              </button>
            )}

            {onPaste && (
              <button
                onClick={() => {
                  onPaste();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-blue-600/20 hover:text-blue-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-blue-400" />
                  <span>貼上</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">Ctrl+V</span>
              </button>
            )}

            <button
              onClick={() => {
                onAddText();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-blue-400" />
                <span>新增文字</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">雙擊畫布</span>
            </button>

            <button
              onClick={() => {
                onUploadImage();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <span>上傳圖片</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">拖放亦可</span>
            </button>
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          <div className="py-1">
            <button
              onClick={() => {
                onSelectAll();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-gray-400" />
                <span>全選物件</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Ctrl+A</span>
            </button>

            <button
              onClick={() => {
                onFitToScreen();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Focus className="w-4 h-4 text-cyan-400" />
                <span>最適視角</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Shift+1</span>
            </button>
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          {/* Canvas Export & Download Section */}
          <div className="py-1">
            {onExportBoardImage && (
              <button
                onClick={() => {
                  onExportBoardImage();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-cyan-600/20 hover:text-cyan-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>匯出畫布 (PNG)</span>
                </div>
                <span className="text-[10px] text-cyan-400/80 font-mono">Export</span>
              </button>
            )}

            {onDownloadAllBoardImages && (
              <button
                onClick={() => {
                  onDownloadAllBoardImages();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-cyan-600/20 hover:text-cyan-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  <span>下載所有圖片</span>
                </div>
              </button>
            )}
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          <div className="py-1 space-y-0.5">
            {onRescueAssets && (
              <button
                onClick={() => {
                  onRescueAssets();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors text-left text-indigo-300"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>救回遺失圖片資源</span>
                </div>
              </button>
            )}

            <button
              onClick={() => {
                onClearCanvas();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Eraser className="w-4 h-4" />
                <span>清空畫布</span>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ContextMenu;
