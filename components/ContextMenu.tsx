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
} from 'lucide-react';
import { CanvasNode } from '../types';
import { getDefaultNodeSize } from '../services/nodeSizingService';

export interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  targetType: 'node' | 'canvas';
  selectedNodes: CanvasNode[];
  onClose: () => void;
  onAutoArrange: (layout: 'grid' | 'horizontal' | 'vertical') => void;
  onResetAspect: () => void;
  onApplyDefaultSize: () => void;
  onSaveAsDefaultSize: () => void;
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
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  position,
  targetType,
  selectedNodes,
  onClose,
  onAutoArrange,
  onResetAspect,
  onApplyDefaultSize,
  onSaveAsDefaultSize,
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
  const menuHeight = targetType === 'node' ? 440 : 280;
  const safeX = Math.min(position.x, window.innerWidth - menuWidth - 12);
  const safeY = Math.min(position.y, window.innerHeight - menuHeight - 12);

  const hasImageSelected = selectedNodes.some(n => n.type === 'image');
  const count = selectedNodes.length;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-900/95 backdrop-blur-xl border border-gray-700/80 rounded-2xl shadow-2xl p-1.5 min-w-[230px] text-xs text-gray-200 select-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${Math.max(12, safeX)}px`, top: `${Math.max(12, safeY)}px` }}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={e => e.stopPropagation()}
    >
      {targetType === 'node' ? (
        <>
          {/* Header indicator */}
          <div className="px-3 py-1.5 border-b border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400 font-medium">
            <span>{count > 1 ? `已選取 ${count} 個物件` : `選取物件 (${selectedNodes[0]?.type === 'image' ? '圖片' : '文字'})`}</span>
            <span className="text-[10px] text-gray-500 font-mono">右鍵選單</span>
          </div>

          {/* Alignment & Arrangement */}
          <div className="py-1">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              排版排列
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
                <span>自動排列整齊 (網格)</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Alt+G</span>
            </button>

            {count > 1 && (
              <div className="flex items-center gap-1 px-1 pt-1">
                <button
                  onClick={() => {
                    onAutoArrange('horizontal');
                    onClose();
                  }}
                  className="flex-1 px-2 py-1 rounded-md bg-gray-800/60 hover:bg-gray-800 text-[11px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                  title="向右水平排列一列"
                >
                  <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                  <span>水平排列</span>
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
                  <span>垂直排列</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          {/* Size & Aspect Ratio */}
          <div className="py-1">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              尺寸與比例
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
                  <span>還原為原圖真實比例</span>
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
                <span>套用最佳預設尺寸</span>
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
                  <span>以此尺寸作為未來預設</span>
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
                <span>移至最上層</span>
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
                <span>移至最下層</span>
              </div>
            </button>
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          {/* Standard Actions */}
          <div className="py-1">
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
                  {count === 1 && selectedNodes[0]?.type === 'image'
                    ? '複製圖片到剪貼簿'
                    : count === 1 && selectedNodes[0]?.type === 'text'
                    ? '複製文字到剪貼簿'
                    : '複製所選物件到剪貼簿'}
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
                <span>在畫布上製作複本</span>
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
                <span>以 Gemini 生成合成</span>
              </div>
              <span className="text-[10px] text-amber-400 font-mono">Shift+Enter</span>
            </button>

            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>刪除所選物件</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Delete</span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Canvas context menu */}
          <div className="px-3 py-1.5 border-b border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400 font-medium">
            <span>畫布操作</span>
            <span className="text-[10px] text-gray-500 font-mono">AI Mix Board</span>
          </div>

          <div className="py-1">
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
                  <span>貼上剪貼簿內容</span>
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
                <span>新增文字節點</span>
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
                <span>上傳/新增圖片</span>
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
                <span>選取畫布所有物件</span>
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
                <span>最適視角 (符合畫面)</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">F / Shift+1</span>
            </button>
          </div>

          <div className="h-px bg-gray-800/80 my-1" />

          <div className="py-1">
            <button
              onClick={() => {
                onClearCanvas();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Eraser className="w-4 h-4" />
                <span>清空此畫布</span>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ContextMenu;
