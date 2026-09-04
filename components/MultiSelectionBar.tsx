import React, { useState } from 'react';
import {
  LayoutGrid,
  Maximize2,
  Ruler,
  Bookmark,
  Copy,
  Trash2,
  X,
  Sparkles,
  ChevronUp,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Layers,
  ClipboardCopy,
} from 'lucide-react';
import { CanvasNode } from '../types';
import { getDefaultNodeSize } from '../services/nodeSizingService';

export interface MultiSelectionBarProps {
  selectedNodes: CanvasNode[];
  onAutoArrange: (layout: 'grid' | 'horizontal' | 'vertical') => void;
  onResetAspect: () => void;
  onApplyDefaultSize: () => void;
  onSaveAsDefaultSize: () => void;
  onCopyToClipboard?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselectAll: () => void;
  onGenerate?: () => void;
}

const MultiSelectionBar: React.FC<MultiSelectionBarProps> = ({
  selectedNodes,
  onAutoArrange,
  onResetAspect,
  onApplyDefaultSize,
  onSaveAsDefaultSize,
  onCopyToClipboard,
  onDuplicate,
  onDelete,
  onDeselectAll,
  onGenerate,
}) => {
  const [showArrangeMenu, setShowArrangeMenu] = useState(false);
  const defaultSize = getDefaultNodeSize();

  const count = selectedNodes.length;
  if (count <= 1) return null;

  const hasImage = selectedNodes.some(n => n.type === 'image');

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 p-1.5 bg-gray-900/90 backdrop-blur-xl border border-gray-700/90 rounded-2xl shadow-2xl text-xs text-gray-200 select-none animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Selection Count Pill */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl font-medium">
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span>已選取 {count} 個物件</span>
      </div>

      <div className="w-px h-5 bg-gray-700/80 mx-0.5" />

      {/* Auto Arrange with Dropdown */}
      <div className="relative">
        <button
          onClick={() => onAutoArrange('grid')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800 text-gray-200 hover:text-white transition-colors"
          title="自動排列整齊 (網格佈局)"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-medium">自動排列</span>
        </button>

        <button
          onClick={() => setShowArrangeMenu(prev => !prev)}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors -ml-1"
          title="更多排列選項"
        >
          <ChevronUp className={`w-3.5 h-3.5 transition-transform ${showArrangeMenu ? 'rotate-180' : ''}`} />
        </button>

        {showArrangeMenu && (
          <div className="absolute bottom-full left-0 mb-2 p-1 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl space-y-1 min-w-[130px] animate-in fade-in zoom-in-95 duration-100">
            <button
              onClick={() => {
                onAutoArrange('grid');
                setShowArrangeMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-blue-600/20 text-left flex items-center gap-2 hover:text-blue-300"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
              <span>網格排列 (Grid)</span>
            </button>
            <button
              onClick={() => {
                onAutoArrange('horizontal');
                setShowArrangeMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-blue-600/20 text-left flex items-center gap-2 hover:text-blue-300"
            >
              <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
              <span>橫向單列 (Row)</span>
            </button>
            <button
              onClick={() => {
                onAutoArrange('vertical');
                setShowArrangeMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-blue-600/20 text-left flex items-center gap-2 hover:text-blue-300"
            >
              <AlignVerticalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
              <span>直向單行 (Column)</span>
            </button>
          </div>
        )}
      </div>

      {/* Reset Aspect Ratio */}
      {hasImage && (
        <button
          onClick={onResetAspect}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800 text-emerald-300 hover:text-emerald-200 transition-colors"
          title="將所選圖片還原為原始真實比例 (不變形)"
        >
          <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>原圖比例</span>
        </button>
      )}

      {/* Apply Default Size */}
      <button
        onClick={onApplyDefaultSize}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800 text-purple-300 hover:text-purple-200 transition-colors"
        title={`套用最佳預設尺寸 (${defaultSize.width}×${defaultSize.height}，等比例限制寬高)`}
      >
        <Ruler className="w-3.5 h-3.5 text-purple-400" />
        <span>最適尺寸</span>
      </button>

      {/* Save current as default size */}
      <button
        onClick={onSaveAsDefaultSize}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800 text-amber-300 hover:text-amber-200 transition-colors"
        title="將首個選取物件的尺寸儲存為未來新節點的預設尺寸"
      >
        <Bookmark className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline">設為預設</span>
      </button>

      <div className="w-px h-5 bg-gray-700/80 mx-0.5" />

      {/* Copy to Clipboard */}
      {onCopyToClipboard && (
        <button
          onClick={onCopyToClipboard}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
          title="複製所選節點至剪貼簿 (Ctrl+C)"
        >
          <ClipboardCopy className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">複製</span>
        </button>
      )}

      {/* Duplicate */}
      <button
        onClick={onDuplicate}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
        title="在畫布上製作複本 (Ctrl+D)"
      >
        <Copy className="w-3.5 h-3.5 text-gray-400" />
        <span className="hidden sm:inline">複本</span>
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors"
        title="刪除所選節點 (Delete)"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">刪除</span>
      </button>

      {/* Close / Deselect */}
      <button
        onClick={onDeselectAll}
        className="p-1.5 ml-0.5 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        title="取消選取 (Esc)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default MultiSelectionBar;
