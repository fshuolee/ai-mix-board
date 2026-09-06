import React, { useState, useMemo } from 'react';
import {
  X,
  RotateCw,
  HardDrive,
  Database,
  CheckSquare,
  Square,
  Sparkles,
  Loader2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { RescuableAsset } from '../services/assetRescueService';

interface AssetRescueModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: RescuableAsset[];
  onRestore: (selectedAssets: RescuableAsset[]) => Promise<void>;
  isLoading: boolean;
  onRescan: () => Promise<void>;
  onDeleteLocalAssets?: (assetIds: string[]) => Promise<void>;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AssetRescueModal: React.FC<AssetRescueModalProps> = ({
  isOpen,
  onClose,
  assets,
  onRestore,
  isLoading,
  onRescan,
  onDeleteLocalAssets,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(assets.map(a => a.id)));
  const [filterSource, setFilterSource] = useState<'all' | 'local' | 'drive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeletingLocal, setIsDeletingLocal] = useState(false);

  // Sync selectedIds when assets list changes
  React.useEffect(() => {
    setSelectedIds(new Set(assets.map(a => a.id)));
  }, [assets]);

  // Keyboard shortcut Esc
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isRestoring) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRestoring, onClose]);

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      if (filterSource !== 'all' && asset.source !== filterSource) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return asset.name.toLowerCase().includes(q) || (asset.driveFileId && asset.driveFileId.toLowerCase().includes(q));
      }
      return true;
    });
  }, [assets, filterSource, searchQuery]);

  const localCount = useMemo(() => assets.filter(a => a.source === 'local').length, [assets]);
  const driveCount = useMemo(() => assets.filter(a => a.source === 'drive').length, [assets]);

  const selectedLocalAssets = useMemo(
    () => filteredAssets.filter(a => a.source === 'local' && selectedIds.has(a.id)),
    [filteredAssets, selectedIds]
  );

  if (!isOpen) return null;

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  const handleExecuteRestore = async () => {
    const toRestore = assets.filter(a => selectedIds.has(a.id));
    if (toRestore.length === 0) return;

    setIsRestoring(true);
    try {
      await onRestore(toRestore);
      onClose();
    } catch (err) {
      console.error('Error during asset restoration:', err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteSelectedLocal = async () => {
    if (!onDeleteLocalAssets || selectedLocalAssets.length === 0) return;
    const count = selectedLocalAssets.length;
    if (
      !window.confirm(
        `確定要從本機 IndexedDB 快取中永久刪除所選取的 ${count} 個圖片嗎？\n此操作不會影響雲端硬碟，但已刪除的本機快取將無法直接復原。`
      )
    ) {
      return;
    }

    setIsDeletingLocal(true);
    try {
      const idsToDelete = selectedLocalAssets.map(a => a.id);
      await onDeleteLocalAssets(idsToDelete);
      setSelectedIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
    } catch (e) {
      console.error('Error deleting local assets:', e);
    } finally {
      setIsDeletingLocal(false);
    }
  };

  const handleDeleteSingleLocal = async (asset: RescuableAsset) => {
    if (!onDeleteLocalAssets) return;
    if (
      !window.confirm(
        `確定要從本機快取刪除圖片「${asset.name}」嗎？`
      )
    ) {
      return;
    }

    setIsDeletingLocal(true);
    try {
      await onDeleteLocalAssets([asset.id]);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    } catch (e) {
      console.error('Error deleting single local asset:', e);
    } finally {
      setIsDeletingLocal(false);
    }
  };

  const isAllSelected = filteredAssets.length > 0 && selectedIds.size === filteredAssets.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">資源救援與復原 (Asset Rescue)</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                  安全備份
                </span>
              </div>
              <p className="text-xs text-gray-400">
                自動掃描本地 IndexedDB 與 Google Drive 專案資料夾，將遺失或未呈現在畫布上的圖片救回
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Action Toolbar */}
        <div className="px-6 py-3 border-b border-gray-800 bg-gray-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex bg-gray-950/70 p-0.5 rounded-lg border border-gray-800 text-xs">
              <button
                onClick={() => setFilterSource('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterSource === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                全部 ({assets.length})
              </button>
              <button
                onClick={() => setFilterSource('local')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterSource === 'local'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Database className="w-3 h-3" />
                <span>本機快取 ({localCount})</span>
              </button>
              <button
                onClick={() => setFilterSource('drive')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterSource === 'drive'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <HardDrive className="w-3 h-3" />
                <span>Google Drive ({driveCount})</span>
              </button>
            </div>

            {/* Select All Toggle */}
            {filteredAssets.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-xs text-gray-200 font-medium transition-colors"
              >
                {isAllSelected ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                    <span>取消全選</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-gray-400" />
                    <span>全選目前 ({filteredAssets.length})</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="搜尋檔案名稱..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-gray-950/70 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-44 placeholder-gray-500"
            />
            <button
              onClick={onRescan}
              disabled={isLoading || isRestoring}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-xs text-gray-300 transition-colors disabled:opacity-50"
              title="重新掃描本地與雲端硬碟"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>重新掃描</span>
            </button>
          </div>
        </div>

        {/* Content Area: Asset Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm font-medium">正在深度掃描本地 IndexedDB 與 Google Drive 資料夾...</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400 border border-dashed border-gray-800 rounded-2xl bg-gray-950/30">
              <div className="p-3 bg-gray-800/50 rounded-full text-gray-500">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-300">
                  {assets.length === 0 ? '未偵測到任何遺失的圖片資源' : '沒有符合篩選條件的圖片'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {assets.length === 0
                    ? '畫布上的所有圖片均與本地儲存及雲端硬碟保持完全同步。'
                    : '請嘗試切換來源分類或清除搜尋關鍵字。'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredAssets.map(asset => {
                const isSelected = selectedIds.has(asset.id);
                return (
                  <div
                    key={asset.id}
                    onClick={() => handleToggleSelect(asset.id)}
                    className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-all flex flex-col bg-gray-950/60 ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg'
                        : 'border-gray-800 hover:border-gray-700 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Thumbnail Preview */}
                    <div className="aspect-square w-full bg-gray-900/80 relative flex items-center justify-center overflow-hidden">
                      {asset.previewUrl ? (
                        <img
                          src={asset.previewUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-gray-500">
                          {asset.source === 'local' ? (
                            <Database className="w-8 h-8 text-emerald-500/60" />
                          ) : (
                            <HardDrive className="w-8 h-8 text-blue-500/60" />
                          )}
                          <span className="text-[10px] text-gray-400">無縮圖預覽</span>
                        </div>
                      )}

                      {/* Checkbox Badge */}
                      <div className="absolute top-2 left-2 z-10">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors shadow-md ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-black/60 border border-gray-600 text-transparent hover:border-gray-400'
                          }`}
                        >
                          {isSelected && <span className="text-xs font-bold">✓</span>}
                        </div>
                      </div>

                      {/* Source Badge */}
                      <div className="absolute top-2 right-2 z-10">
                        {asset.source === 'local' ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 backdrop-blur-sm shadow">
                            <Database className="w-2.5 h-2.5" />
                            <span>本機快取</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-700/50 backdrop-blur-sm shadow">
                            <HardDrive className="w-2.5 h-2.5" />
                            <span>Drive</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="p-2.5 flex-1 flex flex-col justify-between border-t border-gray-800/80 bg-gray-900/40">
                      <p className="text-xs font-medium text-gray-200 truncate" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span>{formatFileSize(asset.size)}</span>
                        <div className="flex items-center gap-1.5">
                          {asset.source === 'local' && onDeleteLocalAssets && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteSingleLocal(asset);
                              }}
                              className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              title="從本機快取刪除此圖片"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          {asset.driveViewLink && (
                            <a
                              href={asset.driveViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-gray-400 hover:text-blue-400 flex items-center gap-0.5"
                              title="在 Google Drive 開啟"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-950/80 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            已選取 <span className="font-semibold text-white">{selectedIds.size}</span> / {filteredAssets.length} 個項目
            {selectedLocalAssets.length > 0 && (
              <span className="text-emerald-400 ml-2 font-mono">
                (包含 {selectedLocalAssets.length} 個本機快取)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {selectedLocalAssets.length > 0 && onDeleteLocalAssets && (
              <button
                type="button"
                onClick={handleDeleteSelectedLocal}
                disabled={isRestoring || isDeletingLocal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-400 bg-red-950/60 hover:bg-red-900 border border-red-800/60 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                title="從本機 IndexedDB 快取中永久刪除所選取的圖片"
              >
                {isDeletingLocal ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>清理所選本機快取 ({selectedLocalAssets.length})</span>
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isRestoring || isDeletingLocal}
              className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleExecuteRestore}
              disabled={isRestoring || isDeletingLocal || selectedIds.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在復原至畫布...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>一鍵救回所選項目至畫布 ({selectedIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetRescueModal;
