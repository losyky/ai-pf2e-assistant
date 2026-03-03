import { MODULE_ID, MAP_CELL_SIZE, MAP_TILES_DIR, getPresetForTemplate } from '../constants';
import { MapTemplate, MapStyleConfig } from './types';
import { MapGuideImageService } from './map-guide-image-service';
import { Logger } from '../utils/logger';

declare const game: any;
declare const ui: any;
declare const FilePicker: any;

export class MapImageGenerationService {
  private static instance: MapImageGenerationService;

  private constructor() {}

  static getInstance(): MapImageGenerationService {
    if (!MapImageGenerationService.instance) {
      MapImageGenerationService.instance = new MapImageGenerationService();
    }
    return MapImageGenerationService.instance;
  }

  async generateMapImage(template: MapTemplate, styleConfig: MapStyleConfig): Promise<string> {
    const guideService = MapGuideImageService.getInstance();
    const guideBase64 = guideService.toBase64(template);

    const apiConfig = this.getAPIConfig();
    if (!apiConfig.apiKey || !apiConfig.apiUrl) {
      throw new Error('未配置图像 API。请在模块设置中配置图像 API 地址和密钥。');
    }

    const imageModel = styleConfig.imageModel
      || (game.settings.get(MODULE_ID, 'imageModel') as string)
      || 'gpt-image-1';

    // Gemini models don't handle style reference images well (structure bleeds through),
    // so only load style ref for non-Gemini models.
    let styleRefBase64: string | null = null;
    const isGemini = imageModel.startsWith('gemini');
    if (styleConfig.styleReferenceImage && !isGemini) {
      styleRefBase64 = await this.fileToBase64(styleConfig.styleReferenceImage);
      if (!styleRefBase64) {
        Logger.warn('Failed to load style reference image:', styleConfig.styleReferenceImage);
      }
    } else if (styleConfig.styleReferenceImage && isGemini) {
      Logger.info('Style reference image skipped for Gemini model — not supported. Use the style prompt text instead.');
    }

    const pixelW = template.gridCols * MAP_CELL_SIZE;
    const pixelH = template.gridRows * MAP_CELL_SIZE;
    const prompt = this.buildPrompt(styleConfig, !!styleRefBase64, pixelW, pixelH, template);

    Logger.debug('Generating map image with model:', imageModel, `size: ${pixelW}x${pixelH}`);
    const imageUrl = await this.callImageAPI(prompt, guideBase64, styleRefBase64, imageModel, apiConfig, template);
    return await this.downloadAndSave(imageUrl, template.id);
  }

  // ----------------------------------------------------------------
  // Prompt building
  // ----------------------------------------------------------------

  private buildPrompt(styleConfig: MapStyleConfig, hasStyleRef: boolean, pixelW: number, pixelH: number, template: MapTemplate): string {
    const parts: string[] = [
      'Transform this color-coded map schematic into a realistic, detailed top-down battle map tile for a tabletop RPG.',
    ];

    const desc = [template.name, template.description].filter(Boolean).join(' — ');
    if (desc) {
      parts.push('', `Map context: "${desc}". Use this to guide the thematic details, furniture, and environmental storytelling of the scene.`);
    }

    parts.push(
      '',
      'The attached image is a STRUCTURAL BLUEPRINT — it is NOT an artistic reference. You must REPAINT this exact layout:',
      '- Every GRAY pixel (#CCCCCC) → paint realistic floor texture with optional furniture, debris, or environmental details',
      '- Every BLACK pixel (#111111) → keep as PURE BLACK with absolutely zero content (void / empty space)',
      '- Every DARK GRAY line (#888888) → replace with a real wall texture (stone, brick, wood) at that exact position',
      '',
      'CRITICAL CONSTRAINTS:',
      '1. This is a pixel-perfect REPAINT of the blueprint. The shape of every room, corridor, and void area must match the schematic EXACTLY.',
      '2. The boundary between gray (floor) and black (void) is the most important constraint — do NOT shift it even by a single grid cell.',
      '3. Walls must sit precisely on the dark gray lines. Do not add or remove walls.',
      '4. The output must look like a hand-painted battle map viewed from directly above, with ZERO schematic colors remaining.',
      '5. Black void areas must be featureless pure black — no rocks, no shadows, no texture bleeding into void.',
    );

    if (hasStyleRef) {
      parts.push(
        '',
        'Use the artistic style (color palette, textures, shading, brush style) you studied from the style reference in the previous message.',
        'IMPORTANT: Apply ONLY the visual style from that reference — its room shapes, wall positions, and spatial layout are COMPLETELY IRRELEVANT. The structure comes ONLY from this blueprint.'
      );
    }

    if (styleConfig.stylePrompt) {
      parts.push('', `Visual style: ${styleConfig.stylePrompt}`);
    }

    if (styleConfig.negativePrompt) {
      parts.push(`Avoid: ${styleConfig.negativePrompt}`);
    }

    parts.push('', `Output: ${pixelW}×${pixelH} pixel top-down map tile.`);
    return parts.join('\n');
  }

  // ----------------------------------------------------------------
  // API dispatch
  // ----------------------------------------------------------------

  private async callImageAPI(
    prompt: string,
    guideBase64: string,
    styleRefBase64: string | null,
    imageModel: string,
    apiConfig: { apiUrl: string; apiKey: string },
    template: MapTemplate,
  ): Promise<string> {
    if (imageModel.startsWith('gpt-image')) {
      return this.callGPTImageEdit(prompt, guideBase64, styleRefBase64, imageModel, apiConfig, template);
    }
    if (imageModel.startsWith('gemini')) {
      return this.callGeminiAPI(prompt, guideBase64, styleRefBase64, imageModel, apiConfig, template);
    }
    return this.callOpenAICompatible(prompt, guideBase64, styleRefBase64, imageModel, apiConfig, template);
  }

  // ----------------------------------------------------------------
  // GPT-Image edit endpoint (multipart/form-data)
  // ----------------------------------------------------------------

  private async callGPTImageEdit(
    prompt: string,
    guideBase64: string,
    styleRefBase64: string | null,
    imageModel: string,
    apiConfig: { apiUrl: string; apiKey: string },
    template: MapTemplate,
  ): Promise<string> {
    const pixelW = template.gridCols * MAP_CELL_SIZE;
    const pixelH = template.gridRows * MAP_CELL_SIZE;

    const formData = new FormData();
    formData.append('model', imageModel);
    formData.append('prompt', prompt);
    formData.append('image[]', this.base64ToBlob(guideBase64), 'layout-guide.png');
    if (styleRefBase64) {
      formData.append('image[]', this.base64ToBlob(styleRefBase64), 'style-reference.png');
    }
    formData.append('size', `${pixelW}x${pixelH}`);

    let editUrl = apiConfig.apiUrl.replace(/\/+$/, '');
    if (editUrl.endsWith('/generations')) {
      editUrl = editUrl.replace('/generations', '/edits');
    } else if (!editUrl.endsWith('/edits')) {
      editUrl = editUrl.replace(/\/[^/]*$/, '/edits');
    }

    const response = await fetch(editUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiConfig.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`GPT-Image edit 调用失败 (${response.status}): ${errText.substring(0, 300)}`);
    }

    return this.extractImageUrl(await response.json());
  }

  // ----------------------------------------------------------------
  // Gemini API — multi-turn when style reference is present
  // ----------------------------------------------------------------

  private async callGeminiAPI(
    prompt: string,
    guideBase64: string,
    _styleRefBase64: string | null,
    _imageModel: string,
    apiConfig: { apiUrl: string; apiKey: string },
    template: MapTemplate,
  ): Promise<string> {
    // Gemini: single turn, guide image first (editing paradigm).
    // Style reference is intentionally not used for Gemini — it overrides
    // the layout structure. Style is controlled via text prompt only.
    const contents = [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: guideBase64 } },
        { text: prompt },
      ],
    }];

    // Look up the matching Gemini preset for aspect ratio and image size
    const preset = getPresetForTemplate(template.gridCols, template.gridRows);
    const imageSize = preset?.geminiImageSize ?? '2K';
    const aspectRatio = preset?.geminiAspectRatio ?? '1:1';

    const requestBody = {
      contents,
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          imageSize,
          aspectRatio,
        },
      },
    };

    Logger.debug(`Gemini imageConfig: size=${imageSize}, aspectRatio=${aspectRatio}`);

    const response = await fetch(apiConfig.apiUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API 调用失败 (${response.status}): ${errText.substring(0, 300)}`);
    }

    return this.extractImageUrl(await response.json());
  }

  // ----------------------------------------------------------------
  // OpenAI-compatible API
  // ----------------------------------------------------------------

  private async callOpenAICompatible(
    prompt: string,
    guideBase64: string,
    styleRefBase64: string | null,
    imageModel: string,
    apiConfig: { apiUrl: string; apiKey: string },
    template: MapTemplate,
  ): Promise<string> {
    const apiUrl = apiConfig.apiUrl.replace(/\/+$/, '');
    const pixelW = template.gridCols * MAP_CELL_SIZE;
    const pixelH = template.gridRows * MAP_CELL_SIZE;

    if (apiUrl.includes('/chat/completions') || apiUrl.includes('/v1/chat')) {
      return this.callChatCompletionsWithImages(prompt, guideBase64, styleRefBase64, imageModel, apiConfig);
    }

    const requestBody: any = {
      model: imageModel,
      prompt,
      n: 1,
      size: `${pixelW}x${pixelH}`,
    };
    requestBody.image = `data:image/png;base64,${guideBase64}`;
    if (styleRefBase64) {
      requestBody.style_reference = `data:image/png;base64,${styleRefBase64}`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`图像 API 调用失败 (${response.status}): ${errText.substring(0, 300)}`);
    }

    return this.extractImageUrl(await response.json());
  }

  private async callChatCompletionsWithImages(
    prompt: string,
    guideBase64: string,
    styleRefBase64: string | null,
    imageModel: string,
    apiConfig: { apiUrl: string; apiKey: string }
  ): Promise<string> {
    const content: any[] = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${guideBase64}` } },
    ];
    if (styleRefBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${styleRefBase64}` },
      });
    }

    const requestBody = {
      model: imageModel,
      messages: [{ role: 'user', content }],
    };

    const response = await fetch(apiConfig.apiUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Chat API 调用失败 (${response.status}): ${errText.substring(0, 300)}`);
    }

    return this.extractImageUrl(await response.json());
  }

  // ----------------------------------------------------------------
  // Response parsing
  // ----------------------------------------------------------------

  private extractImageUrl(data: any): string {
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    }

    if (data.data?.[0]) {
      const first = data.data[0];
      if (first.url) return first.url;
      if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
      if (typeof first === 'string') return first;
    }

    if (data.choices?.[0]?.message?.content) {
      const msgContent = data.choices[0].message.content;
      if (typeof msgContent === 'string' && msgContent.startsWith('data:')) return msgContent;
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (block.type === 'image_url') return block.image_url?.url;
          if (block.image_url) return block.image_url;
        }
      }
    }

    if (data.url) return data.url;
    if (data.image_url) return data.image_url;
    if (data.output?.[0]) return data.output[0];

    throw new Error(`无法从 API 响应中提取图像: ${JSON.stringify(data).substring(0, 300)}`);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private async downloadAndSave(imageUrl: string, templateId: string): Promise<string> {
    let blob: Blob;

    if (imageUrl.startsWith('data:')) {
      blob = this.dataUrlToBlob(imageUrl);
    } else {
      const resp = await fetch(imageUrl);
      if (!resp.ok) throw new Error(`下载图像失败: ${resp.status}`);
      blob = await resp.blob();
    }

    await this.ensureDirectory(MAP_TILES_DIR);

    const filename = `tile-${templateId}-${Date.now()}.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    const uploadResp = await FilePicker.upload('data', MAP_TILES_DIR, file, {});

    if (uploadResp?.path) return uploadResp.path;
    throw new Error('图像文件上传失败');
  }

  private getAPIConfig(): { apiUrl: string; apiKey: string } {
    const imageApiUrl = game.settings.get(MODULE_ID, 'imageApiUrl') as string || '';
    const imageApiKey = game.settings.get(MODULE_ID, 'imageApiKey') as string || '';

    const apiUrl = imageApiUrl || (game.settings.get(MODULE_ID, 'apiUrl') as string) || '';
    const apiKey = imageApiKey || (game.settings.get(MODULE_ID, 'apiKey') as string) || '';

    return { apiUrl, apiKey };
  }

  private async fileToBase64(path: string): Promise<string | null> {
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  private base64ToBlob(b64: string, mime = 'image/png'): Blob {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    return this.base64ToBlob(parts[1]);
  }

  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await FilePicker.browse('data', dir);
    } catch {
      await FilePicker.createDirectory('data', dir);
    }
  }
}
