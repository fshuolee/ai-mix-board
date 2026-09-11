import { CanvasNode, ImageNode, TextNode, ModelInfo } from '../types';
import { getImage } from './dbService';
import { blobToBase64 } from '../utils/canvasUtils';
import { getAccessToken } from './googleAuthService';
import { getAssetBlobFromDrive } from './googleDriveService';

const STORAGE_KEY_ATLAS_API_KEY = 'ai_mix_board_atlascloud_api_key';
const STORAGE_KEY_CACHED_ATLAS_MODELS = 'ai_mix_board_cached_atlas_models';

export function getAtlasCloudApiKey(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY_ATLAS_API_KEY);
    if (stored && stored.trim()) return stored.trim();
  }
  if (typeof process !== 'undefined' && process.env) {
    const envKey = (process.env as any).ATLAS_CLOUD_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  }
  return '';
}

export function setCustomAtlasCloudApiKey(key: string): void {
  if (typeof localStorage !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem(STORAGE_KEY_ATLAS_API_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_ATLAS_API_KEY);
    }
  }
}

export function getEffectiveAtlasCloudApiKey(): string {
  return getAtlasCloudApiKey();
}

export function hasAtlasCloudApiKey(): boolean {
  return !!getEffectiveAtlasCloudApiKey();
}

/**
 * Verify / test connectivity with Atlas Cloud API
 */
export async function testAtlasCloudConnection(key?: string): Promise<{ success: boolean; modelCount?: number; error?: string }> {
  const apiKey = (key || getEffectiveAtlasCloudApiKey()).trim();
  if (!apiKey) {
    return { success: false, error: '尚未填寫 Atlas Cloud API Key' };
  }

  try {
    const res = await fetch('https://api.atlascloud.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `驗證失敗 (${res.status}): ${errText || '請確認金鑰是否正確'}` };
    }

    const data = await res.json();
    const count = Array.isArray(data?.data) ? data.data.length + ATLAS_IMAGE_MODELS.length : ATLAS_IMAGE_MODELS.length;
    return { success: true, modelCount: count };
  } catch (err: any) {
    return { success: false, error: err.message || '連線失敗，請檢查網路連線' };
  }
}

/**
 * Curated Atlas Cloud Image Generation and Image Editing models
 */
export const ATLAS_IMAGE_MODELS: ModelInfo[] = [
  {
    id: 'qwen-image-3.0/edit',
    name: 'Qwen Image 3.0 Edit (通義萬相圖生圖/編輯)',
    category: 'image',
    provider: 'atlascloud',
    description: '阿里通義萬相 3.0 旗艦影像編輯模型，支援依據畫布上的參考圖片進行物件增減、風格置換與畫面重繪。',
    badge: 'Qwen 圖像編輯',
    tag: '圖生圖編輯',
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
    id: 'qwen-image-3.0-pro/edit',
    name: 'Qwen Image 3.0 Pro Edit (通義萬相旗艦多圖編輯)',
    category: 'image',
    provider: 'atlascloud',
    description: '阿里頂級 Pro 圖像編輯模型，支援 1~3 張參考圖片，超高細節鎖定臉部特徵、主體一致性與複合風格遷移。',
    badge: 'Qwen 多圖旗艦編輯',
    tag: '多圖融合編輯',
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
    id: 'qwen/qwen-image-2.0/edit',
    name: 'Qwen Image 2.0 Edit',
    category: 'image',
    provider: 'atlascloud',
    description: '通義萬相 2.0 經典圖像編輯模型，支援 1~6 張參考圖、文字提示詞驅動的局部修圖與風格轉移。',
    badge: 'Qwen 圖像編輯',
    tag: '圖生圖',
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
    id: 'qwen/qwen-image-2.0-pro/edit',
    name: 'Qwen Image 2.0 Pro Edit (專業圖像編輯)',
    category: 'image',
    provider: 'atlascloud',
    description: '通義萬相 2.0 Pro 專業圖像編輯，頂級細節還原、高解析度 2K 渲染。',
    badge: 'Qwen Pro 編輯',
    tag: 'Pro 圖生圖',
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
    id: 'alibaba/qwen-image/edit-plus-20251215',
    name: 'Qwen-Image Edit Plus',
    category: 'image',
    provider: 'atlascloud',
    description: '通義萬相多圖輸入編輯 Plus，支援精準修改文字、物體增刪位移與主體動作調整。',
    badge: 'Qwen 多圖 Plus',
    tag: '精準重繪',
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
    id: 'bytedance/seedream-v4.7/edit',
    name: 'Seedream 4.7 Edit (字節圖像編輯)',
    category: 'image',
    provider: 'atlascloud',
    description: '字節跳動 Seedream 4.7 寫實人像與景深重繪編輯模型。',
    badge: '字節編輯',
    tag: '寫實重繪',
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
    id: 'qwen-image-3.0/text-to-image',
    name: 'Qwen Image 3.0 (通義萬相文生圖)',
    category: 'image',
    provider: 'atlascloud',
    description: '阿里通義萬相 3.0 次世代文字生圖旗艦，精湛構圖與卓越中文語意理解。',
    badge: '通義萬相 3.0',
    tag: '文生圖旗艦',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'qwen-image-3.0-pro/text-to-image',
    name: 'Qwen Image 3.0 Pro (通義萬相 Pro)',
    category: 'image',
    provider: 'atlascloud',
    description: '阿里頂級 Pro 文字生圖模型，支援超高解析度渲染與細膩光影質感。',
    badge: '旗艦生圖 Pro',
    tag: 'Pro 高解析',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'seedream-3.0',
    name: 'Seedream 3.0 (字節跳動寫實生圖)',
    category: 'image',
    provider: 'atlascloud',
    description: 'ByteDance 次世代超寫實生圖模型，支援極高細節與逼真質感。',
    badge: '超寫實生圖',
    tag: '高畫質',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'seedream-3.0/edit',
    name: 'Seedream 3.0 Edit (寫實圖像編輯)',
    category: 'image',
    provider: 'atlascloud',
    description: 'ByteDance 寫實影像擴展與指令編輯，精確保留主體同時進行逼真替換。',
    badge: '寫實影像編輯',
    tag: '圖生圖編輯',
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
    id: 'black-forest-labs/FLUX.1-dev',
    name: 'FLUX.1 Dev',
    category: 'image',
    provider: 'atlascloud',
    description: 'Black Forest Labs 頂級開源藝術生圖模型，強大光影結構與非凡美感。',
    badge: 'FLUX 開發旗艦',
    tag: '高美感生圖',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    name: 'FLUX.1 Schnell',
    category: 'image',
    provider: 'atlascloud',
    description: 'Black Forest Labs 極速 FLUX 擴散模型，瞬間生成精緻高解析度影像。',
    badge: 'FLUX 極速',
    tag: '秒級生圖',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'black-forest-labs/FLUX.1-pro',
    name: 'FLUX.1 Pro',
    category: 'image',
    provider: 'atlascloud',
    description: '商業頂級 FLUX.1 Pro 旗艦端點，最高規格解析度與商業廣告級構圖。',
    badge: 'FLUX 頂級 Pro',
    tag: '頂級商業生圖',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'ideogram-ai/ideogram-v3-balanced',
    name: 'Ideogram v3 Balanced',
    category: 'image',
    provider: 'atlascloud',
    description: '全球領先的文字排印與海報生圖模型，完美在圖像中精準渲染英文與文字排版。',
    badge: '文字排版生圖',
    tag: 'Typography',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'stabilityai/stable-diffusion-3.5-large',
    name: 'Stable Diffusion 3.5 Large',
    category: 'image',
    provider: 'atlascloud',
    description: 'Stability AI 旗艦 SD 3.5 Large 多提示詞架構，廣泛藝術風格相容性。',
    badge: 'SD 3.5 旗艦',
    tag: '開源旗艦',
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
    id: 'hidream-ai/hidream-e1',
    name: 'HiDream E1 (智慧影像編輯)',
    category: 'image',
    provider: 'atlascloud',
    description: '專注於影像指令編輯 (Inpainting/Object Editing) 的高精度修圖模型。',
    badge: '智慧修圖',
    tag: '指令修圖',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
  {
    id: 'openai/gpt-image-2',
    name: 'GPT Image 2',
    category: 'image',
    provider: 'atlascloud',
    description: 'Atlas Cloud 提供之最新次世代影像生成端點，高質感視覺構圖。',
    badge: '影像生成',
    tag: '生圖旗艦',
    capabilities: {
      supportsImageOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
];

/**
 * Curated Atlas Cloud Video Generation models (Text-to-Video & Image-to-Video)
 */
export const ATLAS_VIDEO_MODELS: ModelInfo[] = [
  {
    id: 'minimax/h3-fast/image-to-video',
    name: 'MiniMax H3 Fast (圖生影/極速高性價)',
    category: 'video',
    provider: 'atlascloud',
    description: 'MiniMax 次世代高性價比圖生影片模型，動態自然生動、運鏡細膩，支援快速生成。',
    badge: 'MiniMax 圖生影',
    tag: '極速影片',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'minimax/h3-fast/text-to-video',
    name: 'MiniMax H3 Fast (文生影/極速高性價)',
    category: 'video',
    provider: 'atlascloud',
    description: 'MiniMax 高速文字生影片模型，以提示詞生成富有張力之動態場景與短片。',
    badge: 'MiniMax 文生影',
    tag: '極速文生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
  {
    id: 'minimax/h3/image-to-video',
    name: 'MiniMax H3 Pro (720P 高清圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: 'MiniMax 專業級 720P 高清圖生影片，具備卓越人物肢體協調度與光影一致性。',
    badge: 'MiniMax 720P',
    tag: '高清圖生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'minimax/h3/text-to-video',
    name: 'MiniMax H3 Pro (720P 高清文生影)',
    category: 'video',
    provider: 'atlascloud',
    description: 'MiniMax 專業級高清文字生影片模型，細緻渲染複雜動作與氛圍特效。',
    badge: 'MiniMax 旗艦',
    tag: '高清文生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: false,
    },
  },
  {
    id: 'minimax/h3-max/image-to-video',
    name: 'MiniMax H3 Max (頂級旗艦圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: 'MiniMax 頂級電影感大模型，支援超長運動軌跡與複雜光線動態。',
    badge: 'MiniMax Max',
    tag: '頂級圖生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: false,
    },
  },
  {
    id: 'alibaba/wan-3.0/image-to-video',
    name: 'Alibaba Wan 3.0 (通義萬相圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '阿里萬相 3.0 次世代影片生成旗艦，原生高畫質渲染與自然物理動態表現。',
    badge: '萬相 3.0 影片',
    tag: '萬相圖生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'alibaba/wan-3.0/text-to-video',
    name: 'Alibaba Wan 3.0 (通義萬相文生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '阿里萬相 3.0 次世代文生影片，頂級語意理解與電影級視訊構圖。',
    badge: '萬相 3.0 文生影',
    tag: '萬相文生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'alibaba/wan-3.0-prime/image-to-video',
    name: 'Alibaba Wan 3.0 Prime (電影級圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '阿里頂級 Prime 電影級影像轉視訊，專業鏡頭景深變焦與複雜場景交互。',
    badge: '萬相 Prime',
    tag: '電影級圖生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'alibaba/wan-2.5/image-to-video',
    name: 'Alibaba Wan 2.5 (圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '阿里萬相 2.5 經典影片模型，支援高保真人物與場景轉化為流暢短影音。',
    badge: '萬相 2.5',
    tag: '圖生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
  {
    id: 'alibaba/wan-2.5/text-to-video',
    name: 'Alibaba Wan 2.5 (文生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '阿里萬相 2.5 文生影片，快速生成動態場景。',
    badge: '萬相 2.5 文生影',
    tag: '文生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
  {
    id: 'bytedance/seedance-2.5/image-to-video',
    name: 'ByteDance Seedance 2.5 (字節圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '字節跳動 Seedance 2.5 旗艦圖生影片，擅長人物動態演繹與超流暢幀率。',
    badge: 'Seedance 2.5',
    tag: '字節圖生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'bytedance/seedance-2.5/text-to-video',
    name: 'ByteDance Seedance 2.5 (字節文生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '字節跳動 Seedance 2.5 旗艦文生短影音，創意動態分鏡與寫實質感。',
    badge: 'Seedance 文生影',
    tag: '字節文生影',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'bytedance/seedance-2.0-mini/image-to-video',
    name: 'ByteDance Seedance 2.0 Mini (極速圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: '字節輕量極速圖生影片模型，快速預覽動態創意與過渡動畫。',
    badge: 'Seedance Mini',
    tag: '極速影片',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: false,
    },
  },
  {
    id: 'google/gemini-omni-flash/image-to-video',
    name: 'Google Gemini Omni Flash (圖生影)',
    category: 'video',
    provider: 'atlascloud',
    description: 'Google 全模態影像轉動態短片實驗模型，支援提示詞引導運鏡。',
    badge: 'Google Omni 影片',
    tag: 'Omni 影片',
    capabilities: {
      supportsImageOutput: false,
      supportsVideoOutput: true,
      supportsImageInput: true,
      supportsText: true,
      isFast: true,
      isPro: false,
      isRecommended: true,
    },
  },
];


export const ATLAS_TEXT_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-ai/DeepSeek-V3.1',
    name: 'DeepSeek V3.1',
    category: 'atlascloud',
    provider: 'atlascloud',
    description: 'Atlas Cloud 頂級開源思考旗艦，強大中文理解與代碼生成能力。',
    badge: 'Atlas 旗艦',
    tag: '1M 上下文',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    thinking: true,
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: false,
      supportsText: true,
      isFast: true,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'deepseek-ai/DeepSeek-R1',
    name: 'DeepSeek R1',
    category: 'reasoning',
    provider: 'atlascloud',
    description: 'DeepSeek 深度推理與長鏈思考旗艦，解決複雜數學、算法與架構推導。',
    badge: 'Atlas 深度推理',
    tag: '深度思考',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    thinking: true,
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: false,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash-vision-exp',
    name: 'DeepSeek V4 Flash Vision',
    category: 'atlascloud',
    provider: 'atlascloud',
    description: 'DeepSeek 最新多模態視覺模型，支援圖片理解與極速分析。',
    badge: '視覺多模態',
    tag: 'Vision (1M)',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    thinking: true,
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
    id: 'qwen/qwen3-vl-235b-a22b-thinking',
    name: 'Qwen 3 VL 235B Thinking',
    category: 'atlascloud',
    provider: 'atlascloud',
    description: '通義千問 235B 超大參數視覺思考推理旗艦，兼具頂級圖像洞察與深度推理。',
    badge: '旗艦視覺思考',
    tag: 'VL-Thinking',
    inputTokenLimit: 1048576,
    outputTokenLimit: 131072,
    thinking: true,
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
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    category: 'atlascloud',
    provider: 'atlascloud',
    description: 'Anthropic 次世代 Claude Sonnet 4.6，深度邏輯、文案創作與結構化洞察。',
    badge: 'Claude 旗艦',
    tag: '1M 上下文',
    inputTokenLimit: 1000000,
    outputTokenLimit: 128000,
    capabilities: {
      supportsImageOutput: false,
      supportsImageInput: true,
      supportsText: true,
      isFast: false,
      isPro: true,
      isRecommended: true,
    },
  },
];

/**
 * Curated baseline fallback Atlas Cloud models combining image and text models
 */
export const DEFAULT_ATLAS_MODELS: ModelInfo[] = [
  ...ATLAS_VIDEO_MODELS,
  ...ATLAS_IMAGE_MODELS,
  ...ATLAS_TEXT_MODELS,
];

/**
 * Upload a media Blob to Atlas Cloud temporary storage to obtain an HTTP URL for image editing/reference
 */
export async function uploadMediaToAtlas(blob: Blob, apiKey: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', blob, 'reference_image.png');

    const res = await fetch('https://api.atlascloud.ai/api/v1/model/uploadMedia', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return (
        data?.data?.download_url ||
        data?.download_url ||
        data?.data?.url ||
        data?.url ||
        data?.file_url ||
        null
      );
    }
  } catch (e) {
    console.warn('Failed to upload media to Atlas Cloud:', e);
  }
  return null;
}

/**
 * Safely fetches an image blob from a URL (handles data URIs, direct fetch, and Vite dev server proxy for CORS-restricted hosts like Aliyun OSS)
 */
export async function fetchImageBlob(targetUrl: string): Promise<Blob> {
  if (targetUrl.startsWith('data:')) {
    const res = await fetch(targetUrl);
    return await res.blob();
  }

  // 1. Try direct fetch first
  try {
    const directRes = await fetch(targetUrl);
    if (directRes.ok) {
      return await directRes.blob();
    }
  } catch (directErr) {
    // Direct fetch failed (likely CORS on OSS bucket) - proceed to dev proxy
  }

  // 2. Try proxy endpoint (Vite dev server /api/proxy-image)
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(targetUrl)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      return await proxyRes.blob();
    }
  } catch (proxyErr) {
    console.warn('Dev proxy fetch failed:', proxyErr);
  }

  throw new Error('無法載入生成的圖片檔案 (CORS 或網路限制)');
}

/**
 * Parses Atlas Cloud raw API model object into ModelInfo
 */
export function parseAtlasCloudModel(raw: any): ModelInfo {
  const id = raw.id || raw.name;
  const name = raw.name || id;

  const inputMods: string[] = Array.isArray(raw.input_modalities) ? raw.input_modalities : [];
  const outputMods: string[] = Array.isArray(raw.output_modalities) ? raw.output_modalities : [];

  const isVideo =
    id.toLowerCase().includes('video') ||
    id.toLowerCase().includes('image-to-video') ||
    id.toLowerCase().includes('text-to-video') ||
    id.toLowerCase().includes('seedance') ||
    id.toLowerCase().includes('h3-fast') ||
    outputMods.includes('video');

  const supportsVideoOutput = isVideo;

  const isImageEdit =
    id.toLowerCase().includes('edit') ||
    id.toLowerCase().includes('image-edit') ||
    id.toLowerCase().includes('inpainting');

  const supportsImageOutput =
    !supportsVideoOutput &&
    (outputMods.includes('image') ||
      isImageEdit ||
      id.toLowerCase().includes('image') ||
      id.toLowerCase().includes('flux') ||
      id.toLowerCase().includes('dream') ||
      id.toLowerCase().includes('kling') ||
      id.toLowerCase().includes('sd') ||
      id.toLowerCase().includes('diffusion') ||
      id.toLowerCase().includes('ideogram'));

  const supportsImageInput =
    inputMods.includes('image') ||
    supportsVideoOutput ||
    isImageEdit ||
    id.toLowerCase().includes('vision') ||
    id.toLowerCase().includes('vl') ||
    id.toLowerCase().includes('gemini') ||
    id.toLowerCase().includes('omni') ||
    id.toLowerCase().includes('4o') ||
    id.toLowerCase().includes('claude');

  const isFast =
    id.toLowerCase().includes('flash') ||
    id.toLowerCase().includes('mini') ||
    id.toLowerCase().includes('lite') ||
    id.toLowerCase().includes('turbo') ||
    id.toLowerCase().includes('schnell');

  const isPro =
    id.toLowerCase().includes('pro') ||
    id.toLowerCase().includes('opus') ||
    id.toLowerCase().includes('plus') ||
    id.toLowerCase().includes('max') ||
    id.toLowerCase().includes('235b') ||
    id.toLowerCase().includes('72b');

  const thinking =
    raw.supported_features?.includes('reasoning') ||
    id.toLowerCase().includes('thinking') ||
    id.toLowerCase().includes('reason') ||
    id.toLowerCase().includes('r1');

  const isRecommended =
    id.includes('qwen-image') ||
    id.includes('h3-fast') ||
    id.includes('wan-3.0') ||
    id.includes('seedance') ||
    id.includes('DeepSeek-V3') ||
    id.includes('deepseek-v4') ||
    id.includes('qwen3-vl') ||
    id.includes('claude-sonnet') ||
    id.includes('gpt-image') ||
    id.includes('FLUX.1') ||
    id.includes('seedream');

  let category: 'recommended' | 'video' | 'image' | 'fast' | 'reasoning' | 'atlascloud' = 'atlascloud';
  if (supportsVideoOutput) {
    category = 'video';
  } else if (supportsImageOutput) {
    category = 'image';
  } else if (thinking) {
    category = 'reasoning';
  } else if (isFast) {
    category = 'fast';
  }

  let badge = 'Atlas Cloud';
  if (supportsVideoOutput) {
    badge = 'Atlas 影片生成';
  } else if (isImageEdit) {
    badge = 'Atlas 圖像編輯';
  } else if (supportsImageOutput) {
    badge = 'Atlas 影像生成';
  } else if (thinking) {
    badge = 'Atlas 深度思考';
  } else if (isPro) {
    badge = 'Atlas 旗艦';
  } else if (isFast) {
    badge = 'Atlas 極速';
  }

  const contextK = raw.context_length
    ? raw.context_length >= 1000000
      ? `${(raw.context_length / 1000000).toFixed(0)}M`
      : `${Math.round(raw.context_length / 1000)}K`
    : '';

  const tag = contextK
    ? `${contextK} 上下文`
    : supportsVideoOutput
    ? '影片生成'
    : isImageEdit
    ? '圖生圖編輯'
    : supportsImageOutput
    ? '影像生成'
    : 'Atlas API';

  return {
    id,
    name,
    category,
    provider: 'atlascloud',
    description: raw.description || `Atlas Cloud AI 模型: ${id}`,
    capabilities: {
      supportsImageOutput,
      supportsImageInput,
      supportsVideoOutput,
      supportsText: true,
      isFast,
      isPro,
      isRecommended,
    },
    badge,
    tag,
    apiData: raw,
    inputTokenLimit: raw.context_length,
    outputTokenLimit: raw.max_output_length,
    thinking,
  };
}

/**
 * Fetch dynamic model catalog from Atlas Cloud API, ensuring all image and video models are preserved and indexed
 */
export async function fetchAtlasCloudModels(customApiKey?: string): Promise<ModelInfo[]> {
  const apiKey = (customApiKey || getEffectiveAtlasCloudApiKey()).trim();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch('https://api.atlascloud.ai/v1/models', { headers });
    const dynamicModels: ModelInfo[] = [];

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        dynamicModels.push(...data.data.map(parseAtlasCloudModel));
      }
    }

    // Merge dedicated video and image models with dynamic models
    const mergedMap = new Map<string, ModelInfo>();

    for (const vidModel of ATLAS_VIDEO_MODELS) {
      mergedMap.set(vidModel.id, vidModel);
    }

    for (const imgModel of ATLAS_IMAGE_MODELS) {
      if (!mergedMap.has(imgModel.id)) {
        mergedMap.set(imgModel.id, imgModel);
      }
    }

    for (const textModel of ATLAS_TEXT_MODELS) {
      if (!mergedMap.has(textModel.id)) {
        mergedMap.set(textModel.id, textModel);
      }
    }

    for (const dynModel of dynamicModels) {
      if (!mergedMap.has(dynModel.id)) {
        mergedMap.set(dynModel.id, dynModel);
      }
    }

    const sorted = Array.from(mergedMap.values()).sort((a: ModelInfo, b: ModelInfo) => {
      // Group: recommended first, then video models, then image models, then alphabetical
      if (a.capabilities.isRecommended && !b.capabilities.isRecommended) return -1;
      if (!a.capabilities.isRecommended && b.capabilities.isRecommended) return 1;
      if (a.capabilities.supportsVideoOutput && !b.capabilities.supportsVideoOutput) return -1;
      if (!a.capabilities.supportsVideoOutput && b.capabilities.supportsVideoOutput) return 1;
      if (a.capabilities.supportsImageOutput && !b.capabilities.supportsImageOutput) return -1;
      if (!a.capabilities.supportsImageOutput && b.capabilities.supportsImageOutput) return 1;
      return a.name.localeCompare(b.name);
    });

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_CACHED_ATLAS_MODELS, JSON.stringify(sorted));
      } catch (e) {
        console.warn('Failed to cache Atlas models:', e);
      }
    }

    return sorted;
  } catch (e) {
    console.warn('Failed to fetch Atlas Cloud models:', e);
    return DEFAULT_ATLAS_MODELS;
  }
}

/**
 * Determines if a given modelId is an Atlas Cloud model
 */
export function isAtlasCloudModel(modelId: string, modelInfo?: ModelInfo): boolean {
  if (modelInfo?.provider === 'atlascloud') return true;
  const lower = modelId.toLowerCase();
  if (lower.startsWith('qwen-image') ||
      lower.startsWith('deepseek-ai/') ||
      lower.startsWith('qwen/') ||
      lower.startsWith('alibaba/') ||
      lower.startsWith('anthropic/') ||
      lower.startsWith('openai/') ||
      lower.startsWith('zai-org/') ||
      lower.startsWith('moonshotai/') ||
      lower.startsWith('minimaxai/') ||
      lower.startsWith('minimax/') ||
      lower.startsWith('bytedance/') ||
      lower.startsWith('black-forest-labs/') ||
      lower.startsWith('stabilityai/') ||
      lower.startsWith('ideogram-ai/') ||
      lower.startsWith('hidream-ai/') ||
      lower.startsWith('seedream') ||
      lower.startsWith('seedance') ||
      lower.startsWith('kling') ||
      lower.startsWith('wan') ||
      lower.startsWith('google/')) {
    return true;
  }
  return false;
}

export type GenerationResult =
  | { type: 'image'; blob: Blob }
  | { type: 'video'; blob: Blob; mimeType?: string }
  | { type: 'text'; text: string };

/**
 * Execute generation via Atlas Cloud API (Supports Image Generation, Qwen Image Editing, and Multimodal LLMs)
 */
export async function generateWithAtlasCloud(
  nodes: CanvasNode[],
  modelId: string,
  modelInfo?: ModelInfo
): Promise<GenerationResult> {
  const apiKey = getEffectiveAtlasCloudApiKey();
  if (!apiKey) {
    throw new Error('Atlas Cloud API Key 尚未設定。請點擊上方「金鑰設定」填寫您的 Atlas Cloud API Key。');
  }

  const actualModelInfo = modelInfo || getModelById(modelId);
  const actualModelId = actualModelInfo?.id || modelId;

  const textParts = nodes
    .filter(n => n.type === 'text')
    .map(n => (n as TextNode).content);

  const promptText = textParts.join('\n\n').trim();

  const token = getAccessToken();

  // Load image blobs and base64 strings
  const imageNodes = nodes.filter(n => n.type === 'image') as ImageNode[];
  const imageParts: { mimeType: string; data: string; blob: Blob }[] = [];

  for (const node of imageNodes) {
    try {
      const candidateIds = [node.driveFileId, node.content, node.id].filter(Boolean) as string[];
      let blob: Blob | null = null;

      for (const cid of candidateIds) {
        blob = await getImage(cid);
        if (blob) break;
      }

      if (!blob && token && node.driveFileId) {
        try {
          blob = await getAssetBlobFromDrive(token, node.driveFileId);
        } catch (driveErr) {
          console.warn('Failed to fetch image from Google Drive for Atlas:', node.driveFileId, driveErr);
        }
      }

      if (blob) {
        const base64 = await blobToBase64(blob);
        const match = base64.match(/^data:(image\/\w+);base64,(.*)$/);
        if (match) {
          imageParts.push({ mimeType: match[1], data: match[2], blob });
        }
      }
    } catch (err) {
      console.warn('Failed to prepare image for Atlas generation:', err);
    }
  }

  if (textParts.length === 0 && imageParts.length === 0) {
    throw new Error('請至少選取一個包含文字或圖片的節點');
  }

  const isVideoModel =
    actualModelInfo?.capabilities?.supportsVideoOutput ||
    actualModelInfo?.category === 'video' ||
    actualModelId.toLowerCase().includes('video') ||
    actualModelId.toLowerCase().includes('image-to-video') ||
    actualModelId.toLowerCase().includes('text-to-video') ||
    actualModelId.toLowerCase().includes('seedance') ||
    actualModelId.toLowerCase().includes('h3-fast') ||
    actualModelId.toLowerCase().includes('wan-3') ||
    actualModelId.toLowerCase().includes('wan-2');

  // 1. VIDEO GENERATION PATH
  if (isVideoModel) {
    let finalPrompt = promptText;
    if (!finalPrompt) {
      if (imageParts.length > 0) {
        finalPrompt = 'Dynamic cinematic motion, natural fluid animation, high quality video';
      } else {
        finalPrompt = 'Cinematic dynamic camera movement with high definition rendering';
      }
    }

    let referenceImageUrls: string[] = [];
    if (imageParts.length > 0) {
      const uploadPromises = imageParts.map(async (part) => {
        const uploaded = await uploadMediaToAtlas(part.blob, apiKey);
        if (uploaded) return uploaded;
        return `data:${part.mimeType};base64,${part.data}`;
      });
      referenceImageUrls = await Promise.all(uploadPromises);
    }

    const payload: any = {
      model: actualModelId,
      prompt: finalPrompt,
      ratio: '16:9',
    };

    if (referenceImageUrls.length > 0) {
      payload.image = referenceImageUrls[0];
      payload.images = referenceImageUrls;
    }

    if (actualModelId.includes('h3-fast')) {
      payload.resolution = '480P';
    } else if (actualModelId.includes('h3')) {
      payload.resolution = '720P';
    }

    payload.duration = 5;

    const res = await fetch('https://api.atlascloud.ai/api/v1/model/generateVideo', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Atlas Cloud 影片任務建立失敗 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const predictionId = data?.data?.id || data?.id || data?.prediction_id;

    if (!predictionId) {
      const directOutputs = data?.data?.outputs || data?.outputs;
      const targetUrl = Array.isArray(directOutputs) ? directOutputs[0] : directOutputs;
      if (typeof targetUrl === 'string' && (targetUrl.startsWith('http') || targetUrl.startsWith('data:'))) {
        const blob = await fetchImageBlob(targetUrl);
        return { type: 'video', blob, mimeType: 'video/mp4' };
      }
      throw new Error('未取得影片生成任務 ID');
    }

    // Poll prediction status (up to 90 attempts ~180 seconds)
    const maxAttempts = 90;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 2000));

      let statusRes: Response;
      try {
        statusRes = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });
      } catch (netErr) {
        console.warn('Network issue polling video status:', netErr);
        continue;
      }

      let statusData: any;
      try {
        statusData = await statusRes.json();
      } catch {
        continue;
      }

      const dataObj = statusData?.data || statusData;
      const status = dataObj?.status?.toLowerCase();

      if (status === 'completed' || status === 'succeeded') {
        const outputs = dataObj?.outputs || dataObj?.output;
        let targetUrl = Array.isArray(outputs) ? outputs[0] : outputs;
        if (typeof targetUrl === 'string' && (targetUrl.startsWith('http') || targetUrl.startsWith('data:'))) {
          const blob = await fetchImageBlob(targetUrl);
          return { type: 'video', blob, mimeType: 'video/mp4' };
        }
        throw new Error('影片生成成功但未取得有效影片網址');
      }

      if (status === 'failed' || status === 'error' || (!statusRes.ok && statusRes.status >= 400 && dataObj?.error)) {
        throw new Error(dataObj?.error || statusData?.message || `Atlas Cloud 影片生成失敗 (${statusRes.status})`);
      }
    }

    throw new Error('Atlas Cloud 影片生成等待逾時，請稍後重試');
  }

  const isEditModel =
    actualModelId.toLowerCase().includes('edit') ||
    actualModelInfo?.tag?.includes('編輯') ||
    actualModelInfo?.badge?.includes('編輯');

  const supportsImageOutput =
    actualModelInfo?.capabilities?.supportsImageOutput ||
    isEditModel ||
    actualModelId.toLowerCase().includes('qwen-image') ||
    actualModelId.toLowerCase().includes('flux') ||
    actualModelId.toLowerCase().includes('seedream') ||
    actualModelId.toLowerCase().includes('kling') ||
    actualModelId.toLowerCase().includes('image');

  // 2. IMAGE GENERATION / EDITING PATH
  if (supportsImageOutput) {
    let finalPrompt = promptText;
    if (!finalPrompt) {
      if (isEditModel && imageParts.length > 0) {
        finalPrompt = 'Refine and artistically enhance the subject, keeping key facial and compositional details intact with high fidelity.';
      } else {
        finalPrompt = 'High quality artistic composition, detailed 4k masterpiece.';
      }
    }

    // Upload or prepare reference images if provided (Critical for Qwen Image Edit, Seedream Edit, etc.)
    let referenceImageUrls: string[] = [];
    if (imageParts.length > 0) {
      const uploadPromises = imageParts.map(async (part) => {
        // Try uploading to Atlas temporary storage first to get an HTTP URL
        const uploaded = await uploadMediaToAtlas(part.blob, apiKey);
        if (uploaded) return uploaded;
        // Fallback to data URI
        return `data:${part.mimeType};base64,${part.data}`;
      });
      referenceImageUrls = await Promise.all(uploadPromises);
    }

    // Strategy A: Atlas Cloud Dedicated Image / Edit Endpoint (POST /api/v1/model/generateImage)
    try {
      const payload: any = {
        model: actualModelId,
        prompt: finalPrompt,
      };

      if (referenceImageUrls.length > 0) {
        // Official Atlas Cloud schema accepts "images"
        payload.images = referenceImageUrls;
        payload.reference_image_urls = referenceImageUrls;
        payload.image = referenceImageUrls[0];
      }

      const predRes = await fetch('https://api.atlascloud.ai/api/v1/model/generateImage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (predRes.ok) {
        const predData = await predRes.json();

        // Check if returned immediately (e.g. sync mode or instant base64)
        const instantOutputs = predData?.data?.outputs || predData?.outputs || predData?.output;
        if (instantOutputs) {
          const targetUrl = Array.isArray(instantOutputs) ? instantOutputs[0] : instantOutputs;
          if (typeof targetUrl === 'string' && (targetUrl.startsWith('http') || targetUrl.startsWith('data:'))) {
            const blob = await fetchImageBlob(targetUrl);
            return { type: 'image', blob };
          }
        }

        const predictionId = predData?.data?.id || predData?.id || predData?.prediction_id;

        if (predictionId) {
          // Poll prediction status
          const maxAttempts = 60; // up to ~120 seconds
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(r => setTimeout(r, 2000));

            const statusRes = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`, {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
              },
            });

            if (!statusRes.ok) continue;

            const statusData = await statusRes.json();
            const dataObj = statusData?.data || statusData;
            const status = dataObj?.status?.toLowerCase();

            if (status === 'completed' || status === 'succeeded') {
              const outputs = dataObj?.outputs || dataObj?.output;
              let targetUrl = Array.isArray(outputs) ? outputs[0] : outputs;
              if (typeof targetUrl === 'string' && (targetUrl.startsWith('http') || targetUrl.startsWith('data:'))) {
                const blob = await fetchImageBlob(targetUrl);
                return { type: 'image', blob };
              }
              throw new Error('生圖成功但未取得有效圖片 URL');
            }

            if (status === 'failed' || status === 'error') {
              throw new Error(dataObj?.error || 'Atlas Cloud 影像生成或編輯失敗');
            }
          }

          throw new Error('Atlas Cloud 生成等待逾時，請稍後重試');
        }
      }
    } catch (e: any) {
      console.warn('generateImage endpoint attempt failed, trying fallback:', e);
      if (!isEditModel) {
        // Only try OpenAI fallback if not a specialized editing model requiring reference_image_urls
      } else {
        throw new Error(e.message || 'Atlas Cloud 圖像編輯請求失敗');
      }
    }

    // Strategy B: Try OpenAI-compatible /v1/images/generations fallback
    try {
      const imgRes = await fetch('https://api.atlascloud.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: actualModelId,
          prompt: finalPrompt,
          n: 1,
          response_format: 'b64_json',
        }),
      });

      if (imgRes.ok) {
        const data = await imgRes.json();
        const b64 = data?.data?.[0]?.b64_json;
        if (b64) {
          const fetchRes = await fetch(`data:image/png;base64,${b64}`);
          const blob = await fetchRes.blob();
          return { type: 'image', blob };
        }
        const imgUrl = data?.data?.[0]?.url;
        if (imgUrl) {
          const blob = await fetchImageBlob(imgUrl);
          return { type: 'image', blob };
        }
      }
    } catch (e) {
      console.warn('OpenAI images/generations failed on Atlas:', e);
    }

    throw new Error('Atlas Cloud 影像生成失敗，請檢查 API Key 或提示詞');
  }

  // 2. TEXT / CHAT COMPLETIONS PATH
  try {
    const supportsVision =
      actualModelInfo?.capabilities?.supportsImageInput ||
      actualModelId.toLowerCase().includes('vl') ||
      actualModelId.toLowerCase().includes('vision') ||
      actualModelId.toLowerCase().includes('omni') ||
      actualModelId.toLowerCase().includes('4o');

    let userContent: any;
    if (imageParts.length > 0 && supportsVision) {
      userContent = [
        {
          type: 'text',
          text: promptText || '請綜合分析以上參考圖片與畫布內容，給予富有洞察力的結論或解答。',
        },
        ...imageParts.map(img => ({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${img.data}`,
          },
        })),
      ];
    } else {
      let fullText = promptText;
      if (imageParts.length > 0) {
        fullText += `\n\n[附註：畫布上附有 ${imageParts.length} 個圖片節點，請根據文字提示詞進行分析與創作。]`;
      }
      userContent = fullText;
    }

    const chatRes = await fetch('https://api.atlascloud.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: actualModelId,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      throw new Error(`Atlas Cloud API 錯誤 (${chatRes.status}): ${errText}`);
    }

    const chatData = await chatRes.json();
    const reply = chatData?.choices?.[0]?.message?.content || '';

    if (!reply) {
      throw new Error('Atlas Cloud 未回傳文字結果');
    }

    // Check if the reply happens to be a base64 image
    const dataImageMatch = reply.match(/data:image\/(?:png|jpeg|webp|jpg);base64,[A-Za-z0-9+/=]+/);
    if (dataImageMatch) {
      try {
        const fetchRes = await fetch(dataImageMatch[0]);
        const blob = await fetchRes.blob();
        return { type: 'image', blob };
      } catch {}
    }

    return { type: 'text', text: reply };
  } catch (err: any) {
    console.error('Atlas Cloud Chat Completion error:', err);
    throw new Error(err.message || 'Atlas Cloud 推理失敗');
  }
}
