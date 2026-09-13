import React, { useState } from 'react';
import {
  LayoutGrid,
  Maximize2,
  Ruler,
  Bookmark,
  Copy,
  Trash2,
  X,
  ChevronUp,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  Layers,
  ClipboardCopy,
  Download,
  RotateCw,
  Scissors,
} from 'lucide-react';
import { CanvasNode } from '../types';
import { getDefaultNodeSize } from '../services/nodeSizingService';
import { Locale, t } from '../services/i18n';

export interface MultiSelectionBarProps {
  selectedNodes: CanvasNode[];
  onAutoArrange: (layout: 'grid' | 'horizontal' | 'vertical') => void;
  onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute?: (type: 'horizontal' | 'vertical') => void;
  onResetAspect: () => void;
  onApplyDefaultSize: () => void;
  onSaveAsDefaultSize: () => void;
  onCut?: () => void;
  onCopyToClipboard?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselectAll: () => void;
  onGenerate?: () => void;
  onDownloadSelected?: () => void;
  onRetrySelectedErrors?: () => void;
  locale?: Locale;
}

const MultiSelectionBar: React.FC<MultiSelectionBarProps> = ({
  selectedNodes,
  locale,
  onAutoArrange,
  onAlign,
  onDistribute,
  onResetAspect,
  onApplyDefaultSize,
  onSaveAsDefaultSize,
  onCut,
  onCopyToClipboard,
  onDuplicate,
  onDelete,
  onDeselectAll,
  onDownloadSelected,
  onRetrySelectedErrors,
}) => {
  const [showArrangeMenu, setShowArrangeMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const defaultSize = getDefaultNodeSize();

  const count = selectedNodes.length;
  if (count <= 1) return null;

  const hasImage = selectedNodes.some(n => n.type === 'image');

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 p-1.5 bg-gray-900/90 backdrop-blur-xl border border-gray-700/80 rounded-2xl shadow-2xl text-xs text-gray-200 select-none animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Selection Count Pill */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl font-medium text-xs">
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-mono font-semibold">{count}</span>
        <span className="text-blue-300/80 text-[11px]">{t('selection.selected', locale)}</span>
      </div>

      {/* Retry Failed Nodes CTA */}
      {selectedNodes.some(n => n.status === 'error') && onRetrySelectedErrors && (
        <button
          onClick={onRetrySelectedErrors}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          title={t('selection.retry', locale)}
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>{t('selection.retry', locale)} ({selectedNodes.filter(n => n.status === 'error').length})</span>
        </button>
      )}

      <div className="w-px h-5 bg-gray-800 mx-0.5" />

      {/* Auto Arrange with Dropdown */}
      <div className="relative flex items-center">
        <button
          onClick={() => {
            setShowArrangeMenu(prev => !prev);
            setShowAlignMenu(false);
          }}
          className={`p-1.5 rounded-lg transition-colors flex items-center gap-0.5 ${
            showArrangeMenu ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-gray-800 text-gray-300 hover:text-white'
          }`}
          title={t('selection.arrange', locale)}
        >
          <LayoutGrid className="w-4 h-4 text-blue-400" />
          <ChevronUp className={`w-3 h-3 text-gray-400 transition-transform ${showArrangeMenu ? 'rotate-180' : ''}`} />
        </button>

        {showArrangeMenu && (
          <div className="absolute bottom-full left-0 mb-2 p-1 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl space-y-0.5 min-w-[140px] animate-in fade-in zoom-in-95 duration-100 z-50">
            <div className="px-2 py-1 text-[10px] text-gray-400 font-semibold border-b border-gray-800/80 mb-0.5">
              {t('selection.arrange', locale)}
            </div>
            <button
              onClick={() => {
                onAutoArrange('grid');
                setShowArrangeMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-blue-600/20 text-left flex items-center gap-2 hover:text-blue-300 text-xs text-gray-200 transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('selection.grid', locale)}</span>
            </button>
            <button
              onClick={() => {
                onAutoArrange('horizontal');
                setShowArrangeMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-blue-600/20 text-left flex items-center gap-2 hover:text-blue-300 text-xs text-gray-200 transition-colors"
            >
              <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('selection.row', locale)}</span>
            </button>
            <button
              onClick={() => {
                onAutoArrange('vertical');
                setShowArrangeMenu(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-blue-600/20 text-left flex items-center gap-2 hover:text-blue-300 text-xs text-gray-200 transition-colors"
            >
              <AlignVerticalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('selection.column', locale)}</span>
            </button>
          </div>
        )}
      </div>

      {/* Alignment & Distribution Popover */}
      {onAlign && (
        <div className="relative flex items-center">
          <button
            onClick={() => {
              setShowAlignMenu(prev => !prev);
              setShowArrangeMenu(false);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              showAlignMenu ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-gray-800 text-gray-300 hover:text-white'
            }`}
            title={t('selection.align', locale)}
          >
            <AlignCenterHorizontal className="w-4 h-4 text-blue-400" />
          </button>

          {showAlignMenu && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl space-y-2 min-w-[190px] animate-in fade-in zoom-in-95 duration-100 z-50">
              <div>
                <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">{t('selection.align', locale)} (H)</div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => {
                      onAlign('left');
                      setShowAlignMenu(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                    title={t('selection.alignLeft', locale)}
                  >
                    <AlignLeft className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px]">{t('selection.alignLeft', locale)}</span>
                  </button>
                  <button
                    onClick={() => {
                      onAlign('center');
                      setShowAlignMenu(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                    title={t('selection.alignCenter', locale)}
                  >
                    <AlignCenter className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px]">{t('selection.alignCenter', locale)}</span>
                  </button>
                  <button
                    onClick={() => {
                      onAlign('right');
                      setShowAlignMenu(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                    title={t('selection.alignRight', locale)}
                  >
                    <AlignRight className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px]">{t('selection.alignRight', locale)}</span>
                  </button>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-800">
                <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">{t('selection.align', locale)} (V)</div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => {
                      onAlign('top');
                      setShowAlignMenu(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                    title={t('selection.alignTop', locale)}
                  >
                    <AlignStartHorizontal className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px]">{t('selection.alignTop', locale)}</span>
                  </button>
                  <button
                    onClick={() => {
                      onAlign('middle');
                      setShowAlignMenu(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                    title={t('selection.alignMiddle', locale)}
                  >
                    <AlignCenterVertical className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px]">{t('selection.alignMiddle', locale)}</span>
                  </button>
                  <button
                    onClick={() => {
                      onAlign('bottom');
                      setShowAlignMenu(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                    title={t('selection.alignBottom', locale)}
                  >
                    <AlignEndHorizontal className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px]">{t('selection.alignBottom', locale)}</span>
                  </button>
                </div>
              </div>

              {onDistribute && count > 2 && (
                <div className="pt-1 border-t border-gray-800">
                  <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">{t('selection.distribute', locale)}</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => {
                        onDistribute('horizontal');
                        setShowAlignMenu(false);
                      }}
                      className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex items-center justify-center gap-1.5 transition-colors"
                      title={t('selection.distributeH', locale)}
                    >
                      <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px]">{t('selection.distributeH', locale)}</span>
                    </button>
                    <button
                      onClick={() => {
                        onDistribute('vertical');
                        setShowAlignMenu(false);
                      }}
                      className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex items-center justify-center gap-1.5 transition-colors"
                      title={t('selection.distributeV', locale)}
                    >
                      <AlignVerticalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px]">{t('selection.distributeV', locale)}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reset Aspect Ratio */}
      {hasImage && (
        <button
          onClick={onResetAspect}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-emerald-300 transition-colors"
          title={t('selection.resetAspect', locale)}
        >
          <Maximize2 className="w-4 h-4 text-emerald-400" />
        </button>
      )}

      {/* Apply Default Size */}
      <button
        onClick={onApplyDefaultSize}
        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-purple-300 transition-colors"
        title={`${t('selection.applyOptimalSize', locale)} (${defaultSize.width}×${defaultSize.height})`}
      >
        <Ruler className="w-4 h-4 text-purple-400" />
      </button>

      {/* Save current as default size */}
      <button
        onClick={onSaveAsDefaultSize}
        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-amber-300 transition-colors"
        title={t('selection.setAsDefaultSize', locale)}
      >
        <Bookmark className="w-4 h-4 text-amber-400" />
      </button>

      <div className="w-px h-5 bg-gray-800 mx-0.5" />

      {/* Batch Download Selected */}
      {onDownloadSelected && (
        <button
          onClick={onDownloadSelected}
          className="p-1.5 rounded-lg hover:bg-cyan-950/50 text-gray-300 hover:text-cyan-300 transition-colors"
          title={`${t('selection.download', locale)} (${count})`}
        >
          <Download className="w-4 h-4 text-cyan-400" />
        </button>
      )}

      {/* Cut to Clipboard */}
      {onCut && (
        <button
          onClick={onCut}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-blue-300 transition-colors"
          title={`${t('selection.cut', locale)} (Cmd+X)`}
        >
          <Scissors className="w-4 h-4 text-blue-400" />
        </button>
      )}

      {/* Copy to Clipboard */}
      {onCopyToClipboard && (
        <button
          onClick={onCopyToClipboard}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-blue-300 transition-colors"
          title={`${t('selection.copy', locale)} (Cmd+C)`}
        >
          <ClipboardCopy className="w-4 h-4 text-blue-400" />
        </button>
      )}

      {/* Duplicate */}
      <button
        onClick={onDuplicate}
        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
        title={`${t('selection.duplicate', locale)} (Ctrl+D)`}
      >
        <Copy className="w-4 h-4 text-gray-400" />
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="p-1.5 rounded-lg hover:bg-red-600/20 text-gray-400 hover:text-red-400 transition-colors"
        title={`${t('selection.delete', locale)} (Delete)`}
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-800 mx-0.5" />

      {/* Close / Deselect */}
      <button
        onClick={onDeselectAll}
        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        title={t('selection.deselect', locale)}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default MultiSelectionBar;
