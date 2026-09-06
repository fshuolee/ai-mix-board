import { GoogleGenAI, Modality } from '@google/genai';
import { CanvasNode, ImageNode, TextNode } from '../types';
import { getImage } from './dbService';
import { blobToBase64 } from '../utils/canvasUtils';
import { getModelById, DEFAULT_MODEL_ID, fetchModelsFromApi } from './modelsConfig';
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
      fetchModelsFromApi(key.trim()).catch(() => {});
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

  // Robustly load images from IndexedDB, Drive, or memory
  const imageNodeParts = await Promise.all(
    nodes
      .filter(node => node.type === 'image')
      .map(async node => {
        try {
          const imageNode = node as ImageNode;
          const candidateIds = [imageNode.driveFileId, imageNode.content, node.id].filter(Boolean) as string[];
          let blob: Blob | null = null;

          // 1. Try local IndexedDB
          for (const cid of candidateIds) {
            blob = await getImage(cid);
            if (blob) break;
          }

          // 2. Try Google Drive if driveFileId exists
          if (!blob && token && imageNode.driveFileId) {
            try {
              blob = await getAssetBlobFromDrive(token, imageNode.driveFileId);
            } catch (driveErr) {
              console.warn('Failed to fetch asset from Google Drive:', imageNode.driveFileId, driveErr);
            }
          }

          if (!blob) {
            console.warn(`Could not load image blob for node ${node.id} across candidate IDs:`, candidateIds);
            return null;
          }

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

  const hasImageInputs = imageParts.length > 0;

  // Determine effective model:
  // If the user provided reference images or expects image creation, but the selected model does NOT support image output,
  // auto-route to the primary multimodal image generation model (DEFAULT_MODEL_ID = gemini-3.1-flash-image)
  let effectiveModelId = modelId;
  let effectiveModelConfig = modelConfig;

  if (hasImageInputs && !effectiveModelConfig.capabilities.supportsImageOutput) {
    console.warn(`Model ${modelId} does not support image output. Auto-routing to ${DEFAULT_MODEL_ID} for multimodal image generation.`);
    effectiveModelId = DEFAULT_MODEL_ID;
    effectiveModelConfig = getModelById(effectiveModelId);
  }

  // Handle Imagen 3 Dedicated Image Model
  if (effectiveModelId.startsWith('imagen-3')) {
    const promptText = textParts.map(t => t.text).join(' \n');
    if (!promptText.trim()) {
      throw new Error('Imagen 3 需要文字提示詞節點來生成圖像');
    }

    try {
      const response = await ai.models.generateImages({
        model: effectiveModelId,
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

  // Handle Multimodal Image Output Models (e.g. gemini-3.1-flash-image, gemini-2.5-flash-image)
  if (effectiveModelConfig.capabilities.supportsImageOutput) {
    const promptParts: any[] = [...imageParts, ...textParts];

    // If only image nodes were provided without text prompt, supply a creative synthesis instruction
    if (textParts.length === 0 && imageParts.length > 0) {
      promptParts.push({
        text: 'Generate a new creative image inspired by the visual style, subject matter, colors, and composition of the provided reference image(s). Output high quality image.',
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: effectiveModelId,
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

      // Do NOT fall back to text when an image model was requested! Throw clear error instead.
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const textMsg = response.text || '';
      throw new Error(
        textMsg || `模型未回傳圖像 (狀態: ${finishReason || 'NO_IMAGE'})，請調整提示詞或嘗試切換模型`
      );
    } catch (error: any) {
      // If gemini-3.1-flash-image fails with model not found, try fallback to gemini-2.5-flash-image
      if (
        effectiveModelId !== 'gemini-2.5-flash-image' &&
        (error.message?.includes('not found') ||
          error.message?.includes('404') ||
          error.message?.includes('unsupported'))
      ) {
        console.warn(`Falling back to gemini-2.5-flash-image from ${effectiveModelId}:`, error);
        try {
          const fallbackRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ parts: promptParts }],
            config: { responseModalities: [Modality.IMAGE] },
          });
          for (const part of fallbackRes.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              const base64ImageBytes: string = part.inlineData.data;
              const mimeType = part.inlineData.mimeType || 'image/png';
              const res = await fetch(`data:${mimeType};base64,${base64ImageBytes}`);
              const blob = await res.blob();
              return { type: 'image', blob };
            }
          }
        } catch (fallbackErr) {
          console.error('Fallback image generation error:', fallbackErr);
        }
      }
      console.error('Error generating image with Gemini:', error);
      throw new Error(error.message || '圖像生成失敗，請檢查 Console 或 API Key');
    }
  }

  // Handle Multimodal Text / Reasoning Models ONLY when the user explicitly selected a text model AND did not expect image output
  try {
    const promptParts = [
      ...imageParts,
      ...textParts,
      {
        text: '\n請綜合分析以上畫布中的節點內容，生成精煉、具有洞察力的結論或後續創作引導。',
      },
    ];

    const response = await ai.models.generateContent({
      model: effectiveModelId,
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
