import { ModelInfo, RawApiModelInfo } from '../types';

export interface ModelCategoryConfig {
  id: 'recommended' | 'image' | 'fast' | 'reasoning';
  title: string;
  subtitle: string;
  icon: string;
}

export const MODEL_CATEGORIES: ModelCategoryConfig[] = [
  {
    id: 'recommended',
    title: '🌟 推薦首選 (Recommended)',
    subtitle: 'Google 最新 3.x 旗艦推論與次世代生圖模型',
    icon: 'Sparkles',
  },
  {
    id: 'image',
    title: '🎨 圖像創作與編輯 (Image Generation)',
    subtitle: '多模態混音生圖 (Nano Banana 2 / Pro) 與高畫質合成',
    icon: 'Image',
  },
  {
    id: 'fast',
    title: '⚡ 高速與輕量推論 (Fast & Lightweight)',
    subtitle: 'Gemini 3.8 / 3.7 Flash 極速低延遲運算',
    icon: 'Zap',
  },
  {
    id: 'reasoning',
    title: '🧠 深度推理與複雜理解 (Advanced Reasoning)',
    subtitle: 'Gemini 3.1 Pro 深度思考與百萬 Token 上下文規劃',
    icon: 'Brain',
  },
];

const STORAGE_KEY_CACHED_MODELS = 'ai_mix_board_cached_models';
const STORAGE_KEY_MODELS_TIME = 'ai_mix_board_models_time';

// Default model: Google's flagship 3.1 multimodal image generation model
export const DEFAULT_MODEL_ID = 'gemini-3.1-flash-image';

/**
 * Baseline fallback models (latest 3.x & 4.x generations)
 */
const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image (Nano Banana 2)',
    category: 'recommended',
    description: 'Google 最新 3.1 次世代多模態生圖旗艦，能結合多張圖片與文字節點高速生成全新創作。',
    badge: '預設主力生圖 (3.1)',
    tag: '多模態生圖',
    inputTokenLimit: 65536,
    outputTokenLimit: 65536,
    version: '3.0',
    thinking: true,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    category: 'recommended',
    description: 'Google 最新 3.8 次世代高智慧 Flash 模型，具備百萬上下文深度思考與極致高速分析。',
    badge: '最新旗艦 3.8',
    tag: '極速高智 (1M)',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    version: '3.0',
    thinking: true,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    category: 'recommended',
    description: 'Google 最新 3.1 旗艦 Pro 深度推理模型，具備最強上下文理解、結構拆解與創意規劃能力。',
    badge: '最強推理 3.1',
    tag: '深度思考 (1M)',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    version: '3.1',
    thinking: true,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro Image (Nano Banana Pro)',
    category: 'image',
    description: 'Google 頂級 Pro 等級多模態生圖模型，高細節逼真呈現與複雜藝術風格渲染。',
    badge: '旗艦生圖 Pro',
    tag: 'Pro 高解析',
    inputTokenLimit: 65536,
    outputTokenLimit: 65536,
    version: '3.0',
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    category: 'fast',
    description: '次世代 3.7 高速多模態思考模型，平衡極低延遲與深度推論。',
    badge: '次世代 3.7',
    tag: '低延遲思考',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    version: '3.7',
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    category: 'fast',
    description: 'Google 官方自動指向最新 Flash 正式版本的通用端點。',
    badge: '官方自動最新',
    tag: 'Auto Latest',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini Pro Latest',
    category: 'reasoning',
    description: 'Google 官方自動指向最新 Pro 正式版本的旗艦端點。',
    badge: '官方 Pro 最新',
    tag: 'Auto Latest',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    category: 'fast',
    description: 'Google 最新 Gemma 4 開源指令微調旗艦架構，高效高能。',
    badge: 'Gemma 4',
    tag: '次世代架構',
    inputTokenLimit: 131072,
    outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
];

type ModelsListener = (models: ModelInfo[]) => void;
const listeners: Set<ModelsListener> = new Set();

let currentModels: ModelInfo[] = loadCachedModels() || DEFAULT_MODELS;

// Synchronized export array for backwards compatibility
export const AVAILABLE_MODELS: ModelInfo[] = [...currentModels];

function syncAvailableModels() {
  AVAILABLE_MODELS.length = 0;
  AVAILABLE_MODELS.push(...currentModels);
}

function loadCachedModels(): ModelInfo[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CACHED_MODELS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If cached models are from old 2.5 defaults, invalidate cache so new 3.x models take precedence
        const has3x = parsed.some((m: ModelInfo) => m.id.includes('3.8') || m.id.includes('3.1'));
        if (has3x) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load cached models from localStorage:', e);
  }
  return null;
}

function formatTokenLimit(tokens?: number): string {
  if (!tokens || tokens <= 0) return '';
  if (tokens >= 1000000) {
    const m = Math.round(tokens / 100000) / 10;
    return `${m}M Tokens`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K Tokens`;
  }
  return `${tokens} Tokens`;
}

/**
 * Parses raw Google Generative Language API model info into ModelInfo
 */
export function parseApiModel(raw: RawApiModelInfo): ModelInfo {
  const id = raw.name.replace(/^models\//, '');
  let displayName = raw.displayName || id;
  const methods = raw.supportedGenerationMethods || [];

  // Enhance display names for internal Google code names so users clearly see the Gemini generation
  if (id === 'gemini-3.1-flash-image' || id === 'gemini-3.1-flash-image-preview') {
    displayName = 'Gemini 3.1 Flash Image (Nano Banana 2)';
  } else if (id === 'gemini-3-pro-image' || id === 'gemini-3-pro-image-preview' || id === 'nano-banana-pro-preview') {
    displayName = 'Gemini 3 Pro Image (Nano Banana Pro)';
  } else if (id === 'gemini-3.1-flash-lite-image') {
    displayName = 'Gemini 3.1 Flash-Lite Image (Nano Banana 2 Lite)';
  } else if (id === 'gemini-2.5-flash-image') {
    displayName = 'Gemini 2.5 Flash Image (Nano Banana)';
  }

  const supportsImageOutput =
    id.includes('image') ||
    id.includes('imagen') ||
    methods.includes('generateImages') ||
    id.includes('banana');

  const supportsImageInput =
    id.includes('gemini') ||
    id.includes('omni') ||
    id.includes('vision');

  const supportsText = methods.includes('generateContent');
  const isFast = id.includes('flash') || id.includes('lite') || id.includes('fast');
  const isPro = id.includes('pro') || id.includes('imagen') || id.includes('ultra');

  // Priority recommended list - focus on 3.x and flagship models
  const isRecommended =
    id === 'gemini-3.1-flash-image' ||
    id === 'gemini-3.8-flash' ||
    id === 'gemini-3.1-pro-preview' ||
    id === 'gemini-3-pro-image' ||
    id === 'gemini-3.7-flash' ||
    id === 'gemini-flash-latest' ||
    id === 'gemini-pro-latest' ||
    id === 'deep-research-max-preview-04-2026';

  let category: 'recommended' | 'image' | 'fast' | 'reasoning' = 'fast';
  if (isRecommended) {
    category = 'recommended';
  } else if (supportsImageOutput) {
    category = 'image';
  } else if (isPro || raw.thinking || id.includes('thinking') || id.includes('reasoning')) {
    category = 'reasoning';
  } else if (isFast) {
    category = 'fast';
  } else {
    category = 'recommended';
  }

  let badge = '官方 API 模型';
  if (id === 'gemini-3.1-flash-image') {
    badge = '預設主力生圖 (3.1)';
  } else if (id === 'gemini-3.8-flash') {
    badge = '最新旗艦 3.8';
  } else if (id === 'gemini-3.1-pro-preview') {
    badge = '最強推理 3.1';
  } else if (id === 'gemini-3-pro-image') {
    badge = '旗艦生圖 Pro';
  } else if (id === 'gemini-3.7-flash') {
    badge = '次世代 3.7';
  } else if (id.includes('latest')) {
    badge = '官方最新版';
  } else if (id.includes('deep-research')) {
    badge = '深度研究 (2026)';
  } else if (raw.thinking) {
    badge = '深度思考';
  } else if (supportsImageOutput) {
    badge = '圖像生成';
  } else if (id.includes('preview') || id.includes('exp')) {
    badge = '預覽版本';
  } else if (isPro) {
    badge = '旗艦 Pro';
  } else if (isFast) {
    badge = '極速 Flash';
  }

  const tokenTag = formatTokenLimit(raw.inputTokenLimit);
  const tag = tokenTag || (supportsImageOutput ? '多模態生圖' : '多模態分析');

  return {
    id,
    name: displayName,
    category,
    description: raw.description || `Google API 官方模型: ${id}`,
    capabilities: {
      supportsImageOutput,
      supportsImageInput,
      supportsText,
      isFast,
      isPro,
      isRecommended,
    },
    badge,
    tag,
    apiData: raw,
    inputTokenLimit: raw.inputTokenLimit,
    outputTokenLimit: raw.outputTokenLimit,
    supportedGenerationMethods: raw.supportedGenerationMethods,
    version: raw.version,
    thinking: raw.thinking,
  };
}

/**
 * Returns currently available models list
 */
export function getAvailableModels(): ModelInfo[] {
  return currentModels;
}

/**
 * Subscribe to model list changes
 */
export function subscribeModels(listener: ModelsListener): () => void {
  listeners.add(listener);
  listener(currentModels);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  syncAvailableModels();
  listeners.forEach(fn => {
    try {
      fn(currentModels);
    } catch (e) {
      console.error('Error in models listener', e);
    }
  });
}

function getStoredApiKey(): string {
  if (typeof localStorage !== 'undefined') {
    const key = localStorage.getItem('ai_mix_board_api_key');
    if (key) return key.trim();
  }
  if (typeof process !== 'undefined') {
    return process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  }
  return '';
}

/**
 * Score models to prioritize latest generations (3.8 > 3.7 > 3.1 > 3.0 > 2.5 > 1.5)
 */
function getModelSortScore(m: ModelInfo): number {
  if (m.id === DEFAULT_MODEL_ID) return 10000;
  if (m.id === 'gemini-3.8-flash') return 9500;
  if (m.id === 'gemini-3.1-flash-image') return 9400;
  if (m.id === 'gemini-3.1-pro-preview') return 9300;
  if (m.id === 'gemini-3-pro-image') return 9200;
  if (m.id === 'gemini-3.7-flash') return 9100;
  if (m.id === 'gemini-flash-latest') return 9000;
  if (m.id === 'gemini-pro-latest') return 8900;
  if (m.id === 'deep-research-max-preview-04-2026') return 8800;

  // Extract major/minor version
  const match = m.id.match(/gemini-(\d+(?:\.\d+)?)|gemma-(\d+(?:\.\d+)?)|imagen-(\d+(?:\.\d+)?)|lyria-(\d+(?:\.\d+)?)/);
  let versionNum = 1.0;
  if (match) {
    versionNum = parseFloat(match[1] || match[2] || match[3] || match[4]);
  }
  let score = versionNum * 1000;
  if (m.capabilities.isRecommended) score += 200;
  if (m.capabilities.supportsImageOutput) score += 50;
  return score;
}

/**
 * Fetch full dynamic model catalog from Google Gemini API
 */
export async function fetchModelsFromApi(customApiKey?: string): Promise<ModelInfo[]> {
  const apiKey = customApiKey || getStoredApiKey();
  if (!apiKey) {
    return currentModels;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`Failed to fetch models from API (${res.status}):`, errorText);
      return currentModels;
    }

    const data = await res.json();
    if (!data.models || !Array.isArray(data.models)) {
      return currentModels;
    }

    // Filter models that support generative tasks
    const validGenerative = (data.models as RawApiModelInfo[]).filter(m => {
      const methods = m.supportedGenerationMethods || [];
      return (
        methods.includes('generateContent') ||
        methods.includes('generateImages') ||
        methods.includes('predictLongRunning') ||
        methods.includes('bidiGenerateContent')
      );
    });

    if (validGenerative.length === 0) {
      return currentModels;
    }

    // Parse into ModelInfo
    const parsedModels = validGenerative.map(parseApiModel);

    // Sort models by version descending (newest 3.x & 4.x models at top)
    const sorted = parsedModels.sort((a, b) => {
      const scoreA = getModelSortScore(a);
      const scoreB = getModelSortScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return a.name.localeCompare(b.name);
    });

    currentModels = sorted;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_CACHED_MODELS, JSON.stringify(sorted));
        localStorage.setItem(STORAGE_KEY_MODELS_TIME, Date.now().toString());
      } catch (e) {
        console.warn('Failed to cache models in localStorage:', e);
      }
    }

    notifyListeners();
    return sorted;
  } catch (err) {
    console.error('Failed to fetch models from Gemini API:', err);
    return currentModels;
  }
}

/**
 * Get ModelInfo by ID with dynamic fallback creation
 */
export function getModelById(modelId: string): ModelInfo {
  const cleanId = modelId.replace(/^models\//, '');
  const found = currentModels.find(
    m => m.id === cleanId || m.name === cleanId || m.id === modelId
  );
  if (found) return found;

  return {
    id: cleanId,
    name: cleanId,
    category: cleanId.includes('image') ? 'image' : cleanId.includes('pro') ? 'reasoning' : 'fast',
    description: `API 模型: ${cleanId}`,
    badge: '自訂 API 模型',
    tag: '動態模型',
    capabilities: {
      supportsImageOutput: cleanId.includes('image') || cleanId.includes('imagen'),
      supportsImageInput: true,
      supportsText: true,
      isFast: cleanId.includes('flash') || cleanId.includes('lite'),
      isPro: cleanId.includes('pro'),
      isRecommended: false,
    },
  };
}

// Automatically trigger background fetch on load if in browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    fetchModelsFromApi().catch(() => {});
  }, 300);
}
