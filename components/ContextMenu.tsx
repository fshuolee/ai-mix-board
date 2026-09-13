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
  Sliders,
} from 'lucide-react';
import { CanvasNode } from '../types';
import { getDefaultNodeSize } from '../services/nodeSizingService';
import { Locale, t } from '../services/i18n';

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
  onToggleInspector?: () => void;
  locale?: Locale;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  position,
  locale,
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
  onToggleInspector,
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
            <span>{count > 1 ? `${count} ${t('selection.objects', locale)}` : (selectedNodes[0]?.type === 'image' ? t('context.imageNode', locale) : t('context.textNode', locale))}</span>
            <span className="text-[10px] text-gray-500 font-mono">{t('context.menu', locale)}</span>
          </div>

          {/* Alignment & Arrangement */}
          <div className="py-1">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {t('context.layout', locale)}
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
                <span>{t('selection.grid', locale)}</span>
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
                    title={t('selection.row', locale)}
                  >
                    <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t('selection.row', locale)}</span>
                  </button>
                  <button
                    onClick={() => {
                      onAutoArrange('vertical');
                      onClose();
                    }}
                    className="flex-1 px-2 py-1 rounded-md bg-gray-800/60 hover:bg-gray-800 text-[11px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                    title={t('selection.column', locale)}
                  >
                    <AlignVerticalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t('selection.column', locale)}</span>
                  </button>
                </div>

                {onAlign && (
                  <div className="pt-1 border-t border-gray-800/60">
                    <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">{t('selection.align', locale)}</div>
                    <div className="grid grid-cols-3 gap-1 px-1">
                      <button
                        onClick={() => {
                          onAlign('left');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title={t('selection.alignLeft', locale)}
                      >
                        <AlignLeft className="w-3 h-3 text-blue-400" />
                        <span>{t('selection.alignLeft', locale)}</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('center');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title={t('selection.alignCenter', locale)}
                      >
                        <AlignCenter className="w-3 h-3 text-blue-400" />
                        <span>{t('selection.alignCenter', locale)}</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('right');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title={t('selection.alignRight', locale)}
                      >
                        <AlignRight className="w-3 h-3 text-blue-400" />
                        <span>{t('selection.alignRight', locale)}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1 px-1 pt-1">
                      <button
                        onClick={() => {
                          onAlign('top');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                        title={t('selection.alignTop', locale)}
                      >
                        <span>{t('selection.alignTop', locale)}</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('middle');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                        title={t('selection.alignMiddle', locale)}
                      >
                        <span>{t('selection.alignMiddle', locale)}</span>
                      </button>
                      <button
                        onClick={() => {
                          onAlign('bottom');
                          onClose();
                        }}
                        className="px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                        title={t('selection.alignBottom', locale)}
                      >
                        <span>{t('selection.alignBottom', locale)}</span>
                      </button>
                    </div>
                  </div>
                )}

                {onDistribute && count > 2 && (
                  <div className="pt-1 border-t border-gray-800/60">
                    <div className="px-1 pb-1 text-[10px] text-gray-400 font-medium">{t('selection.distribute', locale)}</div>
                    <div className="flex items-center gap-1 px-1">
                      <button
                        onClick={() => {
                          onDistribute('horizontal');
                          onClose();
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title={t('selection.distributeH', locale)}
                      >
                        <AlignHorizontalDistributeCenter className="w-3 h-3 text-blue-400" />
                        <span>{t('selection.distributeH', locale)}</span>
                      </button>
                      <button
                        onClick={() => {
                          onDistribute('vertical');
                          onClose();
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-[10px] text-gray-300 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title={t('selection.distributeV', locale)}
                      >
                        <AlignVerticalDistributeCenter className="w-3 h-3 text-blue-400" />
                        <span>{t('selection.distributeV', locale)}</span>
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
              {t('context.dimensions', locale)}
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
                  <span>{t('selection.resetAspect', locale)}</span>
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
                <span>{t('selection.applyOptimalSize', locale)}</span>
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
                  <span>{t('selection.setAsDefaultSize', locale)}</span>
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
                <span>{t('context.bringToFront', locale)}</span>
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
                <span>{t('context.sendToBack', locale)}</span>
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
                        ? t('context.downloadImage', locale)
                        : t('context.downloadText', locale)
                      : `${t('selection.download', locale)} (${count})`}
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
                  <span>{t('context.info', locale)}</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">Info</span>
              </button>
            )}

            {onToggleInspector && (
              <button
                onClick={() => {
                  onToggleInspector();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-purple-600/20 hover:text-purple-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <span>{t('context.inspector', locale)}</span>
                </div>
                <span className="text-[10px] text-purple-400/80 font-mono">⌘I</span>
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
                  <span>{t('selection.cut', locale)}</span>
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
                      ? t('context.copyImage', locale)
                      : t('context.copyText', locale)
                    : t('context.copyObjects', locale)}
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
                <span>{t('selection.duplicate', locale)}</span>
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
                <span>{t('context.generate', locale)}</span>
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
                  <span>{t('context.retryFailed', locale)}</span>
                </div>
                <span className="text-[10px] text-blue-400 font-mono">
                  {selectedNodes.filter(n => n.status === 'error').length}
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
                <span>{t('selection.delete', locale)}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Delete</span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Canvas context menu */}
          <div className="px-3 py-1.5 border-b border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400 font-medium">
            <span>{t('context.canvas', locale)}</span>
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
                  <span>{t('context.undo', locale)}</span>
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
                  <span>{t('context.redo', locale)}</span>
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
                  <span>{t('context.paste', locale)}</span>
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
                <span>{t('context.addText', locale)}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">{t('context.doubleClickHint', locale)}</span>
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
                <span>{t('context.uploadImage', locale)}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">{t('context.dragDropHint', locale)}</span>
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
                <span>{t('context.selectAll', locale)}</span>
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
                <span>{t('context.fitView', locale)}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Shift+1</span>
            </button>

            {onToggleInspector && (
              <button
                onClick={() => {
                  onToggleInspector();
                  onClose();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-purple-600/20 hover:text-purple-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <span>{t('context.inspector', locale)}</span>
                </div>
                <span className="text-[10px] text-purple-400/80 font-mono">⌘I</span>
              </button>
            )}
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
                  <span>{t('context.exportBoard', locale)}</span>
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
                  <span>{t('context.downloadAllImages', locale)}</span>
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
                  <span>{t('context.rescueAssets', locale)}</span>
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
                <span>{t('context.clearCanvas', locale)}</span>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ContextMenu;
