import { MODULE_ID, MAP_CELL_SIZE, MAP_TILES_DIR, getPresetForTemplate } from '../constants';
import { MapTemplate, MapStyleConfig, MapWallType } from './types';
import { MapGuideImageService } from './map-guide-image-service';
import { Logger } from '../utils/logger';

declare const game: any;
declare const ui: any;
declare const FilePicker: any;
declare const foundry: any;

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

    // 风格参考图：所有接口都支持发送（Gemini 原生 API 支持最多 14 张图片）
    let styleRefBase64: string | null = null;
    if (styleConfig.styleReferenceImage) {
      styleRefBase64 = await this.fileToBase64(styleConfig.styleReferenceImage);
      if (!styleRefBase64) {
        Logger.warn('加载风格参考图失败:', styleConfig.styleReferenceImage);
      } else {
        Logger.debug('地图生成: 风格参考图已加载，将作为第二张图片发送');
      }
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

  /**
   * 分析模板中实际使用的墙体类型
   */
  private analyzeWallTypes(template: MapTemplate): Set<MapWallType> {
    const usedTypes = new Set<MapWallType>();
    for (const wall of template.walls) {
      usedTypes.add(wall.wallType || 'normal');
    }
    return usedTypes;
  }

  private buildPrompt(styleConfig: MapStyleConfig, hasStyleRef: boolean, pixelW: number, pixelH: number, template: MapTemplate): string {
    const language = styleConfig.promptLanguage || 'zh';
    
    if (language === 'en') {
      return this.buildPromptEN(styleConfig, hasStyleRef, pixelW, pixelH, template);
    } else {
      return this.buildPromptZH(styleConfig, hasStyleRef, pixelW, pixelH, template);
    }
  }

  /**
   * 构建中文提示词
   */
  private buildPromptZH(styleConfig: MapStyleConfig, hasStyleRef: boolean, pixelW: number, pixelH: number, template: MapTemplate): string {
    const parts: string[] = [];

    // 用「第一张图/第二张图」明确指代，便于多模态模型对应；括号内说明用途
    const structLabel = '第一张图（结构图）';
    const styleLabel = hasStyleRef ? '第二张图（风格参考图）' : '';

    // 动态生成替换规则：只包含模板中实际存在的墙体类型
    const usedWallTypes = this.analyzeWallTypes(template);
    const wallReplaceRules: string[] = [];
    
    if (usedWallTypes.has('normal')) {
      wallReplaceRules.push('红线替换为墙壁');
    }
    if (usedWallTypes.has('door') || usedWallTypes.has('secret-door')) {
      wallReplaceRules.push('绿线替换为门（或暗门）');
    }
    if (usedWallTypes.has('ethereal')) {
      wallReplaceRules.push('青线替换为幽灵墙/传送门（半透明或魔法边界效果）');
    }
    if (usedWallTypes.has('invisible')) {
      wallReplaceRules.push('橙线替换为隐形墙');
    }
    if (usedWallTypes.has('window')) {
      wallReplaceRules.push('蓝线替换为窗户');
    }
    
    // 区域规则始终包含（灰色=可通行，黑色=不可通过）
    const areaRules = [
      '黑色区域替换为不可通过区域',
      '灰色区域替换为可通行区域',
    ];
    
    const replaceRules = [...wallReplaceRules, ...areaRules].join('，');

    if (hasStyleRef) {
      parts.push(
        `[Image 1 = layout/structure, Image 2 = style reference.]`,
        `按照${styleLabel}的绘图风格，以及${structLabel}的地图结构，绘制一张 TRPG 俯视战斗地图。`,
        `在${structLabel}中：${replaceRules}。`,
        `${styleLabel}的场景布局请完全忽略，仅用${styleLabel}的地图元素与绘画风格进行绘制。`,
      );
    } else {
      parts.push(
        `按照${structLabel}的地图结构，绘制一张 TRPG 俯视战斗地图。`,
        `在${structLabel}中：${replaceRules}。`,
      );
    }

    parts.push(
      '',
      '约束：',
      '1. 输出为俯视战斗地图，图中不得残留结构图的彩色线条。',
      '2. 黑色不可通过区域保持纯黑，无纹理或杂物。',
    );

    const useStylePrompt = hasStyleRef ? styleConfig.useStylePromptWhenHasRefImage !== false : true;
    if (useStylePrompt && styleConfig.stylePrompt) {
      parts.push('', `视觉风格补充：${styleConfig.stylePrompt}`);
    }

    if (styleConfig.negativePrompt) {
      parts.push('', `避免出现：${styleConfig.negativePrompt}`);
    }

    parts.push('', `输出尺寸：${pixelW}×${pixelH} 像素，俯视图。`);
    return parts.join('\n');
  }

  /**
   * 构建英文提示词
   */
  private buildPromptEN(styleConfig: MapStyleConfig, hasStyleRef: boolean, pixelW: number, pixelH: number, template: MapTemplate): string {
    const parts: string[] = [];

    // Clear labels for multi-image input
    const structLabel = 'Image 1 (structure map)';
    const styleLabel = hasStyleRef ? 'Image 2 (style reference)' : '';

    // Dynamic replacement rules: only include wall types present in the template
    const usedWallTypes = this.analyzeWallTypes(template);
    const wallReplaceRules: string[] = [];
    
    if (usedWallTypes.has('normal')) {
      wallReplaceRules.push('red lines → walls');
    }
    if (usedWallTypes.has('door') || usedWallTypes.has('secret-door')) {
      wallReplaceRules.push('green lines → doors (or secret doors)');
    }
    if (usedWallTypes.has('ethereal')) {
      wallReplaceRules.push('cyan lines → ethereal walls/portals (translucent or magical boundaries)');
    }
    if (usedWallTypes.has('invisible')) {
      wallReplaceRules.push('orange lines → invisible walls');
    }
    if (usedWallTypes.has('window')) {
      wallReplaceRules.push('blue lines → windows');
    }
    
    // Area rules always included (gray = passable, black = impassable)
    const areaRules = [
      'black areas → impassable terrain',
      'gray areas → passable terrain',
    ];
    
    const replaceRules = [...wallReplaceRules, ...areaRules].join(', ');

    if (hasStyleRef) {
      parts.push(
        `[${structLabel} = layout/structure, ${styleLabel} = style reference.]`,
        `Generate a top-down TRPG battle map following the layout from ${structLabel} and the art style from ${styleLabel}.`,
        `In ${structLabel}: ${replaceRules}.`,
        `Strictly preserve the layout structure from ${structLabel}. Use only the visual style and map elements from ${styleLabel}, completely ignore its room layout.`,
      );
    } else {
      parts.push(
        `Generate a top-down TRPG battle map following the layout from ${structLabel}.`,
        `In ${structLabel}: ${replaceRules}.`,
      );
    }

    parts.push(
      '',
      'Constraints:',
      '1. Output must be a top-down battle map with no colored guide lines remaining.',
      '2. Black impassable areas must stay pure black with no textures or objects.',
    );

    const useStylePrompt = hasStyleRef ? styleConfig.useStylePromptWhenHasRefImage !== false : true;
    if (useStylePrompt && styleConfig.stylePrompt) {
      parts.push('', `Visual style: ${styleConfig.stylePrompt}`);
    }

    if (styleConfig.negativePrompt) {
      parts.push('', `Avoid: ${styleConfig.negativePrompt}`);
    }

    parts.push('', `Output size: ${pixelW}×${pixelH} pixels, top-down view.`);
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
    const apiUrl = apiConfig.apiUrl.replace(/\/+$/, '');
    const isChatCompletions = /\/chat\/completions|\/v1\/chat/i.test(apiUrl);
    const isFalEdit = /fal.*(edit|nano-banana)/i.test(apiUrl);

    if (isFalEdit) {
      return this.callFalEdit(prompt, guideBase64, styleRefBase64, apiConfig, template);
    }
    if (imageModel.startsWith('gpt-image')) {
      return this.callGPTImageEdit(prompt, guideBase64, styleRefBase64, imageModel, apiConfig, template);
    }
    if (imageModel.startsWith('gemini') && !isChatCompletions) {
      return this.callGeminiAPI(prompt, guideBase64, styleRefBase64, imageModel, apiConfig, template);
    }
    if (isChatCompletions) {
      return this.callChatCompletionsWithImages(prompt, guideBase64, styleRefBase64, imageModel, apiConfig);
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
  // Fal.ai 风格 Edit API（prompt + image_urls 数组，支持多图/风格参考）
  // 文档: https://fal.ai/models/fal-ai/nano-banana-2/edit/api
  // 中转如 ssopen 若代理该接口，URL 会包含 fal 与 edit/nano-banana
  // ----------------------------------------------------------------
  private async callFalEdit(
    prompt: string,
    guideBase64: string,
    styleRefBase64: string | null,
    apiConfig: { apiUrl: string; apiKey: string },
    template: MapTemplate,
  ): Promise<string> {
    const guideDataUri = `data:image/png;base64,${guideBase64}`;
    const imageUrls: string[] = [guideDataUri];
    if (styleRefBase64) {
      imageUrls.push(`data:image/png;base64,${styleRefBase64}`);
      Logger.debug('Map gen: Fal edit sending 2 images — image_urls[0]=structure, image_urls[1]=style');
    }
    const preset = getPresetForTemplate(template.gridCols, template.gridRows);
    const resolution = (preset?.geminiImageSize ?? '2K') as string;
    const aspectRatio = preset?.geminiAspectRatio ?? '1:1';

    const body: Record<string, unknown> = {
      prompt,
      image_urls: imageUrls,
      num_images: 1,
      resolution: resolution,
      aspect_ratio: aspectRatio,
      output_format: 'png',
    };

    const response = await fetch(apiConfig.apiUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Fal edit API 调用失败 (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const url = data?.images?.[0]?.url ?? data?.data?.images?.[0]?.url;
    if (url) {
      Logger.info('成功从 Fal edit 响应 images[0].url 提取图像');
      return url;
    }
    return this.extractImageUrl(data);
  }

  // ----------------------------------------------------------------
  // Gemini API — multi-turn when style reference is present
  // ----------------------------------------------------------------

  private async callGeminiAPI(
    prompt: string,
    guideBase64: string,
    styleRefBase64: string | null,
    imageModel: string,
    apiConfig: { apiUrl: string; apiKey: string },
    template: MapTemplate,
  ): Promise<string> {
    // Gemini 支持多图输入（最多 14 张），按顺序发送结构图和风格参考图
    // 提示词中已明确指示每张图片的用途，模型会正确理解
    const parts: any[] = [
      { inlineData: { mimeType: 'image/png', data: guideBase64 } },
    ];
    
    // 如果有风格参考图，添加到 parts 数组中
    if (styleRefBase64) {
      parts.push({ inlineData: { mimeType: 'image/png', data: styleRefBase64 } });
      Logger.debug('Gemini API: 发送 2 张图片 - 结构图 + 风格参考图');
    } else {
      Logger.debug('Gemini API: 发送 1 张图片 - 仅结构图');
    }
    
    parts.push({ text: prompt });
    
    const contents = [{
      role: 'user',
      parts,
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

    Logger.debug(`Gemini 请求配置: model=${imageModel}, size=${imageSize}, aspectRatio=${aspectRatio}, images=${styleRefBase64 ? 2 : 1}`);
    Logger.debug(`Gemini API URL: ${apiConfig.apiUrl}`);

    // 使用 AbortController 实现超时控制（5分钟超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分钟

    try {
      const response = await fetch(apiConfig.apiUrl.replace(/\/+$/, ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        Logger.error(`Gemini API 错误响应 (${response.status}):`, errText.substring(0, 500));
        throw new Error(`Gemini API 调用失败 (${response.status}): ${errText.substring(0, 300)}`);
      }

      // 检查响应头，如果内容很大，分块读取
      const contentLength = response.headers.get('content-length');
      Logger.debug(`Gemini API 响应大小: ${contentLength || '未知'} 字节`);

      const responseData = await response.json();
      Logger.debug('Gemini API 响应数据结构:', JSON.stringify(responseData).substring(0, 500));
      
      return this.extractImageUrl(responseData);
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      if (err.name === 'AbortError') {
        Logger.error('Gemini API 请求超时（5分钟）');
        throw new Error('图像生成超时，请稍后重试或使用较小的地图尺寸');
      }
      
      if (err.message.includes('Failed to fetch') || err.message.includes('ERR_CONNECTION_RESET')) {
        Logger.error('Gemini API 连接失败，可能是响应过大导致连接重置');
        throw new Error('图像生成失败：网络连接中断。这可能是因为生成的图像过大，请尝试使用较小的地图尺寸或联系 API 提供商');
      }
      
      throw err;
    }
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
    // 文字在前、图在后：多数「创作图」接口先读指令再解析图片，第一张=结构图，第二张=风格参考图
    const content: any[] = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${guideBase64}` } },
    ];
    if (styleRefBase64) {
      content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${styleRefBase64}` } });
      Logger.debug('Map gen: Chat sending prompt + 2 images (structure, then style reference)');
    } else {
      Logger.debug('Map gen: Chat sending prompt + 1 image (structure only)');
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
    Logger.debug('尝试从 API 响应中提取图像 URL...');

    // Fal.ai edit 响应格式：images[0].url 或 data.images[0].url
    const falUrl = data?.images?.[0]?.url ?? data?.data?.images?.[0]?.url;
    if (falUrl) {
      Logger.info('成功从 Fal edit images[0].url 提取图像');
      return falUrl;
    }

    // Gemini API 响应格式：candidates[0].content.parts[x].inlineData
    if (data.candidates?.[0]?.content?.parts) {
      Logger.debug('检测到 Gemini candidates 格式');
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          Logger.info('成功从 Gemini inlineData 中提取图像');
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    }

    // OpenAI-style data[0] 格式
    if (data.data?.[0]) {
      Logger.debug('检测到 OpenAI data[] 格式');
      const first = data.data[0];
      if (first.url) {
        Logger.info('成功从 data[0].url 中提取图像 URL');
        return first.url;
      }
      if (first.b64_json) {
        Logger.info('成功从 data[0].b64_json 中提取图像');
        return `data:image/png;base64,${first.b64_json}`;
      }
      if (typeof first === 'string') {
        Logger.info('成功从 data[0] 字符串中提取图像 URL');
        return first;
      }
    }

    // Chat completions 格式
    if (data.choices?.[0]?.message?.content) {
      Logger.debug('检测到 Chat completions 格式');
      const msgContent = data.choices[0].message.content;
      if (typeof msgContent === 'string' && msgContent.startsWith('data:')) {
        Logger.info('成功从 choices[0].message.content 字符串中提取图像');
        return msgContent;
      }
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (block.type === 'image_url') {
            Logger.info('成功从 choices[0].message.content 数组中提取图像 URL');
            return block.image_url?.url;
          }
          if (block.image_url) {
            Logger.info('成功从 choices[0].message.content 数组中提取图像 URL');
            return block.image_url;
          }
        }
      }
    }

    // 直接 URL 字段
    if (data.url) {
      Logger.info('成功从 url 字段中提取图像 URL');
      return data.url;
    }
    if (data.image_url) {
      Logger.info('成功从 image_url 字段中提取图像 URL');
      return data.image_url;
    }
    if (data.output?.[0]) {
      Logger.info('成功从 output[0] 中提取图像 URL');
      return data.output[0];
    }

    Logger.error('无法从 API 响应中提取图像，响应结构:', JSON.stringify(data).substring(0, 500));
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
    const templateDir = `${MAP_TILES_DIR}/${templateId}`;
    await this.ensureDirectory(templateDir);

    const filename = `tile-${templateId}-${Date.now()}.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    
    // 兼容 Foundry VTT v13+ 的 FilePicker 命名空间
    const FP = (foundry?.applications?.apps?.FilePicker?.implementation) || FilePicker;
    const uploadResp = await FP.upload('data', templateDir, file, {});

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
    // 兼容 Foundry VTT v13+ 的 FilePicker 命名空间
    const FP = (foundry?.applications?.apps?.FilePicker?.implementation) || FilePicker;
    try {
      await FP.browse('data', dir);
    } catch {
      await FP.createDirectory('data', dir);
    }
  }
}
