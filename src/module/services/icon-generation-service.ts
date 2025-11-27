import { MODULE_ID } from '../constants';

// 声明全局变量
declare const game: any;
declare const ui: any;

export interface IconGenerationOptions {
  name: string;
  description: string;
  type: 'monster' | 'item' | 'spell' | 'npc';
  style?: string;
  size?: string;
  iconPrompt?: string; // AI生成的图标提示词
}

export interface GeneratedIcon {
  filename: string;
  path: string;
  url: string;
  prompt: string;
}

export class IconGenerationService {
  private static instance: IconGenerationService;
  private iconDirectory: string = 'pf2e-icons';

  private constructor() {}

  public static getInstance(): IconGenerationService {
    if (!IconGenerationService.instance) {
      IconGenerationService.instance = new IconGenerationService();
    }
    return IconGenerationService.instance;
  }

  /**
   * 检查是否启用了图标生成
   */
  public isEnabled(): boolean {
    try {
      return game.settings.get(MODULE_ID, 'enableIconGeneration') || false;
    } catch (error) {
      console.warn('Failed to get enableIconGeneration setting, using default false');
      return false;
    }
  }

  /**
   * 生成图标
   * @param options 图标生成选项
   * @param skipEnabledCheck 是否跳过启用状态检查（用于手动按钮触发）
   */
  public async generateIcon(options: IconGenerationOptions, skipEnabledCheck: boolean = false): Promise<GeneratedIcon | null> {
    if (!skipEnabledCheck && !this.isEnabled()) {
      console.error('图标生成服务未启用');
      return null;
    }

    try {
      // 确保图标目录存在
      await this.ensureIconDirectory();

      // 生成图标提示词
      const prompt = this.generatePrompt(options);
      console.log('生成的提示词:', prompt);

      // 调用DALL-E API生成图标
      console.log('开始调用API生成图标...');
      const imageUrl = await this.callDalleAPI(prompt, options);
      console.log('API返回的图片URL:', imageUrl);

      // 下载并保存图标
      console.log('开始下载并保存图标...');
      const iconInfo = await this.downloadAndSaveIcon(imageUrl, options, prompt);
      console.log('图标保存成功:', iconInfo);

      return iconInfo;
    } catch (error: any) {
      console.error('图标生成失败 - 详细错误:', error);
      console.error('错误堆栈:', error.stack);
      if (ui && ui.notifications) {
        ui.notifications.warn(`图标生成失败: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 为怪物生成图标（使用自定义目录和尺寸）
   */
  public async generateMonsterIcon(name: string, description: string, style?: string): Promise<GeneratedIcon | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      // 确保pf2e-tokens目录存在
      await this.ensureCustomDirectory('pf2e-tokens');

      // 构建完整的图标提示词
      let fullPrompt = description;
      if (style && style.trim()) {
        fullPrompt = `${style} style, ` + fullPrompt;
      }
      fullPrompt += ', high quality, detailed, portrait view, game character art';

      // 调用DALL-E API生成图标 - 强制使用1024x1024尺寸
      const monsterOptions: IconGenerationOptions = {
        name: name,
        description: fullPrompt,
        type: 'monster',
        size: '1024x1024',
        iconPrompt: fullPrompt
      };
      
      const imageUrl = await this.callDalleAPI(fullPrompt, monsterOptions);

      // 下载并保存图标到pf2e-tokens目录
      const iconInfo = await this.downloadAndSaveMonsterIcon(imageUrl, name, fullPrompt);

      return iconInfo;
    } catch (error: any) {
      console.error('Monster icon generation failed:', error);
      if (ui && ui.notifications) {
        ui.notifications.warn(`怪物图标生成失败: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 生成图标提示词
   */
  private generatePrompt(options: IconGenerationOptions): string {
    // 优先使用AI生成的专门图标提示词
    if (options.iconPrompt && options.iconPrompt.trim()) {
      const style = game.settings.get(MODULE_ID, 'iconStyle') || 'fantasy art';
      
      let prompt = options.iconPrompt.trim();
      
      // 确保提示词以合适的格式开始
      if (!prompt.toLowerCase().startsWith('a ') && !prompt.toLowerCase().startsWith('an ')) {
        // 如果不是以冠词开始，根据内容添加适当的前缀
        const startsWithVowel = /^[aeiou]/i.test(prompt);
        prompt = (startsWithVowel ? 'An ' : 'A ') + prompt;
      }
      
      // 直接使用用户输入的风格关键词
      if (style && style.trim()) {
        prompt += `, ${style} style`;
      }
      
      // 添加通用的图标要求
      prompt += ', game icon format, square composition, centered object, clean background, no text or labels, professional game asset quality';
      
      console.log('使用AI生成的图标提示词:', prompt);
      return prompt;
    }

    // 回退到原来的提示词生成方式（使用英文）
    const style = game.settings.get(MODULE_ID, 'iconStyle') || 'fantasy art';

    const typeMap: Record<string, string> = {
      'monster': 'creature, monster, being',
      'item': 'item, equipment, gear',
      'spell': 'magical effect, spell, magic',
      'npc': 'character, person, NPC'
    };

    let prompt = `Create a ${style} style icon of ${options.name}. `;
    prompt += `This is a ${typeMap[options.type]} for a Pathfinder 2e RPG game. `;
    
    // 简化描述，避免过长的中文描述
    const shortDescription = options.description.substring(0, 200).replace(/<[^>]*>/g, ''); // 移除HTML标签并截断
    prompt += `Description: ${shortDescription}. `;
    
    prompt += `The icon should be clean, recognizable, and suitable for game use. `;
    prompt += `Square format, centered composition, no text or labels. `;

    if (style === 'pixel-art') {
      prompt += `Use a limited color palette with clear pixel boundaries. `;
    }

    prompt += `Background should be transparent or neutral.`;

    return prompt;
  }

  /**
   * 获取当前用户适用的API配置
   * @returns API配置对象
   */
  private getAPIConfig(): { apiKey: string; apiUrl: string } {
    const isGM = game.user?.isGM;
    
    let apiKey: string;
    let apiUrl: string;
    
    if (isGM) {
      // GM使用GM 图像API Key（如果未设置则回退到主API Key）
      apiKey = game.settings.get(MODULE_ID, 'imageApiKey') || game.settings.get(MODULE_ID, 'apiKey') || '';
      apiUrl = game.settings.get(MODULE_ID, 'imageApiUrl') || game.settings.get(MODULE_ID, 'apiUrl') || 'https://api.openai.com/v1/chat/completions';
    } else {
      // 玩家API配置
      const playerImageApiKey = game.settings.get(MODULE_ID, 'playerImageApiKey') || '';
      const playerImageApiUrl = game.settings.get(MODULE_ID, 'playerImageApiUrl') || '';
      const gmImageApiKey = game.settings.get(MODULE_ID, 'imageApiKey') || '';
      const gmImageApiUrl = game.settings.get(MODULE_ID, 'imageApiUrl') || '';
      const playerApiKey = game.settings.get(MODULE_ID, 'playerApiKey') || '';
      const playerApiUrl = game.settings.get(MODULE_ID, 'playerApiUrl') || '';
      const gmApiKey = game.settings.get(MODULE_ID, 'apiKey') || '';
      const gmApiUrl = game.settings.get(MODULE_ID, 'apiUrl') || 'https://api.openai.com/v1/chat/completions';
      
      // 回退顺序：玩家图像API → GM图像API → 玩家主API → GM主API
      apiKey = playerImageApiKey || gmImageApiKey || playerApiKey || gmApiKey;
      apiUrl = playerImageApiUrl || gmImageApiUrl || playerApiUrl || gmApiUrl;
      
      if (!apiKey) {
        throw new Error('玩家图像API密钥未设置，请联系GM配置玩家图像API访问权限');
      }
    }
    
    if (!apiKey) {
      throw new Error('图像API密钥未设置，请在模块设置中配置图像生成专用密钥');
    }
    
    return { apiKey, apiUrl };
  }

  /**
   * 调用DALL-E API
   */
  private async callDalleAPI(prompt: string, options: IconGenerationOptions): Promise<string> {
    const apiConfig = this.getAPIConfig();
    const apiKey = apiConfig.apiKey;
    const customApiUrl = apiConfig.apiUrl;
    const imageModel = game.settings.get(MODULE_ID, 'imageModel') || 'flux-pro';
    const iconSize = game.settings.get(MODULE_ID, 'iconSize') || '1024x1024';

    // 检查是否使用第三方API（如302.AI）
    const isThirdPartyApi = customApiUrl && (
      customApiUrl.includes('302.ai') || 
      customApiUrl.includes('apifox.cn') ||
      customApiUrl.includes('ssopen.top') ||
      !customApiUrl.includes('openai.com')
    );

    if (isThirdPartyApi) {
      return this.callThirdPartyImageAPI(prompt, options);
    }

    // 原始OpenAI API调用
    const requestBody: any = {
      model: imageModel,
      prompt: prompt,
      n: 1,
      size: iconSize,
      response_format: 'url'
    };

    // DALL-E 3 特有参数
    if (imageModel === 'dall-e-3') {
      requestBody.quality = 'standard';
      requestBody.style = 'natural';
    }

    // 构建API URL
    let apiUrl = customApiUrl || 'https://api.openai.com/v1/images/generations';
    if (customApiUrl && !customApiUrl.includes('images/generations')) {
      // 如果自定义URL不包含图片生成端点，尝试构建
      const baseUrl = customApiUrl.replace('/chat/completions', '');
      apiUrl = `${baseUrl}/images/generations`;
    }

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    };

    try {
      const response = await fetch(apiUrl, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // 如果是CORS错误，提供更具体的错误信息
        if (response.status === 0 || response.type === 'opaque') {
          throw new Error('CORS错误：请配置支持CORS的第三方API代理服务，如 302.AI');
        }
        
        throw new Error(`DALL-E API调用失败: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      if (!data.data || !data.data[0] || !data.data[0].url) {
        throw new Error('DALL-E API返回的数据格式不正确');
      }

      return data.data[0].url;
      
    } catch (error: any) {
      // 检查是否是网络错误（通常是CORS）
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('网络请求失败，可能是CORS限制。建议使用第三方API服务如 302.AI 来解决此问题。');
      }
      throw error;
    }
  }

  /**
   * 调用第三方图片生成API（如302.AI）
   */
  private async callThirdPartyImageAPI(prompt: string, options: IconGenerationOptions): Promise<string> {
    const apiConfig = this.getAPIConfig();
    const apiKey = apiConfig.apiKey;
    const customApiUrl = apiConfig.apiUrl;
    const imageModel = game.settings.get(MODULE_ID, 'imageModel') || 'flux-pro';
    // 对于怪物图标，强制使用1024x1024尺寸
    const iconSize = options.size || game.settings.get(MODULE_ID, 'iconSize') || '1024x1024';

    // 检查是否是SSOPEN API
    const isSSOpenAPI = customApiUrl && (customApiUrl.includes('ssopen.top') || customApiUrl.includes('ssopen.vip'));
    
    // 模型分类
    const isFluxModel = imageModel.startsWith('flux-');
    const isDalleModel = imageModel.startsWith('dall-e');
    const isGPTImageModel = imageModel.startsWith('gpt-image');
    const isMidjourneyModel = imageModel === 'midjourney';
    const isIdeogramModel = imageModel.startsWith('ideogram');
    const isStableDiffusionModel = imageModel.startsWith('stable-diffusion');
    const isDoubaoModel = imageModel.startsWith('doubao');
    const isRecraftModel = imageModel.startsWith('recraft');
    
    // 构建正确的图片生成API URL
    let imageApiUrl = customApiUrl;
    
    if (isSSOpenAPI) {
      // SSOPEN API 根据模型类型使用不同端点
      const baseUrl = customApiUrl.replace(/\/+$/, '').replace('/chat/completions', '');
      
      if (isMidjourneyModel) {
        // Midjourney 使用专门的端点
        imageApiUrl = `${baseUrl}/mj/submit/imagine`;
      } else if (isIdeogramModel) {
        // Ideogram 使用专门的端点
        imageApiUrl = `${baseUrl}/ideogram/generate`;
      } else if (isStableDiffusionModel) {
        // Stable Diffusion 使用 Replicate 端点
        imageApiUrl = `${baseUrl}/replicate/predictions`;
      } else if (isDoubaoModel) {
        // 豆包模型使用专门的端点
        imageApiUrl = `${baseUrl}/doubao/text2image`;
      } else if (isRecraftModel) {
        // Recraft 使用 Replicate 端点
        imageApiUrl = `${baseUrl}/replicate/predictions`;
      } else {
        // DALL-E, GPT-Image, Flux 使用标准端点
        imageApiUrl = `${baseUrl}/images/generations`;
      }
    } else {
      // 其他API使用标准端点
      if (customApiUrl.includes('/chat/completions')) {
        imageApiUrl = customApiUrl.replace('/chat/completions', '/images/generations');
      } else if (!customApiUrl.includes('/images/generations')) {
        const baseUrl = customApiUrl.replace(/\/+$/, '');
        imageApiUrl = `${baseUrl}/images/generations`;
      }
    }
    
    // 处理不同API和模型对尺寸的要求
    let adjustedSize = iconSize;
    
    if (isDalleModel) {
      // DALL-E 模型的尺寸要求
      const dalleValidSizes = ['1024x1024', '1024x1792', '1792x1024'];
      if (!dalleValidSizes.includes(iconSize)) {
        adjustedSize = '1024x1024';
        console.log(`DALL-E 模型不支持尺寸 ${iconSize}，自动调整为 ${adjustedSize}`);
      }
    } else if (isFluxModel) {
      // Flux模型的尺寸要求
      const fluxSizes = ['256x256', '512x512', '768x768', '1024x1024', '1024x768', '768x1024'];
      if (!fluxSizes.includes(iconSize)) {
        adjustedSize = '1024x1024';
        console.log(`Flux模型不支持尺寸 ${iconSize}，自动调整为 ${adjustedSize}`);
      }
    } else if (isGPTImageModel) {
      // GPT-Image 模型支持多种尺寸
      const gptImageSizes = ['1024x1024', '1024x1792', '1792x1024', '512x512', '768x768'];
      if (!gptImageSizes.includes(iconSize)) {
        adjustedSize = '1024x1024';
        console.log(`GPT-Image 模型不支持尺寸 ${iconSize}，自动调整为 ${adjustedSize}`);
      }
    } else if (isIdeogramModel || isStableDiffusionModel || isDoubaoModel || isRecraftModel) {
      // 其他模型通常支持标准尺寸
      const standardSizes = ['512x512', '768x768', '1024x1024', '1024x768', '768x1024'];
      if (!standardSizes.includes(iconSize)) {
        adjustedSize = '1024x1024';
        console.log(`${imageModel} 不支持尺寸 ${iconSize}，自动调整为 ${adjustedSize}`);
      }
    } else if (isMidjourneyModel) {
      // Midjourney 有自己的尺寸系统，使用aspect_ratio
      adjustedSize = iconSize; // 保持原尺寸，后续转换为aspect_ratio
    }
    
    // 构建请求体 - 根据不同模型调整格式
    let requestBody: any = {};

    if (isMidjourneyModel && isSSOpenAPI) {
      // Midjourney 专用格式
      requestBody = {
        prompt: prompt,
        aspect_ratio: this.getSizeToAspectRatio(adjustedSize),
        version: '6.1',
        mode: 'fast'
      };
    } else if (isIdeogramModel && isSSOpenAPI) {
      // Ideogram 专用格式
      requestBody = {
        image_request: {
          model: imageModel === 'ideogram-v3' ? 'V_3_0' : 'V_2_TURBO',
          prompt: prompt,
          aspect_ratio: this.getSizeToAspectRatio(adjustedSize),
          magic_prompt_option: 'AUTO'
        }
      };
    } else if ((isStableDiffusionModel || isRecraftModel) && isSSOpenAPI) {
      // Replicate 格式 (Stable Diffusion, Recraft)
      const modelVersion = this.getReplicateModelVersion(imageModel);
      requestBody = {
        version: modelVersion,
        input: {
          prompt: prompt,
          width: parseInt(adjustedSize.split('x')[0]),
          height: parseInt(adjustedSize.split('x')[1]),
          num_outputs: 1
        }
      };
    } else if (isDoubaoModel && isSSOpenAPI) {
      // 豆包专用格式
      requestBody = {
        model: imageModel,
        prompt: prompt,
        size: adjustedSize,
        n: 1
      };
    } else {
      // 标准 OpenAI 格式 (DALL-E, GPT-Image, Flux)
      requestBody = {
        model: imageModel,
        prompt: prompt,
        n: 1
      };

      // 根据模型类型设置特定参数
      if (isFluxModel) {
        // Flux 模型使用 aspect_ratio 而不是 size (特别是 ssopen.top API)
        if (isSSOpenAPI) {
          // ssopen.top 的 Flux API 要求使用 aspect_ratio（必需参数）
          requestBody.aspect_ratio = this.getSizeToAspectRatio(adjustedSize);
          // 不添加 size 参数
        } else {
          // 其他 API 可能使用 size
          requestBody.size = adjustedSize;
          requestBody.num_outputs = 1;
          if (imageModel === 'flux-pro') {
            requestBody.aspect_ratio = this.getSizeToAspectRatio(adjustedSize);
          }
        }
      } else if (isDalleModel) {
        // DALL-E 特有参数
        requestBody.size = adjustedSize;
        if (!isSSOpenAPI) {
          requestBody.response_format = 'url';
        }
        if (imageModel === 'dall-e-3') {
          requestBody.quality = 'standard';
          requestBody.style = 'natural';
        }
      } else if (isGPTImageModel) {
        // GPT-Image 特有参数
        requestBody.size = adjustedSize;
        requestBody.quality = 'standard';
        if (!isSSOpenAPI) {
          requestBody.response_format = 'url';
        }
      } else {
        // 默认添加 size 参数
        requestBody.size = adjustedSize;
      }
    }

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    };

    try {
      console.log(`调用图片生成API: ${imageApiUrl}`);
      console.log('请求体:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(imageApiUrl, requestOptions);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errorData: any = {};
        
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        throw new Error(`第三方API调用失败: ${response.status} - ${errorData.error?.message || errorData.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('API响应数据:', data);
      
      // 处理不同模型的响应格式
      if (isMidjourneyModel && isSSOpenAPI) {
        // Midjourney 响应格式
        if (data.task_id) {
          // 异步任务，需要轮询结果
          return await this.pollMidjourneyTask(data.task_id, imageApiUrl.replace('/submit/imagine', '/fetch'));
        } else if (data.image_url) {
          return data.image_url;
        }
      } else if (isIdeogramModel && isSSOpenAPI) {
        // Ideogram 响应格式
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const result = data.data[0];
          if (result.url) {
            return result.url;
          }
        }
      } else if ((isStableDiffusionModel || isRecraftModel) && isSSOpenAPI) {
        // Replicate 响应格式
        if (data.id) {
          // 异步任务，需要轮询结果
          return await this.pollReplicateTask(data.id, imageApiUrl);
        } else if (data.output && Array.isArray(data.output) && data.output.length > 0) {
          return data.output[0];
        }
      } else if (isDoubaoModel && isSSOpenAPI) {
        // 豆包响应格式
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const result = data.data[0];
          if (result.url) {
            return result.url;
          } else if (result.b64_json) {
            return `data:image/png;base64,${result.b64_json}`;
          }
        }
      }
      
      // 处理302.AI的异步任务响应
      if (data.id && !data.data) {
        // 这是一个异步任务，需要轮询结果
        return await this.pollTaskResult(data.id);
      }
      
      // 处理标准 OpenAI 格式响应 (DALL-E, GPT-Image, Flux)
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        console.log('检查data.data[0]结构:', data.data[0]);
        const firstResult = data.data[0];
        
        // 处理URL格式响应
        if (firstResult && firstResult.url) {
          console.log('使用标准URL格式响应:', firstResult.url);
          return firstResult.url;
        }
        
        // 处理base64格式响应
        if (firstResult && firstResult.b64_json) {
          console.log('收到base64格式响应，转换为data URL');
          const base64Data = firstResult.b64_json;
          const dataUrl = `data:image/png;base64,${base64Data}`;
          return dataUrl;
        }
        
        // 处理直接字符串URL (某些API可能直接返回URL字符串)
        if (typeof firstResult === 'string' && (firstResult.startsWith('http') || firstResult.startsWith('data:'))) {
          console.log('data.data[0]是直接URL字符串:', firstResult);
          return firstResult;
        }
      }
      
      // 处理Flux模型的响应格式
      if (isFluxModel) {
        // Flux模型可能返回不同的格式
        if (data.output && Array.isArray(data.output) && data.output[0]) {
          console.log('使用Flux output数组格式:', data.output[0]);
          return data.output[0];
        } else if (data.images && Array.isArray(data.images) && data.images[0]) {
          console.log('使用Flux images数组格式:', data.images[0]);
          return data.images[0];
        } else if (data.url) {
          console.log('使用Flux直接url字段:', data.url);
          return data.url;
        } else if (data.output && typeof data.output === 'string' && (data.output.startsWith('http') || data.output.startsWith('data:'))) {
          console.log('使用Flux output字符串格式:', data.output);
          return data.output;
        } else if (data.image_url) {
          console.log('使用Flux image_url字段:', data.image_url);
          return data.image_url;
        }
      }
      
      // 处理其他可能的响应格式
      if (data.output && typeof data.output === 'string' && (data.output.startsWith('http') || data.output.startsWith('data:'))) {
        console.log('使用通用output字符串格式:', data.output);
        return data.output;
      }
      
      // 处理直接URL响应
      if (data.url && typeof data.url === 'string' && (data.url.startsWith('http') || data.url.startsWith('data:'))) {
        console.log('使用通用url字段:', data.url);
        return data.url;
      }
      
      // 处理image_url字段
      if (data.image_url && typeof data.image_url === 'string' && (data.image_url.startsWith('http') || data.image_url.startsWith('data:'))) {
        console.log('使用通用image_url字段:', data.image_url);
        return data.image_url;
      }
      
      console.warn('未知的API响应格式:', data);
      console.warn('响应数据完整结构:', JSON.stringify(data, null, 2));
      throw new Error(`第三方API返回的数据格式不正确。响应数据: ${JSON.stringify(data).substring(0, 500)}`);
      
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('网络请求失败，请检查第三方API地址是否正确');
      }
      throw error;
    }
  }

  /**
   * 轮询任务结果（用于302.AI等异步API）
   */
  private async pollTaskResult(taskId: string, maxAttempts: number = 30): Promise<string> {
    const apiConfig = this.getAPIConfig();
    const apiKey = apiConfig.apiKey;
    const customApiUrl = apiConfig.apiUrl;
    
    // 构建查询URL - 适配不同的API服务
    let fetchUrl: string;
    
    if (customApiUrl.includes('302.ai')) {
      // 302.AI 格式
      const baseUrl = customApiUrl.replace(/\/v1\/.*$/, ''); // 移除v1及之后的路径
      fetchUrl = `${baseUrl}/302/task/${taskId}/fetch`;
    } else {
      // 通用格式，假设有类似的任务查询端点
      const baseUrl = customApiUrl.replace(/\/[^/]*$/, ''); // 移除最后一个路径段
      fetchUrl = `${baseUrl}/task/${taskId}`;
    }
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
        
        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });

        if (!response.ok) {
          throw new Error(`查询任务状态失败: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status === 'completed' && result.output) {
          return result.output;
        } else if (result.status === 'failed') {
          throw new Error(`任务失败: ${result.error || 'Unknown error'}`);
        }
        
        // 任务还在进行中，继续等待
        console.log(`图标生成任务进行中... (${attempt + 1}/${maxAttempts})`);
        
      } catch (error: any) {
        if (attempt === maxAttempts - 1) {
          throw new Error(`轮询任务结果失败: ${error.message}`);
        }
      }
    }
    
    throw new Error('任务超时，请稍后重试');
  }

  /**
   * 下载并保存图标
   */
  private async downloadAndSaveIcon(imageUrl: string, options: IconGenerationOptions, prompt: string): Promise<GeneratedIcon> {
    // 生成文件名
    const timestamp = Date.now();
    const sanitizedName = options.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const filename = `${options.type}_${sanitizedName}_${timestamp}.png`;
    
    // 下载图片
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }

    const imageBlob = await response.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // 保存到FVTT数据目录
    const relativePath = `${this.iconDirectory}/${filename}`;
    const fullPath = await this.saveToDataDirectory(relativePath, imageBuffer);

    return {
      filename: filename,
      path: fullPath,
      url: `/${relativePath}`,
      prompt: prompt
    };
  }

  /**
   * 下载并保存怪物图标
   */
  private async downloadAndSaveMonsterIcon(imageUrl: string, name: string, prompt: string): Promise<GeneratedIcon> {
    // 生成文件名
    const timestamp = Date.now();
    const sanitizedName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const filename = `monster_${sanitizedName}_${timestamp}.png`;
    
    // 下载图片
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }

    const imageBlob = await response.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // 保存到pf2e-tokens目录
    const relativePath = `pf2e-tokens/${filename}`;
    const fullPath = await this.saveToDataDirectory(relativePath, imageBuffer);

    return {
      filename: filename,
      path: fullPath,
      url: `/${relativePath}`,
      prompt: prompt
    };
  }

  /**
   * 确保图标目录存在
   */
  private async ensureIconDirectory(): Promise<void> {
    try {
      // 使用Foundry VTT的文件API检查目录是否存在
      const source = 'data';
      const path = this.iconDirectory;
      
      // 尝试浏览目录，如果不存在会抛出异常
      try {
        await (FilePicker as any).browse(source, path);
      } catch (error) {
        // 目录不存在，创建它
        await (FilePicker as any).createDirectory(source, path);
        console.log(`Created icon directory: ${path}`);
      }
    } catch (error: any) {
      console.error('Failed to ensure icon directory:', error);
      throw new Error(`无法创建图标目录: ${error.message}`);
    }
  }

  /**
   * 确保自定义目录存在
   */
  private async ensureCustomDirectory(directoryName: string): Promise<void> {
    try {
      const source = 'data';
      
      // 尝试浏览目录，如果不存在会抛出异常
      try {
        await (FilePicker as any).browse(source, directoryName);
      } catch (error) {
        // 目录不存在，创建它
        await (FilePicker as any).createDirectory(source, directoryName);
        console.log(`Created custom directory: ${directoryName}`);
      }
    } catch (error: any) {
      console.error('Failed to ensure custom directory:', error);
      throw new Error(`无法创建目录: ${error.message}`);
    }
  }

  /**
   * 保存文件到数据目录
   */
  private async saveToDataDirectory(relativePath: string, buffer: ArrayBuffer): Promise<string> {
    try {
      // 创建File对象
      const file = new File([buffer], relativePath.split('/').pop() || 'icon.png', {
        type: 'image/png'
      });

      // 使用Foundry VTT的文件API上传
      const response = await (FilePicker as any).upload('data', this.iconDirectory, file);
      
      if (response && response.path) {
        return response.path;
      } else {
        throw new Error('文件上传返回的路径为空');
      }
    } catch (error: any) {
      console.error('Failed to save icon to data directory:', error);
      throw new Error(`保存图标文件失败: ${error.message}`);
    }
  }

  /**
   * 获取默认图标路径
   */
  public getDefaultIcon(type: 'monster' | 'item' | 'spell' | 'npc'): string {
    const defaultIcons: Record<string, string> = {
      'monster': 'icons/svg/mystery-man.svg',
      'item': 'icons/svg/sword.svg',
      'spell': 'icons/svg/aura.svg',
      'npc': 'icons/svg/actor.svg'
    };
    return defaultIcons[type] || 'icons/svg/mystery-man.svg';
  }

  /**
   * 将尺寸转换为宽高比（用于Flux模型）
   */
  private getSizeToAspectRatio(size: string): string {
    const aspectRatios: Record<string, string> = {
      '256x256': '1:1',
      '512x512': '1:1',
      '768x768': '1:1',
      '1024x1024': '1:1',
      '1024x768': '4:3',
      '768x1024': '3:4',
      '1024x1792': '9:16',
      '1792x1024': '16:9'
    };
    return aspectRatios[size] || '1:1';
  }

  /**
   * 清理旧图标（可选功能）
   */
  public async cleanupOldIcons(daysOld: number = 30): Promise<void> {
    try {
      const source = 'data';
      const path = this.iconDirectory;
      
      const browse = await (FilePicker as any).browse(source, path);
      const files = browse.files || [];
      
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      
      for (const filePath of files) {
        try {
          // 从文件名中提取时间戳
          const filename = filePath.split('/').pop() || '';
          const timestampMatch = filename.match(/_(\d+)\.png$/);
          
          if (timestampMatch) {
            const timestamp = parseInt(timestampMatch[1]);
            if (timestamp < cutoffTime) {
              // 删除旧文件
              await (FilePicker as any).delete('data', filePath);
              console.log(`Deleted old icon: ${filename}`);
            }
          }
        } catch (error) {
          console.warn(`Failed to process file ${filePath}:`, error);
        }
      }
    } catch (error: any) {
      console.warn('Failed to cleanup old icons:', error);
    }
  }


  /**
   * 获取 Replicate 模型版本
   */
  private getReplicateModelVersion(imageModel: string): string {
    const modelVersions: { [key: string]: string } = {
      'stable-diffusion-xl': 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      'stable-diffusion-3': 'stability-ai/stable-diffusion-3:527d2a6296facb8e47ba1eaf17f142c240c19a30894f437feee9b91cc29d8e4f',
      'recraft-v3': 'recraft-ai/recraft-v3:c7b6c2d5e8e7f8b9a0c1d2e3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4'
    };
    
    return modelVersions[imageModel] || modelVersions['stable-diffusion-xl'];
  }

  /**
   * 轮询 Midjourney 任务结果
   */
  private async pollMidjourneyTask(taskId: string, fetchUrl: string, maxAttempts: number = 30): Promise<string> {
    const apiConfig = this.getAPIConfig();
    const apiKey = apiConfig.apiKey;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${fetchUrl}/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'SUCCESS' && data.image_url) {
            return data.image_url;
          } else if (data.status === 'FAILED') {
            throw new Error('Midjourney 任务失败');
          }
        }
        
        // 等待5秒后重试
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.warn(`Midjourney 轮询尝试 ${attempt + 1} 失败:`, error);
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    throw new Error('Midjourney 任务超时');
  }

  /**
   * 轮询 Replicate 任务结果
   */
  private async pollReplicateTask(taskId: string, baseUrl: string, maxAttempts: number = 30): Promise<string> {
    const apiConfig = this.getAPIConfig();
    const apiKey = apiConfig.apiKey;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'succeeded' && data.output && Array.isArray(data.output) && data.output.length > 0) {
            return data.output[0];
          } else if (data.status === 'failed') {
            throw new Error('Replicate 任务失败');
          }
        }
        
        // 等待3秒后重试
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.warn(`Replicate 轮询尝试 ${attempt + 1} 失败:`, error);
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    throw new Error('Replicate 任务超时');
  }
}

// 声明FilePicker类型
declare class FilePicker {
  static browse(source: string, path: string): Promise<any>;
  static createDirectory(source: string, path: string): Promise<any>;
  static upload(source: string, path: string, file: File): Promise<any>;
  static delete(source: string, path: string): Promise<any>;
}