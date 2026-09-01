import { GoogleGenAI, Modality } from '@google/genai';
import { CanvasNode, ImageNode, TextNode } from '../types';
import { getImage } from './dbService';
import { blobToBase64 } from '../utils/canvasUtils';
import { getModelById, DEFAULT_MODEL_ID } from './modelsConfig';
import { getAssetBlobFromDrive } from './googleDriveService';
import { getAccessToken } from './googleAuthService';

function getApiKey(): string {
  return (
    (typeof process !== 'undefined' && (process.env.GEMINI_API_KEY || process.env.API_KEY)) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('ai_mix_board_api_key')) ||
    ''
  );
}

export function setCustomApiKey(key: string): void {
  if (typeof localStorage !== 'undefined') {
    if (key) {
      localStorage.setItem('ai_mix_board_api_key', key.trim());
    } else {
      localStorage.removeItem('ai_mix_board_api_key');
    }
  }
}

export function getEffectiveApiKey(): string {
  return getApiKey();
}

function getAiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'Gemini API Key 尚未設定。請在 .env 填寫 GEMINI_API_KEY 或在設定中填寫。'
    );
  }
  return new GoogleGenAI({ apiKey });
}

function base64ToPart(base64: string) {
  const match = base64.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    return null;
  }
  const [_, mimeType, data] = match;
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

export type GenerationResult =
  | { type: 'image'; blob: Blob }
  | { type: 'text'; text: string };

/**
 * Execute generation on selected canvas nodes with the chosen model
 */
export const generateFromNodes = async (
  nodes: CanvasNode[],
  modelId: string = DEFAULT_MODEL_ID
): Promise<GenerationResult> => {
  const ai = getAiClient();
  const modelConfig = getModelById(modelId);

  const textParts = nodes
    .filter(node => node.type === 'text')
    .map(node => ({ text: (node as TextNode).content }));

  const token = getAccessToken();

  // Load images from IndexedDB or Google Drive
  const imageNodeParts = await Promise.all(
    nodes
      .filter(node => node.type === 'image')
      .map(async node => {
        try {
          const imageNode = node as ImageNode;
          const fileId = imageNode.driveFileId || imageNode.content;
          let blob = await getImage(fileId);

          if (!blob && token && imageNode.driveFileId) {
            blob = await getAssetBlobFromDrive(token, imageNode.driveFileId);
          }

          if (!blob) return null;
          const base64 = await blobToBase64(blob);
          return base64ToPart(base64);
        } catch (e) {
          console.error(`Failed to load image ${node.id}`, e);
          return null;
        }
      })
  );

  const imageParts = imageNodeParts.filter(part => part !== null).map(part => part!);

  if (textParts.length === 0 && imageParts.length === 0) {
    throw new Error('請至少選取一個包含文字或圖片的節點');
  }

  // Handle Imagen 3 Dedicated Image Model
  if (modelId.startsWith('imagen-3')) {
    const promptText = textParts.map(t => t.text).join(' \n');
    if (!promptText.trim()) {
      throw new Error('Imagen 3 需要文字提示詞節點來生成圖像');
    }

    try {
      const response = await ai.models.generateImages({
        model: modelId,
        prompt: promptText,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '1:1',
        },
      });

      const imageObj = response.generatedImages?.[0]?.image;
      if (imageObj?.imageBytes) {
        const res = await fetch(`data:image/png;base64,${imageObj.imageBytes}`);
        const blob = await res.blob();
        return { type: 'image', blob };
      }
      throw new Error('Imagen 3 未回傳圖像資料');
    } catch (err: any) {
      console.error('Imagen 3 generation error:', err);
      throw new Error(err.message || 'Imagen 3 生成失敗');
    }
  }

  // Handle Image Output Models (e.g. gemini-2.5-flash-image)
  if (modelConfig.capabilities.supportsImageOutput) {
    const promptParts = [...imageParts, ...textParts];

    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            parts: promptParts,
          },
        ],
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64ImageBytes: string = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          const res = await fetch(`data:${mimeType};base64,${base64ImageBytes}`);
          const blob = await res.blob();
          return { type: 'image', blob };
        }
      }
      throw new Error('模型未回傳圖像，請嘗試調整提示詞或切換模型');
    } catch (error: any) {
      console.error('Error generating image with Gemini:', error);
      throw new Error(error.message || '圖像生成失敗，請檢查 Console 或 API Key');
    }
  }

  // Handle Multimodal Text / Reasoning Models (e.g. gemini-2.5-pro, gemini-2.5-flash)
  try {
    const promptParts = [
      ...imageParts,
      ...textParts,
      {
        text: '\n請綜合分析以上畫布中的節點內容，生成精煉、具有洞察力的結論或後續創作引導。',
      },
    ];

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ parts: promptParts }],
    });

    const textOutput = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textOutput) {
      return { type: 'text', text: textOutput };
    }
    throw new Error('模型未回傳文字結果');
  } catch (error: any) {
    console.error('Error generating text with Gemini:', error);
    throw new Error(error.message || '推理分析生成失敗');
  }
};

// Backward-compatible alias for existing imports
export const generateImageFromNodes = async (
  nodes: CanvasNode[],
  modelId?: string
): Promise<Blob> => {
  const result = await generateFromNodes(nodes, modelId || DEFAULT_MODEL_ID);
  if (result.type === 'image') {
    return result.blob;
  }
  throw new Error('選取的模型輸出了文字而非圖片');
};
