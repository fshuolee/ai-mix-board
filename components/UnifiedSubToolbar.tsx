import React, { useState, useRef, useEffect } from 'react';
import {
  Type,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Maximize2,
  Download,
  Eraser,
  ChevronDown,
  LayoutGrid,
  AlignCenterHorizontal,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Ruler,
  Bookmark,
} from 'lucide-react';
import { CanvasNode } from '../types';
import { getDefaultNodeSize } from '../services/nodeSizingService';
import { Locale, t } from '../services/i18n';

export interface UnifiedSubToolbarProps {
  // Canvas basic actions
  isLocked?: boolean;
  isLoading?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onAddTextNode: () => void;
  onUploadImage: (file: File) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onClearCanvas: () => void;
  onExportBoardImage?: () => void;
  onDownloadAllImages?: () => void;

  // Selection contextual actions
  selectedNodes: CanvasNode[];
  onAutoArrange?: (layout: 'grid' | 'horizontal' | 'vertical') => void;
  onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute?: (type: 'horizontal' | 'vertical') => void;
  onResetAspect?: () => void;
  onApplyDefaultSize?: () => void;
  onSaveAsDefaultSize?: () => void;
  onCut?: () => void;
  onCopyToClipboard?: () => void;
  onDuplicate?: () => void;
  onDeleteSelected?: () => void;
  onDeselectAll?: () => void;
  onDownloadSelected?: () => void;
  onRetrySelectedErrors?: () => void;

  locale?: Locale;
}

export const UnifiedSubToolbar: React.FC<UnifiedSubToolbarProps> = ({
  isLocked = false,
  isLoading = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onAddTextNode,
  onUploadImage,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  onClearCanvas,
  onExportBoardImage,
  onDownloadAllImages,

  selectedNodes = [],
  onAutoArrange,
  onAlign,
  onDistribute,
  onResetAspect,
  onApplyDefaultSize,
  onSaveAsDefaultSize,
  onCut,
  onCopyToClipboard,
  onDuplicate,
  onDeleteSelected,
  onDeselectAll,
  onDownloadSelected,
  onRetrySelectedErrors,

  locale = 'zh-TW',
}) => {
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadDropdownRef = useRef<HTMLDivElement>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const alignRef = useRef<HTMLDivElement>(null);

  const defaultSize = getDefaultNodeSize();
  const selectionCount = selectedNodes.length;
  const hasImage = selectedNodes.some(n => n.type === 'image');

  // Close dropdown menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(e.target as Node)) {
        setDownloadDropdownOpen(false);
      }
      if (sizeMenuRef.current && !sizeMenuRef.current.contains(e.target as Node)) {
        setShowSizeMenu(false);
      }
      if (alignRef.current && !alignRef.current.contains(e.target as Node)) {
        setShowAlignMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed top-12 left-0 right-0 z-30 h-10 px-4 bg-gray-950/85 backdrop-blur-xl border-b border-gray-800/80 shadow-sm flex items-center justify-between select-none pointer-events-auto overflow-visible"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Left side: Main Unified Toolbar Grouping */}
      {/* Groups: [Undo, Redo] | [Text, Asset] | [Size] | [Align] | [Clear Canvas] | [Download] */}
      <div className="flex items-center gap-1.5 overflow-visible">
        {/* GROUP 1: Undo, Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={isLocked ? undefined : onUndo}
            disabled={!canUndo || isLoading || isLocked}
            className={`p-1.5 rounded-lg transition-colors ${
              !canUndo || isLoading || isLocked
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
            title={isLocked ? t('nav.lockedReadOnly', locale) : t('nav.undoTip', locale)}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={isLocked ? undefined : onRedo}
            disabled={!canRedo || isLoading || isLocked}
            className={`p-1.5 rounded-lg transition-colors ${
              !canRedo || isLoading || isLocked
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
            title={isLocked ? t('nav.lockedReadOnly', locale) : t('nav.redoTip', locale)}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-800 mx-0.5 shrink-0" />

        {/* GROUP 2: Text, Asset (Image) */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={isLocked ? undefined : onAddTextNode}
            disabled={isLoading || isLocked}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              isLoading || isLocked
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
            title={isLocked ? t('nav.lockedReadOnly', locale) : t('nav.addTextTip', locale)}
          >
            <Type className="w-4 h-4 text-blue-400" />
          </button>

          <button
            onClick={() => !isLoading && !isLocked && fileInputRef.current?.click()}
            disabled={isLoading || isLocked}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              isLoading || isLocked
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
            title={isLocked ? t('nav.lockedReadOnly', locale) : t('nav.uploadImageTip', locale)}
          >
            <ImageIcon className="w-4 h-4 text-purple-400" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={isLocked}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-800 mx-0.5 shrink-0" />

        {/* GROUP 3: Size (Supports single selection, multi-selection, and default sizing) */}
        <div className="relative" ref={sizeMenuRef}>
          <button
            onClick={() => {
              if (isLocked) return;
              setShowSizeMenu(prev => !prev);
              setShowAlignMenu(false);
              setDownloadDropdownOpen(false);
            }}
            disabled={isLocked}
            className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-xs transition-colors ${
              isLocked
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : showSizeMenu
                ? 'bg-purple-600/30 text-purple-300'
                : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
            title={selectionCount > 0 ? t('context.dimensions', locale) : t('selection.applyOptimalSize', locale)}
          >
            <Ruler className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-mono text-[11px] hidden sm:inline text-purple-300">
              {selectionCount === 1
                ? `${Math.round(selectedNodes[0].width)}×${Math.round(selectedNodes[0].height)}`
                : `${defaultSize.width}×${defaultSize.height}`}
            </span>
            <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showSizeMenu ? 'rotate-180' : ''}`} />
          </button>

          {showSizeMenu && (
            <div className="absolute top-full left-0 mt-1.5 w-60 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800 mb-1 flex items-center justify-between">
                <span>{t('context.dimensions', locale)}</span>
                <span className="text-[10px] text-purple-400/80 font-mono">
                  {selectionCount > 0 ? `${selectionCount} ${t('selection.selected', locale)}` : 'Preset'}
                </span>
              </div>

              {/* Apply Optimal / Default Size */}
              {onApplyDefaultSize && (
                <button
                  onClick={() => {
                    onApplyDefaultSize();
                    setShowSizeMenu(false);
                  }}
                  disabled={selectionCount === 0}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors text-left text-xs ${
                    selectionCount === 0
                      ? 'opacity-40 cursor-not-allowed text-gray-500'
                      : 'hover:bg-purple-600/20 text-gray-200 hover:text-purple-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>{t('selection.applyOptimalSize', locale)}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {defaultSize.width}×{defaultSize.height}
                  </span>
                </button>
              )}

              {/* Reset to Original Image Aspect Ratio */}
              {onResetAspect && (
                <button
                  onClick={() => {
                    onResetAspect();
                    setShowSizeMenu(false);
                  }}
                  disabled={!hasImage}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors text-left text-xs mt-0.5 ${
                    !hasImage
                      ? 'opacity-40 cursor-not-allowed text-gray-500'
                      : 'hover:bg-emerald-600/20 text-gray-200 hover:text-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{t('selection.resetAspect', locale)}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-mono">Aspect</span>
                </button>
              )}

              {/* Set Current Single Node Size as Default */}
              {onSaveAsDefaultSize && (
                <button
                  onClick={() => {
                    onSaveAsDefaultSize();
                    setShowSizeMenu(false);
                  }}
                  disabled={selectionCount !== 1}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors text-left text-xs mt-0.5 ${
                    selectionCount !== 1
                      ? 'opacity-40 cursor-not-allowed text-gray-500'
                      : 'hover:bg-amber-600/20 text-gray-200 hover:text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{t('selection.setAsDefaultSize', locale)}</span>
                  </div>
                  {selectionCount === 1 && (
                    <span className="text-[10px] text-amber-400 font-mono">
                      {Math.round(selectedNodes[0].width)}×{Math.round(selectedNodes[0].height)}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-800 mx-0.5 shrink-0" />

        {/* GROUP 4: Align Popover (Supports Auto Arrange, Alignment, and Distribution) */}
        <div className="relative" ref={alignRef}>
          <button
            onClick={() => {
              if (isLocked) return;
              setShowAlignMenu(prev => !prev);
              setShowSizeMenu(false);
              setDownloadDropdownOpen(false);
            }}
            disabled={isLocked || selectionCount < 2}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-0.5 ${
              isLocked || selectionCount < 2
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : showAlignMenu
                ? 'bg-blue-600/30 text-blue-300'
                : 'hover:bg-gray-850 text-gray-400 hover:text-white'
            }`}
            title={selectionCount < 2 ? '請選取至少 2 個節點以進行對齊' : t('selection.align', locale)}
          >
            <AlignCenterHorizontal className="w-3.5 h-3.5 text-blue-400" />
            <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showAlignMenu ? 'rotate-180' : ''}`} />
          </button>

          {showAlignMenu && (
            <div className="absolute top-full left-0 mt-1.5 p-2 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl space-y-2 min-w-[210px] animate-in fade-in zoom-in-95 duration-100 z-50">
              {/* Auto Arrange Options */}
              {onAutoArrange && (
                <div>
                  <div className="px-1 pb-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                    {t('selection.arrange', locale)}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      onClick={() => {
                        onAutoArrange('grid');
                        setShowAlignMenu(false);
                      }}
                      className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                      title={t('selection.grid', locale)}
                    >
                      <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px]">網格</span>
                    </button>
                    <button
                      onClick={() => {
                        onAutoArrange('horizontal');
                        setShowAlignMenu(false);
                      }}
                      className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                      title={t('selection.row', locale)}
                    >
                      <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px]">單列</span>
                    </button>
                    <button
                      onClick={() => {
                        onAutoArrange('vertical');
                        setShowAlignMenu(false);
                      }}
                      className="p-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 hover:text-blue-300 text-gray-300 flex flex-col items-center justify-center gap-1 transition-colors"
                      title={t('selection.column', locale)}
                    >
                      <AlignVerticalDistributeCenter className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px]">單行</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Horizontal Alignment */}
              {onAlign && (
                <>
                  <div className="pt-1 border-t border-gray-800">
                    <div className="px-1 pb-1 text-[10px] text-gray-400 font-semibold">{t('selection.align', locale)} (水平)</div>
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

                  {/* Vertical Alignment */}
                  <div className="pt-1 border-t border-gray-800">
                    <div className="px-1 pb-1 text-[10px] text-gray-400 font-semibold">{t('selection.align', locale)} (垂直)</div>
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
                </>
              )}

              {/* Distribution */}
              {onDistribute && selectionCount > 2 && (
                <div className="pt-1 border-t border-gray-800">
                  <div className="px-1 pb-1 text-[10px] text-gray-400 font-semibold">{t('selection.distribute', locale)}</div>
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

        {/* Divider */}
        <div className="w-px h-4 bg-gray-800 mx-0.5 shrink-0" />

        {/* GROUP 5: Clear Canvas (Uses Eraser icon - clearly distinguished from Delete Trash2) */}
        <button
          onClick={isLocked ? undefined : onClearCanvas}
          disabled={isLoading || isLocked}
          className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
            isLoading || isLocked
              ? 'opacity-30 cursor-not-allowed text-gray-500'
              : 'text-gray-400 hover:text-red-400 hover:bg-gray-850'
          }`}
          title={isLocked ? t('nav.lockedReadOnly', locale) : t('nav.clearTip', locale)}
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-800 mx-0.5 shrink-0" />

        {/* GROUP 6: Download / Export Menu */}
        {!isLocked && (
          <div className="relative" ref={downloadDropdownRef}>
            <button
              onClick={() => {
                if (isLoading) return;
                setDownloadDropdownOpen(prev => !prev);
                setShowSizeMenu(false);
                setShowAlignMenu(false);
              }}
              disabled={isLoading}
              className={`flex items-center gap-0.5 p-1.5 rounded-lg transition-colors ${
                isLoading
                  ? 'opacity-40 cursor-not-allowed text-gray-500'
                  : downloadDropdownOpen
                  ? 'bg-cyan-600/30 text-cyan-300'
                  : 'text-gray-400 hover:text-white hover:bg-gray-850'
              }`}
              title={t('nav.exportMenu', locale)}
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${downloadDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {downloadDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800 mb-1">
                  {t('nav.exportMenu', locale)}
                </div>

                {/* Download Selected Nodes if selection active */}
                {selectionCount > 0 && onDownloadSelected && (
                  <button
                    onClick={() => {
                      setDownloadDropdownOpen(false);
                      onDownloadSelected();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-cyan-600/20 text-gray-200 hover:text-cyan-300 transition-colors flex items-center gap-2.5 group mb-0.5"
                  >
                    <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-white group-hover:text-cyan-300">
                        {t('selection.download', locale)} ({selectionCount})
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        下載已選取物件之原始檔案
                      </div>
                    </div>
                  </button>
                )}

                {/* Export whole canvas as image */}
                {onExportBoardImage && (
                  <button
                    onClick={() => {
                      setDownloadDropdownOpen(false);
                      onExportBoardImage();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-cyan-600/20 text-gray-200 hover:text-cyan-300 transition-colors flex items-center gap-2.5 group"
                  >
                    <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-white group-hover:text-cyan-300">
                        {t('nav.exportBoard', locale)}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {t('nav.exportBoardSub', locale)}
                      </div>
                    </div>
                  </button>
                )}

                {/* Batch download all board images */}
                {onDownloadAllImages && (
                  <button
                    onClick={() => {
                      setDownloadDropdownOpen(false);
                      onDownloadAllImages();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-emerald-600/20 text-gray-200 hover:text-emerald-300 transition-colors flex items-center gap-2.5 group mt-0.5"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-white group-hover:text-emerald-300">
                        {t('nav.downloadAll', locale)}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {t('nav.downloadAllSub', locale)}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedSubToolbar;

