import { ModelInfo } from '../types';

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
    subtitle: '最適合畫布混音創作與生圖的最佳模型',
    icon: 'Sparkles',
  },
  {
    id: 'image',
    title: '🎨 圖像創作與編輯 (Image Generation)',
    subtitle: '專用高畫質生圖與視覺多模態合成',
    icon: 'Image',
  },
  {
    id: 'fast',
    title: '⚡ 高速與輕量推論 (Fast & Lightweight)',
    subtitle: '低延遲、快速構想與高性價比',
    icon: 'Zap',
  },
  {
    id: 'reasoning',
    title: '🧠 深度推理與複雜理解 (Advanced Reasoning)',
    subtitle: '最強上下文理解與複雜提示詞規劃',
    icon: 'Brain',
  },
];

export const AVAILABLE_MODELS: ModelInfo[] = [
  // 🌟 推薦區 (Recommended)
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    category: 'recommended',
    description: '專為畫布多模態生圖優化，能結合多張圖片與文字節點高速生成新圖像。',
    badge: '預設推薦',
    tag: '多模態生圖',
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
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    category: 'recommended',
    description: 'Google 最新次世代旗艦 Flash 模型，在速度、推理與多模態分析達到完美平衡。',
    badge: '次世代主力',
    tag: '多模態推論',
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
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    category: 'recommended',
    description: '具備頂級深度思考與超長上下文理解能力，適合複雜提示詞拆解與創意合成。',
    badge: '最強推理',
    tag: '深度思考',
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },

  // 🎨 圖像創作 (Image Generation)
  {
    id: 'imagen-3.0-generate-002',
    name: 'Imagen 3 (002)',
    category: 'image',
    description: 'Google 最頂尖的純文字生成高解析度圖像模型，細節逼真、文字渲染精準。',
    badge: '高畫質',
    tag: '獨立生圖',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: false,
    },
  },
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    category: 'image',
    description: 'Gemini 2.0 實驗版本，具備多模態圖像理解與實驗性生成能力。',
    badge: '實驗性',
    tag: '多模態',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },

  // ⚡ 高速與輕量 (Fast & Lightweight)
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    category: 'fast',
    description: '極致輕量化與超低延遲，適合即時互動與高頻率文字概念生成。',
    badge: '極速低延遲',
    tag: '輕量',
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    category: 'fast',
    description: '經典高效多模態模型，提供穩定快速的多節點關聯分析。',
    badge: '經典穩定',
    tag: '快速',
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
  {
    id: 'gemini-1.5-flash-8b',
    name: 'Gemini 1.5 Flash-8B',
    category: 'fast',
    description: '80 億參數高效率模型，專為大批量低成本查詢設計。',
    badge: '超輕量',
    tag: '8B',
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },

  // 🧠 深度推理 (Advanced Reasoning)
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    category: 'reasoning',
    description: '經典 200 萬 Token 上下文旗艦模型，支援海量節點內容交叉分析。',
    badge: '2M 上下文',
    tag: '大上下文',
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: false,
    },
  },
];

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash-image';

export function getModelById(modelId: string): ModelInfo {
  return AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];
}
