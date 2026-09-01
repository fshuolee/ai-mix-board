import React, { useState } from 'react';
import { Sparkles, Image as ImageIcon, Zap, Brain, Check, X, Info } from 'lucide-react';
import { AVAILABLE_MODELS, MODEL_CATEGORIES, getModelById } from '../services/modelsConfig';
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

const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  onSelectModel,
}) => {
  const [activeTab, setActiveTab] = useState<string>('all');

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentModel = getModelById(selectedModelId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-xl shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                選擇 AI 模型
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  能力分類
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                依據您的創作需求（生圖、高速推論、深度思考）選擇最適合的 Gemini 模型
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-800/80 bg-gray-900/90 overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            全部模型
          </button>
          {MODEL_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === cat.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <CategoryIcon categoryId={cat.id} className="w-4 h-4" />
              <span>{cat.title.split(' ')[1] || cat.title}</span>
            </button>
          ))}
        </div>

        {/* Models List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {MODEL_CATEGORIES.filter(cat => activeTab === 'all' || activeTab === cat.id).map(
            category => {
              const categoryModels = AVAILABLE_MODELS.filter(
                m => m.category === category.id
              );
              if (categoryModels.length === 0) return null;

              return (
                <div key={category.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CategoryIcon categoryId={category.id} />
                      <h3 className="text-sm font-semibold text-gray-200">{category.title}</h3>
                    </div>
                    <span className="text-xs text-gray-400">{category.subtitle}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {categoryModels.map(model => {
                      const isSelected = model.id === selectedModelId;
                      return (
                        <div
                          key={model.id}
                          onClick={() => {
                            onSelectModel(model.id);
                            onClose();
                          }}
                          className={`group relative p-4 rounded-xl border transition-all cursor-pointer text-left flex flex-col justify-between ${
                            isSelected
                              ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/10'
                              : 'bg-gray-800/60 border-gray-700/80 hover:bg-gray-800 hover:border-gray-600'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
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
                              </div>
                              {isSelected ? (
                                <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border border-gray-600 group-hover:border-gray-400 shrink-0" />
                              )}
                            </div>

                            <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed mb-3">
                              {model.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-gray-700/50 text-[11px] text-gray-400">
                            <span className="font-mono text-gray-400">{model.id}</span>
                            <span className="ml-auto px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300">
                              {model.tag}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            <span>
              目前選擇：
              <span className="text-white font-medium ml-1">{currentModel.name}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelSelectorModal;
