import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Sliders,
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  Search,
  Maximize2,
  Palette,
  Cpu,
  Video,
  Wrench,
  HelpCircle,
  Dices,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  Code2,
  Bookmark,
  Zap,
  CheckCircle2,
  AlertCircle,
  Send,
  Info,
  Volume2,
} from 'lucide-react';
import { CanvasNode, ModelInfo, ModelParamField, ModelParamGroup } from '../types';
import {
  getModelParamSchema,
  getModelParams,
  saveModelParams,
  resetModelParams,
  countModifiedParams,
  BUILTIN_PRESETS,
  getModelModality,
  parseRawPayload,
} from '../services/modelParamsService';
import { getModelById } from '../services/modelsConfig';
import { t, Locale } from '../services/i18n';

interface InspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId: string;
  onOpenModelModal: () => void;
  params: Record<string, any>;
  onParamsChange: (newParams: Record<string, any>) => void;
  selectedNodes?: CanvasNode[];
  onGenerate?: () => void;
  onApplyNodeParams?: (nodeParams: Record<string, any>) => void;
  isGenerating?: boolean;
  locale?: Locale;
}

const GROUP_ICON_MAP: Record<string, React.ReactNode> = {
  Sliders: <Sliders className="w-4 h-4 text-blue-400" />,
  Maximize2: <Maximize2 className="w-4 h-4 text-emerald-400" />,
  Palette: <Palette className="w-4 h-4 text-pink-400" />,
  Cpu: <Cpu className="w-4 h-4 text-purple-400" />,
  Video: <Video className="w-4 h-4 text-amber-400" />,
  Volume2: <Volume2 className="w-4 h-4 text-cyan-400" />,
  Wrench: <Wrench className="w-4 h-4 text-orange-400" />,
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  onOpenModelModal,
  params,
  onParamsChange,
  selectedNodes = [],
  onGenerate,
  onApplyNodeParams,
  isGenerating = false,
  locale = 'zh-TW',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'params' | 'node'>('params');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    basic: true,
    dimensions: true,
    creative: true,
    sampling: true,
    video: true,
    advanced: false,
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  const modelInfo = useMemo(() => getModelById(selectedModelId), [selectedModelId]);
  const modality = useMemo(() => getModelModality(modelInfo), [modelInfo]);
  const schema = useMemo(() => getModelParamSchema(modelInfo), [modelInfo]);

  // If a node is selected and has generationParams, allow switching to node tab
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const hasNodeGenParams = Boolean(singleSelectedNode?.generationParams);

  // Filter presets compatible with current model modality
  const relevantPresets = useMemo(() => {
    return BUILTIN_PRESETS.filter(p => p.modality === modality || p.modality === 'all');
  }, [modality]);

  const modifiedCount = useMemo(() => {
    return countModifiedParams(selectedModelId, params, modelInfo);
  }, [selectedModelId, params, modelInfo]);

  // Update field value
  const handleFieldChange = (fieldId: string, value: any) => {
    const next = { ...params, [fieldId]: value };
    onParamsChange(next);
    saveModelParams(selectedModelId, next);

    if (fieldId === 'rawPayload') {
      if (typeof value === 'string' && value.trim()) {
        try {
          JSON.parse(value.trim());
          setJsonError(null);
        } catch (e: any) {
          setJsonError(e.message || '無效的 JSON 格式');
        }
      } else {
        setJsonError(null);
      }
    }
  };

  // Reset to default
  const handleResetDefaults = () => {
    const defaults = resetModelParams(selectedModelId, modelInfo);
    onParamsChange(defaults);
    setJsonError(null);
  };

  // Apply preset
  const handleApplyPreset = (presetId: string) => {
    const targetPreset = relevantPresets.find(p => p.id === presetId);
    if (!targetPreset) return;
    const merged = { ...params, ...targetPreset.params };
    onParamsChange(merged);
    saveModelParams(selectedModelId, merged);
  };

  // Copy payload as JSON
  const handleCopyPayload = () => {
    try {
      const payloadToExport = {
        modelId: selectedModelId,
        modelName: modelInfo.name,
        modality,
        parameters: { ...params },
        customRawPayload: parseRawPayload(params.rawPayload),
        exportedAt: new Date().toISOString(),
      };
      navigator.clipboard?.writeText(JSON.stringify(payloadToExport, null, 2));
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {}
  };

  // Toggle group accordion
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Randomize seed
  const handleRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 1000000000);
    handleFieldChange('seed', randomSeed);
  };

  // Filter fields based on search query
  const filteredFieldsByGroup = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const result: Record<string, ModelParamField[]> = {};

    for (const group of schema.groups) {
      const groupFields = schema.fields.filter(f => {
        if (f.group !== group.id) return false;
        if (!query) return true;
        return (
          f.label.toLowerCase().includes(query) ||
          f.id.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query)
        );
      });
      if (groupFields.length > 0) {
        result[group.id] = groupFields;
      }
    }
    return result;
  }, [schema, searchQuery]);

  if (!isOpen) return null;

  return (
    <aside
      className="fixed top-[88px] right-0 bottom-0 w-80 sm:w-96 z-40 bg-gray-900/95 backdrop-blur-2xl border-l border-gray-800 shadow-2xl flex flex-col select-none text-gray-200 transition-all duration-300 animate-in slide-in-from-right-8 pointer-events-auto"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* 1. Header with Model Info & Tabs */}
      <div className="p-3.5 border-b border-gray-800/80 bg-gray-900/80 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                <span>{t('inspector.title', locale)}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-blue-600/20 text-blue-300 border border-blue-500/30">
                  {t('inspector.badge', locale)}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Reset button */}
            <button
              onClick={handleResetDefaults}
              disabled={modifiedCount === 0}
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                modifiedCount > 0
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/25'
                  : 'text-gray-500 opacity-40 cursor-not-allowed'
              }`}
              title={modifiedCount > 0 ? `${t('inspector.reset', locale)} (${modifiedCount})` : t('inspector.reset', locale)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {modifiedCount > 0 && <span className="text-[10px]">{modifiedCount}</span>}
            </button>

            {/* Copy JSON Payload */}
            <button
              onClick={handleCopyPayload}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
              title={t('inspector.copy', locale)}
            >
              {copiedPayload ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Close Inspector */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors ml-0.5"
              title={t('inspector.close', locale)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Model Pill Banner */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-gray-950/60 border border-gray-800/80 group">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-200 truncate">
                {modelInfo.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                <span className="px-1.5 py-0.2 rounded bg-gray-800 text-gray-300 font-mono">
                  {modelInfo.provider === 'atlascloud' ? 'Atlas Cloud' : 'Google Gemini'}
                </span>
                <span className="truncate">· {modelInfo.tag || modelInfo.badge}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenModelModal}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition-all shrink-0 active:scale-95"
          >
            {t('inspector.change', locale)}
          </button>
        </div>

        {/* Tab Switcher if node is selected */}
        {singleSelectedNode && (
          <div className="flex items-center p-0.5 bg-gray-950 rounded-lg border border-gray-800/80 text-xs">
            <button
              onClick={() => setActiveTab('params')}
              className={`flex-1 py-1 px-2 rounded-md font-medium transition-all text-center ${
                activeTab === 'params'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t('inspector.tabParams', locale)} ({schema.fields.length})
            </button>
            <button
              onClick={() => setActiveTab('node')}
              className={`flex-1 py-1 px-2 rounded-md font-medium transition-all text-center flex items-center justify-center gap-1 ${
                activeTab === 'node'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>{t('inspector.tabNode', locale)}</span>
              {hasNodeGenParams && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-4 custom-scrollbar">
        {activeTab === 'node' && singleSelectedNode ? (
          /* Node Properties View */
          <div className="space-y-3.5 animate-fadeIn text-xs">
            <div className="p-3 bg-gray-950/60 rounded-xl border border-gray-800/80 space-y-2">
              <div className="text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                {t('node.specs', locale)}
              </div>
              <div className="flex justify-between py-1 border-b border-gray-850">
                <span className="text-gray-400">{t('node.type', locale)}:</span>
                <span className="font-mono text-gray-200 uppercase">{singleSelectedNode.type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-850">
                <span className="text-gray-400">{t('node.dimensions', locale)}:</span>
                <span className="font-mono text-gray-200">
                  {Math.round(singleSelectedNode.width)} × {Math.round(singleSelectedNode.height)} px
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-850">
                <span className="text-gray-400">{t('node.created', locale)}:</span>
                <span className="text-gray-300">
                  {singleSelectedNode.createdAt
                    ? new Date(singleSelectedNode.createdAt).toLocaleTimeString(locale === 'zh-TW' ? 'zh-TW' : 'en-US', { hour12: false })
                    : '—'}
                </span>
              </div>
              {singleSelectedNode.generationModel && (
                <div className="flex justify-between py-1 border-b border-gray-850">
                  <span className="text-gray-400">{t('node.model', locale)}:</span>
                  <span className="text-blue-300 truncate max-w-[180px]">
                    {singleSelectedNode.generationModel}
                  </span>
                </div>
              )}
            </div>

            {singleSelectedNode.generationPrompt && (
              <div className="p-3 bg-gray-950/60 rounded-xl border border-gray-800/80 space-y-1.5">
                <div className="text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                  {t('node.promptHistory', locale)}
                </div>
                <p className="text-gray-200 text-xs leading-relaxed bg-gray-900/80 p-2 rounded-lg border border-gray-800 break-words max-h-32 overflow-y-auto">
                  {singleSelectedNode.generationPrompt}
                </p>
              </div>
            )}

            {hasNodeGenParams ? (
              <div className="p-3 bg-gray-950/60 rounded-xl border border-blue-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-blue-300 font-semibold text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t('node.historyParams', locale)}</span>
                  </div>
                  {onApplyNodeParams && (
                    <button
                      onClick={() => onApplyNodeParams(singleSelectedNode.generationParams!)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-medium transition-all shadow-sm"
                    >
                      {t('inspector.applyNodeParams', locale)}
                    </button>
                  )}
                </div>
                <div className="bg-gray-900 p-2.5 rounded-lg font-mono text-[11px] text-gray-300 max-h-48 overflow-y-auto space-y-1 border border-gray-800">
                  {Object.entries(singleSelectedNode.generationParams!).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center py-0.5 border-b border-gray-800/50">
                      <span className="text-gray-400">{k}:</span>
                      <span className="text-blue-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-950/40 rounded-xl border border-gray-800 text-center text-gray-400 text-xs">
                {t('node.noParams', locale)}
              </div>
            )}
          </div>
        ) : (
          /* Parameter Configuration View */
          <>
            {/* Search Filter & Presets Bar */}
            <div className="space-y-2">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('inspector.searchPlaceholder', locale)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-gray-950/70 border border-gray-800 rounded-xl text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/80 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Quick Presets Pills */}
              {relevantPresets.length > 0 && !searchQuery && (
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-semibold text-gray-400 flex items-center gap-1 uppercase tracking-wider">
                    <Bookmark className="w-3 h-3 text-blue-400" />
                    <span>{t('inspector.presets', locale)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {relevantPresets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-950 border border-gray-800 hover:border-blue-500/50 hover:bg-gray-850 text-gray-300 hover:text-white shrink-0 transition-all flex items-center gap-1"
                        title={preset.description}
                      >
                        <span>{t('preset.' + preset.id, locale) !== 'preset.' + preset.id ? t('preset.' + preset.id, locale) : preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion Parameter Groups */}
            <div className="space-y-2.5">
              {schema.groups.map(group => {
                const fieldsInGroup = filteredFieldsByGroup[group.id] || [];
                if (fieldsInGroup.length === 0) return null;

                const isExpanded = searchQuery ? true : expandedGroups[group.id] ?? true;

                return (
                  <div
                    key={group.id}
                    className="border border-gray-800/80 rounded-2xl bg-gray-950/40 overflow-hidden shadow-sm transition-colors"
                  >
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center justify-between p-2.5 bg-gray-900/50 hover:bg-gray-850/80 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {GROUP_ICON_MAP[group.icon] || <Sliders className="w-4 h-4 text-blue-400" />}
                        <div>
                          <div className="text-xs font-semibold text-gray-200">
                            {t('group.' + group.id, locale) || group.title}
                          </div>
                          {group.description && (
                            <div className="text-[10px] text-gray-400">
                              {t('groupDesc.' + group.id, locale) !== 'groupDesc.' + group.id ? t('groupDesc.' + group.id, locale) : group.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-800 text-gray-400 font-mono">
                          {fieldsInGroup.length}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Group Fields Body */}
                    {isExpanded && (
                      <div className="p-3 space-y-3.5 divide-y divide-gray-850/60 border-t border-gray-800/60">
                        {fieldsInGroup.map(field => {
                          const value = params[field.id] !== undefined ? params[field.id] : field.defaultValue;
                          const isModified = value !== field.defaultValue;

                          return (
                            <div key={field.id} className="pt-2.5 first:pt-0 space-y-1.5">
                              {/* Field Label & Tooltip */}
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-gray-200 flex items-center gap-1.5">
                                  <span>{t('field.' + field.id, locale) !== 'field.' + field.id ? t('field.' + field.id, locale) : field.label}</span>
                                  {isModified && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-amber-400"
                                      title="已修改為自訂值"
                                    />
                                  )}
                                </label>
                                {isModified && (
                                  <button
                                    onClick={() => handleFieldChange(field.id, field.defaultValue)}
                                    className="text-[10px] text-gray-500 hover:text-amber-400 transition-colors"
                                    title={t('inspector.reset', locale)}
                                  >
                                    {t('inspector.reset', locale)}
                                  </button>
                                )}
                              </div>

                              {field.description && (
                                <p className="text-[11px] text-gray-400 leading-tight">
                                  {t('fieldDesc.' + field.id, locale) !== 'fieldDesc.' + field.id ? t('fieldDesc.' + field.id, locale) : field.description}
                                </p>
                              )}

                              {/* Field Controls Rendering */}
                              {/* 1. SLIDER */}
                              {field.type === 'slider' && (
                                <div className="flex items-center gap-2.5 pt-1">
                                  <input
                                    type="range"
                                    min={field.min ?? 0}
                                    max={field.max ?? 100}
                                    step={field.step ?? 1}
                                    value={value}
                                    onChange={e =>
                                      handleFieldChange(
                                        field.id,
                                        field.step && field.step < 1
                                          ? parseFloat(e.target.value)
                                          : parseInt(e.target.value, 10)
                                      )
                                    }
                                    className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                                  />
                                  <div className="flex items-center gap-1 w-16 shrink-0">
                                    <input
                                      type="number"
                                      min={field.min}
                                      max={field.max}
                                      step={field.step}
                                      value={value}
                                      onChange={e =>
                                        handleFieldChange(
                                          field.id,
                                          field.step && field.step < 1
                                            ? parseFloat(e.target.value)
                                            : parseInt(e.target.value, 10)
                                        )
                                      }
                                      className="w-full text-center text-xs font-mono py-1 bg-gray-950 border border-gray-800 rounded-lg text-blue-300 focus:outline-none focus:border-blue-500"
                                    />
                                    {field.unit && (
                                      <span className="text-[10px] text-gray-500 font-mono">
                                        {field.unit}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 2. NUMBER INPUT */}
                              {field.type === 'number' && (
                                <div className="flex items-center gap-2 pt-1">
                                  <input
                                    type="number"
                                    min={field.min}
                                    max={field.max}
                                    step={field.step || 1}
                                    value={value}
                                    onChange={e => handleFieldChange(field.id, parseInt(e.target.value, 10) || 0)}
                                    className="w-full text-xs font-mono px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-xl text-gray-200 focus:outline-none focus:border-blue-500"
                                  />
                                </div>
                              )}

                              {/* 3. ASPECT RATIO PILLS */}
                              {field.type === 'aspect_ratio' && (
                                <div className="grid grid-cols-3 gap-1.5 pt-1">
                                  {(field.options || []).map(opt => {
                                    const isSelected = value === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        onClick={() => handleFieldChange(field.id, opt.value)}
                                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all ${
                                          isSelected
                                            ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-semibold shadow-sm'
                                            : 'bg-gray-950/60 border-gray-800 text-gray-300 hover:border-gray-700 hover:bg-gray-900'
                                        }`}
                                        title={opt.description}
                                      >
                                         {opt.value === 'auto' ? (
                                           <Sparkles className="w-4 h-4 mb-1 text-current opacity-85" />
                                         ) : (
                                           <div
                                             className={`mb-1 border border-current rounded-sm ${
                                               opt.value === '1:1'
                                                 ? 'w-4 h-4'
                                                 : opt.value === '16:9'
                                                 ? 'w-5 h-3'
                                                 : opt.value === '9:16'
                                                 ? 'w-3 h-5'
                                                 : opt.value === '4:3'
                                                 ? 'w-4 h-3'
                                                 : opt.value === '3:4'
                                                 ? 'w-3 h-4'
                                                 : 'w-6 h-2.5'
                                             }`}
                                           />
                                         )}
                                         <span className="font-mono text-[11px] truncate max-w-full">
                                           {opt.value === 'auto' ? '原圖 (Auto)' : opt.value}
                                         </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 4. SEGMENTED CONTROL */}
                              {field.type === 'segmented' && (
                                <div className="flex items-center p-0.5 bg-gray-950 rounded-xl border border-gray-800 pt-0.5">
                                  {(field.options || []).map(opt => {
                                    const isSelected = value === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        onClick={() => handleFieldChange(field.id, opt.value)}
                                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
                                          isSelected
                                            ? 'bg-blue-600 text-white font-semibold shadow-sm'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                      >
                                        {t('opt.' + opt.value, locale) !== 'opt.' + opt.value ? t('opt.' + opt.value, locale) : opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 5. SELECT DROPDOWN */}
                              {field.type === 'select' && (
                                <div className="relative pt-1">
                                  <select
                                    value={value}
                                    onChange={e => handleFieldChange(field.id, e.target.value)}
                                    className="w-full text-xs bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-gray-200 appearance-none focus:outline-none focus:border-blue-500 cursor-pointer"
                                  >
                                    {(field.options || []).map(opt => (
                                      <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
                                        {t('opt.' + opt.value, locale) !== 'opt.' + opt.value ? t('opt.' + opt.value, locale) : (t('cam.' + opt.value, locale) !== 'cam.' + opt.value ? t('cam.' + opt.value, locale) : opt.label)}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              )}

                              {/* 6. TEXTAREA (Negative Prompt / System Prompt) */}
                              {field.type === 'textarea' && (
                                <div className="pt-1">
                                  <textarea
                                    value={value || ''}
                                    rows={3}
                                    placeholder={field.placeholder}
                                    onChange={e => handleFieldChange(field.id, e.target.value)}
                                    className="w-full text-xs font-sans p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-y"
                                  />
                                </div>
                              )}

                              {/* 7. SEED FIELD */}
                              {field.type === 'seed' && (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <input
                                    type="number"
                                    value={value}
                                    onChange={e => handleFieldChange(field.id, parseInt(e.target.value, 10) || -1)}
                                    placeholder="-1 代表隨機種子"
                                    className="flex-1 text-xs font-mono px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-xl text-gray-200 focus:outline-none focus:border-blue-500"
                                  />
                                  <button
                                    onClick={handleRandomSeed}
                                    className="p-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-blue-400 border border-gray-800 hover:border-gray-700 transition-all shrink-0"
                                    title="生成隨機種子碼"
                                  >
                                    <Dices className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleFieldChange(field.id, -1)}
                                    className="px-2 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-[11px] border border-gray-800 shrink-0 transition-all"
                                    title="重設為隨機 (-1)"
                                  >
                                    {t('inspector.random', locale)}
                                  </button>
                                </div>
                              )}

                              {/* 8. RAW JSON EDITOR (Future APIs & Provider Extensibility) */}
                              {field.type === 'json' && (
                                <div className="space-y-1.5 pt-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-400 font-mono">Custom JSON Body:</span>
                                    {jsonError ? (
                                      <span className="text-rose-400 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        <span>{jsonError}</span>
                                      </span>
                                    ) : (
                                      <span className="text-emerald-400 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>{t('inspector.validJson', locale)}</span>
                                      </span>
                                    )}
                                  </div>
                                  <textarea
                                    value={value || ''}
                                    rows={4}
                                    placeholder={field.placeholder}
                                    onChange={e => handleFieldChange(field.id, e.target.value)}
                                    className={`w-full font-mono text-xs p-2.5 bg-gray-950 rounded-xl border focus:outline-none ${
                                      jsonError
                                        ? 'border-rose-500/80 text-rose-200'
                                        : 'border-gray-800 text-gray-200 focus:border-blue-500'
                                    }`}
                                  />
                                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <Info className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span>{t('inspector.rawHint', locale)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 3. Bottom Execution / Sticky Action Bar */}
      <div className="p-3 border-t border-gray-800/80 bg-gray-900/90 shrink-0 flex items-center justify-between gap-2">
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{t('inspector.realtimeSync', locale)}</span>
        </div>

        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={isGenerating || selectedNodes.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all active:scale-95 ${
              isGenerating || selectedNodes.length === 0
                ? 'opacity-40 cursor-not-allowed bg-gray-800 text-gray-400'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-blue-500/20'
            }`}
            title={selectedNodes.length === 0 ? t('inspector.selectNodesFirst', locale) : t('inspector.generateTip', locale)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('inspector.generateNow', locale)}</span>
          </button>
        )}
      </div>
    </aside>
  );
};
