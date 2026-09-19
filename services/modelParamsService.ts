import { ModelInfo, ModelParamField, ModelParamGroup, ModelParamPreset } from '../types';
import { getModelById, DEFAULT_MODEL_ID } from './modelsConfig';
import { isAtlasCloudModel } from './atlasCloudService';

const STORAGE_PREFIX = 'ai_mix_board_model_params_';
const STORAGE_KEY_INSPECTOR_OPEN = 'ai_mix_board_inspector_open';
const STORAGE_KEY_CUSTOM_PRESETS = 'ai_mix_board_custom_presets';

export const PARAM_GROUPS: ModelParamGroup[] = [
  {
    id: 'basic',
    title: '核心控制 (Core)',
    icon: 'Sliders',
    description: '基本生成模式與系統指示',
    defaultExpanded: true,
  },
  {
    id: 'dimensions',
    title: '尺寸與規格 (Dimensions)',
    icon: 'Maximize2',
    description: '長寬比、解析度與幀率設定',
    defaultExpanded: true,
  },
  {
    id: 'creative',
    title: '風格與導引 (Guidance & Style)',
    icon: 'Palette',
    description: '提示詞相關度 (CFG Scale) 與負向過濾',
    defaultExpanded: true,
  },
  {
    id: 'sampling',
    title: '採樣與運算 (Sampling & Reasoning)',
    icon: 'Cpu',
    description: '迭代步數、隨機度 (Temp) 與思考配額',
    defaultExpanded: true,
  },
  {
    id: 'video',
    title: '動態與運鏡 (Motion & Camera)',
    icon: 'Video',
    description: '運動強度與攝影機視角運鏡',
    defaultExpanded: true,
  },
  {
    id: 'audio',
    title: '語音與音訊 (Audio & Voice)',
    icon: 'Volume2',
    description: '發音聲線、語速與音訊格式',
    defaultExpanded: true,
  },
  {
    id: 'advanced',
    title: '種子與自訂 Payload (Advanced & Extensibility)',
    icon: 'Wrench',
    description: '固定隨機種子或直接傳入自訂 API 擴充參數',
    defaultExpanded: false,
  },
];

/**
 * Visual aspect ratio options
 */
export const ASPECT_RATIO_OPTIONS = [
  { label: '依照原圖 (Auto)', value: 'auto', description: '自動符合選取之參考圖片長寬比 (無參考圖時預設 1:1)', icon: 'auto' },
  { label: '1:1 正方形', value: '1:1', description: '社群頭像、經典方格 (1024x1024)', icon: 'square' },
  { label: '16:9 橫向寬螢幕', value: '16:9', description: '電腦桌布、YouTube 封面 (1280x720)', icon: 'ratio_16_9' },
  { label: '9:16 直向短影音', value: '9:16', description: '手機桌布、IG Reels、TikTok (720x1280)', icon: 'ratio_9_16' },
  { label: '4:3 傳統標準', value: '4:3', description: '經典相機、投影片 (1024x768)', icon: 'ratio_4_3' },
  { label: '3:4 直向肖像', value: '3:4', description: '人物立繪、雜誌寫真 (768x1024)', icon: 'ratio_3_4' },
  { label: '21:9 電影超寬螢幕', value: '21:9', description: '劇院寬畫幅、全景視覺 (1536x640)', icon: 'ratio_21_9' },
];

/**
 * Built-in Parameter Presets
 */
export const BUILTIN_PRESETS: ModelParamPreset[] = [
  // Image Presets
  {
    id: 'img-balanced',
    name: '標準平衡 (Standard)',
    description: '適合日常創作，畫面穩定且細節均衡',
    badge: '預設推薦',
    modality: 'image',
    params: {
      aspectRatio: 'auto',
      steps: 28,
      cfgScale: 7.0,
      negativePrompt: 'blurry, low quality, distorted, extra limbs',
      seed: -1,
    },
  },
  {
    id: 'img-cinematic',
    name: '電影質感 (Cinematic 16:9)',
    description: '16:9 寬螢幕，強對比與電影光影氛圍',
    badge: '電影大片',
    modality: 'image',
    params: {
      aspectRatio: '16:9',
      steps: 35,
      cfgScale: 8.5,
      negativePrompt: 'blurry, low quality, cartoon, oversaturated, amateur photo, grain',
      seed: -1,
    },
  },
  {
    id: 'img-portrait',
    name: '精緻人像 (Portrait 9:16)',
    description: '9:16 直向構圖，優化臉部五官細膩度與景深',
    badge: '人物寫真',
    modality: 'image',
    params: {
      aspectRatio: '9:16',
      steps: 32,
      cfgScale: 7.5,
      negativePrompt: 'bad anatomy, deformed face, bad eyes, extra fingers, plastic skin, distorted',
      seed: -1,
    },
  },
  {
    id: 'img-fast',
    name: '極速草稿 (Fast Draft)',
    description: '降低採樣步數，以最少時間快速概念發想',
    badge: '低延遲',
    modality: 'image',
    params: {
      aspectRatio: '1:1',
      steps: 16,
      cfgScale: 5.5,
      seed: -1,
    },
  },
  {
    id: 'img-ultra-detail',
    name: '極致超細節 (8K Masterpiece)',
    description: '高採樣步數與嚴格提示詞遵循度，呈現微米級紋理',
    badge: '旗艦細節',
    modality: 'image',
    params: {
      aspectRatio: '1:1',
      steps: 45,
      cfgScale: 9.0,
      negativePrompt: 'blurry, low quality, worst quality, artifacts, watermark, signature, mutated, deformed, duplicate',
      seed: -1,
    },
  },

  // Video Presets
  {
    id: 'video-cinematic-720p',
    name: '電影級運鏡 (720P 5s)',
    description: '720P 高清 24fps，平滑推鏡與流暢動態',
    badge: '推薦首選',
    modality: 'video',
    params: {
      aspectRatio: '16:9',
      resolution: '720P',
      duration: 5,
      fps: 24,
      motionScale: 6,
      cameraMovement: 'zoom_in',
      seed: -1,
    },
  },
  {
    id: 'video-fast-preview',
    name: '極速預覽 (480P 3s)',
    description: '480P 低消耗極速出片，適合快速檢查運動效果',
    badge: '低消耗',
    modality: 'video',
    params: {
      aspectRatio: '16:9',
      resolution: '480P',
      duration: 3,
      fps: 16,
      motionScale: 5,
      cameraMovement: 'none',
      seed: -1,
    },
  },
  {
    id: 'video-dramatic-pan',
    name: '史詩全景橫移 (Pan Right 10s)',
    description: '長時長 10 秒大視角平移，展現場景縱深',
    badge: '史詩運鏡',
    modality: 'video',
    params: {
      aspectRatio: '16:9',
      resolution: '720P',
      duration: 10,
      fps: 24,
      motionScale: 4,
      cameraMovement: 'pan_right',
      seed: -1,
    },
  },

  // Text / Reasoning Presets
  {
    id: 'text-precise',
    name: '嚴謹推理 (Precise & Logical)',
    description: '低隨機度，適合程式碼、邏輯架構分析與決策',
    badge: '精準邏輯',
    modality: 'text',
    params: {
      temperature: 0.2,
      topP: 0.8,
      topK: 20,
      thinkingBudget: 8192,
      maxOutputTokens: 8192,
    },
  },
  {
    id: 'text-creative',
    name: '創意腦力激盪 (Creative Spark)',
    description: '高溫度發散思維，適合故事創作、文案發想',
    badge: '創意發散',
    modality: 'text',
    params: {
      temperature: 1.25,
      topP: 0.98,
      topK: 40,
      thinkingBudget: 0,
      maxOutputTokens: 8192,
    },
  },

  // Audio Presets
  {
    id: 'audio-natural',
    name: '自然口語 (Natural Speech)',
    description: '標準語速與自然聲線，適合對話與旁白',
    badge: '推薦首選',
    modality: 'audio',
    params: {
      voice: 'Aoede',
      audioSpeed: 1.0,
      audioFormat: 'mp3',
    },
  },
  {
    id: 'audio-fast',
    name: '快速朗讀 (Fast Reading)',
    description: '1.25x 加速朗讀，適合快速聆聽資訊',
    badge: '高效朗讀',
    modality: 'audio',
    params: {
      voice: 'Puck',
      audioSpeed: 1.25,
      audioFormat: 'mp3',
    },
  },
];

/**
 * Determine model modality
 */
export function getModelModality(modelInfo?: ModelInfo): 'image' | 'video' | 'text' | 'audio' {
  if (!modelInfo) return 'image';
  const id = (modelInfo.id || '').toLowerCase();
  const cat = modelInfo.category;
  const caps = modelInfo.capabilities;

  if (id.includes('audio') || id.includes('tts') || id.includes('whisper') || id.includes('voice') || id.includes('sound')) {
    return 'audio';
  }
  if (caps?.supportsVideoOutput || cat === 'video' || id.includes('video') || id.includes('image-to-video') || id.includes('text-to-video') || id.includes('seedance') || id.includes('wan') || id.includes('h3')) {
    return 'video';
  }
  if (caps?.supportsImageOutput || cat === 'image' || id.includes('image') || id.includes('edit') || id.includes('flux') || id.includes('seedream') || id.includes('hidream') || id.includes('imagen')) {
    return 'image';
  }
  return 'text';
}

/**
 * Generate schema of available parameters based on the model's capabilities and provider
 */
export function getModelParamSchema(modelInfo: ModelInfo): {
  fields: ModelParamField[];
  groups: ModelParamGroup[];
} {
  const modality = getModelModality(modelInfo);
  const isAtlas = modelInfo.provider === 'atlascloud' || isAtlasCloudModel(modelInfo.id, modelInfo);
  const isGemini = !isAtlas;
  const isEdit = (modelInfo.id || '').toLowerCase().includes('edit') || (modelInfo.tag || '').includes('編輯');

  const fields: ModelParamField[] = [];

  // ==========================
  // 1. VIDEO MODELS SCHEMA
  // ==========================
  if (modality === 'video') {
    fields.push(
      {
        id: 'aspectRatio',
        label: '影片畫面比例 (Aspect Ratio)',
        description: '設定輸出影片的畫面比例',
        type: 'aspect_ratio',
        defaultValue: '16:9',
        group: 'dimensions',
        options: [
          { label: '依照原圖 (Auto)', value: 'auto', description: '自動符合輸入參考圖之比例' },
          { label: '16:9 橫向寬螢幕', value: '16:9', description: '電腦、電視、YouTube 常用規格' },
          { label: '9:16 直向直式', value: '9:16', description: '手機直式、Shorts、TikTok 專用' },
          { label: '1:1 正方形', value: '1:1', description: '社群經典正方形影片' },
          { label: '4:3 復古標準', value: '4:3', description: '懷舊與紀錄片視覺規格' },
        ],
      },
      {
        id: 'resolution',
        label: '影片解析度 (Resolution)',
        description: '設定生成影片之畫質規格（720P 清晰自然，480P 極速出片）',
        type: 'segmented',
        defaultValue: modelInfo.id.includes('h3-fast') ? '480P' : '720P',
        group: 'dimensions',
        options: [
          { label: '480P 極速 (標清)', value: '480P', badge: 'Fast' },
          { label: '720P 高清 (推薦)', value: '720P', badge: 'HD' },
          { label: '1080P 超高清', value: '1080P', badge: 'FHD' },
        ],
      },
      {
        id: 'duration',
        label: '生成長度 (Duration)',
        description: '輸出影片的連續秒數',
        type: 'segmented',
        defaultValue: 5,
        unit: '秒',
        group: 'dimensions',
        options: [
          { label: '3 秒', value: 3, description: '短暫動態' },
          { label: '5 秒 (預設)', value: 5, description: '標準時長' },
          { label: '10 秒', value: 10, description: '完整故事長鏡頭' },
        ],
      },
      {
        id: 'fps',
        label: '影片幀率 (Frame Rate)',
        description: '每秒播放格數，幀率越高動作越滑順流暢',
        type: 'segmented',
        defaultValue: 24,
        unit: 'FPS',
        group: 'dimensions',
        options: [
          { label: '16 FPS', value: 16, description: '復古風格/低消耗' },
          { label: '24 FPS (電影感)', value: 24, description: '標準電影幀率' },
          { label: '30 FPS', value: 30, description: '順暢高清視訊' },
        ],
      },
      {
        id: 'motionScale',
        label: '運動幅度 (Motion Intensity)',
        description: '控制畫面物體或人物的動態劇烈程度 (1 = 極微弱動態, 10 = 劇烈動態)',
        type: 'slider',
        defaultValue: 5,
        min: 1,
        max: 10,
        step: 1,
        unit: '級',
        group: 'video',
      },
      {
        id: 'cameraMovement',
        label: '運鏡方式 (Camera Movement)',
        description: '指定攝影機的鏡頭移動軌跡',
        type: 'select',
        defaultValue: 'none',
        group: 'video',
        options: [
          { label: '固定機位 (Static)', value: 'none', description: '無運鏡，主體自主運動' },
          { label: '鏡頭推進 (Zoom In)', value: 'zoom_in', description: '由遠及近聚焦主體' },
          { label: '鏡頭拉遠 (Zoom Out)', value: 'zoom_out', description: '展示環境與空間全景' },
          { label: '向左平移 (Pan Left)', value: 'pan_left', description: '鏡頭向左水平橫移' },
          { label: '向右平移 (Pan Right)', value: 'pan_right', description: '鏡頭向右水平橫移' },
          { label: '向上仰移 (Tilt Up)', value: 'tilt_up', description: '由下往上仰視視角' },
          { label: '向下俯移 (Tilt Down)', value: 'tilt_down', description: '由上往下俯視視角' },
        ],
      }
    );
  }

  // ==========================
  // 2. IMAGE MODELS SCHEMA
  // ==========================
  else if (modality === 'image') {
    fields.push(
      {
        id: 'aspectRatio',
        label: '畫面比例 (Aspect Ratio)',
        description: '設定畫布輸出影像之長寬比例 (預設「依照原圖」將自動符合參考圖)',
        type: 'aspect_ratio',
        defaultValue: 'auto',
        group: 'dimensions',
        options: ASPECT_RATIO_OPTIONS,
      }
    );

    if (isAtlas) {
      fields.push(
        {
          id: 'steps',
          label: '採樣步數 (Inference Steps)',
          description: '擴散模型生成迭代次數。步數越多細節越精緻，但運算時間越長 (預設 28~30)',
          type: 'slider',
          defaultValue: modelInfo.id.includes('flux') ? 24 : 30,
          min: 10,
          max: 60,
          step: 1,
          unit: '步',
          group: 'sampling',
        },
        {
          id: 'cfgScale',
          label: '提示詞相關度 (CFG / Guidance Scale)',
          description: '數值越高越嚴格貼合提示詞，較低數值則賦予模型更多自由創作與藝術發揮空間',
          type: 'slider',
          defaultValue: modelInfo.id.includes('flux') ? 3.5 : 7.0,
          min: 1.0,
          max: 20.0,
          step: 0.5,
          unit: '',
          group: 'creative',
        },
        {
          id: 'negativePrompt',
          label: '負向提示詞 (Negative Prompt)',
          description: '指定不想出現在畫面中的元素（例如：變形、模糊、多餘手指、文字水印等）',
          type: 'textarea',
          defaultValue: 'blurry, bad anatomy, deformed limbs, watermark, text, low quality, oversaturated',
          placeholder: '例如: blurry, bad anatomy, low quality, extra limbs, watermark...',
          group: 'creative',
        },
        {
          id: 'sampler',
          label: '採樣器 (Sampler Algorithm)',
          description: '控制雜訊去除演算法的採樣路徑',
          type: 'select',
          defaultValue: 'Euler',
          group: 'sampling',
          options: [
            { label: 'Euler (速度快/經典泛用)', value: 'Euler' },
            { label: 'Euler a (多樣性豐富)', value: 'Euler a' },
            { label: 'DPM++ 2M Karras (高細節/推薦)', value: 'DPM++ 2M Karras' },
            { label: 'DPM++ SDE Karras (逼真光影)', value: 'DPM++ SDE Karras' },
            { label: 'DDIM (穩定確定性)', value: 'DDIM' },
          ],
        }
      );

      if (isEdit) {
        fields.push({
          id: 'imageGuidanceScale',
          label: '參考圖遵循度 (Image Guidance Scale)',
          description: '控制輸出結果鎖定原圖特徵、臉部外貌與構圖的權重',
          type: 'slider',
          defaultValue: 1.5,
          min: 0.5,
          max: 3.0,
          step: 0.1,
          group: 'creative',
        });
      }
    } else {
      // Gemini / Imagen Image specific
      fields.push(
        {
          id: 'safetyFilter',
          label: '安全性審查等級 (Safety Filter Level)',
          description: '調整 Google 內容過濾機制的嚴格程度',
          type: 'select',
          defaultValue: 'BLOCK_MEDIUM_AND_ABOVE',
          group: 'creative',
          options: [
            { label: '標準保護 (過濾中高等級風險)', value: 'BLOCK_MEDIUM_AND_ABOVE' },
            { label: '寬鬆模式 (僅過濾極高風險)', value: 'BLOCK_LOW_AND_ABOVE' },
            { label: '完全放寬 (BLOCK_NONE)', value: 'BLOCK_NONE' },
          ],
        },
        {
          id: 'personGeneration',
          label: '人像生成策略 (Person Generation)',
          description: '控制是否允許生成真人外觀或臉部影像',
          type: 'select',
          defaultValue: 'ALLOW_ADULT',
          group: 'creative',
          options: [
            { label: '允許成年人面孔 (ALLOW_ADULT)', value: 'ALLOW_ADULT' },
            { label: '完全禁止人像 (DONT_ALLOW)', value: 'DONT_ALLOW' },
            { label: '全面開放 (ALLOW_ALL)', value: 'ALLOW_ALL' },
          ],
        }
      );
    }
  }

  // ==========================
  // 3. TEXT & REASONING SCHEMA
  // ==========================
  else if (modality === 'text') {
    fields.push(
      {
        id: 'temperature',
        label: '創意隨機度 (Temperature)',
        description: '數值越高回答越富有想像力與不可預測性；數值越低回答越精確聚焦且嚴謹',
        type: 'slider',
        defaultValue: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.05,
        group: 'sampling',
      },
      {
        id: 'topP',
        label: '核採樣閾值 (Top-P)',
        description: '控制候選詞累積機率閾值 (0.0 ~ 1.0)，搭配 Temperature 一起調節生成多樣性',
        type: 'slider',
        defaultValue: 0.95,
        min: 0.0,
        max: 1.0,
        step: 0.05,
        group: 'sampling',
      },
      {
        id: 'topK',
        label: '候選詞數量 (Top-K)',
        description: '限制每次生成時僅從機率最高的前 K 個詞中隨機選取',
        type: 'slider',
        defaultValue: 40,
        min: 1,
        max: 100,
        step: 1,
        group: 'sampling',
      },
      {
        id: 'maxOutputTokens',
        label: '最大輸出 Token (Max Output Tokens)',
        description: '單次推論輸出的最大長度限制 (Token 數)',
        type: 'number',
        defaultValue: modelInfo.outputTokenLimit || 8192,
        min: 128,
        max: modelInfo.outputTokenLimit || 65536,
        step: 256,
        group: 'sampling',
      }
    );

    if (modelInfo.thinking || (modelInfo.id || '').includes('thinking') || (modelInfo.id || '').includes('3.1-pro') || (modelInfo.id || '').includes('r1')) {
      fields.push({
        id: 'thinkingBudget',
        label: '深度思考配額 (Thinking Budget Tokens)',
        description: '思考模型在回答前的內部推理演算 Token 上限 (0 = 由模型自動決定)',
        type: 'slider',
        defaultValue: 0,
        min: 0,
        max: 32768,
        step: 512,
        unit: 'Tokens',
        group: 'sampling',
      });
    }

    fields.push({
      id: 'systemInstruction',
      label: '系統指示詞 (System Instruction)',
      description: '設定 AI 的角色定位、專家背景、回覆語氣或格式規範',
      type: 'textarea',
      defaultValue: '',
      placeholder: '例如: 你是一位資深視覺設計師與藝術總監，請給予結構嚴謹且具體可執行的分析建議...',
      group: 'creative',
    });
  }

  // ==========================
  // 3.5. AUDIO / TTS SCHEMA
  // ==========================
  else if (modality === 'audio') {
    fields.push(
      {
        id: 'voice',
        label: '語音聲線 (Voice)',
        description: '選擇合成語音的人聲特質與發音音色',
        type: 'select',
        defaultValue: 'Aoede',
        group: 'audio',
        options: [
          { label: 'Aoede (女性 / 自然明亮)', value: 'Aoede', description: '清晰親和，適合旁白與說明' },
          { label: 'Puck (男性 / 輕快活力)', value: 'Puck', description: '年輕活力，適合故事與導引' },
          { label: 'Charon (男性 / 沉穩磁性)', value: 'Charon', description: '低沉厚重，適合演說與紀錄片' },
          { label: 'Kore (女性 / 溫暖柔和)', value: 'Kore', description: '平靜治癒，適合有聲書' },
          { label: 'Fenrir (男性 / 有力權威)', value: 'Fenrir', description: '威嚴堅定，適合新聞播報' },
          { label: 'Alloy (中性 / 現代簡約)', value: 'Alloy', description: '標準現代語音' },
          { label: 'Nova (女性 / 熱情活潑)', value: 'Nova', description: '明亮熱情' },
        ],
      },
      {
        id: 'audioSpeed',
        label: '播放語速 (Speech Speed)',
        description: '調整朗讀文字的速度倍率 (0.5x ~ 2.0x)',
        type: 'slider',
        defaultValue: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
        unit: 'x',
        group: 'audio',
      },
      {
        id: 'audioFormat',
        label: '音訊格式 (Audio Format)',
        description: '設定輸出音檔的編碼格式',
        type: 'segmented',
        defaultValue: 'mp3',
        group: 'audio',
        options: [
          { label: 'MP3 (推薦/高相容)', value: 'mp3' },
          { label: 'WAV (無損/高品質)', value: 'wav' },
          { label: 'AAC (低延遲)', value: 'aac' },
        ],
      },
      {
        id: 'systemInstruction',
        label: '語氣指導 (Voice Tone & Accent)',
        description: '引導語音的情感、說話風格或口吻規範',
        type: 'textarea',
        defaultValue: '',
        placeholder: '例如: 請以溫和有禮的台灣正體口吻朗讀，語速平穩...',
        group: 'creative',
      }
    );
  }

  // ==========================
  // 4. UNIVERSAL ADVANCED (Seed & Raw Payload for ANY future Provider)
  // ==========================
  fields.push(
    {
      id: 'seed',
      label: '隨機種子碼 (Seed)',
      description: '固定隨機種子可確保在相同提示詞下重現完全相同的畫面或輸出 (-1 代表每次隨機)',
      type: 'seed',
      defaultValue: -1,
      min: -1,
      max: 2147483647,
      group: 'advanced',
    },
    {
      id: 'rawPayload',
      label: '自訂 API 擴充參數 (Raw JSON Payload)',
      description: '直接傳入任意自訂 JSON 鍵值對，將直接深度合併至向 API 發送的請求體中。完美支援任何未來新 Provider、端點或非標準參數！',
      type: 'json',
      defaultValue: '',
      placeholder: '{\n  "lora_weights": 0.8,\n  "custom_flag": true\n}',
      group: 'advanced',
    }
  );

  // Filter groups that have fields
  const activeGroupIds = new Set(fields.map(f => f.group));
  const activeGroups = PARAM_GROUPS.filter(g => activeGroupIds.has(g.id));

  return { fields, groups: activeGroups };
}

/**
 * Get default parameter object for a model
 */
export function getDefaultParams(modelId: string, modelInfo?: ModelInfo): Record<string, any> {
  const actualInfo = modelInfo || getModelById(modelId);
  const { fields } = getModelParamSchema(actualInfo);
  const defaults: Record<string, any> = {};
  for (const field of fields) {
    defaults[field.id] = field.defaultValue;
  }
  return defaults;
}

/**
 * Load persisted model params for a specific model
 */
export function getModelParams(modelId: string, modelInfo?: ModelInfo): Record<string, any> {
  const defaults = getDefaultParams(modelId, modelInfo);
  if (typeof localStorage === 'undefined') return defaults;

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${modelId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    }
  } catch (err) {
    console.warn(`Failed to parse saved parameters for model ${modelId}`, err);
  }

  return defaults;
}

/**
 * Save model params to localStorage
 */
export function saveModelParams(modelId: string, params: Record<string, any>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${modelId}`, JSON.stringify(params));
  } catch (err) {
    console.warn(`Failed to save parameters for model ${modelId}`, err);
  }
}

/**
 * Reset model params to defaults
 */
export function resetModelParams(modelId: string, modelInfo?: ModelInfo): Record<string, any> {
  const defaults = getDefaultParams(modelId, modelInfo);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${STORAGE_PREFIX}${modelId}`);
  }
  return defaults;
}

/**
 * Check if current params differ from defaults
 */
export function countModifiedParams(modelId: string, params: Record<string, any>, modelInfo?: ModelInfo): number {
  const defaults = getDefaultParams(modelId, modelInfo);
  let count = 0;
  for (const [key, val] of Object.entries(params)) {
    if (key === 'rawPayload') {
      if (typeof val === 'string' && val.trim() !== '') count++;
    } else if (defaults[key] !== undefined && defaults[key] !== val) {
      count++;
    }
  }
  return count;
}

/**
 * Get/Set Inspector Open State
 */
export function getInspectorOpenState(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_INSPECTOR_OPEN) === 'true';
}

export function setInspectorOpenState(isOpen: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_INSPECTOR_OPEN, isOpen ? 'true' : 'false');
}

/**
 * Parse raw payload JSON safely
 */
export function parseRawPayload(raw: string | undefined): Record<string, any> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw.trim());
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Find the closest matching aspect ratio from a set of supported ratios.
 * Uses logarithmic distance to treat reciprocal ratios (e.g. 16:9 and 9:16) symmetrically.
 */
export function findClosestAspectRatio(
  width: number,
  height: number,
  allowedRatios: string[] = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '2:3', '3:2']
): string {
  if (!width || !height || width <= 0 || height <= 0) {
    return '1:1';
  }

  const targetRatio = width / height;
  const logTarget = Math.log(targetRatio);

  let bestRatio = '1:1';
  let minDiff = Infinity;

  for (const ratioStr of allowedRatios) {
    const parts = ratioStr.split(':').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[1] === 0) continue;
    const rVal = parts[0] / parts[1];
    const diff = Math.abs(logTarget - Math.log(rVal));
    if (diff < minDiff) {
      minDiff = diff;
      bestRatio = ratioStr;
    }
  }

  return bestRatio;
}

