import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Zap,
  Brain,
  Check,
  X,
  Info,
  RefreshCw,
  Search,
  Cpu,
  Layers,
} from 'lucide-react';
import {
  MODEL_CATEGORIES,
  getModelById,
  getAvailableModels,
  subscribeModels,
  fetchModelsFromApi,
} from '../services/modelsConfig';
import { ModelInfo } from '../types';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

const CategoryIcon: React.FC<{ categoryId: string; className?: string }> = ({
  categoryId,
  className = 'w-5 h-5',
}) => {
  switch (categoryId) {
    case 'recommended':
      return <Sparkles className={`${className} text-amber-400`} />;
    case 'image':
      return <ImageIcon className={`${className} text-purple-400`} />;
    case 'fast':
      return <Zap className={`${className} text-emerald-400`} />;
    case 'reasoning':
      return <Brain className={`${className} text-blue-400`} />;
    default:
      return <Sparkles className={`${className} text-gray-400`} />;
  }
};

function formatTokens(tokens?: number): string {
  if (!tokens || tokens <= 0) return '';
  if (tokens >= 1000000) {
    const m = Math.round(tokens / 100000) / 10;
    return `${m}M tokens`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K tokens`;
  }
  return `${tokens} tokens`;
}

const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  onSelectModel,
}) => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [models, setModels] = useState<ModelInfo[]>(getAvailableModels());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeModels(newModels => {
      setModels(newModels);
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Proactively fetch latest models on open
      fetchModelsFromApi().catch(() => {});
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSyncClick = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const updated = await fetchModelsFromApi();
      setSyncMessage(`已成功同步 ${updated.length} 個 API 模型！`);
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err: any) {
      setSyncMessage('同步失敗，請檢查 API Key');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredModels = useMemo(() => {
    return models.filter(model => {
      // Tab filter
      if (activeTab === 'recommended' && !model.capabilities.isRecommended && model.category !== 'recommended') {
        return false;
      }
      if (activeTab !== 'all' && activeTab !== 'recommended' && model.category !== activeTab) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = model.name.toLowerCase().includes(q);
        const matchesId = model.id.toLowerCase().includes(q);
        const matchesDesc = model.description.toLowerCase().includes(q);
        const matchesBadge = (model.badge || '').toLowerCase().includes(q);
        return matchesName || matchesId || matchesDesc || matchesBadge;
      }

      return true;
    });
  }, [models, activeTab, searchQuery]);

  if (!isOpen) return null;

  const currentModel = getModelById(selectedModelId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 rounded-xl shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                選擇 AI 模型
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  動態 API 資訊 ({models.length} 個模型)
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                以 Google Gemini API 最新完整資訊為準，即時支援多模態生圖、思考推理與高速運算
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition-colors shadow-sm disabled:opacity-50"
              title="從 Google Gemini API 重新同步最新模型清單"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isSyncing ? '同步中...' : '同步 API 模型'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync message banner if any */}
        {syncMessage && (
          <div className="px-6 py-2 bg-blue-950/60 border-b border-blue-800/80 text-xs text-blue-300 flex items-center justify-between animate-fadeIn">
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Search & Tabs Controls */}
        <div className="px-6 py-3 border-b border-gray-800/80 bg-gray-900/90 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋模型名稱、ID (例如: 3.8-flash, 3.1-pro, 3.1-image, flash, thinking...)"
              className="w-full pl-9 pr-4 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-all font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
              >
                清除
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs pb-0.5 scrollbar-thin">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>全部模型 ({models.length})</span>
            </button>
            {MODEL_CATEGORIES.map(cat => {
              const count = models.filter(m =>
                cat.id === 'recommended'
                  ? m.capabilities.isRecommended || m.category === 'recommended'
                  : m.category === cat.id
              ).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                    activeTab === cat.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  <CategoryIcon categoryId={cat.id} className="w-3.5 h-3.5" />
                  <span>{cat.title.split(' ')[1] || cat.title} ({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Models List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredModels.length === 0 ? (
            <div className="text-center py-12 text-gray-400 space-y-2">
              <Cpu className="w-8 h-8 mx-auto text-gray-500 opacity-60" />
              <div className="text-sm font-medium">找不到相符的模型</div>
              <p className="text-xs text-gray-500">
                請嘗試不同的關鍵字，或點擊上方「同步 API 模型」重新整理。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredModels.map(model => {
                const isSelected = model.id === selectedModelId;
                const inputTokenStr = formatTokens(model.inputTokenLimit);
                const outputTokenStr = formatTokens(model.outputTokenLimit);

                return (
                  <div
                    key={model.id}
                    onClick={() => {
                      onSelectModel(model.id);
                      onClose();
                    }}
                    className={`group relative p-4 rounded-xl border transition-all cursor-pointer text-left flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40'
                        : 'bg-gray-800/60 border-gray-700/80 hover:bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div>
                      {/* Title & Badges */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm text-white group-hover:text-blue-300 transition-colors">
                            {model.name}
                          </span>

                          {model.badge && (
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                                model.category === 'recommended'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : model.category === 'image'
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                  : model.category === 'fast'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {model.badge}
                            </span>
                          )}

                          {model.thinking && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              🧠 思考模式
                            </span>
                          )}
                        </div>

                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-gray-600 group-hover:border-gray-400 shrink-0" />
                        )}
                      </div>

                      {/* Official API Description */}
                      <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed mb-3">
                        {model.description}
                      </p>
                    </div>

                    {/* Metadata & API Specs Footer */}
                    <div className="pt-2 border-t border-gray-700/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                        <span className="truncate max-w-[200px] text-gray-300">{model.id}</span>
                        {inputTokenStr && (
                          <span className="text-emerald-400 text-[10px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                            上下文: {inputTokenStr}
                          </span>
                        )}
                      </div>

                      {/* Detailed capabilities chips */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                        {model.capabilities.supportsImageOutput && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50">
                            支援圖像輸出
                          </span>
                        )}
                        {model.capabilities.supportsImageInput && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50">
                            支援圖片輸入
                          </span>
                        )}
                        {outputTokenStr && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-300">
                            輸出上限: {outputTokenStr}
                          </span>
                        )}
                        {model.version && (
                          <span className="ml-auto text-gray-500 text-[9px] font-mono">
                            v{model.version}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate">
              目前畫布預設：
              <span className="text-white font-medium ml-1">{currentModel.name}</span>
              <span className="text-gray-500 ml-1 font-mono text-[11px]">({currentModel.id})</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelSelectorModal;
