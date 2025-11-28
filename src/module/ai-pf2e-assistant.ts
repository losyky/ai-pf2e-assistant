import { MODULE_ID } from './constants';
import { Logger } from './utils/logger';
import { AIGeneratorApp } from './ui/ai-generator-app';
import { ItemGeneratorApp } from './ui/item-generator-app';
import { PF2eExplorerApp } from './ui/pf2e-explorer-app';
import { FeatureGeneratorApp } from './ui/feature-generator-app';
import { FeatGeneratorApp } from './ui/feat-generator-app';
import { FragmentGeneratorApp } from './ui/fragment-generator-app';
import { FeatSynthesisApp } from './ui/feat-synthesis-app';
import { ShrineSynthesisApp } from './ui/shrine-synthesis-app';
import { ShrinePointManager } from './applications/shrine-point-manager';
import { balanceKeywordsManager } from './ui/balance-keywords-manager';
import { terminologyImporter } from './ui/terminology-importer';
import { IconGenerationService } from './services/icon-generation-service';
import { PF2eMechanicsKnowledgeService } from './services/pf2e-mechanics-knowledge';
// 不直接导入game对象，而是在需要时使用全局访问
// import { Hooks, ui, game } from '../foundry-imports';
import { Hooks, ui } from '../foundry-imports';
import { terminologyTranslator } from './pf2e-terminology';
// 删除错误的导入
// import { Dialog } from '@arccore/dialog';

// 声明Foundry VTT特定的类型
declare class FormApplication {
  static get defaultOptions(): any;
  constructor(object?: any, options?: any);
  getData(options?: any): any;
  _updateObject(event: Event, formData: any): Promise<void>;
  activateListeners(html: JQuery): void;
  close(): Promise<void>;
  element: JQuery;
  render(force?: boolean, options?: any): this;
}

// 添加Dialog类型声明
declare class Dialog extends FormApplication {
  constructor(data: any, options?: any);
  render(force?: boolean, options?: any): any;
  static confirm(options: any): Promise<boolean>;
  static prompt(options: any): Promise<string>;
}

// 添加Handlebars声明
declare const Handlebars: any;

// 添加JQuery接口声明
declare interface JQuery {
  find(selector: string): JQuery;
  empty(): JQuery;
  append(content: string): JQuery;
  prepend(content: string): JQuery;
  text(text?: string): JQuery;
  prop(name: string, value?: any): JQuery;
  click(handler: Function): JQuery;
  show(): JQuery;
  hide(): JQuery;
  length: number;
}

// 辅助函数：安全访问game对象
function getGame(): any {
  // @ts-ignore - 全局访问
  return window.game || null;
}

// 辅助函数：合并对象
function mergeObject(original: any, other: any): any {
  // 获取Foundry的mergeObject函数
  // @ts-ignore
  return foundry?.utils?.mergeObject ? foundry.utils.mergeObject(original, other) : { ...original, ...other };
}

// 尝试导入默认 API 密钥，如果文件不存在则使用空字符串
let DEFAULT_API_KEY = '';
try {
  // 这个 require 是在运行时调用的，所以如果文件不存在，会抛出异常
  const config = require('./config');
  DEFAULT_API_KEY = config.DEFAULT_API_KEY || '';
} catch (e) {
  // 配置文件不存在是正常情况，不需要输出日志
}

// 默认 AI API 接口地址（OpenAI 兼容格式）
// 注意：这是默认值，用户应该在模块设置中配置自己的 API 地址
const API_URL = 'https://api.openai.com/v1/chat/completions';

// 支持的 AI 模型
enum AIModel {
  GPT35Turbo = 'gpt-3.5-turbo',
  GPT4omini = 'gpt-4o-mini-ca',
  GPT4o = 'gpt-4o-ca',
  deepseekv3 = 'deepseek-v3',
  deepseekr1 = 'deepseek-r1',
  Claude35Sonnet = 'claude-3-5-sonnet-20241022',
  Claude37Sonnet = 'claude-3-7-sonnet-20250219'
}

// 内容生成类型
enum ContentType {
  Monster = 'monster',
  Item = 'item',
  Spell = 'spell',
  NPC = 'npc',
  Encounter = 'encounter'
}

// 消息接口
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Function Call 相关接口定义
interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    items?: any;
  };
}

// 新的 Tools 格式接口定义
interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

interface FunctionCall {
  name: string;
  arguments: string; // JSON string
}

interface FunctionCallMessage extends Message {
  function_call?: FunctionCall;
}

interface FunctionCallChoice {
  index: number;
  message: FunctionCallMessage;
  finish_reason: string;
}

// 新的工具调用响应接口
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolCallMessage extends Message {
  tool_calls?: ToolCall[];
}

interface ToolCallChoice {
  index: number;
  message: ToolCallMessage;
  finish_reason: string;
}

// 卡片数据修改相关接口
interface DataChange {
  path: string;
  value: any;
  operation: 'set' | 'add' | 'remove';
}

interface DocumentModification {
  changes: DataChange[];
  reason: string;
}

// Claude的工具定义格式（不同于OpenAI）
interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

// API 请求参数接口
interface ApiRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  // 新的 tools 格式（OpenAI 推荐）
  tools?: ToolDefinition[] | ClaudeToolDefinition[] | any[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } } | { type: 'auto' | 'any' | 'tool'; name?: string };
  // 保留旧的 functions 格式以向后兼容
  functions?: FunctionDefinition[];
  function_call?: 'auto' | 'none' | { name: string };
}

// API 响应接口 - 支持两种格式
interface ApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: (FunctionCallChoice | ToolCallChoice)[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AIPF2eAssistant {
  private apiKey: string = '';
  private defaultModel: string = AIModel.GPT35Turbo;
  private initialized: boolean = false;
  // 当前处理的文档和应用实例引用
  private currentDocument: any = null;
  private currentApp: any = null;
  // 图标生成服务
  public iconGeneratorService: IconGenerationService;
  // 图标生成中的物品ID集合，用于防止重复点击
  private generatingIconItemIds: Set<string> = new Set();

  constructor() {
    // 构造函数只设置默认值，不访问game对象
    this.apiKey = DEFAULT_API_KEY;
    // 初始化图标生成服务
    this.iconGeneratorService = IconGenerationService.getInstance();
  }
  
  /**
   * 初始化设置
   * 应该在Foundry完全初始化后调用
   */
  init(): void {
    if (this.initialized) return;
    
    const game = getGame();
    if (!game) {
      console.error(`${MODULE_ID} | 初始化失败: game对象不可用`);
      return;
    }
    
    // 从设置中获取API密钥
    if (game.settings && typeof game.settings.get === 'function') {
      try {
        const savedApiKey = game.settings.get(MODULE_ID, 'apiKey') as string;
        if (savedApiKey) {
          this.apiKey = savedApiKey;
        }
      } catch (e) {
        console.error(`${MODULE_ID} | 获取API密钥设置失败:`, e);
      }
    }
    
    // 注册为角色和物品表单添加标题栏按钮的钩子
    this.registerHeaderButtons();
    
    // 注册场景控制栏按钮
    this.registerSceneControlButtons();
    
    // 注册渲染钩子，确保每次渲染表单时添加按钮
    this.registerRenderHooks();
    
    // 添加测试功能到全局窗口对象，便于调试
    this.exposeTestFunction();
    
    this.initialized = true;
    Logger.debug('助手初始化完成');
  }

  /**
   * 初始化设置（不包括Scene Control按钮）
   * 用于在ready钩子中调用，Scene Control按钮已在setup钩子中注册
   */
  initWithoutSceneControls(): void {
    if (this.initialized) return;
    
    const game = getGame();
    if (!game) {
      Logger.error('初始化失败: game对象不可用');
      return;
    }
    
    // 从设置中获取API密钥
    if (game.settings && typeof game.settings.get === 'function') {
      try {
        const savedApiKey = game.settings.get(MODULE_ID, 'apiKey') as string;
        if (savedApiKey) {
          this.apiKey = savedApiKey;
        }
      } catch (e) {
        Logger.error('获取API密钥设置失败:', e);
      }
    }
    
    // 注册为角色和物品表单添加标题栏按钮的钩子
    this.registerHeaderButtons();
    
    // 注册渲染钩子，确保每次渲染表单时添加按钮
    this.registerRenderHooks();
    
    // 添加测试功能到全局窗口对象，便于调试
    this.exposeTestFunction();
    
    this.initialized = true;
    Logger.debug('助手初始化完成');
  }

  /**
   * 将测试函数暴露到全局窗口对象，方便通过控制台调用
   */
  private exposeTestFunction(): void {
    // @ts-ignore - 全局访问
    window.testAIConnection = async () => {
      Logger.debug('从控制台调用测试函数');
      try {
        const result = await this.testApiConnection();
        return result;
      } catch (error) {
        Logger.error('控制台测试失败:', error);
        return { success: false, message: String(error) };
      }
    };
    
    // 在控制台输出使用方法（仅调试模式）
    Logger.debug('%cAI测试功能已启用', 'color: #4361ee; font-weight: bold; font-size: 12px;');
    Logger.debug('%c在控制台输入 testAIConnection() 开始测试API连接', 'color: #2a9d8f; font-style: italic;');
    Logger.debug('%c也可以在右上角"模块设置 > 测试连接"中进行测试', 'color: #2a9d8f; font-style: italic;');
    
  }

  /**
   * 注册为应用程序添加标题栏按钮的钩子
   * 主要针对角色和物品表单
   */
  private registerHeaderButtons(): void {
    // 使用Hooks.on注册getApplicationHeaderButtons钩子
    Hooks.on('getApplicationHeaderButtons', (app: any, buttons: any[]) => {
      try {
        // 检查应用程序类型，只为角色和物品表单添加按钮
        const isActor = app.document?.documentName === 'Actor' || 
                        app.actor?.documentName === 'Actor' || 
                        app.constructor?.name?.includes('ActorSheet');
                        
        const isItem = app.document?.documentName === 'Item' || 
                      app.item?.documentName === 'Item' || 
                      app.constructor?.name?.includes('ItemSheet');
        
        if (isActor) {
          Logger.debug('为角色表单添加按钮:', app.constructor?.name);
          
          // AI助手按钮（只显示图标）
          buttons.unshift({
            label: '',
            class: 'ai-pf2e-button',
            icon: 'fas fa-robot',
            onclick: () => this.handleAIButtonClick(app),
            title: 'AI助手'
          });
        }
        
        if (isItem) {
          Logger.debug('为物品表单添加按钮:', app.constructor?.name);
          
          // 规则元素配置按钮（替代原AI助手按钮）
          buttons.unshift({
            label: '',
            class: 'ai-pf2e-rule-button',
            icon: 'fas fa-wand-magic-sparkles',
            onclick: () => this.handleRuleElementButtonClick(app),
            title: '规则元素配置'
          });
          
          // AI图标生成按钮（保持不变）
          buttons.unshift({
            label: '',
            class: 'ai-pf2e-icon-button',
            icon: 'fas fa-image',
            onclick: () => this.handleIconGenerationButtonClick(app),
            title: 'AI图标生成'
          });
        }
      } catch (error) {
        console.error(`${MODULE_ID} | 添加标题栏按钮时出错:`, error);
      }
    });
  }
  
  /**
   * 注册场景控制栏按钮
   */
  public   registerSceneControlButtons(): void {
    Hooks.on('getSceneControlButtons', (controls: any) => {
      Logger.debug('注册场景控制按钮，controls类型:', typeof controls);
      
      // 安全地检查controls参数
      if (!controls) {
        Logger.debug('controls参数为空');
        return;
      }
      

      
      // 尝试不同的访问方式
      let controlsArray = null;
      
      if (Array.isArray(controls)) {
        controlsArray = controls;
        Logger.debug('controls是数组，长度:', controls.length);
      } else if (controls && typeof controls === 'object') {
        // 检查是否是控制组对象（v13的新结构）
        const controlKeys = Object.keys(controls);
        Logger.debug('controls的键:', controlKeys);
        
        // 查找token控制组
        if (controls.tokens && controls.tokens.tools) {
          Logger.debug('找到token控制组，直接添加工具');
          this.addToolsToTokenControl(controls.tokens);
          return;
        }
        
        // 尝试访问可能的数组属性
        if (controls.controls && Array.isArray(controls.controls)) {
          controlsArray = controls.controls;
          Logger.debug('找到controls.controls数组，长度:', controlsArray.length);
        } else if (controls.tools && Array.isArray(controls.tools)) {
          controlsArray = controls.tools;
          Logger.debug('找到controls.tools数组，长度:', controlsArray.length);
        } else {
          // 尝试遍历对象的所有属性
          for (const key in controls) {
            if (Array.isArray(controls[key])) {
              Logger.debug('找到数组属性 ' + key + '，长度:', controls[key].length);
              controlsArray = controls[key];
              break;
            }
          }
        }
      }
      
      if (controlsArray) {
        this.addToolsToControls(controlsArray);
      } else {
        Logger.debug('无法找到有效的控制组数组');
      }
    });
  }
  
  /**
   * 向Token控制组添加工具（v13新结构）
   */
  private addToolsToTokenControl(tokenControl: any): void {
    Logger.debug('向Token控制组添加工具');
    
    // 检查当前用户是否为GM
    const game = getGame();
    if (!game || !game.user || !game.user.isGM) {
      Logger.debug('非GM用户，跳过添加AI工具按钮');
      return;
    }
    
    Logger.debug('GM用户 - 向Token控制组添加工具');
    
    // 确保tools对象存在
    if (!tokenControl.tools) {
      tokenControl.tools = {};
      Logger.debug('创建了新的tools对象');
    }
    
    // 检查是否已经添加过按钮（避免重复添加）
    if (tokenControl.tools['ai-pf2e-item-generator']) {
      Logger.debug('AI工具按钮已存在，跳过添加');
      return;
    }
    
    // 添加AI工具
    const aiTools = {
      'ai-pf2e-item-generator': {
        name: 'ai-pf2e-item-generator',
        title: game.i18n.localize('AIPF2E.tools.itemGenerator'),
        icon: 'fas fa-magic',
        button: true,
        visible: true,
        onClick: () => {
          console.log(`${MODULE_ID} | 物品生成器按钮被点击`);
          this.openItemGenerator();
        }
      },
      'ai-feat-generator': {
        name: 'ai-feat-generator',
        title: game.i18n.localize('AIPF2E.tools.featGenerator'),
        icon: 'fas fa-medal',
        button: true,
        visible: true,
        onClick: () => {
          console.log(`${MODULE_ID} | 专长生成器按钮被点击`);
          this.openFeatGenerator();
        }
      },
      'ai-fragment-generator': {
        name: 'ai-fragment-generator',
        title: game.i18n.localize('AIPF2E.tools.fragmentGenerator'),
        icon: 'fas fa-puzzle-piece',
        button: true,
        visible: true,
        onClick: () => {
          console.log(`${MODULE_ID} | 词条碎片生成器按钮被点击`);
          this.openFragmentGenerator();
        }
      }
    };
    
    // 添加所有工具
    Object.assign(tokenControl.tools, aiTools);
    
    console.log(`${MODULE_ID} | 成功添加${Object.keys(aiTools).length}个AI工具按钮`);
  }

  /**
   * 向控制组添加工具（旧版本兼容）
   */
  private addToolsToControls(controls: any[]): void {
    const game = getGame();
    if (!game || !game.user || !game.user.isGM) {
      console.log(`${MODULE_ID} | 非GM用户，跳过添加AI工具按钮`);
      return;
    }
    
    console.log(`${MODULE_ID} | GM用户 - 添加AI工具按钮`);
    
    try {
      console.log(`${MODULE_ID} | 可用的控制组:`, controls.map(c => c.name));
    } catch (e) {
      console.log(`${MODULE_ID} | 无法获取控制组名称:`, e);
      return;
    }
    
    const tokenControl = controls.find((c: any) => c.name === 'token');
    if (tokenControl) {
      console.log(`${MODULE_ID} | 找到token控制组，当前工具数量:`, tokenControl.tools ? tokenControl.tools.length : 'undefined');
      
      if (!tokenControl.tools) {
        tokenControl.tools = [];
        console.log(`${MODULE_ID} | 创建了新的tools数组`);
      }
      
      const existingTool = tokenControl.tools.find((t: any) => t.name === 'ai-pf2e-item-generator');
      if (existingTool) {
        console.log(`${MODULE_ID} | AI工具按钮已存在，跳过添加`);
        return;
      }
      
      const aiTools = [
        {
          name: 'ai-pf2e-item-generator',
          title: game.i18n.localize('AIPF2E.tools.itemGenerator'),
          icon: 'fas fa-magic',
          button: true,
          visible: true,
          onClick: () => {
            console.log(`${MODULE_ID} | 物品生成器按钮被点击`);
            this.openItemGenerator();
          }
        },
        {
          name: 'ai-feat-generator',
          title: game.i18n.localize('AIPF2E.tools.featGenerator'),
          icon: 'fas fa-medal',
          button: true,
          visible: true,
          onClick: () => {
            console.log(`${MODULE_ID} | 专长生成器按钮被点击`);
            this.openFeatGenerator();
          }
        },
        {
          name: 'ai-fragment-generator',
          title: game.i18n.localize('AIPF2E.tools.fragmentGenerator'),
          icon: 'fas fa-puzzle-piece',
          button: true,
          visible: true,
          onClick: () => {
            console.log(`${MODULE_ID} | 词条碎片生成器按钮被点击`);
            this.openFragmentGenerator();
          }
        },
        {
          name: 'shrine-point-manager',
          title: game.i18n.localize('AIPF2E.tools.shrineManager'),
          icon: 'fas fa-coins',
          button: true,
          visible: true,
          onClick: () => {
            console.log(`${MODULE_ID} | 神龛点数管理器按钮被点击`);
            this.openShrinePointManager();
          }
        }
      ];
      
      aiTools.forEach(tool => tokenControl.tools.push(tool));
      console.log(`${MODULE_ID} | 成功添加${aiTools.length}个AI工具按钮，新的工具总数:`, tokenControl.tools.length);
    } else {
      console.log(`${MODULE_ID} | 未找到token控制组`);
    }
  }

  /**
   * 注册渲染钩子
   * 将AI按钮添加到各种应用的表单中
   */
  private registerRenderHooks(): void {
    console.log(`${MODULE_ID} | 注册渲染钩子`);
    
    // 注册Actor表单
    Hooks.on('renderActorSheet', (app: any, html: any, data: any) => {
      // 忽略快速访问窗口
      if (app?.actor?.isToken && !app?.token?.isLinked) return;
      this.addButtonToSheet(app, html);
      
      // 如果是角色表单，添加专长合成按钮、法术合成按钮和物品合成按钮
      if (app.actor?.type === 'character') {
        this.addFeatSynthesisButton(app, html);
        this.addSpellSynthesisButton(app, html);
        this.addEquipmentSynthesisButton(app, html);
      }
    });
    
    // 注册Item表单
    Hooks.on('renderItemSheet', (app: any, html: any, data: any) => {
      this.addButtonToSheet(app, html);
    });
    
    // 注册Journal表单
    Hooks.on('renderJournalSheet', (app: any, html: any, data: any) => {
      this.addJournalTranslationButton(app, html);
    });
    
    // 注册Journal页面表单
    Hooks.on('renderJournalPageSheet', (app: any, html: any, data: any) => {
      this.addJournalPageTranslationButton(app, html);
    });

    // 注册Journal页面内容渲染
    Hooks.on('renderJournalTextPageSheet', (app: any, html: any, data: any) => {
      this.addJournalPageTranslationButton(app, html);
    });

    // 注册Journal页面标题渲染
    Hooks.on('renderJournalEntryPage', (app: any, html: any, data: any) => {
      this.addJournalPageTranslationButton(app, html);
    });
    
    console.log(`${MODULE_ID} | 渲染钩子注册完成`);
  }

  /**
   * 为角色表单的专长分页添加合成按钮
   * @param app 角色表单应用
   * @param html JQuery对象
   */
  private addFeatSynthesisButton(app: any, html: any): void {
    try {
      Logger.debug('为角色表单添加专长合成按钮', app.actor?.name);
      
      // 查找专长分页的控制区域
      const featSections = html.find('.feats-pane .feat-section .controls');
      
      if (featSections.length === 0) {
        Logger.debug('未找到专长控制区域');
        return;
      }

      // 只为"额外专长"分组添加合成按钮
      featSections.each((index: number, element: HTMLElement) => {
        const $ = (window as any).$; // 获取全局jQuery
        const controls = $(element);
        
        // 检查是否已经添加过按钮
        if (controls.find('.feat-synthesis-button').length > 0) {
          return;
        }

        // 查找专长分组，只为bonus分组添加按钮（与PF2e系统的创建专长按钮一致）
        const section = controls.closest('.feat-section');
        const groupId = section.attr('data-group-id');
        
        Logger.debug(`检查专长分组 ${index + 1}: data-group-id="${groupId}"`);
        
        // 只在bonus分组添加按钮（与PF2e系统逻辑一致）
        if (groupId !== 'bonus') {
          Logger.debug(`跳过非bonus分组: ${groupId}`);
          return;
        }

        // 创建专长合成按钮（先使用默认文本）
        const synthesisButton = $(`
          <button type="button" class="feat-synthesis-button" data-tooltip="${game.i18n.localize('ai-pf2e-assistant.buttons.synthesizeFeatTooltip')}">
            <i class="fa-solid fa-fw fa-flask"></i>${game.i18n.localize('ai-pf2e-assistant.buttons.synthesizeFeat')}
          </button>
        `);
        
        // 异步加载主题化的按钮文本
        import('./services/theme-service.js').then((module) => {
          const themeService = module.ThemeService.getInstance();
          const buttonText = themeService.getText('ui.buttons.synthesisButton');
          
          // 更新按钮文本
          synthesisButton.contents().filter(function(this: Node) {
            return this.nodeType === 3; // 文本节点
          }).remove();
          synthesisButton.find('i').after(buttonText);
        }).catch((err) => {
          console.warn(`${MODULE_ID} | 无法加载主题服务，使用默认文本`, err);
        });

        // 添加点击事件
        synthesisButton.on('click', (event: Event) => {
          event.preventDefault();
          Logger.debug('专长合成按钮被点击');
          this.openFeatSynthesis(app.actor);
        });

        // 添加CSS样式
        synthesisButton.css({
          'margin-left': '8px',
          'background': '#6f42c1',
          'color': 'white',
          'border': 'none',
          'border-radius': '3px',
          'padding': '6px 12px',
          'cursor': 'pointer',
          'font-size': '13px'
        });

        // 添加悬停效果
        synthesisButton.on('mouseenter', function(this: HTMLElement) {
          $(this).css('background', '#5a32a3');
        }).on('mouseleave', function(this: HTMLElement) {
          $(this).css('background', '#6f42c1');
        });

        // 创建储存箱按钮
        const storageButton = $(`
          <button type="button" class="feat-storage-button" data-tooltip="${game.i18n.localize('ai-pf2e-assistant.buttons.featStorageTooltip')}">
            <i class="fa-solid fa-fw fa-box-archive"></i>${game.i18n.localize('ai-pf2e-assistant.buttons.storage')}
          </button>
        `);

        // 添加储存箱按钮点击事件
        storageButton.on('click', (event: Event) => {
          event.preventDefault();
          Logger.debug('储存箱按钮被点击');
          this.openFeatStorage(app.actor);
        });

        // 添加储存箱按钮CSS样式
        storageButton.css({
          'margin-left': '8px',
          'background': '#17a2b8',
          'color': 'white',
          'border': 'none',
          'border-radius': '3px',
          'padding': '6px 12px',
          'cursor': 'pointer',
          'font-size': '13px'
        });

        // 添加悬停效果
        storageButton.on('mouseenter', function(this: HTMLElement) {
          $(this).css('background', '#138496');
        }).on('mouseleave', function(this: HTMLElement) {
          $(this).css('background', '#17a2b8');
        });

        // 将按钮添加到控制区域（紧挨着创建专长按钮）
        const createFeatButton = controls.find('button[data-action="create-feat"]');
        if (createFeatButton.length > 0) {
          // 如果找到创建专长按钮，在它后面插入合成按钮
          createFeatButton.after(synthesisButton);
          // 在合成按钮后面插入储存箱按钮
          synthesisButton.after(storageButton);
          Logger.debug('已在创建专长按钮后添加合成按钮和储存箱按钮');
        } else {
          // 如果没找到创建专长按钮，添加到控制区域末尾
          controls.append(synthesisButton);
          controls.append(storageButton);
          Logger.debug('已添加合成按钮和储存箱按钮到控制区域末尾');
        }
      });

    } catch (error) {
      console.error(`${MODULE_ID} | 添加专长合成按钮失败:`, error);
    }
  }

  /**
   * 为角色表单的法术分页添加合成按钮
   * @param app 角色表单应用
   * @param html JQuery对象
   */
  private addSpellSynthesisButton(app: any, html: any): void {
    try {
      Logger.debug('为角色表单添加法术合成按钮', app.actor?.name);
      const $ = (window as any).$;
      
      // 查找所有施法传统条目（spellcasting-entry）
      const spellcastingEntries = html.find('.tab[data-tab="spellcasting"] .spellcasting-entry');
      
      if (spellcastingEntries.length === 0) {
        Logger.debug('未找到施法传统条目');
        return;
      }
      
      Logger.debug(`找到 ${spellcastingEntries.length} 个施法传统条目`);
      
      // 为每个施法传统添加合成按钮
      spellcastingEntries.each((index: number, entry: HTMLElement) => {
        const $entry = $(entry);
        
        // 检查是否已经添加过按钮
        if ($entry.find('.spell-synthesis-button').length > 0) {
          return;
        }
        
        // 尝试获取施法传统信息
        const entryId = $entry.attr('data-container-id') || $entry.attr('data-item-id');
        let tradition = 'arcane'; // 默认奥术
        
        // 尝试从标题中提取传统
        const headerText = $entry.find('.item-name h3').text().toLowerCase();
        if (headerText.includes('divine') || headerText.includes('神术')) {
          tradition = 'divine';
        } else if (headerText.includes('primal') || headerText.includes('原能')) {
          tradition = 'primal';
        } else if (headerText.includes('occult') || headerText.includes('秘法')) {
          tradition = 'occult';
        }
        
        Logger.debug(`施法传统 ${index + 1}: ${tradition}, entryId: ${entryId}`);
        
        // 尝试多种可能的控制按钮位置
        let controls = $entry.find('.item-name .item-controls');
        if (controls.length === 0) {
          controls = $entry.find('.item-controls');
        }
        if (controls.length === 0) {
          controls = $entry.find('header .controls');
        }
        if (controls.length === 0) {
          controls = $entry.find('header');
        }
        if (controls.length === 0) {
          controls = $entry.find('.item-name');
        }
        
        if (controls.length === 0) {
          Logger.debug('未找到任何可添加按钮的位置');
          return;
        }
        
        Logger.debug(`找到控制区域，类名: ${controls.attr('class')}`);
        
        // 创建法术合成按钮（小型图标按钮）
        const synthesisButton = $(`
          <a class="spell-synthesis-button item-control" data-tooltip="使用神龛合成${tradition}法术" data-tradition="${tradition}">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
          </a>
        `);
        
        // 添加点击事件
        synthesisButton.on('click', (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          Logger.debug(`法术合成按钮被点击，施法传统: ${tradition}`);
          // 打开法术合成界面，并传入施法传统
          this.openSpellSynthesis(app.actor, tradition);
        });
        
        // 创建法术储存箱按钮（小型图标按钮）
        const storageButton = $(`
          <a class="spell-storage-button item-control" data-tooltip="${game.i18n.localize('ai-pf2e-assistant.buttons.spellStorageTooltip')}" style="margin-left: 0.25rem;">
            <i class="fa-solid fa-box"></i>
          </a>
        `);
        
        // 添加点击事件 - 只在第一个传统上添加一次
        if (index === 0) {
          storageButton.on('click', (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            Logger.debug('法术储存箱按钮被点击');
            // 打开法术储存箱，切换到法术分页
            this.openItemStorage(app.actor, 'spells');
          });
          
        // 将按钮添加到找到的第一个控制区域
          $(controls[0]).append(synthesisButton).append(storageButton);
        } else {
          // 其他传统只添加合成按钮
        $(controls[0]).append(synthesisButton);
        }
      });
      
      Logger.debug('已为所有施法传统添加合成按钮');

    } catch (error) {
      Logger.error('添加法术合成按钮失败:', error);
    }
  }
  
  /**
   * 为角色表单的物品栏添加合成按钮
   * @param app 角色表单应用
   * @param html JQuery对象
   */
  private addEquipmentSynthesisButton(app: any, html: any): void {
    try {
      Logger.debug('为角色表单添加物品合成按钮', app.actor?.name);
      const $ = (window as any).$;
      
      // 查找物品栏
      const inventoryPane = html.find('.tab[data-tab="inventory"]');
      
      if (inventoryPane.length === 0) {
        Logger.debug('未找到物品栏');
        return;
      }
      
      // 查找"全部财产"那一行（包含 fa-scale-unbalanced 图标）
      // 根据PF2e模板，这是 .wealth 区域中的 h3.item-name
      let wealthRow = inventoryPane.find('.wealth h3.item-name').filter(function(this: HTMLElement) {
        return $(this).find('i.fa-scale-unbalanced').length > 0;
      });
      
      if (wealthRow.length === 0) {
        Logger.debug('未找到全部财产行（fa-scale-unbalanced），尝试备用方案');
        // 备用方案：查找包含"Total Wealth"或"全部财产"文字的h3
        wealthRow = inventoryPane.find('.wealth h3.item-name').filter(function(this: HTMLElement) {
          const text = $(this).text();
          return text.includes('Total Wealth') || text.includes('全部财产');
        });
      }
      
      if (wealthRow.length === 0) {
        Logger.debug('未找到财产行，使用.wealth容器');
        // 如果还是找不到，就使用.wealth容器
        wealthRow = inventoryPane.find('.wealth');
      }
      
      if (wealthRow.length === 0) {
        Logger.debug('所有方法都失败，无法添加按钮');
        return;
      }
      
      Logger.debug(`找到财产元素，标签: ${wealthRow.prop('tagName')}, 类名: ${wealthRow.attr('class')}`);
      
      // 检查是否已经添加过按钮
      if (wealthRow.find('.equipment-synthesis-button').length > 0) {
        Logger.debug('按钮已存在，跳过添加');
        return;
      }
      
      // 创建物品合成按钮（小型图标按钮，类似法术合成按钮）
      const synthesisButton = $(`
        <a class="equipment-synthesis-button item-control" data-tooltip="使用神龛合成魔法物品" style="margin-left: 8px;">
          <i class="fa-solid fa-wand-sparkles"></i>
        </a>
      `);
      
      // 添加点击事件
      synthesisButton.on('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        Logger.debug('物品合成按钮被点击');
        this.openEquipmentSynthesis(app.actor);
      });
      
      // 将按钮添加到找到的元素
      wealthRow.first().append(synthesisButton);
      Logger.debug('已添加物品合成按钮到全部财产行');

    } catch (error) {
      Logger.error('添加物品合成按钮失败:', error);
    }
  }
  
  /**
   * 为Journal页面表单添加AI翻译按钮
   * @param app Journal页面应用
   * @param html JQuery对象
   */
  private addJournalPageTranslationButton(app: any, html: any): void {
    // 检查是否是有效的Journal页面
    if (!app.document || 
        (app.document.documentName !== 'JournalEntryPage' && 
         app.document.documentName !== 'JournalEntry')) return;

    // 查找合适的工具栏位置
    let toolbarElement: Element | null = null;
    const journalWindow = html.closest('.journal-sheet, .journal-entry-page, .journal-page-sheet');
    
    if (!journalWindow.length) return;

    // 尝试不同的工具栏选择器
    const toolbarSelectors = [
      '.window-header .window-title',
      '.journal-header .title',
      '.journal-entry-title',
      '.editor-toolbar'
    ];

    for (const selector of toolbarSelectors) {
      toolbarElement = journalWindow.find(selector)[0];
      if (toolbarElement) break;
    }

    if (!toolbarElement) return;

    // 检查是否已经添加过按钮
    const existingButton = journalWindow.find('.ai-translate-button');
    if (existingButton.length) return; // 按钮已存在，不重复添加

    // 创建新按钮
    const translateButton = document.createElement('a');
    translateButton.className = 'ai-translate-button';
    translateButton.title = 'AI翻译此页面';
    translateButton.style.marginLeft = '5px';
    translateButton.innerHTML = '<i class="fas fa-language"></i>';
    
    // 添加点击事件
    translateButton.addEventListener('click', () => {
      this.handleJournalPageTranslation(app.document);
    });
    
    // 添加按钮到工具栏
    if (toolbarElement.parentNode) {
      toolbarElement.parentNode.insertBefore(translateButton, toolbarElement.nextSibling);
    }

    // 创建MutationObserver监听页面变化
    this.setupJournalButtonObserver(app, journalWindow[0]);
  }
  
  /**
   * 处理Journal页面的AI翻译请求
   * @param page Journal页面对象
   */
  public async handleJournalPageTranslation(page: any): Promise<void> {
    console.log(`${MODULE_ID} | 开始处理Journal页面翻译请求`);
    
    if (!page || page.documentName !== 'JournalEntryPage') {
      if (ui && ui.notifications) {
        ui.notifications.error("只支持Journal页面的翻译");
      }
      return;
    }
    
    // 保存文档引用
    this.currentDocument = page;
    
    // 创建对话框让用户输入翻译要求
    const d = new Dialog({
      title: "AI翻译页面内容",
      content: `
        <form>
          <div class="form-group translation-requirements">
            <label>翻译要求:</label>
            <textarea name="translationRequirements" rows="3" placeholder="请输入具体翻译要求，例如：保持专业术语不翻译，使用中文翻译所有正文内容等..."></textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="useTerminology" checked>
              使用术语表辅助翻译
            </label>
          </div>
        </form>
      `,
      buttons: {
        translate: {
          icon: '<i class="fas fa-language"></i>',
          label: "开始翻译",
          callback: async (html: any) => {
            const translationRequirements = html.find('[name="translationRequirements"]').val();
            const useTerminology = html.find('[name="useTerminology"]').prop('checked');
            
            await this.translateJournalPageWhole(page, translationRequirements, useTerminology);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "取消"
        }
      },
      default: "translate",
      close: () => {}
    });
    
    d.render(true);
  }
  
  /**
   * 翻译Journal单个页面内容 - 原有的分段翻译逻辑
   * @param page Journal页面对象
   * @param translationRequirements 翻译要求
   * @param useTerminology 是否使用术语表
   */
  private async translateJournalPageOriginal(page: any, translationRequirements: string, useTerminology: boolean = false): Promise<void> {
    if (page.type !== 'text' || !page.text?.content) {
      console.log(`${MODULE_ID} | 跳过非文本页面或无内容页面: ${page.name}`);
      return;
    }
    
    console.log(`${MODULE_ID} | 正在处理页面: ${page.name}`);
    
    // 获取页面HTML内容
    const htmlContent = page.text.content;
    
    // 分析HTML结构，提取可翻译的文本内容
    const { textSegments, htmlStructure } = this.analyzeHtmlForTranslation(htmlContent);
    
    if (textSegments.length === 0) {
      console.log(`${MODULE_ID} | 页面没有可翻译的文本内容: ${page.name}`);
      return;
    }
    
    // 显示翻译进度
    if (ui && ui.notifications) {
      ui.notifications.info(`正在翻译页面: ${page.name}`);
    }
    
    // 处理术语表
    let terminologyPrompt = '';
    let terminologyInfo = null;
    
    if (useTerminology) {
      try {
        console.log(`${MODULE_ID} | 正在准备术语表...`);
        
        // 提取所有文本
        const allText = textSegments.join('\n');
        
        // 使用术语转换器获取术语匹配并准备AI输入
        terminologyInfo = terminologyTranslator.prepareForAI(allText);
        
        if (terminologyInfo && terminologyInfo.termMatches.length > 0) {
          console.log(`${MODULE_ID} | 找到 ${terminologyInfo.termMatches.length} 个术语匹配项`);
          
          // 构建术语提示
          terminologyPrompt = `
请特别注意以下游戏专有术语及其中文翻译:

${Object.entries(terminologyInfo.terminology).map(([term, translation]) => `${term} - ${translation}`).join('\n')}

请在翻译中正确使用上述术语的中文翻译。`;
        } else {
          console.log(`${MODULE_ID} | 未找到术语匹配项`);
        }
      } catch (error) {
        console.error(`${MODULE_ID} | 处理术语表时出错:`, error);
        // 出错时不使用术语表，继续翻译
        terminologyPrompt = '';
      }
    }
    
    // 大段文本分批翻译，每批最多20段
    const BATCH_SIZE = 20;
    const batches = [];
    for (let i = 0; i < textSegments.length; i += BATCH_SIZE) {
      batches.push(textSegments.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`${MODULE_ID} | 文本分为 ${batches.length} 批进行翻译，每批最多 ${BATCH_SIZE} 段`);
    
    let allTranslatedSegments: string[] = [];
    let allBatchResponses: string[] = []; // 用于累积所有批次的响应以便最后收集术语
    
    // 检查是否启用自动收集（在循环外检查一次）
    const game = getGame();
    const autoCollectTerms = game?.settings?.get(MODULE_ID, 'autoCollectTerminology') !== false;
    const existingTermsCount = terminologyTranslator.getAllTerms?.()?.length || 0;
    
    // 逐批翻译
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const isLastBatch = batchIndex === batches.length - 1;
      console.log(`${MODULE_ID} | 正在处理第 ${batchIndex + 1}/${batches.length} 批，包含 ${batch.length} 段文本`);
      
      // 只在最后一批时启用术语收集
      const termCollectionPrompt = (autoCollectTerms && isLastBatch) ? `

额外要求：这是最后一批翻译。请识别整篇文档中的**专有名词**（proper nouns），仅包括：
- 人物名称（NPC、角色）
- 地名（城市、地区、位面）
- 组织名称（派系、公会）
- 神祇和传说生物的名字
- 特定的怪物种族名称（如Aboleth，非large这类通用词）
- 专有法术、物品的名称

**不要收集通用词汇**（如：large, medium, red, sword等）

**注意：术语表中已有${existingTermsCount}个术语，请只通过 collect_new_terminology 函数返回术语表中没有的新专有名词。**
${terminologyPrompt ? '上方列出的术语都已经在术语表中，请不要重复返回。' : ''}

如果发现新的专有名词，请调用 collect_new_terminology 函数。
类别：monster(怪物种族), spell(法术), skill(技能), item(物品), place(地名), deity(神祇), organization(组织), character(人物), other(其他)` : '';
      
      // 构建翻译提示
      const systemPrompt = `你是一个专业的翻译助手，精通中英翻译。
请将提供的文本内容翻译成中文，同时考虑以下要求：
1. 保持原文的专业术语含义和格式
2. 不要翻译专有名词、人名、地名等，保留原文
3. 维持原文的段落结构和格式
4. 只翻译提供的文本内容，不要添加额外解释
5. 确保翻译通顺、准确、符合中文表达习惯

${translationRequirements ? `用户特别要求: ${translationRequirements}` : ''}
${terminologyPrompt}
${termCollectionPrompt}`;

      const userPrompt = `以下是需要翻译的文本内容，这些内容来自TTRPG规则书。请将它们翻译成中文。
${!isLastBatch ? `(这是第${batchIndex + 1}批，共${batches.length}批)` : `(这是最后一批)`}

文本片段总数: ${batch.length}

${batch.map((segment, index) => `<段落${index + 1}>\n${segment}\n</段落${index + 1}>`).join('\n\n')}

请以数组形式返回翻译结果，数组中的每个元素对应一个段落的翻译，保持原始顺序。`;

      const translateFunctionDefinition: FunctionDefinition = {
        name: 'translate_text_segments',
        description: '翻译文本片段',
        parameters: {
          type: 'object',
          properties: {
            translatedSegments: {
              type: 'array',
              description: '翻译后的文本片段，顺序与原文一致',
              items: {
                type: 'string'
              }
            }
          },
          required: ['translatedSegments']
        }
      };
      
      // 构建消息
      const messages: Message[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ];
      
      // 准备 tools（如果是最后一批且启用术语收集）
      let tools = undefined;
      if (autoCollectTerms && isLastBatch) {
        tools = [{
          type: 'function' as const,
          function: {
            name: 'collect_new_terminology',
            description: '收集文档中识别出的专有名词（proper nouns），仅包括人名、地名、组织名、神祇名等需要保持翻译一致性的独特名称。不要收集游戏机制术语、通用词汇、普通物品名等。',
            parameters: {
              type: 'object',
              properties: {
                newTerms: {
                  type: 'array',
                  description: '新识别出的专有名词列表，只包含术语表中没有的、在文本中重要的专有名词',
                  items: {
                    type: 'object',
                    properties: {
                      original: {
                        type: 'string',
                        description: '英文专有名词（完整准确的原文）'
                      },
                      translation: {
                        type: 'string',
                        description: '你翻译的中文版本'
                      },
                      category: {
                        type: 'string',
                        enum: ['character', 'place', 'deity', 'organization', 'monster', 'event', 'item', 'other'],
                        description: '专有名词类别：character(人物/角色名), place(地名-城市/地区/位面), deity(神祇/魔神/传说存在), organization(组织/派系/公会), monster(特定怪物个体名字), event(历史事件名称), item(神器/传说物品名), other(其他专有名词)'
                      }
                    },
                    required: ['original', 'translation', 'category']
                  }
                }
              },
              required: ['newTerms']
            }
          }
        }];
      }
      
      // 调用AI进行翻译
      console.log(`${MODULE_ID} | 发送翻译请求，文本片段数: ${batch.length}`);
      
      let batchTranslatedSegments: string[] = [];
      let apiResponse;
      
      try {
        apiResponse = await this.callAIAPI(messages, { 
          functionDefinition: translateFunctionDefinition,
          tools,
          tool_choice: (autoCollectTerms && isLastBatch) ? 'auto' : undefined
        });
        console.log(`${MODULE_ID} | 收到API响应:`, apiResponse);
        
        // 如果是最后一批，检查是否有术语收集的 tool_calls
        if (isLastBatch && apiResponse.choices && apiResponse.choices.length > 0) {
          const choice = apiResponse.choices[0];
          const message = choice.message as ToolCallMessage;
          if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
              if (toolCall.function.name === 'collect_new_terminology') {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  if (args.newTerms && Array.isArray(args.newTerms) && args.newTerms.length > 0) {
                    console.log(`${MODULE_ID} | 从 Function Call 中提取到 ${args.newTerms.length} 个新术语`);
                    // 保存术语数据以便后续处理
                    allBatchResponses.push(JSON.stringify({ newTerms: args.newTerms }));
                  }
                } catch (parseError) {
                  console.error(`${MODULE_ID} | 解析 Function Call 参数失败:`, parseError);
                }
              }
            }
          } else {
            // 如果没有使用 FC，使用旧方法作为后备
            allBatchResponses.push(JSON.stringify(apiResponse));
          }
        }
        
        // 解析翻译结果
        // 首先尝试从function_call中获取结果
        if (apiResponse.choices && apiResponse.choices.length > 0) {
          const choice = apiResponse.choices[0];
          
          if ((choice.message as FunctionCallMessage).function_call) {
            try {
              const args = JSON.parse((choice.message as FunctionCallMessage).function_call!.arguments);
              if (args.translatedSegments && Array.isArray(args.translatedSegments)) {
                batchTranslatedSegments = args.translatedSegments;
                console.log(`${MODULE_ID} | 从function_call中解析出 ${batchTranslatedSegments.length} 段翻译`);
              } else {
                console.warn(`${MODULE_ID} | function_call响应中缺少translatedSegments数组`);
              }
            } catch (parseError) {
              console.error(`${MODULE_ID} | 解析function_call参数失败:`, parseError);
            }
          } 
          // 如果没有function_call或解析失败，尝试从文本内容中提取
          else if (choice.message.content) {
            console.log(`${MODULE_ID} | 从文本响应中提取翻译结果`);
            
            // 使用改进的JSON解析方法
            const parsedArray = this.safeParseTranslationJson(choice.message.content);
            if (parsedArray) {
              batchTranslatedSegments = parsedArray;
              console.log(`${MODULE_ID} | 从JSON文本中解析出 ${batchTranslatedSegments.length} 段翻译`);
            } else {
              // 如果JSON解析失败，尝试按段落分割
              console.log(`${MODULE_ID} | JSON解析失败，尝试按段落分割`);
              const paragraphs = choice.message.content
                .split(/\n\n+/)
                .filter(p => p.trim())
                .map(p => p.trim())
                .filter(p => !p.startsWith('[') && !p.startsWith('{') && !p.includes('```')); // 过滤掉JSON标记
              
              if (paragraphs.length === batch.length) {
                batchTranslatedSegments = paragraphs;
                console.log(`${MODULE_ID} | 从文本段落中解析出 ${batchTranslatedSegments.length} 段翻译`);
              } else {
                console.warn(`${MODULE_ID} | 无法从文本内容中提取正确数量的翻译`);
              }
            }
          }
        }
        
        // 验证翻译结果数量是否匹配
        if (batchTranslatedSegments.length !== batch.length) {
          console.error(`${MODULE_ID} | 批次${batchIndex + 1}翻译结果段落数量不匹配: 原文${batch.length}段, 译文${batchTranslatedSegments.length}段`);
          
          // 增强的错误恢复机制
          if (batchTranslatedSegments.length === 0) {
            // 如果没有获取到任何翻译结果，使用原文
            console.log(`${MODULE_ID} | 未获取到翻译结果，使用原文`);
            batchTranslatedSegments = [...batch];
          } else if (batchTranslatedSegments.length > 0) {
            console.log(`${MODULE_ID} | 尝试智能修复段落数量不匹配问题`);
            
            // 如果翻译段落少于原文
            if (batchTranslatedSegments.length < batch.length) {
              const missingCount = batch.length - batchTranslatedSegments.length;
              console.log(`${MODULE_ID} | 缺少 ${missingCount} 个翻译段落，尝试填补`);
              
              // 尝试将最后一个翻译段落按原文段落数分割
              const lastTranslation = batchTranslatedSegments[batchTranslatedSegments.length - 1] || '';
              const lastOriginals = batch.slice(batchTranslatedSegments.length - 1);
              
              if (lastOriginals.length > 1 && lastTranslation.length > 50) {
                // 如果最后的翻译很长，可能是多个段落合并了
                const sentences = lastTranslation.split(/[。！？.!?]\s*/).filter(s => s.trim());
                if (sentences.length >= missingCount) {
                  // 移除最后一个翻译，用分割的句子替换
                  batchTranslatedSegments.pop();
                  for (let i = 0; i < lastOriginals.length && i < sentences.length; i++) {
                    batchTranslatedSegments.push(sentences[i] + (sentences[i].match(/[。！？.!?]$/) ? '' : '。'));
                  }
                }
              }
              
              // 如果仍然不够，用最后一段填充
              while (batchTranslatedSegments.length < batch.length) {
                const lastSegment = batchTranslatedSegments[batchTranslatedSegments.length - 1] || batch[batchTranslatedSegments.length];
                batchTranslatedSegments.push(lastSegment);
              }
            } 
            // 如果翻译段落多于原文，智能截断
            else if (batchTranslatedSegments.length > batch.length) {
              console.log(`${MODULE_ID} | 翻译段落过多，智能截断到 ${batch.length} 段`);
              
              // 尝试合并相似的段落
              const excess = batchTranslatedSegments.length - batch.length;
              if (excess <= 3) {
                // 将多余的段落合并到前面的段落中
                for (let i = 0; i < excess; i++) {
                  const targetIndex = Math.floor(i * batch.length / excess);
                  const excessSegment = batchTranslatedSegments.pop();
                  if (excessSegment && targetIndex < batchTranslatedSegments.length) {
                    batchTranslatedSegments[targetIndex] += ' ' + excessSegment;
                  }
                }
              } else {
                // 直接截断
                batchTranslatedSegments = batchTranslatedSegments.slice(0, batch.length);
              }
            }
            
            console.log(`${MODULE_ID} | 修复后段落数: ${batchTranslatedSegments.length}`);
          } else {
            // 最后的保护措施
            console.warn(`${MODULE_ID} | 无法修复翻译结果，使用原文`);
            batchTranslatedSegments = [...batch];
          }
        }
        
        // 将当前批次翻译结果添加到总结果
        allTranslatedSegments = allTranslatedSegments.concat(batchTranslatedSegments);
        
      } catch (error) {
        console.error(`${MODULE_ID} | 翻译请求失败:`, error);
        if (ui && ui.notifications) {
          ui.notifications.error(`翻译失败: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 如果是最后一批，或者还没有任何翻译结果，则中断
        if (batchIndex === 0 || batchIndex === batches.length - 1) {
          continue;
        }
        
        // 中间批次出错，使用原文填充，继续处理后续批次
        console.log(`${MODULE_ID} | 批次 ${batchIndex + 1} 翻译失败，使用原文继续`);
        allTranslatedSegments = allTranslatedSegments.concat(batch);
      }
    }
    
    // 所有批次处理完成，检查最终结果
    if (allTranslatedSegments.length !== textSegments.length) {
      console.error(`${MODULE_ID} | 最终翻译结果段落数量不匹配: 原文${textSegments.length}段, 译文${allTranslatedSegments.length}段`);
      if (ui && ui.notifications) {
        ui.notifications.error(`翻译结果段落数量不匹配，无法应用翻译`);
      }
      return;
    }
    
    // 收集新术语（如果启用了自动收集）
    if (autoCollectTerms && allBatchResponses.length > 0) {
      // 从最后一批的响应中收集术语
      try {
        for (const responseStr of allBatchResponses) {
          try {
            const responseData = JSON.parse(responseStr);
            // 如果响应包含 newTerms（来自 FC）
            if (responseData.newTerms && Array.isArray(responseData.newTerms)) {
              console.log(`${MODULE_ID} | 使用 FC 方法收集术语`);
              await this.collectNewTerminologiesFromFC(responseData.newTerms);
            } else {
              // 使用旧方法作为后备
              console.log(`${MODULE_ID} | 使用传统方法收集术语`);
              await this.collectNewTerminologies(responseStr, true);
            }
          } catch (parseError) {
            // 如果无法解析，尝试旧方法
            await this.collectNewTerminologies(responseStr, true);
          }
        }
      } catch (termError) {
        console.error(`${MODULE_ID} | 术语收集失败:`, termError);
        // 不影响翻译流程
      }
    }
    
    // 重建HTML内容
    const translatedHtml = this.reconstructHtmlWithTranslation(htmlStructure, allTranslatedSegments);
    
    // 更新页面内容
    try {
      await page.update({
        'text.content': translatedHtml
      });
      
      // 强制刷新页面显示
      if (page.sheet && page.sheet.rendered) {
        page.sheet.render(true);
      }
      
      console.log(`${MODULE_ID} | 页面翻译成功: ${page.name}`);
      if (ui && ui.notifications) {
        ui.notifications.info(`页面 "${page.name}" 翻译完成`);
      }
    } catch (updateError) {
      console.error(`${MODULE_ID} | 更新页面内容失败:`, updateError);
      if (ui && ui.notifications) {
        ui.notifications.error(`更新页面内容失败: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
      }
    }
  }
  
  /**
   * 为Journal表单添加AI翻译按钮
   * @param app Journal应用
   * @param html JQuery对象
   */
  private addJournalTranslationButton(app: any, html: any): void {
    if (!app.document || app.document.documentName !== 'JournalEntry') return;
    
    const journalWindow = html.closest('.journal-sheet');
    if (!journalWindow.length) return;
    
    // 查找工具栏
    let toolbarElement = journalWindow.find('.window-header .window-title');
    if (!toolbarElement.length) return;
    
    // 检查是否已经添加过按钮
    const existingButton = journalWindow.find('.ai-translate-button');
    if (existingButton.length) return; // 按钮已存在，不重复添加
    
    // 使用html来创建元素，避免使用jQuery
    const translateButton = document.createElement('a');
    translateButton.className = 'ai-translate-button';
    // 根据文档类型设置不同的标题
    if (app.document && app.document.documentName === 'JournalEntryPage') {
      translateButton.title = 'AI翻译此页面';
    } else {
      translateButton.title = 'AI翻译整个文档';
    }
    translateButton.style.marginLeft = '5px';
    translateButton.innerHTML = '<i class="fas fa-language"></i>';
    
    // 添加点击事件 - 根据文档类型决定调用哪个方法
    translateButton.addEventListener('click', () => {
      // 检查是否是页面级文档
      if (app.document && app.document.documentName === 'JournalEntryPage') {
        this.handleJournalPageTranslation(app.document);
      } else {
        this.handleJournalTranslation(app.document);
      }
    });
    
    // 添加按钮到工具栏
    if (toolbarElement.parentNode) {
      toolbarElement.parentNode.insertBefore(translateButton, toolbarElement.nextSibling);
    }
    
    // 创建MutationObserver监听页面变化
    this.setupJournalButtonObserver(app, journalWindow[0]);
  }
  
  /**
   * 设置Journal按钮监听器，确保按钮始终存在
   * @param app Journal应用
   * @param journalElement Journal元素
   */
  private setupJournalButtonObserver(app: any, journalElement: HTMLElement): void {
    // 检查是否已经有Observer
    const observerKey = `_aiTranslateObserver_${app.document.id}`;
    if ((app as any)[observerKey]) return;
    
    // 创建新的Observer
    const observer = new MutationObserver((mutations) => {
      // 检查当前用户是否为GM
      const game = getGame();
      if (!game || !game.user || !game.user.isGM) {
        console.log(`${MODULE_ID} | 非GM用户，不重新添加翻译按钮`);
        return;
      }
      
      // 检查按钮是否还存在
      const hasButton = journalElement.querySelector('.ai-translate-button');
      if (!hasButton) {
        console.log(`${MODULE_ID} | 检测到翻译按钮丢失，重新添加`);
        
        // 查找工具栏
        const toolbarElement = journalElement.querySelector('.window-header .window-title');
        if (!toolbarElement) return;
        
        // 创建新按钮
        const translateButton = document.createElement('a');
        translateButton.className = 'ai-translate-button';
        // 根据文档类型设置不同的标题
        if (app.document && app.document.documentName === 'JournalEntryPage') {
          translateButton.title = 'AI翻译此页面';
        } else {
          translateButton.title = 'AI翻译整个文档';
        }
        translateButton.style.marginLeft = '5px';
        translateButton.innerHTML = '<i class="fas fa-language"></i>';
        
        // 添加点击事件 - 根据应用类型决定调用哪个方法
        translateButton.addEventListener('click', () => {
          // 检查是否是页面级应用
          if (app.document && app.document.documentName === 'JournalEntryPage') {
            this.handleJournalPageTranslation(app.document);
          } else {
            this.handleJournalTranslation(app.document);
          }
        });
        
        // 添加按钮到工具栏
        if (toolbarElement.parentNode) {
          toolbarElement.parentNode.insertBefore(translateButton, toolbarElement.nextSibling);
        }
      }
    });
    
    // 开始观察DOM变化
    observer.observe(journalElement, { 
      childList: true, 
      subtree: true 
    });
    
    // 存储Observer引用
    (app as any)[observerKey] = observer;
    
    // 当应用关闭时断开Observer
    const originalClose = app.close;
    app.close = function(...args: any[]) {
      if ((app as any)[observerKey]) {
        (app as any)[observerKey].disconnect();
        delete (app as any)[observerKey];
      }
      return originalClose.apply(this, args);
    };
  }
  
  /**
   * 向表单添加AI助手按钮
   * @param app 应用程序实例
   * @param html jQuery对象，表示渲染后的HTML
   */
  private addButtonToSheet(app: any, html: any): void {
    const $ = (window as any).$;
    if (!$) return;
    
    try {
      // 获取第一个元素（如果html是jQuery对象）
      const element = html instanceof $ ? html[0] : html;
      
      // 查找标题栏
      const header = $(element).find('.window-header');
      if (!header.length) {
        console.log(`${MODULE_ID} | 未找到窗口标题栏`);
        return;
      }
      
      const closeButton = header.find('.close');
      const self = this;
      
      // 检查是否是物品表单
      const isItemSheet = app.document?.documentName === 'Item' || 
                         app.item?.documentName === 'Item' || 
                         app.constructor?.name?.includes('ItemSheet');
      
      // 如果是角色表单，添加AI助手按钮
      if (!isItemSheet && header.find('.ai-pf2e-button').length === 0) {
        const aiButton = $(`<a class="ai-pf2e-button"><i class="fas fa-robot"></i>AI助手</a>`);
        
        aiButton.click(function() {
          try {
            self.handleAIButtonClick(app);
          } catch (error) {
            console.error(`${MODULE_ID} | 按钮点击处理时出错:`, error);
            if (ui && ui.notifications) {
              ui.notifications.error("处理AI助手请求时出错。请查看控制台获取详细信息。");
            }
          }
        });
        
        if (closeButton.length) {
          closeButton.before(aiButton);
        } else {
          header.append(aiButton);
        }
        
        Logger.debug('成功添加AI助手按钮到:', app.constructor?.name);
      }
      
      // 如果是物品表单，添加规则元素配置按钮和AI图标按钮
      if (isItemSheet) {
        // 添加规则元素配置按钮
        if (header.find('.ai-pf2e-rule-button').length === 0) {
          const ruleButton = $(`<a class="ai-pf2e-rule-button"><i class="fas fa-wand-magic-sparkles"></i>规则元素</a>`);
          
          ruleButton.click(function() {
            try {
              self.handleRuleElementButtonClick(app);
            } catch (error) {
              console.error(`${MODULE_ID} | 规则元素按钮点击处理时出错:`, error);
              if (ui && ui.notifications) {
                ui.notifications.error("处理规则元素配置请求时出错。请查看控制台获取详细信息。");
              }
            }
          });
          
          if (closeButton.length) {
            closeButton.before(ruleButton);
          } else {
            header.append(ruleButton);
          }
          
          console.log(`${MODULE_ID} | 成功添加规则元素配置按钮到:`, app.constructor?.name);
        }
        
        // 添加AI图标按钮
      }
      
      if (isItemSheet && header.find('.ai-pf2e-icon-button').length === 0) {
        // 获取物品文档
        const item = app.document || app.item || app.object;
        
        // 动态导入使用服务来检查状态
        import('./services/item-icon-usage-service').then(({ ItemIconUsageService }) => {
          const usageService = ItemIconUsageService.getInstance();
          const canUse = item && usageService.canUseIconGeneration(item.id);
          
          // 根据使用状态设置按钮
          let iconButton: any;
          if (!canUse && item && !getGame().user?.isGM) {
            // 已使用，显示禁用状态
            iconButton = $(`<a class="ai-pf2e-icon-button" style="opacity: 0.6; pointer-events: none;"><i class="fas fa-check"></i>已使用</a>`);
          } else {
            // 未使用或GM用户，显示正常按钮
            iconButton = $(`<a class="ai-pf2e-icon-button"><i class="fas fa-image"></i>AI图标</a>`);
            
            iconButton.click(function() {
              try {
                self.handleIconGenerationButtonClick(app);
              } catch (error) {
                console.error(`${MODULE_ID} | 图标按钮点击处理时出错:`, error);
                if (ui && ui.notifications) {
                  ui.notifications.error("处理AI图标生成请求时出错。请查看控制台获取详细信息。");
                }
              }
            });
          }
          
          if (closeButton.length) {
            closeButton.before(iconButton);
          } else {
            header.append(iconButton);
          }
          
          console.log(`${MODULE_ID} | 成功添加AI图标按钮到:`, app.constructor?.name, canUse ? '(可用)' : '(已使用)');
        });
      }
    } catch (e) {
      console.error(`${MODULE_ID} | 添加按钮时出错:`, e);
    }
  }

  /**
   * 处理AI图标生成按钮点击事件
   * @param app 应用程序实例（物品表单）
   */
  public async handleIconGenerationButtonClick(app: any): Promise<void> {
    console.log(`${MODULE_ID} | AI图标生成按钮点击:`, app);
    
    const game = getGame();
    const { IconGenerationService } = await import('./services/icon-generation-service');
    const { ItemIconUsageService } = await import('./services/item-icon-usage-service');
    
    const iconService = IconGenerationService.getInstance();
    const usageService = ItemIconUsageService.getInstance();
    
    // 注意：按钮功能独立于全局图标生成开关，无需检查 isEnabled()
    // 这样用户可以在不启用自动图标生成的情况下，按需手动生成图标
    
    // 获取物品文档
    let item = app.document || app.item || app.object;
    if (!item) {
      console.error(`${MODULE_ID} | 无法获取物品文档`);
      ui.notifications?.error('无法获取物品数据');
      return;
    }
    
    // 检查是否正在生成中（防止重复点击）
    if (this.generatingIconItemIds.has(item.id)) {
      ui.notifications?.warn('该物品正在生成图标中，请稍候...');
      return;
    }
    
    // 检查使用权限（玩家每个物品只能使用一次，GM无限制）
    if (!usageService.canUseIconGeneration(item.id)) {
      ui.notifications?.warn('该物品已经使用过AI图标生成功能');
      return;
    }
    
    // 获取jQuery和按钮元素
    const $ = (window as any).$;
    let button: any = null;
    if ($) {
      // 查找对应的按钮元素
      $('.window-app').each(function(this: HTMLElement) {
        const appElement = this;
        const currentApp = $(appElement).data('app');
        if (currentApp === app) {
          button = $(appElement).find('.ai-pf2e-icon-button');
        }
      });
    }
    
    // 标记为生成中
    this.generatingIconItemIds.add(item.id);
    
    // 禁用按钮并更改样式
    if (button && button.length) {
      button.addClass('generating');
      button.prop('disabled', true);
      button.css('opacity', '0.5');
      button.css('pointer-events', 'none');
      const originalHtml = button.html();
      button.html('<i class="fas fa-spinner fa-spin"></i>生成中...');
      button.data('originalHtml', originalHtml);
    }
    
    try {
      ui.notifications?.info('正在生成图标提示词...');
      
      // 从物品描述生成图标提示词
      const iconPrompt = await this.generateIconPromptFromItem(item);
      
      if (!iconPrompt) {
        throw new Error('无法生成图标提示词');
      }
      
      ui.notifications?.info('正在生成图标...');
      
      // 生成图标
      const iconOptions: any = {
        name: item.name,
        description: item.system?.description?.value || '',
        type: 'item',
        iconPrompt: iconPrompt
      };
      
      // 手动按钮点击时跳过全局开关检查，允许按需生成图标
      const generatedIcon = await iconService.generateIcon(iconOptions, true);
      
      if (!generatedIcon) {
        throw new Error('图标生成失败');
      }
      
      // 更新物品图标
      await item.update({ img: generatedIcon.url });
      
      // 记录使用（仅玩家）- 只有成功后才记录
      await usageService.markItemUsed(item.id);
      
      ui.notifications?.info(`图标生成成功！已应用到物品 ${item.name}`);
      
      // 生成成功，永久禁用按钮（对非GM玩家）
      if (button && button.length && !game.user?.isGM) {
        button.html('<i class="fas fa-check"></i>已使用');
        button.css('opacity', '0.6');
        button.off('click'); // 移除点击事件
      } else if (button && button.length) {
        // GM用户恢复按钮
        const originalHtml = button.data('originalHtml') || '<i class="fas fa-image"></i>AI图标';
        button.html(originalHtml);
        button.removeClass('generating');
        button.prop('disabled', false);
        button.css('opacity', '1');
        button.css('pointer-events', 'auto');
      }
      
      // 刷新物品表单
      if (app.render) {
        app.render(false);
      }
      
    } catch (error: any) {
      console.error(`${MODULE_ID} | 图标生成失败:`, error);
      ui.notifications?.error(`图标生成失败: ${error.message}`);
      
      // 失败时恢复按钮状态，允许重试
      if (button && button.length) {
        const originalHtml = button.data('originalHtml') || '<i class="fas fa-image"></i>AI图标';
        button.html(originalHtml);
        button.removeClass('generating');
        button.prop('disabled', false);
        button.css('opacity', '1');
        button.css('pointer-events', 'auto');
      }
    } finally {
      // 无论成功还是失败，都从生成中集合移除
      this.generatingIconItemIds.delete(item.id);
    }
  }
  
  /**
   * 从物品描述生成图标提示词
   * @param item 物品文档
   * @returns 图标提示词
   */
  private async generateIconPromptFromItem(item: any): Promise<string | null> {
    try {
      const description = item.system?.description?.value || '';
      const itemName = item.name;
      const itemType = item.type;
      
      // 清理HTML标签
      const cleanDescription = description.replace(/<[^>]*>/g, ' ').trim();
      
      // 构建AI提示
      const messages = [
        {
          role: 'system' as const,
          content: `你是一个专业的图标提示词生成器。根据物品的名称、类型和描述，生成一个简洁、准确的图标绘制提示词。

提示词要求：
1. 使用英文
2. 描述要具体、视觉化
3. 适合用于游戏图标（方形构图、居中、干净的背景）
4. 长度控制在50个单词以内
5. 突出物品的核心特征和视觉元素

只返回提示词本身，不要任何其他文本。`
        },
        {
          role: 'user' as const,
          content: `物品名称: ${itemName}
物品类型: ${itemType}
物品描述: ${cleanDescription.substring(0, 500)}

请生成图标提示词：`
        }
      ];
      
      // 调用AI服务（玩家使用玩家API Key）
      const game = getGame();
      const usePlayerKey = !game?.user?.isGM;
      const response = await this.callAIAPI(messages, { usePlayerKey });
      
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('AI服务返回空响应');
      }
      
      const iconPrompt = response.choices[0].message?.content?.trim();
      
      if (!iconPrompt) {
        throw new Error('无法提取图标提示词');
      }
      
      console.log(`${MODULE_ID} | 生成的图标提示词:`, iconPrompt);
      return iconPrompt;
      
    } catch (error: any) {
      console.error(`${MODULE_ID} | 生成图标提示词失败:`, error);
      throw error;
    }
  }

  /**
   * 处理规则元素配置按钮点击事件
   * @param app 应用程序实例（物品表单）
   */
  public async handleRuleElementButtonClick(app: any): Promise<void> {
    console.log(`${MODULE_ID} | 规则元素配置按钮点击:`, app);
    
    // 检查GM权限
    const game = getGame();
    if (!game || !game.user || !game.user.isGM) {
      ui.notifications?.warn('规则元素配置功能仅限GM使用');
      return;
    }
    
    // 获取物品文档
    let item = app.document || app.item || app.object;
    if (!item) {
      console.error(`${MODULE_ID} | 无法获取物品文档`);
      ui.notifications?.error('无法获取物品数据');
      return;
    }
    
    try {
      // 动态导入规则元素配置应用
      const { RuleElementConfigApp } = await import('./ui/rule-element-config-app');
      
      // 创建并打开配置对话框
      const configApp = new RuleElementConfigApp(item, app);
      (configApp as any).render(true);
      
    } catch (error: any) {
      console.error(`${MODULE_ID} | 打开规则元素配置对话框失败:`, error);
      ui.notifications?.error(`打开配置对话框失败: ${error.message}`);
    }
  }

  /**
   * 处理AI按钮点击事件
   * @param app 应用程序实例（角色或物品表单）
   */
  public handleAIButtonClick(app: any): void {
    console.log(`${MODULE_ID} | AI按钮点击:`, app);
    
    // 检查GM权限
    const game = getGame();
    if (!game || !game.user || !game.user.isGM) {
      ui.notifications?.warn('AI助手功能仅限GM使用');
      return;
    }
    
    let document = app.document;
    
    // PF2e系统特殊处理
    if (!document && app.actor) {
      document = app.actor;
    } else if (!document && app.item) {
      document = app.item;
    }
    
    // 如果仍然找不到文档，尝试直接从应用程序获取
    if (!document && app.object) {
      document = app.object;
    }
    
    if (!document) {
      console.error(`${MODULE_ID} | 无法获取文档对象`);
      if (ui && ui.notifications) {
        ui.notifications.error("无法获取角色或物品数据。");
      }
      return;
    }
    
    // 保存对当前文档和应用程序的引用
    this.currentDocument = document;
    this.currentApp = app;
    
    let contentType: ContentType;
    let context: any = {};
    
    console.log(`${MODULE_ID} | 文档类型:`, document.documentName, document.type);
    
    try {
      // 创建一个干净的数据副本，移除环形引用和方法
      const cleanData = this.extractCleanData(document);
      
      // 根据文档类型确定内容类型
      if (document.documentName === 'Actor') {
        // PF2e系统中的角色类型判断
        // character = 玩家角色(PC)
        // npc = 非玩家角色(NPC)
        // 其他 = 怪物/生物
        let isNPC = false;
        if (document.type === 'character') {
          // 玩家角色卡，视为NPC类型处理（因为都是类人智慧生物）
          contentType = ContentType.NPC;
          isNPC = true;
        } else if (document.type === 'npc') {
          // NPC角色卡
          contentType = ContentType.NPC;
          isNPC = true;
        } else {
          // 其他类型（如monster, hazard等）视为怪物
          contentType = ContentType.Monster;
          isNPC = false;
        }
        
        // 基础数据
        context = {
          ...cleanData,
          // 添加一些描述性元数据帮助AI理解
          _metadata: {
            documentType: 'Actor',
            actorType: document.type,
            isNPC: isNPC,
            requestType: isNPC ? 'NPC生成' : '怪物生成'
          }
        };
      } else if (document.documentName === 'Item') {
        // 确定物品类型
        if (document.type === 'spell') {
          contentType = ContentType.Spell;
          
          // 基础数据
          context = {
            ...cleanData,
            // 添加一些描述性元数据帮助AI理解
            _metadata: {
              documentType: 'Item',
              itemType: 'spell',
              requestType: '法术生成'
            }
          };
        } else {
          contentType = ContentType.Item;
          
          // 基础数据
          context = {
            ...cleanData,
            // 添加一些描述性元数据帮助AI理解
            _metadata: {
              documentType: 'Item',
              itemType: document.type,
              requestType: '物品生成'
            }
          };
        }
      } else {
        // 未知类型，默认使用Monster类型
        contentType = ContentType.Monster;
        context = {
          name: document.name || "未命名",
          description: "请提供关于这个内容的描述。",
          _metadata: {
            documentType: document.documentName || '未知',
            requestType: '未知类型生成'
          }
        };
      }
      
      console.log(`${MODULE_ID} | 生成内容类型:`, contentType, context);
      
      // 特殊处理：如果是角色文档，提供更多选项
      if (document.documentName === 'Actor') {
        this.showActorAIOptions(document, app);
      } else {
        // 打开AI生成器应用程序并初始化参数
        this.openDocumentModifierApp(contentType, context, document);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 处理数据时出错:`, error);
      if (ui && ui.notifications) {
        ui.notifications.error("处理数据时出错。请查看控制台获取详细信息。");
      }
    }
  }

  /**
   * 显示角色AI选项对话框
   * @param actor 角色文档
   * @param app 角色表单应用
   */
  private showActorAIOptions(actor: any, app: any): void {
    const game = getGame();
    const useShrineSystem = game?.settings?.get(MODULE_ID, 'useShrineSystem') || false;
    
    const synthesisToolName = useShrineSystem ? '神龛' : '专长合成器';
    const synthesisDescription = useShrineSystem 
      ? '在神圣祭坛上使用神明力量合成专长' 
      : '使用词条碎片合成新的专长';
    const synthesisIcon = useShrineSystem ? 'fas fa-monument' : 'fas fa-flask';
    
    // 检查是否是NPC类型
    const isNPC = actor.type === 'npc';
    
    // 如果是NPC，添加翻译选项
    const translationOption = isNPC ? `
          <div class="tool-option" data-tool="translate">
            <div class="tool-icon">
              <i class="fas fa-language"></i>
            </div>
            <div class="tool-info">
              <h4>NPC翻译</h4>
              <p>翻译NPC的名称、描述和所有能力</p>
            </div>
          </div>
    ` : '';
    
    const dialogContent = `
      <div class="actor-ai-options">
        <h3>选择AI工具</h3>
        <p>为角色 <strong>${actor.name}</strong> 选择要使用的AI工具：</p>
        
        <div class="ai-tool-options">
          ${translationOption}
          
          <div class="tool-option" data-tool="synthesis">
            <div class="tool-icon">
              <i class="${synthesisIcon}"></i>
            </div>
            <div class="tool-info">
              <h4>${synthesisToolName}</h4>
              <p>${synthesisDescription}</p>
            </div>
          </div>
          
          <div class="tool-option" data-tool="generator">
            <div class="tool-icon">
              <i class="fas fa-robot"></i>
            </div>
            <div class="tool-info">
              <h4>AI角色生成器</h4>
              <p>使用AI增强或修改角色属性</p>
            </div>
          </div>
          
          <div class="tool-option" data-tool="explorer">
            <div class="tool-icon">
              <i class="fas fa-search"></i>
            </div>
            <div class="tool-info">
              <h4>数据探索器</h4>
              <p>探索和搜索PF2e数据</p>
            </div>
          </div>
          
        </div>
      </div>
      
      <style>
        .actor-ai-options {
          padding: 10px;
        }
        
        .tool-option {
          display: flex;
          align-items: center;
          padding: 10px;
          margin: 8px 0;
          border: 2px solid #ddd;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .tool-option:hover {
          border-color: #007bff;
          background: #f8f9fa;
        }
        
        .tool-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #007bff;
          color: white;
          border-radius: 50%;
          margin-right: 15px;
          font-size: 18px;
        }
        
        .tool-info h4 {
          margin: 0 0 5px 0;
          color: #333;
        }
        
        .tool-info p {
          margin: 0;
          color: #666;
          font-size: 0.9em;
        }
      </style>
    `;

    const dialog = new Dialog({
      title: "AI工具选择",
      content: dialogContent,
      buttons: {
        cancel: {
          label: "取消",
          icon: '<i class="fas fa-times"></i>',
          callback: () => {}
        }
      },
      render: (html: any) => {
        // 绑定工具选项点击事件
        html.find('.tool-option').click((event: any) => {
          const tool = event.currentTarget.getAttribute('data-tool');
          dialog.close();
          
          switch (tool) {
            case 'translate':
              // NPC翻译功能
              this.handleNPCTranslation(actor);
              break;
            case 'synthesis':
              this.openFeatSynthesis(actor);
              break;
            case 'generator':
              // 使用原有的生成器逻辑
              const contentType = actor.type === 'npc' ? ContentType.NPC : ContentType.Monster;
              const cleanData = this.extractCleanData(actor);
              const context = {
                ...cleanData,
                _metadata: {
                  documentType: 'Actor',
                  actorType: actor.type,
                  isNPC: actor.type === 'npc',
                  requestType: actor.type === 'npc' ? 'NPC生成' : '怪物生成'
                }
              };
              this.openDocumentModifierApp(contentType, context, actor);
              break;
            case 'explorer':
              this.openPF2eExplorer();
              break;
          }
        });
      },
      default: "cancel"
    });
    
    dialog.render(true);
  }

  /**
   * 打开专长合成器应用
   * 从专长页面入口进入，默认为专长合成模式
   * @param actor 角色文档
   */
  openFeatSynthesis(actor?: any): void {
    try {
      const game = getGame();
      const useShrineSystem = game?.settings?.get(MODULE_ID, 'useShrineSystem') || false;
      
      let app;
      if (useShrineSystem) {
        // 使用默认模式（feat），由入口决定
        app = new ShrineSynthesisApp(actor);
      } else {
        app = new FeatSynthesisApp(actor);
      }
      
      // 设置AI服务实例
      app.setAIService({
        callService: this.createCompatibleCallService(),
        getServiceName: () => 'AI Assistant',
        getAvailableModels: () => Object.values(AIModel)
      });
      
      (app as any).render(true);
      const systemName = useShrineSystem ? '神龛' : '专长合成器';
      console.log(`${MODULE_ID} | ${systemName}已打开${actor ? ` (角色: ${actor.name})` : ''}`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开合成器失败:`, error);
      ui.notifications.error('打开合成器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开法术合成器应用
   * 从法术页面入口进入，设置为法术合成模式
   * @param actor 角色文档
   */
  openSpellSynthesis(actor?: any, tradition?: string): void {
    try {
      const game = getGame();
      const useShrineSystem = game?.settings?.get(MODULE_ID, 'useShrineSystem') || false;
      
      if (!useShrineSystem) {
        ui.notifications.warn('请先在模块设置中启用神龛系统');
        return;
      }
      
      // 使用ShrineSynthesisApp，明确传入spell模式和施法传统（由法术页面入口决定）
      const app = new ShrineSynthesisApp(actor, { 
        synthesisMode: 'spell',
        spellTradition: tradition || 'arcane'  // 传入施法传统，默认奥术
      });
      
      // 设置AI服务实例
      app.setAIService({
        callService: this.createCompatibleCallService(),
        getServiceName: () => 'AI Assistant',
        getAvailableModels: () => Object.values(AIModel)
      });
      
      (app as any).render(true);
      console.log(`${MODULE_ID} | 法术合成器已打开${actor ? ` (角色: ${actor.name})` : ''}，施法传统: ${tradition || 'arcane'}`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开法术合成器失败:`, error);
      ui.notifications.error('打开法术合成器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开专长储存箱
   * @param actor 角色文档
   */
  openFeatStorage(actor?: any): void {
    this.openItemStorage(actor, 'feats');
  }

  /**
   * 打开物品储存箱（专长或法术）
   * @param actor 角色文档
   * @param initialTab 初始打开的分页（'feats' 或 'spells'）
   */
  openItemStorage(actor?: any, initialTab: 'feats' | 'spells' = 'feats'): void {
    try {
      if (!actor) {
        ui.notifications.warn('请先选择一个角色');
        return;
      }

      // 导入FeatStorageSheet（现在是通用的物品储存箱）
      import('./ui/feat-storage-sheet.js').then((module) => {
        const { FeatStorageSheet } = module;
        const app = new FeatStorageSheet(actor, { initialTab });
        (app as any).render(true);
        console.log(`${MODULE_ID} | 物品储存箱已打开 (角色: ${actor.name}, 分页: ${initialTab})`);
      }).catch((error) => {
        console.error(`${MODULE_ID} | 加载物品储存箱失败:`, error);
        ui.notifications.error('加载物品储存箱失败，请查看控制台错误信息');
      });
    } catch (error) {
      console.error(`${MODULE_ID} | 打开物品储存箱失败:`, error);
      ui.notifications.error('打开物品储存箱失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开物品合成器应用
   * 从物品栏入口进入，设置为物品合成模式
   * @param actor 角色文档
   */
  openEquipmentSynthesis(actor?: any): void {
    try {
      const game = getGame();
      const useShrineSystem = game?.settings?.get(MODULE_ID, 'useShrineSystem') || false;
      
      if (!useShrineSystem) {
        ui.notifications.warn('请先在模块设置中启用神龛系统');
        return;
      }
      
      // 使用ShrineSynthesisApp，明确传入equipment模式
      const app = new ShrineSynthesisApp(actor, { 
        synthesisMode: 'equipment'
      });
      
      // 设置AI服务实例
      app.setAIService({
        callService: this.createCompatibleCallService(),
        getServiceName: () => 'AI Assistant',
        getAvailableModels: () => Object.values(AIModel)
      });
      
      (app as any).render(true);
      console.log(`${MODULE_ID} | 物品合成器已打开${actor ? ` (角色: ${actor.name})` : ''}`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开物品合成器失败:`, error);
      ui.notifications.error('打开物品合成器失败，请查看控制台错误信息');
    }
  }

  
  /**
   * 从文档对象中提取干净的数据副本，移除环形引用和方法
   * 增强版：更全面地提取 FVTT 数据结构用于动态生成函数参数
   * @param document 文档对象
   * @returns 清理过的数据对象
   */
  private extractCleanData(document: any): any {
    try {
      // 基础信息
      const baseData: any = {
        name: document.name,
        type: document.type,
        uuid: document.uuid,
        documentName: document.documentName
      };
      
      // 尝试从文档中提取更多元数据
      if (document.metadata) {
        try {
          baseData.metadata = JSON.parse(JSON.stringify(document.metadata));
        } catch (e) {
          console.warn(`${MODULE_ID} | 无法序列化元数据`);
        }
      }
      
      // 提取 system 数据 - 更全面的提取
      let systemData = {};
      if (document.system) {
        // 使用递归函数来处理深层数据结构
        systemData = this.extractNestedData(document.system);
      }
      
      // 提取额外数据 - 更全面的处理
      let extraData: any = {};
      
      // 角色特有数据 - 提取更多信息
      if (document.documentName === 'Actor') {
        extraData = this.extractActorSpecificData(document);
      }
      
      // 物品特有数据 - 提取更多信息
      if (document.documentName === 'Item') {
        extraData = this.extractItemSpecificData(document);
      }
      
      // 提取规则元素（如果存在）
      if (document.rules || document.system?.rules) {
        try {
          const rules = document.rules || document.system?.rules;
          extraData.rules = Array.isArray(rules) ? 
            JSON.parse(JSON.stringify(rules)) : 
            (rules ? [rules] : []);
              } catch (e) {
          console.warn(`${MODULE_ID} | 无法提取规则元素`);
        }
      }
      
      // 尝试提取图像和图标信息
      if (document.img) {
        baseData.img = document.img;
      }
      if (document.icon) {
        baseData.icon = document.icon;
      }
      
      // 合并所有数据
      return {
        ...baseData,
        system: systemData,
        ...extraData
      };
    } catch (error) {
      console.error(`${MODULE_ID} | 提取数据时出错:`, error);
      return { 
        name: document.name, 
        type: document.type,
        error: "数据提取失败"
      };
    }
  }
  
  /**
   * 递归提取嵌套数据结构
   * @param data 嵌套数据对象
   * @param visited 已访问对象的WeakSet，用于检测循环引用
   * @returns 提取的数据
   */
  private extractNestedData(data: any, visited?: WeakSet<any>): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    // 检查是否为简单类型
    if (typeof data !== 'object') {
      return data;
    }
    
    // 初始化visited集合（仅在第一次调用时）
    if (!visited) {
      visited = new WeakSet();
    }
    
    // 检测循环引用
    if (visited.has(data)) {
      console.debug(`${MODULE_ID} | 检测到循环引用，跳过`);
      return '[Circular Reference]';
    }
    
    // 标记当前对象为已访问
    visited.add(data);
    
    // 检查是否为数组
    if (Array.isArray(data)) {
      return data.map(item => this.extractNestedData(item, visited));
    }
    
    // 处理对象
    const result: any = {};
    for (const key in data) {
      // 排除方法、以下划线开头的属性，以及可能引起循环的常见属性
      if (typeof data[key] !== 'function' && 
          !key.startsWith('_') && 
          key !== 'parent' && 
          key !== 'actor' && 
          key !== 'apps') {
        try {
          result[key] = this.extractNestedData(data[key], visited);
        } catch (e) {
          // 如果无法序列化某个属性，忽略它
          console.debug(`${MODULE_ID} | 跳过无法提取的属性: ${key}`);
        }
      }
    }
    
    return result;
  }
  
  /**
   * 提取角色特有数据
   * @param actor 角色对象
   * @returns 角色特有数据
   */
  private extractActorSpecificData(actor: any): any {
    const actorData: any = {};
    
    try {
      // 提取物品数据
      if (actor.items && actor.items.size) {
        const items = Array.from(actor.items.values()).map((item: any) => {
          return this.extractCleanItemData(item);
        });
        actorData.items = items;
      }
      
      // 提取效果数据
      if (actor.effects && actor.effects.size) {
        const effects = Array.from(actor.effects.values()).map((effect: any) => {
          return this.extractCleanEffectData(effect);
        });
        actorData.effects = effects;
      }
      
      // 提取特定的角色属性
      if (actor.system) {
        // 提取属性值
        if (actor.system.abilities) {
          actorData.abilities = this.extractNestedData(actor.system.abilities);
        }
        
        // 提取技能
        if (actor.system.skills) {
          actorData.skills = this.extractNestedData(actor.system.skills);
        }
        
        // 提取豁免
        if (actor.system.saves) {
          actorData.saves = this.extractNestedData(actor.system.saves);
        }
        
        // 提取生命值
        if (actor.system.attributes?.hp) {
          actorData.hp = this.extractNestedData(actor.system.attributes.hp);
        }
        
        // 提取AC
        if (actor.system.attributes?.ac) {
          actorData.ac = this.extractNestedData(actor.system.attributes.ac);
        }
        
        // 提取速度
        if (actor.system.attributes?.speed) {
          actorData.speed = this.extractNestedData(actor.system.attributes.speed);
        }
        
        // 提取感官
        if (actor.system.traits?.senses) {
          actorData.senses = this.extractNestedData(actor.system.traits.senses);
        }
        
        // 提取特性/种族
        if (actor.system.traits?.value) {
          actorData.traits = this.extractNestedData(actor.system.traits.value);
        }
        
        // 提取等级/CR
        if (actor.system.details?.level || actor.system.details?.cr) {
          actorData.level = actor.system.details?.level?.value || actor.system.details?.cr?.value || null;
        }
      }
      
          } catch (e) {
      console.error(`${MODULE_ID} | 提取角色数据时出错:`, e);
    }
    
    return actorData;
  }
  
  /**
   * 提取物品特有数据
   * @param item 物品对象
   * @returns 物品特有数据
   */
  private extractItemSpecificData(item: any): any {
    const itemData: any = {};
    
    try {
      // 提取效果数据
      if (item.effects && item.effects.size) {
        const effects = Array.from(item.effects.values()).map((effect: any) => {
          return this.extractCleanEffectData(effect);
        });
        itemData.effects = effects;
      }
      
      // 根据物品类型提取特定数据
      if (item.system) {
        // 提取等级
        if (item.system.level !== undefined) {
          itemData.level = this.extractNestedData(item.system.level);
        }
        
        // 提取稀有度
        if (item.system.traits?.rarity) {
          itemData.rarity = item.system.traits.rarity;
        }
        
        // 提取特性
        if (item.system.traits?.value) {
          itemData.traits = this.extractNestedData(item.system.traits.value);
        }
        
        // 提取价格
        if (item.system.price) {
          itemData.price = this.extractNestedData(item.system.price);
        }
        
        // 提取重量/体积
        if (item.system.bulk) {
          itemData.bulk = item.system.bulk;
        }
        
        // 针对特定类型的物品提取额外数据
        switch (item.type) {
          case 'weapon':
            // 提取武器特定数据
            if (item.system.damage) {
              itemData.damage = this.extractNestedData(item.system.damage);
            }
            break;
          case 'armor':
            // 提取护甲特定数据
            if (item.system.ac) {
              itemData.ac = this.extractNestedData(item.system.ac);
            }
            break;
          case 'spell':
            // 提取法术特定数据
            if (item.system.traditions) {
              itemData.traditions = this.extractNestedData(item.system.traditions);
            }
            if (item.system.spellType) {
              itemData.spellType = item.system.spellType.value;
            }
            if (item.system.school) {
              itemData.school = item.system.school.value;
            }
            if (item.system.time) {
              itemData.time = item.system.time.value;
            }
            if (item.system.components) {
              itemData.components = this.extractNestedData(item.system.components);
            }
            if (item.system.range) {
              itemData.range = item.system.range.value;
            }
            if (item.system.target) {
              itemData.target = item.system.target.value;
            }
            if (item.system.duration) {
              itemData.duration = item.system.duration.value;
            }
            if (item.system.save) {
              itemData.save = this.extractNestedData(item.system.save);
            }
            break;
        }
      }
    } catch (e) {
      console.error(`${MODULE_ID} | 提取物品数据时出错:`, e);
    }
    
    return itemData;
  }
  
  /**
   * 提取干净的物品数据
   * @param item 物品对象
   * @returns 干净的物品数据
   */
  private extractCleanItemData(item: any): any {
    if (!item) return null;
    
    try {
      // 创建一个新的visited集合用于此物品
      const visited = new WeakSet();
      return {
        name: item.name,
        type: item.type,
        uuid: item.uuid,
        img: item.img,
        system: this.extractNestedData(item.system || {}, visited)
      };
    } catch (e) {
      console.warn(`${MODULE_ID} | 提取物品数据失败 (${item.name}):`, e);
      return { name: item.name, type: item.type, error: "无法序列化" };
    }
  }
  
  /**
   * 提取干净的效果数据
   * @param effect 效果对象
   * @returns 干净的效果数据
   */
  private extractCleanEffectData(effect: any): any {
    if (!effect) return null;
    
    try {
      // 创建一个新的visited集合用于此效果
      const visited = new WeakSet();
      return {
        name: effect.name,
        type: effect.type,
        uuid: effect.uuid,
        img: effect.img,
        duration: effect.duration,
        flags: this.extractNestedData(effect.flags || {}, visited)
      };
    } catch (e) {
      console.warn(`${MODULE_ID} | 提取效果数据失败 (${effect.name}):`, e);
      return { name: effect.name, error: "无法序列化" };
    }
  }

  /**
   * 使用指定上下文打开AI生成器应用程序
   * @param type 内容类型
   * @param context 上下文数据
   */
  private openAIGeneratorWithContext(type: ContentType, context: any): void {
    try {
      // 传入当前文档引用
      const generator = new AIGeneratorApp(this.currentDocument);
      generator.render(true);
      
      // 在生成器应用打开后，设置相应的内容类型和参数
      setTimeout(() => {
        try {
          // 设置内容类型
          const $ = (window as any).$;
          if ($ && generator.element) {
            generator.element.find('select[name="content-type"]').val(type);
            
            // 设置预填充的参数
            const paramsJSON = JSON.stringify(context, null, 2);
            generator.element.find('textarea[name="params"]').val(paramsJSON);
            
            console.log(`${MODULE_ID} | 已设置生成器参数:`, type, paramsJSON);
          } else {
            console.error(`${MODULE_ID} | 无法设置生成器参数: jQuery或元素不可用`);
          }
        } catch (innerError) {
          console.error(`${MODULE_ID} | 设置生成器参数时出错:`, innerError);
        }
      }, 100); // 短暂延迟，确保UI已渲染
    } catch (error) {
      console.error(`${MODULE_ID} | 打开AI生成器应用时出错:`, error);
      if (ui && ui.notifications) {
        ui.notifications.error("无法打开AI生成器应用。请查看控制台获取详细信息。");
      }
    }
  }

  /**
   * 生成内容
   * @param type 内容类型
   * @param params 生成参数
   * @returns 生成的内容
   */
  async generateContent(type: string, params: any): Promise<any> {
    console.log(`${MODULE_ID} | 开始生成内容，类型: ${type}`);
    
    // 显示加载提示
    if (ui && ui.notifications) {
      ui.notifications.info("正在分析数据结构，这可能需要一些时间...");
    }
    
    try {
      // 步骤1: 提取数据结构（只有键名，不包含值）
      console.log(`${MODULE_ID} | 提取数据结构以便筛选关键字段`);
      const structureData = this.extractStructure(params);
      
      // 步骤2: 构造关键字段筛选的提示词
      const purpose = `${type}生成或增强`;
      const messages: Message[] = [
        {
          role: 'system',
          content: `你是一个 Pathfinder 2e 系统专家，精通 FVTT 的 PF2e 系统数据结构。
你的任务是从给定的数据结构中选择与内容生成相关的关键字段。
你应该仔细分析哪些字段对于生成或增强${type}内容是必要的。
请尽量减少不必要的字段以降低token消耗，只保留最重要的信息。
必须使用提供的函数来返回字段列表。`
        },
        {
          role: 'user',
          content: `我需要你从以下数据结构中选择与"${purpose}"相关的关键字段。
这是一个PF2e系统中的${params.documentName || ''}${params.documentName ? '（类型：' + params.type + '）' : ''}数据结构：

${JSON.stringify(structureData, null, 2)}

请分析这个结构，返回一个字段路径列表，只包含生成或增强${type}内容所需的关键字段。字段路径应该是用点号分隔的完整路径，例如"system.traits.value"。`
        }
      ];
      
      // 步骤3: 创建函数定义用于获取关键字段
      const fieldSelectionFunctionDefinition: FunctionDefinition = {
        name: 'select_key_fields',
        description: '从数据结构中选择关键字段',
        parameters: {
          type: 'object',
          properties: {
            fieldPaths: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: '选择的字段路径列表'
            },
            reason: {
              type: 'string',
              description: '选择这些字段的原因和分析'
            }
          },
          required: ['fieldPaths']
        }
      };
      
      // 步骤4: 调用API获取关键字段
      console.log(`${MODULE_ID} | 调用AI筛选关键字段`);
      if (ui && ui.notifications) {
        ui.notifications.info("AI正在筛选关键字段，请稍候...");
      }
      
      // 添加超时处理
      let fieldSelectionResponse;
      try {
        fieldSelectionResponse = await Promise.race([
          this.callAIAPI(messages, { functionDefinition: fieldSelectionFunctionDefinition }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('字段筛选超时')), 30000) // 30秒超时
          )
        ]) as ApiResponse;
      } catch (timeoutError) {
        console.warn(`${MODULE_ID} | 字段筛选超时或失败，将使用原始数据`);
        if (ui && ui.notifications) {
          ui.notifications.warn("字段筛选耗时过长，将使用完整数据进行处理");
        }
        
        // 创建函数定义，使用原始数据
        const contentFunctionDefinition = this.createFunctionDefinition(type, params);
        
        // 构造提示词，使用原始数据
        const contentMessages = this.constructPrompt(type as ContentType, params);
        
        // 调用API生成内容
        console.log(`${MODULE_ID} | 使用原始数据调用AI生成内容`);
        if (ui && ui.notifications) {
          ui.notifications.info("正在生成内容...");
        }
        const response = await this.callAIAPI(contentMessages, { functionDefinition: contentFunctionDefinition });
        
        // 解析响应
        const content = this.parseResponse(response, type as ContentType, 'select_key_fields');
        return content;
      }
      
      // 步骤5: 解析关键字段响应
      let fieldPaths: string[] = [];
      let selectionReason: string = '';
      if (fieldSelectionResponse.choices && fieldSelectionResponse.choices.length > 0) {
        const choice = fieldSelectionResponse.choices[0];
        if ((choice.message as FunctionCallMessage).function_call) {
          try {
            const functionArgs = JSON.parse((choice.message as FunctionCallMessage).function_call!.arguments);
            fieldPaths = functionArgs.fieldPaths || [];
            selectionReason = functionArgs.reason || '';
            console.log(`${MODULE_ID} | AI已选择${fieldPaths.length}个关键字段，原因: ${selectionReason}`);
          } catch (error) {
            console.error(`${MODULE_ID} | 解析字段筛选结果失败:`, error);
            if (ui && ui.notifications) {
              ui.notifications.warn("解析字段筛选结果失败，将使用完整数据");
            }
            // 使用原始数据
            fieldPaths = [];
          }
        } else {
          if (ui && ui.notifications) {
            ui.notifications.warn("AI未返回字段列表，将使用完整数据");
          }
        }
      }
      
      // 步骤6: 根据选定的字段路径筛选数据
      let filteredParams: any;
      if (fieldPaths.length > 0) {
        filteredParams = this.filterDataByPaths(params, fieldPaths);
        
        // 确保基本字段总是被包含
        filteredParams.name = params.name;
        filteredParams.type = params.type;
        filteredParams.documentName = params.documentName;
        
        // 记录数据大小减少情况
        const originalSize = JSON.stringify(params).length;
        const filteredSize = JSON.stringify(filteredParams).length;
        const reductionPercentage = ((originalSize - filteredSize) / originalSize * 100).toFixed(2);
        console.log(`${MODULE_ID} | 数据大小: ${originalSize} -> ${filteredSize} (减少 ${reductionPercentage}%)`);
        
        if (ui && ui.notifications) {
          ui.notifications.info(`字段筛选完成，数据量减少了${reductionPercentage}%`);
        }
      } else {
        // 如果没有字段被选中，使用原始数据
        filteredParams = params;
        console.log(`${MODULE_ID} | 未选择任何字段，使用原始数据`);
      }
      
      // 步骤7: 创建内容生成函数定义
      const contentFunctionDefinition = this.createFunctionDefinition(type, filteredParams);
      
      // 步骤8: 构造提示词
      const contentMessages = this.constructPrompt(type as ContentType, filteredParams);
      
      // 添加关键字段选择的说明
      if (fieldPaths.length > 0) {
        contentMessages.push({
          role: 'system',
          content: `注意：为了节省token使用，当前数据已经基于生成需求过滤，仅包含最相关的字段。
选择这些字段的原因是: ${selectionReason}`
        });
      }
      
      // 步骤9: 调用API生成内容
      console.log(`${MODULE_ID} | 使用筛选后的数据调用AI生成内容`);
      if (ui && ui.notifications) {
        ui.notifications.info("正在生成内容...");
      }
      
      // 添加超时处理
      let response;
      try {
        response = await Promise.race([
          this.callAIAPI(contentMessages, { functionDefinition: contentFunctionDefinition }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('生成内容超时')), 60000) // 60秒超时
          )
        ]) as ApiResponse;
      } catch (timeoutError) {
        console.error(`${MODULE_ID} | 生成内容超时:`, timeoutError);
        if (ui && ui.notifications) {
          ui.notifications.error("生成内容超时，请稍后重试或尝试简化请求");
        }
        throw new Error('生成内容超时，请稍后重试');
      }
      
      // 步骤10: 解析响应
      const content = this.parseResponse(response, type as ContentType, `modify_${type}`);
      
      return content;
    } catch (error) {
      console.error(`${MODULE_ID} | 生成内容出错:`, error);
      if (ui && ui.notifications) {
        ui.notifications.error(`生成内容失败: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    }
  }
  
  /**
   * 创建函数定义，基于实体类型和数据
   * @param type 实体类型
   * @param data 实体数据
   * @returns 函数定义对象
   */
  private createFunctionDefinition(type: string, data: any): FunctionDefinition {
    console.log(`${MODULE_ID} | 为实体类型 ${type} 创建函数定义，数据:`, data);
    
    // 根据实体类型确定函数名称
    let functionName = '';
    let description = '';
    
    // 确定文档类型和函数名称
    if (data?.documentName) {
      switch(data.documentName) {
        case 'Actor':
          // 区分角色和NPC/怪物
          if (data.type === 'character') {
            functionName = 'generate_character';
            description = '根据提供的数据生成或增强 PF2e 角色';
          } else if (data.type === 'npc') {
            functionName = 'generate_npc';
            description = '根据提供的数据生成或增强 PF2e NPC';
          } else {
            functionName = 'generate_creature';
            description = '根据提供的数据生成或增强 PF2e 生物';
          }
          break;
          
        case 'Item':
          // 根据物品类型设置函数名称
          switch(data.type) {
            case 'weapon':
              functionName = 'generate_weapon';
              description = '根据提供的数据生成或增强 PF2e 武器';
              break;
            case 'armor':
              functionName = 'generate_armor';
              description = '根据提供的数据生成或增强 PF2e 护甲';
              break;
            case 'equipment':
              functionName = 'generate_equipment';
              description = '根据提供的数据生成或增强 PF2e 装备';
              break;
            case 'consumable':
              functionName = 'generate_consumable';
              description = '根据提供的数据生成或增强 PF2e 消耗品';
              break;
            case 'spell':
              functionName = 'generate_spell';
              description = '根据提供的数据生成或增强 PF2e 法术';
              break;
            case 'feat':
              functionName = 'generate_feat';
              description = '根据提供的数据生成或增强 PF2e 专长';
              break;
            default:
              functionName = 'generate_item';
              description = '根据提供的数据生成或增强 PF2e 物品';
          }
          break;
          
        default:
          // 通用情况，使用内容类型作为函数名
          functionName = `generate_${type}`;
          description = `根据提供的数据生成或增强 PF2e ${type} 实体`;
      }
    } else {
      // 如果没有文档类型，使用内容类型
      functionName = `generate_${type}`;
      description = `根据提供的数据生成或增强 PF2e ${type} 实体`;
    }
    
    // 创建函数定义
    const definition: FunctionDefinition = {
      name: functionName,
      description: description,
      parameters: {
        type: 'object',
        properties: this.createDynamicParameters(data),
        required: ['name']
      }
    };
    
    console.log(`${MODULE_ID} | 创建的函数定义:`, definition);
    return definition;
  }
  
  /**
   * 创建动态参数，基于实体数据
   * @param data 实体数据
   * @returns 参数定义
   */
  private createDynamicParameters(data: any): Record<string, any> {
    // 基础参数，适用于所有实体类型
    const parameters: Record<string, any> = {
      name: {
        type: 'string',
        description: '实体的名称'
      },
      description: {
        type: 'string',
        description: '实体的详细描述'
      }
    };
    
    // 如果没有数据，返回基本参数
    if (!data) {
      return parameters;
    }
    
    // 简化的方法 - 不再依赖手动定义的参数
    // 因为我们现在直接使用从文档提取的数据，所以不需要详细定义每个参数
    
    // 添加一些常见的通用参数
    if (data.documentName === 'Actor') {
      parameters.level = {
        type: 'integer',
        description: '角色的等级或生物的挑战等级'
      };
    } else if (data.documentName === 'Item') {
      parameters.rarity = {
        type: 'string',
        description: '物品稀有度'
      };
    }
    
    return parameters;
  }
  
  /**
   * 添加角色通用参数
   */
  private addActorParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加角色特有参数
   */
  private addCharacterParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加NPC特有参数
   */
  private addNPCParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加生物/怪物特有参数
   */
  private addCreatureParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加物品通用参数
   */
  private addItemParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加武器特有参数
   */
  private addWeaponParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加护甲特有参数
   */
  private addArmorParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加法术特有参数
   */
  private addSpellParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加专长特有参数
   */
  private addFeatParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }
  
  /**
   * 添加消耗品特有参数
   */
  private addConsumableParameters(parameters: Record<string, any>, data: any): void {
    // 方法已移除，不再使用
  }

  /**
   * 根据内容类型构造提示词
   * @param type 内容类型
   * @param params 生成参数
   * @returns 消息数组
   */
  private constructPrompt(type: ContentType, params: any): Message[] {
    const messages: Message[] = [];
    
    // 添加系统提示词，包含函数调用指令
    messages.push({
      role: 'system',
      content: `你是一个 Pathfinder 2e 系统专家，精通 FVTT 的 PF2e 系统数据结构。
请根据用户提供的参数，使用函数调用生成符合 PF2e 系统规则和数据格式的内容。
必须使用提供的函数来返回数据，不要直接回复 JSON 格式。
确保生成的内容符合 Pathfinder 2e 规则，且与用户提供的现有数据兼容。`
    });
    
    // 根据不同内容类型添加特定的指导
    switch (type) {
      case ContentType.Monster:
        messages.push({
          role: 'system',
          content: `你需要创建或增强一个 PF2e 怪物。
使用 generate_monster 函数返回怪物数据。
确保生成的怪物属性和技能符合其等级，且遵循 PF2e 的平衡性规则。
如果用户提供了现有怪物数据，请基于该数据进行增强或补充。`
        });
        break;
      case ContentType.Item:
        messages.push({
          role: 'system',
          content: `你需要创建或增强一个 PF2e 物品。
使用 generate_item 函数返回物品数据。
确保物品的属性和效果符合其等级和类型，且遵循 PF2e 的装备规则。
如果用户提供了现有物品数据，请基于该数据进行增强或补充。`
        });
        break;
      case ContentType.Spell:
        messages.push({
          role: 'system',
          content: `你需要创建或增强一个 PF2e 法术。
使用 generate_spell 函数返回法术数据。
确保法术的属性和效果符合其环级和学派，且遵循 PF2e 的法术规则。
如果用户提供了现有法术数据，请基于该数据进行增强或补充。`
        });
        break;
      case ContentType.NPC:
        messages.push({
          role: 'system',
          content: `你需要创建或增强一个 PF2e NPC。
使用 generate_npc 函数返回 NPC 数据。
确保 NPC 的属性和技能符合其等级、种族和职业，且具有合理的背景和动机。
如果用户提供了现有 NPC 数据，请基于该数据进行增强或补充。`
        });
        break;
      case ContentType.Encounter:
        messages.push({
          role: 'system',
          content: `你需要创建或增强一个 PF2e 遭遇。
使用 generate_encounter 函数返回遭遇数据。
确保遭遇的难度和奖励符合参与的角色等级，且包含合理的敌人组合和环境描述。
如果用户提供了现有遭遇数据，请基于该数据进行增强或补充。`
        });
        break;
    }
    
    // 添加用户参数作为最后一条用户消息
    messages.push({
      role: 'user',
      content: `请根据以下参数生成一个 ${type}：\n${JSON.stringify(params, null, 2)}`
    });
    
    return messages;
  }

  /**
   * 兼容旧代码：调用AI API（已重命名为 callAIAPI）
   * @deprecated 请使用 callAIAPI 代替
   * @param messages 消息列表
   * @param options 可选的配置参数，支持函数调用和工具调用
   * @returns API响应
   */
  /**
   * 获取当前用户适用的API配置
   * @param usePlayerKey 是否强制使用玩家API Key（用于玩家限制功能）
   * @returns API配置对象
   */
  private getAPIConfig(usePlayerKey: boolean = false): { apiKey: string; apiUrl: string } {
    const game = getGame();
    const isGM = game?.user?.isGM;
    
    let apiKey: string;
    let apiUrl: string;
    
    if (isGM && !usePlayerKey) {
      // GM使用GM API Key
      apiKey = game?.settings?.get(MODULE_ID, 'apiKey') || '';
      apiUrl = game?.settings?.get(MODULE_ID, 'apiUrl') || 'https://api.openai.com/v1/chat/completions';
    } else {
      // 玩家使用玩家API Key
      const playerApiKey = game?.settings?.get(MODULE_ID, 'playerApiKey') || '';
      const playerApiUrl = game?.settings?.get(MODULE_ID, 'playerApiUrl') || '';
      
      if (!playerApiKey) {
        throw new Error('玩家API密钥未设置，请联系GM配置玩家API访问权限');
      }
      
      apiKey = playerApiKey;
      // 如果玩家API URL未设置，回退到GM的API URL
      apiUrl = playerApiUrl || game?.settings?.get(MODULE_ID, 'apiUrl') || 'https://api.openai.com/v1/chat/completions';
    }
    
    if (!apiKey) {
      throw new Error('API密钥未设置，请在模块设置中配置密钥');
    }
    
    return { apiKey, apiUrl };
  }

  /**
   * 调用AI API（通用方法，支持多种AI提供商）
   * 支持 OpenAI、Claude、Grok 等兼容的 API
   * @param messages 消息列表
   * @param options 可选配置
   * @returns API响应
   */
  private async callAIAPI(
    messages: Message[], 
    options?: {
      // 新的 tools 格式（推荐）
      tools?: ToolDefinition[];
      tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
      // 旧的 functions 格式（向后兼容）
      functions?: FunctionDefinition[];
      function_call?: 'auto' | 'none' | { name: string };
      // 单个函数定义（向后兼容）
      functionDefinition?: FunctionDefinition;
      functionCallConfig?: 'auto' | 'none' | { name: string };
      retryCount?: number;
      // 是否使用玩家API Key（用于玩家限制功能）
      usePlayerKey?: boolean;
      // 指定使用的模型（优先级高于通用设置）
      model?: string;
    }
  ): Promise<ApiResponse> {
    // 获取适用的API配置
    const apiConfig = this.getAPIConfig(options?.usePlayerKey || false);
    const apiKey = apiConfig.apiKey;
    const apiUrl = apiConfig.apiUrl;
    
    // 优先使用options中指定的模型，否则从设置中获取
    const game = getGame();
    const configuredModel = options?.model || game?.settings?.get(MODULE_ID, 'aiModel') || this.defaultModel;
    const model = configuredModel;
    
    console.log(`${MODULE_ID} | 调用 AI API，使用模型: ${model}，API地址: ${apiUrl}，使用${options?.usePlayerKey ? '玩家' : 'GM'} API Key`);
    
    // 解析选项参数
    const retryCount = options?.retryCount ?? 2;
    
    // 构建请求正文
    const requestBody: ApiRequest = {
      model: model,
      messages: messages,
      max_tokens: 4000
    };
    
    // 检测模型类型以确定使用哪种函数调用格式
    const isClaudeModel = model.toLowerCase().includes('claude');
    const isGPTModel = model.toLowerCase().includes('gpt') || model.toLowerCase().includes('deepseek');
    
    // 处理函数调用配置（按优先级处理）
    if (options?.tools && options.tools.length > 0) {
      if (isClaudeModel) {
        // Claude 使用 tools 格式，但格式不同于 GPT
        // 将 OpenAI 格式转换为 Claude 格式
        requestBody.tools = options.tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters
        }));
        // Claude 的 tool_choice 格式
        if (options.tool_choice === 'none') {
          // Claude 没有 'none' 选项，不传 tool_choice 即可
        } else if (options.tool_choice && typeof options.tool_choice === 'object') {
          requestBody.tool_choice = { type: 'tool', name: options.tool_choice.function.name };
        } else if (options.tool_choice === 'required') {
          requestBody.tool_choice = { type: 'any' };
        } else {
          requestBody.tool_choice = { type: 'auto' };
        }
        console.log(`${MODULE_ID} | Claude 使用工具调用 (tools): ${requestBody.tools.map((t: any) => t.name).join(', ')}`);
        console.log(`${MODULE_ID} | Claude 工具详情:`, JSON.stringify(requestBody.tools[0], null, 2));
        console.log(`${MODULE_ID} | Claude tool_choice:`, JSON.stringify(requestBody.tool_choice, null, 2));
      } else {
        // GPT 等其他模型使用新的 tools 格式
        requestBody.tools = options.tools;
        requestBody.tool_choice = options.tool_choice || 'auto';
        console.log(`${MODULE_ID} | 使用工具调用 (tools): ${options.tools.map(t => t.function.name).join(', ')}`);
      }
    } else if (options?.functions && options.functions.length > 0) {
      if (isClaudeModel) {
        // 如果是 Claude 且直接提供 functions，转换为 Claude tools 格式
        requestBody.tools = options.functions.map(f => ({
          name: f.name,
          description: f.description,
          input_schema: f.parameters
        }));
        if (options.function_call && typeof options.function_call === 'object') {
          requestBody.tool_choice = { type: 'tool', name: options.function_call.name };
        } else {
          requestBody.tool_choice = { type: 'auto' };
        }
        console.log(`${MODULE_ID} | Claude 使用工具调用 (functions->tools): ${requestBody.tools.map((t: any) => t.name).join(', ')}`);
      } else {
        // 非 Claude 模型使用旧的 functions 格式
        requestBody.functions = options.functions;
        requestBody.function_call = options.function_call || 'auto';
        console.log(`${MODULE_ID} | 使用函数调用 (functions): ${options.functions.map(f => f.name).join(', ')}`);
      }
    } else if (options?.functionDefinition) {
      if (isClaudeModel) {
        // Claude 使用 tools 格式
        requestBody.tools = [{
          name: options.functionDefinition.name,
          description: options.functionDefinition.description,
          input_schema: options.functionDefinition.parameters
        }];
        if (options.functionCallConfig && typeof options.functionCallConfig === 'object') {
          requestBody.tool_choice = { type: 'tool', name: options.functionCallConfig.name };
        } else {
          requestBody.tool_choice = { type: 'auto' };
        }
        console.log(`${MODULE_ID} | Claude 使用工具调用 (单个): ${options.functionDefinition.name}`);
      } else {
        // GPT 等其他模型转换为 tools 格式
        requestBody.tools = [{
          type: 'function',
          function: options.functionDefinition
        }];
        requestBody.tool_choice = options.functionCallConfig === 'none' ? 'none' : 
                                 options.functionCallConfig && typeof options.functionCallConfig === 'object' ? 
                                 { type: 'function', function: { name: options.functionCallConfig.name } } : 'auto';
        console.log(`${MODULE_ID} | GPT 使用工具调用 (单个): ${options.functionDefinition.name}`);
      }
    }
    
    // 添加详细日志：显示完整的请求体
    console.log(`${MODULE_ID} | ========== API 请求详情 ==========`);
    console.log(`${MODULE_ID} | 模型: ${requestBody.model}`);
    console.log(`${MODULE_ID} | 消息数量: ${requestBody.messages.length}`);
    if (requestBody.tools) {
      console.log(`${MODULE_ID} | 工具数量: ${requestBody.tools.length}`);
      console.log(`${MODULE_ID} | 工具列表: ${requestBody.tools.map((t: any) => t.function?.name || t.name).join(', ')}`);
      console.log(`${MODULE_ID} | tool_choice: ${typeof requestBody.tool_choice === 'object' ? JSON.stringify(requestBody.tool_choice) : requestBody.tool_choice}`);
    }
    console.log(`${MODULE_ID} | 完整请求体:`, JSON.stringify(requestBody, null, 2));
    console.log(`${MODULE_ID} | =====================================`);
    
    let attempts = 0;
    let lastError: Error | null = null;
    
    // 添加重试逻辑
    while (attempts <= retryCount) {
      try {
        // 构建请求选项
        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody),
          mode: 'cors' as RequestMode,
          credentials: 'omit' as RequestCredentials
        };
        
        // 发送请求
        const response = await fetch(apiUrl, requestOptions);
        
        // 检查响应状态
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API请求失败，状态码: ${response.status}, 错误: ${errorText}`);
        }
        
        // 解析响应
        const data = await response.json();
        
        // 检查响应中是否包含预期的结构
        if (!data.choices || data.choices.length === 0) {
          throw new Error('API响应没有包含选择结果');
        }
        
        // 返回解析的响应
        return data as ApiResponse;
      } catch (error) {
        console.error(`${MODULE_ID} | API调用错误:`, error);
        
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;
        
        // 如果还有重试机会，等待后重试
        if (attempts <= retryCount) {
          console.log(`${MODULE_ID} | 重试 API 调用 (${attempts}/${retryCount})`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
        }
      }
    }
    
    // 如果所有重试都失败，抛出最后的错误
    throw lastError || new Error('API调用失败，原因未知');
  }
  
  /**
   * 解析 API 响应，支持函数调用响应
   * @param response API 响应
   * @param type 内容类型
   * @param expectedFunctionName 期望的函数名称（可选）
   * @returns 解析后的内容
   */
  private parseResponse(response: ApiResponse | any, type: ContentType, expectedFunctionName?: string): any {
    console.log(`解析 ${type} 内容响应:`, response);
    
    // 检查API响应类型
    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      
      // 检查是否有工具调用（新格式）
      if ((choice.message as ToolCallMessage).tool_calls && (choice.message as ToolCallMessage).tool_calls!.length > 0) {
        const toolCall = (choice.message as ToolCallMessage).tool_calls![0];
        console.log(`${MODULE_ID} | 检测到工具调用响应:`, toolCall.function.name);
        
        try {
          // 解析工具调用参数
          const functionArgs = JSON.parse(toolCall.function.arguments);
          console.log(`${MODULE_ID} | 工具调用参数:`, functionArgs);
          
          // 返回解析后的工具调用结果
          return functionArgs;
        } catch (error) {
          console.error(`${MODULE_ID} | 解析工具调用参数失败:`, error);
          // 不要直接抛出错误，尝试从文本内容中解析
        }
      }
      // 检查是否有函数调用（旧格式，向后兼容）
      else if ((choice.message as FunctionCallMessage).function_call) {
        console.log(`${MODULE_ID} | 检测到函数调用响应:`, (choice.message as FunctionCallMessage).function_call!.name);
        
        try {
          // 解析函数调用参数
          const functionArgs = JSON.parse((choice.message as FunctionCallMessage).function_call!.arguments);
          console.log(`${MODULE_ID} | 函数调用参数:`, functionArgs);
          
          // 返回解析后的函数调用结果
          return functionArgs;
        } catch (error) {
          console.error(`${MODULE_ID} | 解析函数调用参数失败:`, error);
          // 不要直接抛出错误，尝试从文本内容中解析
        }
      }
      
      // 处理文本响应（包括function_call失败的情况）
      if (choice.message.content) {
        const content = choice.message.content;
        console.log(`${MODULE_ID} | 解析文本响应: ${content.substring(0, 100)}...`);
        
        // 首先尝试使用通用Function Call解析器
        if (expectedFunctionName) {
          const functionCall = this.parseUniversalFunctionCall(content, expectedFunctionName);
          if (functionCall) {
            console.log(`${MODULE_ID} | 通用解析器成功解析Function Call`);
            return functionCall.parameterValue;
          }
        }
        
        // 尝试从文本中提取 JSON
        try {
          // 查找可能的 JSON 内容
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                           content.match(/{[\s\S]*}/) || 
                           content.match(/\[[\s\S]*\]/);
                           
          if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            return JSON.parse(jsonStr);
          }
          
          // 如果没有找到 JSON，返回原始文本
          return content;
        } catch (error) {
          // 如果不是 JSON 格式，则返回原始文本内容
          console.warn(`${MODULE_ID} | 提取 JSON 失败，返回原始文本`);
          return content;
        }
      }
    }
    
    // 未知响应格式
    console.error('未知的API响应格式:', response);
    throw new Error('无法解析API响应，未知格式');
  }

  /**
   * 验证生成的内容是否符合 PF2e 系统规范
   * @param content 生成的内容
   * @returns 是否有效
   */
  async validateContent(content: any): Promise<boolean> {
    // TODO: 实现 PF2e 数据验证逻辑
    console.log('Validating content:', content);
    return true; // 暂时始终返回验证通过
  }

  /**
   * 创建兼容的 callService 方法，用于向后兼容
   * 支持多种调用格式：
   * 1. callService(messages, options) - 新格式（options对象）
   * 2. callService(messages, model) - 指定模型字符串
   * 3. callService(messages, functionDefinition, retryCount, functionCallConfig) - 旧格式
   * 4. callService(messages) - 简单调用
   */
  private createCompatibleCallService() {
    return async (
      messages: Message[],
      optionsOrFunctionDef?: any,
      retryCount?: number,
      functionCallConfig?: any
    ): Promise<ApiResponse> => {
      
      // 检测调用格式
      if (typeof optionsOrFunctionDef === 'string') {
        // 字符串参数：callService(messages, model)
        return this.callAIAPI(messages, { model: optionsOrFunctionDef });
      } else if (optionsOrFunctionDef && typeof optionsOrFunctionDef === 'object' && 
          (optionsOrFunctionDef.functions || optionsOrFunctionDef.tools || 
           optionsOrFunctionDef.function_call || optionsOrFunctionDef.tool_choice ||
           optionsOrFunctionDef.model)) {
        // 新格式：callService(messages, options)
        return this.callAIAPI(messages, optionsOrFunctionDef);
      } else if (optionsOrFunctionDef && optionsOrFunctionDef.name) {
        // 旧格式：callService(messages, functionDefinition, retryCount, functionCallConfig)
        return this.callAIAPI(messages, {
          functionDefinition: optionsOrFunctionDef,
          retryCount: retryCount,
          functionCallConfig: functionCallConfig
        });
      } else {
        // 简单调用：callService(messages) 或 未识别的参数
        return this.callAIAPI(messages, optionsOrFunctionDef);
      }
    };
  }

  /**
   * 打开 AI 生成器应用
   */
  openAIGenerator(): void {
    // 检查GM权限
    const game = getGame();
    if (!game || !game.user || !game.user.isGM) {
      ui.notifications?.warn('AI助手功能仅限GM使用');
      return;
    }
    
    // 使用类型断言来修复类型检查问题
    // 注意：从顶层菜单打开时没有文档上下文，需要提示用户
    const app = new AIGeneratorApp();
    (app as any).render(true);
  }

  /**
   * 打开物品生成器应用
   */
  openItemGenerator(): void {
    try {
      new ItemGeneratorApp();
      console.log(`${MODULE_ID} | 物品生成器已打开`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开物品生成器失败:`, error);
      ui.notifications.error('打开物品生成器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开PF2e数据探索器应用
   */
  openPF2eExplorer(): void {
    try {
      new PF2eExplorerApp();
      console.log(`${MODULE_ID} | PF2e数据探索器已打开`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开PF2e数据探索器失败:`, error);
      ui.notifications.error('打开PF2e数据探索器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开特性生成器应用
   */
  openFeatureGenerator(): void {
    try {
      const app = new FeatureGeneratorApp();
      
      // 设置AI服务实例
      app.setAIService({
        callService: this.createCompatibleCallService(),
        getServiceName: () => 'AI Assistant',
        getAvailableModels: () => Object.values(AIModel)
      });
      
      app.render(true);
      console.log(`${MODULE_ID} | 特性生成器已打开`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开特性生成器失败:`, error);
      ui.notifications.error('打开特性生成器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开专长生成器应用
   */
  openFeatGenerator(): void {
    try {
      const app = new FeatGeneratorApp();
      
      // 设置AI服务实例
      app.setAIService({
        callService: this.createCompatibleCallService(),
        getServiceName: () => 'AI Assistant',
        getAvailableModels: () => Object.values(AIModel)
      });
      
      (app as any).render(true);
      console.log(`${MODULE_ID} | 专长生成器已打开`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开专长生成器失败:`, error);
      ui.notifications.error('打开专长生成器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开词条碎片生成器应用
   */
  openFragmentGenerator(): void {
    try {
      // 检查是否为GM
      const game = getGame();
      if (!game || !game.user || !game.user.isGM) {
        ui.notifications.warn('词条碎片生成器仅限GM使用');
        return;
      }

      const app = new FragmentGeneratorApp();
      
      // 设置AI服务实例
      app.setAIService({
        callService: this.createCompatibleCallService(),
        getServiceName: () => 'AI Assistant',
        getAvailableModels: () => Object.values(AIModel)
      });
      
      (app as any).render(true);
      console.log(`${MODULE_ID} | 词条碎片生成器已打开`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开词条碎片生成器失败:`, error);
      ui.notifications.error('打开词条碎片生成器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开神龛点数管理器应用
   */
  openShrinePointManager(): void {
    try {
      ShrinePointManager.show();
      console.log(`${MODULE_ID} | 神龛点数管理器已打开`);
    } catch (error) {
      console.error(`${MODULE_ID} | 打开神龛点数管理器失败:`, error);
      ui.notifications.error('打开神龛点数管理器失败，请查看控制台错误信息');
    }
  }

  /**
   * 打开文档修改器应用
   * @param type 内容类型
   * @param context 上下文数据
   * @param document 文档对象
   */
  private openDocumentModifierApp(type: ContentType, context: any, document: any): void {
    try {
      // 传入文档引用
      const generator = new AIGeneratorApp(document);
      generator.render(true);
      
      // 在生成器应用打开后，设置相应的内容类型
      setTimeout(() => {
        try {
          // 设置内容类型
          const $ = (window as any).$;
          if ($ && generator.element) {
            generator.element.find('select[name="content-type"]').val(type);
            console.log(`${MODULE_ID} | 已设置生成器内容类型:`, type);
          } else {
            console.error(`${MODULE_ID} | 无法设置生成器参数: jQuery或元素不可用`);
          }
        } catch (innerError) {
          console.error(`${MODULE_ID} | 设置生成器参数时出错:`, innerError);
        }
      }, 100); // 短暂延迟，确保UI已渲染
    } catch (error) {
      console.error(`${MODULE_ID} | 打开文档修改器应用时出错:`, error);
      if (ui && ui.notifications) {
        ui.notifications.error("无法打开文档修改器应用。请查看控制台获取详细信息。");
      }
    }
  }

  /**
   * 创建修改文档的函数定义
   * @param type 文档类型
   * @param data 文档数据
   * @returns 函数定义
   */
  createModifyFunctionDefinition(type: string, data: any): FunctionDefinition {
    console.log(`${MODULE_ID} | 为文档类型 ${type} 创建修改函数定义`);
    
    // 根据文档类型定义函数名和描述
    let functionName = 'modify_document';
    let functionDescription = '修改 Foundry VTT 文档数据';
    
    if (type === 'actor' || type === 'npc' || type === 'character') {
          functionName = 'modify_actor';
      functionDescription = '修改 PF2e 角色/NPC 数据';
    } else if (type === 'item' || type === 'weapon' || type === 'equipment' || type === 'consumable') {
          functionName = 'modify_item';
      functionDescription = '修改 PF2e 物品数据';
    } else if (type === 'spell') {
      functionName = 'modify_spell';
      functionDescription = '修改 PF2e 法术数据';
    }
    
    // 确保始终包含原始数据和修改原因参数
    const baseParams: Record<string, any> = {
      original_data: {
        type: 'object',
        description: '要修改的原始数据'
      },
          changes: {
            type: 'array',
        description: '要应用的修改列表',
            items: {
              type: 'object',
              properties: {
                path: { 
                  type: 'string', 
                  description: '要修改的数据路径。常见路径示例：\n' +
                    '- 基础：name, img\n' +
                    '- 属性：system.abilities.str.value, system.abilities.dex.value\n' +
                    '- 生命值：system.attributes.hp.value, system.attributes.hp.max\n' +
                    '- 护甲：system.attributes.ac.value\n' +
                    '- 技能：system.skills.acrobatics.rank\n' +
                    '- 豁免：system.saves.fortitude.value\n' +
                    '- 描述：system.details.biography.value\n' +
                    '- 特质：system.traits.value (数组，使用add/remove操作)'
                },
            value: {
              description: '新的值，可以是字符串、数字、布尔值、对象或数组'
            },
                operation: { 
                  type: 'string', 
              description: '修改操作类型',
              enum: ['set', 'add', 'remove']
                }
              },
          required: ['path', 'value', 'operation']
        }
          },
          reason: { 
            type: 'string', 
        description: '修改的原因或说明'
      }
    };
    
    // 创建完整的函数定义
    const functionDefinition: FunctionDefinition = {
      name: functionName,
      description: functionDescription,
      parameters: {
        type: 'object',
        properties: baseParams,
        required: ['original_data', 'changes']
      }
    };
    
    // 添加示例说明，帮助模型理解格式
    functionDefinition.description += `\n\n## 调用示例：

示例1 - 修改属性和生命值：
{
  "changes": [
    {"path": "system.abilities.str.value", "value": 18, "operation": "set"},
    {"path": "system.attributes.hp.max", "value": 45, "operation": "set"}
  ],
  "reason": "提升力量和生命值上限"
}

示例2 - 添加特质：
{
  "changes": [
    {"path": "system.traits.value", "value": "强壮", "operation": "add"},
    {"path": "system.traits.value", "value": "勇敢", "operation": "add"}
  ],
  "reason": "为角色添加特质"
}

示例3 - 修改描述（HTML格式）：
{
  "changes": [
    {"path": "system.details.biography.value", "value": "<p>这位战士来自北方...</p>", "operation": "set"}
  ],
  "reason": "更新角色背景故事"
}`;
    
    console.log(`${MODULE_ID} | 创建的修改函数定义:`, functionDefinition);
    
    return functionDefinition;
  }
  
  /**
   * 构造带有用户需求的提示词
   * @param type 内容类型
   * @param data 文档数据
   * @param userPrompt 用户需求
   * @returns 消息数组
   */
  constructPromptWithUserRequest(type: ContentType, data: any, userPrompt: string): Message[] {
    const messages: Message[] = [];
    
    // 添加系统提示词
    messages.push({
      role: 'system',
      content: `你是一个 Pathfinder 2e 系统专家，精通 FVTT 的 PF2e 系统数据结构。
请根据用户提供的需求，使用函数调用来修改文档数据。
必须使用提供的函数来返回修改指令，不要直接回复 JSON 格式。
确保修改符合 Pathfinder 2e 规则，且与现有数据结构兼容。`
    });
    
    // 根据不同文档类型添加特定的指导
    if (data?.documentName === 'Actor') {
      messages.push({
        role: 'system',
        content: `你需要修改一个 PF2e 角色或 NPC 的数据。
使用 modify_actor 函数返回修改指令。
确保修改后的属性和技能符合角色等级，且遵循 PF2e 的规则。
尽量使用现有数据结构的路径，避免创建新的路径。
常见路径包括：
- name: 角色名称
- system.abilities.str.mod: 力量调整值
- system.attributes.hp.max: 最大生命值
- system.details.level.value: 等级值
- system.traits.value: 特性数组`
      });
    } else if (data?.documentName === 'Item') {
      messages.push({
        role: 'system',
        content: `你需要修改一个 PF2e 物品的数据。
使用 modify_item 函数返回修改指令。
确保修改后的物品属性符合其等级和类型，且遵循 PF2e 的规则。
尽量使用现有数据结构的路径，避免创建新的路径。
常见路径包括：
- name: 物品名称
- system.level.value: 物品等级
- system.price.value: 价格数值
- system.price.coin: 价格货币类型
- system.traits.value: 特性数组
- system.description.value: 描述HTML文本
- system.damage.dice: 伤害骰数量(武器)
- system.damage.die: 伤害骰类型(武器)`
      });
    }
    
    // 添加文档数据信息
    messages.push({
      role: 'system',
      content: `以下是当前文档的数据结构:\n${JSON.stringify(data, null, 2)}`
    });
    
    // 添加用户需求
    messages.push({
      role: 'user',
      content: userPrompt
    });
    
    return messages;
  }
  
  /**
   * 解析修改响应
   * @param response API 响应
   * @returns 解析后的修改指令
   */
  parseModifyResponse(response: ApiResponse): DocumentModification {
    console.log(`${MODULE_ID} | 解析修改响应:`, response);
    
    try {
      // 获取响应中的第一个选择
      const choice = response.choices[0];
      
      if (!choice) {
        throw new Error('API响应中没有选择项');
      }
      
      // 优先尝试从tool_calls获取结果（新格式）
      const toolCallMessage = choice.message as ToolCallMessage;
      if (toolCallMessage.tool_calls && toolCallMessage.tool_calls.length > 0) {
        console.log(`${MODULE_ID} | 使用工具调用响应格式 (tool_calls)`);
        
        const toolCall = toolCallMessage.tool_calls[0];
        console.log(`${MODULE_ID} | 工具调用名称: ${toolCall.function.name}`);
        
        try {
          // 解析工具调用参数
          const argsJson = toolCall.function.arguments;
          console.log(`${MODULE_ID} | 工具调用参数JSON:`, argsJson);
          const args = JSON.parse(argsJson);
          
          // 确保有changes字段
          if (!args.changes || !Array.isArray(args.changes)) {
            console.log(`${MODULE_ID} | 工具调用参数缺少changes数组，尝试其他解析方法`);
            throw new Error('工具调用参数中缺少有效的changes数组');
          }
          
          // 映射数据修改
          const changes: DataChange[] = args.changes.map((change: any) => {
            // 确保每个change都有必要的字段
            if (!change.path || !change.operation) {
              console.warn(`${MODULE_ID} | change对象缺少必要字段:`, change);
              // 提供默认值
              return {
                path: change.path || 'system.description.value',
                value: change.value || '',
                operation: (change.operation as 'set' | 'add' | 'remove') || 'set'
              };
            }
            
            return {
              path: change.path,
              value: change.value,
              operation: change.operation as 'set' | 'add' | 'remove'
            };
          });
          
          const reason = args.reason || '未提供修改原因';
          
          console.log(`${MODULE_ID} | ✅ 成功解析工具调用，获得 ${changes.length} 个修改`);
          return { changes, reason };
        } catch (parseError) {
          console.error(`${MODULE_ID} | 解析工具调用参数出错:`, parseError);
          // 解析失败时转而尝试其他方法
        }
      }
      
      // 其次尝试从function_call获取结果（旧格式）
      if (choice.message && (choice.message as FunctionCallMessage).function_call) {
        console.log(`${MODULE_ID} | 使用函数调用响应格式 (function_call)`);
        
        try {
          // 解析函数调用参数
          const argsJson = (choice.message as FunctionCallMessage).function_call!.arguments;
          console.log(`${MODULE_ID} | 函数调用参数JSON:`, argsJson);
          const args = JSON.parse(argsJson);
          
          // 确保有changes字段
          if (!args.changes || !Array.isArray(args.changes)) {
            console.log(`${MODULE_ID} | 函数调用参数缺少changes数组，尝试其他解析方法`);
            throw new Error('函数调用参数中缺少有效的changes数组');
          }
          
          // 映射数据修改
          const changes: DataChange[] = args.changes.map((change: any) => {
            // 确保每个change都有必要的字段
            if (!change.path || !change.operation) {
              console.warn(`${MODULE_ID} | change对象缺少必要字段:`, change);
              // 提供默认值
              return {
                path: change.path || 'system.description.value',
                value: change.value || '',
                operation: (change.operation as 'set' | 'add' | 'remove') || 'set'
              };
            }
            
            return {
              path: change.path,
              value: change.value,
              operation: change.operation as 'set' | 'add' | 'remove'
            };
          });
          
          const reason = args.reason || '未提供修改原因';
          
          console.log(`${MODULE_ID} | ✅ 成功解析函数调用，获得 ${changes.length} 个修改`);
          return { changes, reason };
        } catch (parseError) {
          console.error(`${MODULE_ID} | 解析函数调用参数出错:`, parseError);
          // 解析失败时转而尝试解析内容
        }
      }
      
      // 如果没有函数调用或函数调用解析失败，尝试从文本内容提取JSON
      console.log(`${MODULE_ID} | 尝试从文本内容解析修改指令`);
      
      // 获取文本内容
      const content = choice.message.content || '';
      console.log(`${MODULE_ID} | 文本内容:`, content.substring(0, 500) + '...');
      
      // 尝试从内容中提取JSON对象
      const jsonMatches = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || 
                         content.match(/(\{[\s\S]*?\})/) ||
                         content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      
      if (jsonMatches && jsonMatches[1]) {
        try {
          let jsonContent = jsonMatches[1];
          let parsedData = JSON.parse(jsonContent);
          
          // 根据返回的JSON结构检查是否有changes字段
          if (Array.isArray(parsedData)) {
            // 如果是数组，假设它是changes数组
            return {
              changes: parsedData.map(item => ({
                path: item.path,
                value: item.value,
                operation: item.operation || 'set'
              })),
              reason: '从内容中提取的修改'
            };
          } else if (parsedData.changes && Array.isArray(parsedData.changes)) {
            // 如果是包含changes字段的对象
            return {
              changes: parsedData.changes.map((item: any) => ({
                path: item.path,
                value: item.value,
                operation: item.operation || 'set'
              })),
              reason: parsedData.reason || '从内容中提取的修改'
            };
          }
        } catch (jsonError) {
          console.error(`${MODULE_ID} | 解析JSON内容失败:`, jsonError);
          // 解析JSON失败，尝试后续方法
        }
      }
      
      // 如果上述方法都失败，尝试从文本内容进行结构化提取
      console.log(`${MODULE_ID} | 尝试从文本内容中结构化提取修改指令`);
      
      // 尝试提取描述相关的修改
      const descriptionMatch = content.match(/描述[:：][\s\n]*(.+?)(?:\n\n|\n(?=\S)|$)/s);
      
      if (descriptionMatch && descriptionMatch[1]) {
        // 找到了描述文本
        const descriptionText = descriptionMatch[1].trim();
        
        // 根据上下文猜测路径
        const pathGuesses = [
          "system.details.description.value", 
          "system.description.value",
          "data.details.description.value",
          "details.description.value",
          "description.value",
          "description"
        ];
        
        // 使用第一个可能的路径
            return {
          changes: [{
            path: pathGuesses[0],
            value: descriptionText,
            operation: 'set'
          }],
          reason: '从文本内容提取的描述修改'
        };
      }
      
      // 使用增强的文本解析器
      const parseResult = this.parseModifyResponseFromText(content);
      if (parseResult) {
        console.log(`${MODULE_ID} | 成功从文本内容解析修改指令`);
        return parseResult;
      }
      
      // 如果所有方法都失败，返回一个默认的修改指令
      console.warn(`${MODULE_ID} | 无法解析修改内容，返回默认修改指令`);
      return {
        changes: [{
          path: 'system.description.value',
          value: content.trim() || '翻译内容提取失败',
          operation: 'set' as const
        }],
        reason: '无法解析API响应，使用默认修改'
      };
      
        } catch (error) {
      console.error(`${MODULE_ID} | 解析修改响应出错:`, error);
      
      // 创建一个错误提示，告知用户
          return {
        changes: [{
          path: 'system.details.description.value',
          value: `解析AI响应时出错: ${error instanceof Error ? error.message : String(error)}\n\n请尝试使用更具体的指令重新生成，或联系开发者报告此问题。`,
          operation: 'set'
        }],
        reason: '解析响应失败，返回错误信息'
      };
    }
  }
  
  /**
   * 应用变更到文档
   * @param document 文档对象
   * @param changes 变更列表
   * @returns 是否成功应用
   */
  async applyChangesToDocument(document: any, changes: DataChange[]): Promise<boolean> {
    try {
      console.log(`${MODULE_ID} | 应用变更到文档:`, changes);
      
      // 保存当前文档引用，供getUpdatePathForFoundry使用
      this.currentDocument = document;
      
      // 添加更多调试信息
      console.log(`${MODULE_ID} | 当前文档类型: ${document.documentName || document.constructor.name}`);
      
      const game = getGame();
      if (!game) return false;
      
      // 创建更新数据对象
      const updateData: Record<string, any> = {};
      
      // 处理每个变更
      for (const change of changes) {
        const { path, value, operation } = change;
        
        console.log(`${MODULE_ID} | 处理变更 => 路径: "${path}", 操作: "${operation}", 值:`, value);
        
        // 根据操作类型处理
        switch (operation) {
          case 'set':
            // 使用转换后的路径设置值
            const updatePath = this.getUpdatePathForFoundry(path);
            updateData[updatePath] = value;
            console.log(`${MODULE_ID} | 变更操作 => SET "${path}" -> "${updatePath}" = `, value);
            break;
            
          case 'add':
            // 处理数组添加
            // 需要先获取当前值
            let currentArray = this.getValueByPath(document, path);
            if (!Array.isArray(currentArray)) {
              console.log(`${MODULE_ID} | 变更操作 => ADD 目标不是数组，创建新数组`);
              currentArray = [];
            } else {
              console.log(`${MODULE_ID} | 变更操作 => ADD 现有数组:`, currentArray);
            }
            
            // 添加新值
            if (Array.isArray(value)) {
              updateData[this.getUpdatePathForFoundry(path)] = [...currentArray, ...value];
              console.log(`${MODULE_ID} | 变更操作 => ADD 添加多个值:`, value);
            } else {
              updateData[this.getUpdatePathForFoundry(path)] = [...currentArray, value];
              console.log(`${MODULE_ID} | 变更操作 => ADD 添加单个值:`, value);
            }
            break;
            
          case 'remove':
            // 处理数组删除
            // 需要先获取当前值
            let currentValue = this.getValueByPath(document, path);
            console.log(`${MODULE_ID} | 变更操作 => REMOVE 当前值:`, currentValue);
            
            if (Array.isArray(currentValue)) {
              // 如果值是数组，移除指定元素
              if (Array.isArray(value)) {
                const newArray = currentValue.filter(item => !value.includes(item));
                updateData[this.getUpdatePathForFoundry(path)] = newArray;
                console.log(`${MODULE_ID} | 变更操作 => REMOVE 移除多个值后:`, newArray);
              } else {
                const newArray = currentValue.filter(item => item !== value);
                updateData[this.getUpdatePathForFoundry(path)] = newArray;
                console.log(`${MODULE_ID} | 变更操作 => REMOVE 移除单个值后:`, newArray);
              }
            } else {
              // 如果不是数组，设置为空或null
              updateData[this.getUpdatePathForFoundry(path)] = null;
              console.log(`${MODULE_ID} | 变更操作 => REMOVE 设置为null`);
            }
            break;
        }
      }
      
      // 确保更新数据不为空
      if (Object.keys(updateData).length === 0) {
        console.warn(`${MODULE_ID} | 无变更需要应用`);
        return false;
      }
      
      console.log(`${MODULE_ID} | 更新数据:`, updateData);
      console.log(`${MODULE_ID} | 即将更新文档:`, document.id, document.name);
      
      // 使用 FVTT API 更新文档
      await document.update(updateData);
      console.log(`${MODULE_ID} | 文档更新成功`);
      
      // 清除当前文档引用
      this.currentDocument = null;
      
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | 应用更改时出错:`, error);
      // 确保即使出错也清除文档引用
      this.currentDocument = null;
      return false;
    }
  }
  
  /**
   * 将路径转换为Foundry VTT数据更新所需的格式
   * @param path 原始路径，支持JSONPath和常规路径
   * @returns Foundry VTT兼容的更新路径
   */
  private getUpdatePathForFoundry(path: string): string {
    console.log(`${MODULE_ID} | getUpdatePathForFoundry - 输入路径: "${path}"`);
    
    // 确保路径是标准化的
    const jsonPath = this.standardizePath(path);
    console.log(`${MODULE_ID} | getUpdatePathForFoundry - 标准化路径: "${jsonPath}"`);
    
    // 转换为foundry路径格式
    const foundryPath = this.convertJSONPathToFoundryPath(jsonPath);
    console.log(`${MODULE_ID} | getUpdatePathForFoundry - 转换后路径: "${foundryPath}"`);
    
    return foundryPath;
  }
  
  /**
   * 将JSON路径转换为Foundry路径
   * @param path JSON路径，如 data.items[3].name
   * @returns Foundry更新路径，如 data.items.3.name
   */
  private convertJSONPathToFoundryPath(path: string): string {
    console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 处理路径: "${path}"`);
    
    // 如果路径包含数组索引模式 [x]，需要处理特殊情况
    if (path.includes('[')) {
      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 检测到数组路径`);
      
      // 分解路径为各个部分
      const parts = path.split(/\.|\[|\]/).filter(Boolean);
      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 路径分解为:`, parts);
      
      let result = '';
      let currentPath = '';
      
      for (let i = 0; i < parts.length; i++) {
        let part = parts[i];
        
        // 检查当前部分是否是数字（表示数组索引）
        const isNumeric = /^\d+$/.test(part);
        console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 部分 "${part}" ${isNumeric ? '是' : '不是'}数字`);
        
        if (isNumeric) {
          // 这是一个数组索引
          // 需要检查前一部分是否是根据名称确定的数组项
          
          // 构建到当前位置的路径（不包括当前的数字索引）
          if (result) {
            currentPath = result;
          }
          
          // 检查前一部分是否是具有_id或name的数组
          const previousPart = i > 0 ? parts[i - 1] : '';
          console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 前一部分: "${previousPart}", 当前路径: "${currentPath}"`);
          
          if (previousPart && this.currentDocument) {
            try {
              // 获取对应数组
              const arrayPath = currentPath ? `${currentPath}.${previousPart}` : previousPart;
              const array = this.getValueByPath(this.currentDocument, arrayPath);
              console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 尝试获取数组: "${arrayPath}"`, 
                array ? `(找到长度为 ${Array.isArray(array) ? array.length : 'non-array'})` : '(未找到)');
              
              // 输出数组元素类型信息
              if (Array.isArray(array)) {
                console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 数组包含 ${array.length} 个元素`);
                // 输出前几个元素的类型信息
                const sampleSize = Math.min(array.length, 3);
                for (let j = 0; j < sampleSize; j++) {
                  const element = array[j];
                  console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 数组元素[${j}]类型: ${typeof element}`);
                  if (element && typeof element === 'object') {
                    console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 元素[${j}]键: ${Object.keys(element).join(', ')}`);
                  }
                }
              }
              
              // 检查是否为具有_id字段的数组
              if (Array.isArray(array) && array.length > 0) {
                const index = parseInt(part);
                
                // 检查数组中是否有该索引
                if (index >= 0 && index < array.length) {
                  const item = array[index];
                  console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 数组项索引 ${index}:`, 
                    item ? (typeof item === 'object' ? `对象(键: ${Object.keys(item).join(', ')})` : typeof item) : 'undefined');
                  
                  // 检查项是否有_id或name字段
                  if (item && typeof item === 'object') {
                    if ('_id' in item) {
                      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 使用_id (${item._id})代替索引`);
                      // 使用_id代替索引
                      result = result ? `${result}.${previousPart}.${item._id}` : `${previousPart}.${item._id}`;
                      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 路径更新为: "${result}"`);
                      continue;
                    } else if ('name' in item && typeof item.name === 'string') {
                      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 使用name (${item.name})代替索引`);
                      // 使用name代替索引
                      result = result ? `${result}.${previousPart}.${item.name}` : `${previousPart}.${item.name}`;
                      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 路径更新为: "${result}"`);
                      continue;
                    } else {
                      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 元素没有_id或name字段，将使用数字索引`);
                    }
                  } else {
                    console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 元素不是对象，将使用数字索引`);
                  }
                } else {
                  console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 索引${index}超出范围(0-${array.length-1})`);
                }
              } else if (Array.isArray(array)) {
                console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 数组为空，将使用数字索引`);
              } else {
                console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 获取的值不是数组，将使用数字索引`);
              }
            } catch (error) {
              console.warn(`${MODULE_ID} | convertJSONPathToFoundryPath - 获取数组时出错:`, error);
            }
          }
          
          // 默认情况：直接使用数字作为路径的一部分
          if (result) {
            result = `${result}.${previousPart}.${part}`;
            console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 使用数字索引，路径更新为: "${result}"`);
          } else {
            result = `${previousPart}.${part}`;
            console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 使用数字索引，初始路径为: "${result}"`);
          }
        } else if (result) {
          // 非数字部分，正常添加
          result = `${result}.${part}`;
          console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 添加非数字部分，路径更新为: "${result}"`);
        } else {
          // 第一部分
          result = part;
          console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 设置初始部分: "${result}"`);
        }
        
        console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 当前构建结果: "${result}"`);
      }
      
      console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 最终路径: "${result}"`);
      return result;
    }
    
    // 如果没有数组索引，直接返回原始路径
    console.log(`${MODULE_ID} | convertJSONPathToFoundryPath - 无需转换，返回原始路径`);
    return path;
  }
  
  /**
   * 将路径标准化为Foundry VTT所需的格式
   * @param path 路径字符串
   * @returns 标准化的路径
   */
  private standardizePath(path: string): string {
    // Foundry VTT主要使用点号形式的路径，如system.attributes.hp.value
    const parts = this.splitPath(path);
    
    // 特殊处理：确保不以 `data.` 开头 (这是早期FVTT版本的格式)
    // 将 `data.` 转换为 `system.`，保持与PF2e系统的兼容性
    if (parts.length > 0 && parts[0] === 'data') {
      parts[0] = 'system';
    }
    
    return parts.join('.');
  }
  
  /**
   * 根据路径获取值，支持多种路径格式
   * @param obj 对象
   * @param path 路径，支持简单路径、数组索引和JSONPath筛选表达式
   * @returns 值
   */
  private getValueByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    
    // 处理完整的JSONPath表达式
    if (path.includes('[?')) {
      try {
        return this.getValueByJSONPath(obj, path);
      } catch (error) {
        console.error(`${MODULE_ID} | JSONPath解析错误: ${error}`);
        // 如果JSONPath解析失败，尝试标准路径
      }
    }
    
    // 标准路径解析
    const parts = this.splitPath(path);
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      // 如果是数组，并且当前部分是可转换为数字的索引
      if (Array.isArray(current) && !isNaN(Number(part))) {
        current = current[Number(part)];
      } else {
      current = current[part];
      }
    }
    
    return current;
  }
  
  /**
   * 使用JSONPath格式获取值
   * @param obj 对象
   * @param path JSONPath表达式
   * @returns 匹配的值
   */
  private getValueByJSONPath(obj: any, path: string): any {
    // 处理[?(@.property=='value')]格式
    if (path.includes('[?(@.') && path.includes('==')) {
      const beforeFilter = path.substring(0, path.indexOf('[?'));
      const filterExpression = path.substring(path.indexOf('[?'), path.indexOf(')]') + 2);
      const afterFilter = path.substring(path.indexOf(')]') + 2);
      
      // 解析过滤表达式 [?(@.property=='value')]
      const propertyMatch = filterExpression.match(/\[\?\(@\.([^=]+)==['"]([^'"]+)['"]\)\]/);
      if (!propertyMatch) {
        console.error(`${MODULE_ID} | 无法解析过滤表达式: ${filterExpression}`);
        return undefined;
      }
      
      const [, property, value] = propertyMatch;
      
      // 获取需要过滤的数组
      const arrayToFilter = this.getValueByPath(obj, beforeFilter);
      if (!Array.isArray(arrayToFilter)) {
        console.error(`${MODULE_ID} | 过滤目标不是数组: ${beforeFilter}`);
        return undefined;
      }
      
      // 查找匹配项
      const matches = arrayToFilter.filter(item => item && item[property] === value);
      
      // 处理匹配后的结果
      if (matches.length === 0) {
        return undefined;
      }
      
      const match = matches[0]; // 使用第一个匹配项
      
      // 如果有后续路径，继续处理
      if (afterFilter && afterFilter.startsWith('.')) {
        return this.getValueByPath(match, afterFilter.substring(1));
      }
      
      return match;
    }
    
    // 其他JSONPath表达式类型可以在这里添加支持
    console.error(`${MODULE_ID} | 不支持的JSONPath表达式: ${path}`);
    return undefined;
  }
  
  /**
   * 拆分路径为部分
   * @param path 路径字符串
   * @returns 路径部分数组
   */
  private splitPath(path: string): string[] {
    const parts: string[] = [];
    
    // 匹配属性名和数组索引的正则表达式
    // 支持形如 property, property[0], [0] 的格式
    const regex = /([^\.\[\]]+)|\[(\d+)\]/g;
    let match;
    
    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) {
        // 匹配到属性名
        parts.push(match[1]);
      } else if (match[2] !== undefined) {
        // 匹配到数组索引
        parts.push(match[2]);
      }
    }
    
    return parts;
  }
  
  /**
   * 生成用于修改文档的内容
   * @param type 文档类型
   * @param data 文档数据
   * @param userPrompt 用户需求
   * @param useMechanicsKnowledge 是否使用PF2e规则知识库
   * @returns 修改指令
   */
  async generateDocumentModification(type: string, data: any, userPrompt: string, useMechanicsKnowledge: boolean = true): Promise<DocumentModification> {
    console.log(`${MODULE_ID} | 开始生成文档修改指令，类型: ${type}，用户提示: ${userPrompt}，使用规则知识库: ${useMechanicsKnowledge}`);
    
    // 显示加载提示
    if (ui && ui.notifications) {
      ui.notifications.info("正在分析数据结构，这可能需要一些时间...");
    }

    try {
      // 步骤1: 提取数据结构（只有键名，不包含值）
      console.log(`${MODULE_ID} | 提取数据结构以便筛选关键字段`);
      const structureData = this.extractStructure(data);
      
      // 处理用户术语
      const { processedText, terminology } = terminologyTranslator.prepareForAI(userPrompt);
      const userPromptWithStandardTerms = processedText;
      console.log(`${MODULE_ID} | 用户提示术语标准化: ${userPromptWithStandardTerms}`);
      console.log(`${MODULE_ID} | 识别到的术语: `, terminology);
      
      // 步骤2: 根据用户提示构造关键字段筛选的提示词
      const purpose = `${type}修改，用户意图: ${userPromptWithStandardTerms}`;
      const messages: Message[] = [
        {
          role: 'system',
          content: `你是一个 Pathfinder 2e 系统专家，精通 FVTT 的 PF2e 系统数据结构。
你的任务是从给定的数据结构中选择与特定目的相关的关键字段。
你应该根据用户的需求和意图，仔细分析哪些字段是必要的。
请考虑用户可能需要查看和修改的字段，但要尽量减少不必要的字段以降低token消耗。
必须使用提供的函数来返回字段列表。`
        },
        {
          role: 'user',
          content: `我需要你从以下数据结构中选择与"${purpose}"相关的关键字段。
这是一个PF2e系统中的${data.documentName || ''}数据，请选择所有与用户意图相关的字段，包括用户可能需要查看和修改的内容。
仅返回必要的字段路径，以便减少数据大小。

数据结构:
${JSON.stringify(structureData, null, 2)}`
        }
      ];
      
      console.log(`${MODULE_ID} | 调用AI筛选关键字段`);
      
      // 显示筛选进度
      if (ui && ui.notifications) {
        ui.notifications.info("AI正在筛选关键字段，请稍候...");
      }
      
      // 步骤3: 调用API筛选关键字段
      const selectFieldsFunctionDefinition: FunctionDefinition = {
        name: 'select_key_fields',
        description: '从数据结构中选择关键字段',
        parameters: {
          type: 'object',
          properties: {
            fields: {
              type: 'array',
              description: '选择的关键字段路径列表',
              items: {
                type: 'string'
              }
            },
            reason: {
              type: 'string',
              description: '选择这些字段的原因'
            }
          },
          required: ['fields', 'reason']
        }
      };
      
      let apiResponse;
      try {
        apiResponse = await this.callAIAPI(messages, { functionDefinition: selectFieldsFunctionDefinition });
    } catch (error) {
        console.error(`${MODULE_ID} | 调用AI筛选字段失败:`, error);
        throw new Error(`筛选关键字段时出错: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 步骤4: 从API响应中提取字段列表
      let selectedFields: string[] = [];
      let selectionReason = '';
      
      if (apiResponse.choices && apiResponse.choices.length > 0 && (apiResponse.choices[0].message as FunctionCallMessage).function_call) {
        try {
          const args = JSON.parse((apiResponse.choices[0].message as FunctionCallMessage).function_call!.arguments);
          selectedFields = args.fields || [];
          selectionReason = args.reason || '';
        } catch (parseError) {
          console.error(`${MODULE_ID} | 解析字段选择结果出错:`, parseError);
          // 出错时使用原始数据
          console.log(`${MODULE_ID} | 将使用原始数据继续处理`);
        }
      }
      
      // 如果没有选择任何字段或出错，使用原始数据
      if (selectedFields.length === 0) {
        console.log(`${MODULE_ID} | 未选择任何字段，将使用原始数据继续处理`);
        // 创建一个包含所有主要属性的字段列表
        selectedFields = Object.keys(data).filter(key => !key.startsWith('_') && typeof data[key] !== 'function');
      } else {
        console.log(`${MODULE_ID} | AI已选择${selectedFields.length}个关键字段，原因: ${selectionReason}`);
        console.log(`${MODULE_ID} | 选择的字段路径列表:`, JSON.stringify(selectedFields, null, 2));
      }
      
      // 步骤5: 根据字段列表过滤数据
      const filteredData = this.filterDataByPaths(data, selectedFields);
      
      // 计算数据减少的百分比
      const originalSize = JSON.stringify(data).length;
      const filteredSize = JSON.stringify(filteredData).length;
      const reductionPercentage = ((originalSize - filteredSize) / originalSize * 100).toFixed(2);
      console.log(`${MODULE_ID} | 数据筛选结果: 原始大小 ${originalSize}字节, 筛选后 ${filteredSize}字节, 减少 ${reductionPercentage}%`);
      
      // 显示筛选结果
      if (ui && ui.notifications) {
        ui.notifications.info(`字段筛选完成，数据量减少了${reductionPercentage}%`);
      }
      
      // 步骤6: 准备修改提示和函数定义
      console.log(`${MODULE_ID} | 数据大小: ${originalSize} -> ${filteredSize} (减少 ${reductionPercentage}%)`);
      
      // 创建用于生成修改的系统提示
      let systemPrompt = `你是一个专业的Pathfinder 2e系统助手，精通FVTT的PF2e系统数据结构。
你的任务是根据用户需求生成精确的文档修改指令。

## PF2e系统数据结构说明

### 角色/NPC常用路径：
- **基础信息**: name, img, system.details.level.value
- **属性值**: system.abilities.str.value (力量), dex (敏捷), con (体质), int (智力), wis (感知), cha (魅力)
- **生命值**: system.attributes.hp.value (当前), system.attributes.hp.max (最大)
- **护甲等级**: system.attributes.ac.value
- **速度**: system.attributes.speed.value
- **技能**: system.skills.[技能名].rank (0=未受训, 1=受训, 2=专家, 3=大师, 4=传奇)
- **豁免**: system.saves.fortitude.value (强韧), reflex (反射), will (意志)
- **特质**: system.traits.value (数组，使用add/remove操作)
- **描述**: system.details.biography.value, system.details.appearance.value

### 物品常用路径：
- **基础**: name, img, system.description.value
- **等级/价格**: system.level.value, system.price.value.gp
- **武器**: system.damage.dice, system.damage.die, system.damage.damageType
- **护甲**: system.armor.value, system.checkPenalty.value
- **特质**: system.traits.value, system.traits.rarity

## 重要规则：
1. **必须使用函数调用返回结果**，不要在文本中提供建议
2. **路径必须准确**，使用system.而不是data.前缀
3. **值类型要正确**：数字用数字类型，字符串用字符串，数组操作用add/remove
4. **数组修改**：使用operation: "add"添加元素，"remove"删除元素，"set"替换整个数组
5. **HTML内容**：描述类字段通常使用HTML格式，例如<p>文本</p>

## 返回格式：
每项修改包含：
- path: 数据路径（字符串）
- value: 新值（任意类型）
- operation: "set"（设置）| "add"（添加到数组）| "remove"（从数组移除）`;

      // 如果启用了规则知识库，添加完整的PF2e规则知识
      if (useMechanicsKnowledge) {
        const knowledgeService = PF2eMechanicsKnowledgeService.getInstance();
        const mechanicsKnowledge = knowledgeService.getFullKnowledge();
        
        console.log(`${MODULE_ID} | ✅ 已添加 PF2e 规则知识库到系统提示词`);
        systemPrompt += `\n\n---\n\n# PF2e 游戏规则机制知识\n\n` +
          `以下是完整的PF2e核心规则知识，在生成修改时请参考这些规则，确保修改符合游戏平衡：\n\n` +
          mechanicsKnowledge;
        
        // 显示通知
        if (ui && ui.notifications) {
          ui.notifications.info("已启用 PF2e 规则知识库，AI将生成更符合游戏平衡的修改");
        }
      } else {
        console.log(`${MODULE_ID} | ⚠️ 用户未启用规则知识库，AI将仅基于数据结构生成修改`);
      }

      // 准备用户提示
      let userInstructionPrompt = `我需要修改这个${type === 'npc' ? 'NPC' : type}的数据，具体请求是: ${userPromptWithStandardTerms}`;
      
      // 添加术语信息
      if (Object.keys(terminology).length > 0) {
        userInstructionPrompt += `\n\n以下是相关的术语对照，请参考使用:\n${Object.entries(terminology).map(([term, translation]) => `- ${term}: ${translation}`).join('\n')}`;
      }
      
      // 添加数据分析提示
      userInstructionPrompt += `\n\n请根据我的请求和提供的数据，使用modify_${type}函数返回适当的修改。`;
      
      // 准备API调用的消息
      const modifyMessages: Message[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `${userInstructionPrompt}\n\n以下是当前数据:\n\`\`\`json\n${JSON.stringify(filteredData, null, 2)}\n\`\`\``
        }
      ];
      
      // 创建修改函数定义
      console.log(`${MODULE_ID} | 为文档类型 ${type} 创建修改函数定义`);
      const modifyFunctionDefinition = this.createModifyFunctionDefinition(type, data);
      
      console.log(`${MODULE_ID} | 使用筛选后的数据调用AI生成修改建议`);
      
      // 显示生成进度
      if (ui && ui.notifications) {
        ui.notifications.info("正在生成修改建议...");
      }
      
      // 步骤7: 调用API生成修改
      let modifyResponse;
      try {
        console.log(`${MODULE_ID} | ========== 准备调用AI生成修改 ==========`);
        console.log(`${MODULE_ID} | 函数名称: ${modifyFunctionDefinition.name}`);
        console.log(`${MODULE_ID} | 函数描述: ${modifyFunctionDefinition.description}`);
        console.log(`${MODULE_ID} | 函数参数结构:`, JSON.stringify(modifyFunctionDefinition.parameters, null, 2));
        console.log(`${MODULE_ID} | 强制调用: ${modifyFunctionDefinition.name}`);
        
        // 添加强制使用函数调用的设置
        modifyResponse = await this.callAIAPI(
          modifyMessages, 
          { 
            functionDefinition: modifyFunctionDefinition,
            retryCount: 2,
            functionCallConfig: { name: modifyFunctionDefinition.name }
          }
        );
        
        console.log(`${MODULE_ID} | ========== AI响应结构 ==========`);
        console.log(`${MODULE_ID} | 响应对象:`, JSON.stringify(modifyResponse, null, 2));
        
        if (modifyResponse.choices && modifyResponse.choices.length > 0) {
          const choice = modifyResponse.choices[0];
          console.log(`${MODULE_ID} | finish_reason: ${choice.finish_reason}`);
          
          const toolCallMessage = choice.message as ToolCallMessage;
          if (toolCallMessage.tool_calls) {
            console.log(`${MODULE_ID} | ✅ 检测到 tool_calls: ${toolCallMessage.tool_calls.length} 个`);
            toolCallMessage.tool_calls.forEach((tc, idx) => {
              console.log(`${MODULE_ID} | tool_call[${idx}]: ${tc.function.name}`);
              console.log(`${MODULE_ID} | 参数预览: ${tc.function.arguments.substring(0, 200)}...`);
            });
          } else if ((choice.message as FunctionCallMessage).function_call) {
            console.log(`${MODULE_ID} | ✅ 检测到 function_call: ${(choice.message as FunctionCallMessage).function_call!.name}`);
            console.log(`${MODULE_ID} | 参数预览: ${(choice.message as FunctionCallMessage).function_call!.arguments.substring(0, 200)}...`);
          } else {
            console.log(`${MODULE_ID} | ⚠️ 未检测到函数调用，只有文本响应`);
            console.log(`${MODULE_ID} | 文本内容预览: ${choice.message.content?.substring(0, 200)}...`);
          }
        }
        
        console.log(`${MODULE_ID} | ========================================`);
      } catch (error) {
        console.error(`${MODULE_ID} | 调用AI生成修改建议失败:`, error);
        throw new Error(`生成修改建议时出错: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 步骤8: 解析API响应
      return this.parseModifyResponse(modifyResponse);
      
    } catch (error) {
      console.error(`${MODULE_ID} | 生成文档修改指令时出错:`, error);
      // 返回一个错误提示修改
      return {
        changes: [{
          path: 'system.details.description.value',
          value: `生成修改指令时出错: ${error instanceof Error ? error.message : String(error)}\n请尝试使用更具体的指令重新生成。`,
          operation: 'set'
        }],
        reason: '生成修改指令失败，返回错误信息'
      };
    }
}
  
  /**
   * 提取数据结构（只有键名，不包含值）
   * @param data 原始数据
   * @returns 只包含结构的数据
   */
  private extractStructure(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }
    
    // 检查是否为简单类型
    if (typeof data !== 'object') {
      return typeof data;
    }
    
    // 检查是否为数组
    if (Array.isArray(data)) {
      if (data.length === 0) return [];
      // 只分析第一个元素的结构
      return [this.extractStructure(data[0])];
    }
    
    // 处理对象
    const result: any = {};
    for (const key in data) {
      // 排除方法和以下划线开头的属性
      if (typeof data[key] !== 'function' && !key.startsWith('_')) {
        try {
          result[key] = this.extractStructure(data[key]);
        } catch (e) {
          result[key] = "无法解析的结构";
        }
      }
    }
    
    return result;
  }

  /**
   * 根据字段路径筛选数据
   * @param data 原始数据
   * @param paths 字段路径列表
   * @returns 筛选后的数据
   */
  private filterDataByPaths(data: any, paths: string[]): any {
    if (!data || !paths || !paths.length) {
      return data;
    }
    
    // 创建结果对象
    const result: any = {
      documentName: data.documentName,
      type: data.type,
      name: data.name
    };
    
    // 确保至少保留id, uuid等基本字段
    const essentialFields = ['_id', 'id', 'uuid', 'documentName', 'name', 'type', 'img'];
    for (const field of essentialFields) {
      if (data[field] !== undefined) {
        result[field] = data[field];
      }
    }
    
    // 暂存当前文档引用，以便在路径解析时使用
    const prevDocument = this.currentDocument;
    this.currentDocument = data;
    
    try {
    // 添加指定路径的数据
    for (const path of paths) {
      const value = this.getValueByPath(data, path);
      if (value !== undefined) {
          // 获取标准化的路径部分
          const parts = this.splitPath(path);
        
        // 递归创建嵌套对象
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (current[part] === undefined) {
              // 获取原始路径的片段来确定类型
              const partialPath = parts.slice(0, i + 1).join('.');
              const originalValue = this.getValueByPath(data, partialPath);
              
            // 根据原始数据中的类型创建适当的容器
            current[part] = Array.isArray(originalValue) ? [] : {};
          }
          current = current[part];
        }
        
        // 设置最终值
        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
      }
      }
    } finally {
      // 恢复原来的文档引用
      this.currentDocument = prevDocument;
    }
    
    // 术语标准化：处理所有字符串值，标准化专业术语
    const processTerminology = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      // 处理数组
      if (Array.isArray(obj)) {
        return obj.map(item => {
          if (typeof item === 'string') {
            // 对字符串数组元素应用术语标准化
            return terminologyTranslator.standardizeTerminology(item);
          }
          return processTerminology(item);
        });
      }
      
      // 处理对象
      const newObj = {...obj};
      for (const key in newObj) {
        if (typeof newObj[key] === 'string') {
          // 对字符串值应用术语标准化
          newObj[key] = terminologyTranslator.standardizeTerminology(newObj[key]);
        } else if (typeof newObj[key] === 'object') {
          // 递归处理嵌套对象
          newObj[key] = processTerminology(newObj[key]);
        }
      }
      
      return newObj;
    };
    
    // 应用术语标准化
    const processedResult = processTerminology(result);
    
    // 计算数据大小减少百分比
    const originalSize = JSON.stringify(data).length;
    const filteredSize = JSON.stringify(processedResult).length;
    const reduction = ((originalSize - filteredSize) / originalSize * 100).toFixed(2);
    
    console.log(`${MODULE_ID} | 数据筛选结果: 原始大小 ${originalSize}字节, 筛选后 ${filteredSize}字节, 减少 ${reduction}%`);
    
    return processedResult;
  }

  /**
   * 测试AI API连接
   * 发送一个简单请求检查连接是否正常
   * @returns 连接测试结果对象，包含成功状态和消息
   */
  async testApiConnection(): Promise<{success: boolean, message: string, details?: any}> {
    console.log(`${MODULE_ID} | 开始测试API连接...`);
    
    if (ui && ui.notifications) {
      ui.notifications.info("正在测试AI服务连接，请稍候...");
    }
    
    if (!this.apiKey) {
      console.error(`${MODULE_ID} | API Key未设置`);
      return {
        success: false,
        message: "API Key未设置，请在模块设置中配置API密钥"
      };
    }
    
    try {
      // 创建一个非常简单的请求
      const messages: Message[] = [
        {
          role: 'user',
          content: '简单的连接测试。请回复"连接成功"。'
        }
      ];
      
      // 添加超时处理
      const response = await Promise.race([
        this.callAIAPI(messages),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('连接测试超时')), 15000) // 15秒超时
        )
      ]) as ApiResponse;
      
      console.log(`${MODULE_ID} | API连接测试响应:`, response);
      
      // 检查响应是否有效
      if (response && response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content || '';
        
        if (ui && ui.notifications) {
          ui.notifications.info("AI服务连接成功!");
        }
        
        return {
          success: true,
          message: "API连接成功",
          details: {
            model: response.model,
            content: content.substring(0, 100),
            usage: response.usage
          }
        };
      } else {
        console.error(`${MODULE_ID} | API响应格式不正确:`, response);
        
        if (ui && ui.notifications) {
          ui.notifications.error("AI服务连接测试返回了无效的响应格式");
        }
        
        return {
          success: false,
          message: "API响应格式不正确",
          details: response
        };
      }
    } catch (error) {
      console.error(`${MODULE_ID} | API连接测试失败:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (ui && ui.notifications) {
        ui.notifications.error(`AI服务连接失败: ${errorMessage}`);
      }
      
      return {
        success: false,
        message: `API连接失败: ${errorMessage}`
      };
    }
  }

  /**
   * 调试用：输出文档结构
   * 用于在控制台输出文档结构，帮助调试路径解析
   * @param document 要输出的文档
   * @param maxDepth 最大递归深度
   * @param path 当前路径前缀
   */
  private debugDocumentStructure(document: any, maxDepth: number = 3, path: string = ''): void {
    if (!document || typeof document !== 'object') return;
    
    console.group(`${MODULE_ID} | 文档结构 (${path || 'root'})`);
    
    try {
      if (maxDepth <= 0) {
        console.log('...(已达最大深度)');
        console.groupEnd();
        return;
      }
      
      // 处理数组
      if (Array.isArray(document)) {
        console.log(`Array[${document.length}]`);
        
        // 只输出部分数组项，避免过多输出
        const maxItems = 3;
        for (let i = 0; i < Math.min(document.length, maxItems); i++) {
          const itemPath = path ? `${path}[${i}]` : `[${i}]`;
          this.debugDocumentStructure(document[i], maxDepth - 1, itemPath);
        }
        
        if (document.length > maxItems) {
          console.log(`...(还有${document.length - maxItems}项未显示)`);
        }
      } 
      // 处理对象
      else {
        const keys = Object.keys(document);
        console.log(`Object{${keys.length} keys}`);
        
        // 输出所有键和值的预览
        for (const key of keys) {
          const value = document[key];
          const newPath = path ? `${path}.${key}` : key;
          
          if (value === null) {
            console.log(`${newPath}: null`);
          } else if (typeof value === 'undefined') {
            console.log(`${newPath}: undefined`);
          } else if (typeof value !== 'object') {
            // 非对象类型直接输出
            console.log(`${newPath}: ${typeof value} = ${String(value).substring(0, 100)}`);
          } else if (Array.isArray(value)) {
            // 递归处理数组
            this.debugDocumentStructure(value, maxDepth - 1, newPath);
          } else {
            // 递归处理对象
            this.debugDocumentStructure(value, maxDepth - 1, newPath);
          }
        }
      }
    } catch (error) {
      console.error(`调试文档结构错误:`, error);
    }
    
    console.groupEnd();
  }
  
  /**
   * 调试用：输出提取的路径信息
   * 用于分析和输出路径的分解结果
   * @param path 要分析的路径
   */
  private debugPathInfo(path: string): void {
    console.group(`${MODULE_ID} | 路径分析 "${path}"`);
    
    try {
      // 分解路径
      const parts = this.splitPath(path);
      console.log(`路径组成部分:`, parts);
      
      // 检查路径中是否包含数组索引模式
      if (path.includes('[')) {
        console.log(`检测到数组索引模式，原始路径: "${path}"`);
        // 分析路径中的数组索引和替换过程
        const arrayPattern = /\[(\d+)\]/g;
        const matches = [...path.matchAll(arrayPattern)];
        if (matches.length > 0) {
          console.log(`数组索引匹配:`, matches.map(m => ({index: m.index, value: m[1]})));
          
          // 说明数组索引路径转换问题
          console.log(`
=================== 数组路径转换说明 ===================
问题描述: JSON路径中的数组索引格式 'array[0]' 在Foundry中需要转换为点号格式 'array.0'
示例: 'system.actions[0].weapon.system.damageRolls' 转换为 'system.actions.0.weapon.system.damageRolls'

转换逻辑:
1. 识别路径中的数组索引模式 [n]
2. 将其替换为点号格式 .n
3. 如果数组元素有_id或name字段，则使用该值替代数字索引
4. 这种转换是必要的，因为Foundry的数据更新系统使用点号表示法

此日志功能可以帮助调试路径转换问题，特别是在修改复杂数据结构时。
=================== 数组路径转换说明 ===================
          `);
        }
      }
      
      // 尝试输出路径对应的值
      if (this.currentDocument) {
        try {
          const value = this.getValueByPath(this.currentDocument, path);
          console.log(`路径对应的值:`, value);
          
          if (value !== undefined) {
            console.log(`值类型: ${Array.isArray(value) ? 'Array' : typeof value}`);
            
            // 如果是数组，输出其元素信息
            if (Array.isArray(value)) {
              console.log(`数组长度: ${value.length}`);
              
              // 输出数组元素的键信息
              if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                console.log(`首个元素键列表:`, Object.keys(value[0]));
                
                // 检查数组元素是否有_id或name字段
                if ('_id' in value[0]) {
                  console.log(`数组元素有_id字段 (${value[0]._id})`);
                }
                if ('name' in value[0]) {
                  console.log(`数组元素有name字段 (${value[0].name})`);
                }
              }
            }
          }
        } catch (error) {
          console.log(`无法获取路径对应的值:`, error);
        }
      } else {
        console.log(`当前没有活动文档，无法获取路径值`);
      }
      
      // 输出标准化路径
      const standardizedPath = this.standardizePath(path);
      console.log(`标准化路径: "${standardizedPath}"`);
      
      // 转换为Foundry更新路径
      try {
        const foundryPath = this.getUpdatePathForFoundry(path);
        console.log(`Foundry更新路径: "${foundryPath}"`);
        
        // 分析转换后的路径与原始路径的差异
        if (foundryPath !== standardizedPath) {
          console.log(`路径转换变化: "${standardizedPath}" -> "${foundryPath}"`);
          // 检查路径部分的变化
          const originalParts = this.splitPath(standardizedPath);
          const convertedParts = this.splitPath(foundryPath);
          
          if (originalParts.length === convertedParts.length) {
            for (let i = 0; i < originalParts.length; i++) {
              if (originalParts[i] !== convertedParts[i]) {
                console.log(`路径部分 ${i} 变化: "${originalParts[i]}" -> "${convertedParts[i]}"`);
              }
            }
          } else {
            console.log(`路径部分长度变化: ${originalParts.length} -> ${convertedParts.length}`);
            console.log(`原始路径部分:`, originalParts);
            console.log(`转换后路径部分:`, convertedParts);
          }
        }
      } catch (error) {
        console.log(`无法转换为Foundry更新路径:`, error);
      }
    } catch (error) {
      console.error(`路径分析错误:`, error);
    }
    
    console.groupEnd();
  }

  /**
   * 处理Journal文档的AI翻译请求
   * @param document Journal文档对象
   */
  public async handleJournalTranslation(document: any): Promise<void> {
    console.log(`${MODULE_ID} | 开始处理Journal文档翻译请求`);
    
    if (!document || document.documentName !== 'JournalEntry') {
      if (ui && ui.notifications) {
        ui.notifications.error("只支持Journal类型文档的翻译");
      }
      return;
    }
    
    // 保存文档引用
    this.currentDocument = document;
    
    // 创建对话框让用户输入翻译要求
    const d = new Dialog({
      title: "AI翻译文档内容",
      content: `
        <form>
          <div class="form-group">
            <label>翻译设置:</label>
            <select id="translation-type" name="translationType">
              <option value="all">翻译所有页面</option>
              <option value="current">只翻译当前页面</option>
              <option value="selected">选择特定页面</option>
            </select>
          </div>
          <div class="form-group translation-requirements">
            <label>翻译要求:</label>
            <textarea name="translationRequirements" rows="3" placeholder="请输入具体翻译要求，例如：保持专业术语不翻译，使用中文翻译所有正文内容等..."></textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="useTerminology" checked>
              使用术语表辅助翻译
            </label>
          </div>
        </form>
      `,
      buttons: {
        translate: {
          icon: '<i class="fas fa-language"></i>',
          label: "开始翻译",
          callback: async (html: any) => {
            const translationType = html.find('[name="translationType"]').val();
            const translationRequirements = html.find('[name="translationRequirements"]').val();
            const useTerminology = html.find('[name="useTerminology"]').prop('checked');
            
            // 根据选择类型处理不同的翻译范围
            if (translationType === 'all') {
              await this.translateJournalPages(document, null, translationRequirements, useTerminology);
            } else if (translationType === 'current') {
              const currentPageId = document.pages?.contents?.[0]?._id;
              if (currentPageId) {
                await this.translateJournalPages(document, [currentPageId], translationRequirements, useTerminology);
              } else {
                ui.notifications?.error("无法确定当前页面");
              }
            } else if (translationType === 'selected') {
              // 显示页面选择对话框
              this.showPageSelectionDialog(document, translationRequirements, useTerminology);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "取消"
        }
      },
      default: "translate",
      close: () => {}
    });
    
    d.render(true);
  }
  
  /**
   * 显示页面选择对话框
   * @param document Journal文档
   * @param translationRequirements 翻译要求
   * @param useTerminology 是否使用术语表
   */
  private showPageSelectionDialog(document: any, translationRequirements: string, useTerminology: boolean): void {
    const pages = document.pages?.contents || [];
    
    if (pages.length === 0) {
      if (ui && ui.notifications) {
        ui.notifications.error("文档中没有页面");
      }
      return;
    }
    
    let content = `<form><div class="form-group"><label>选择要翻译的页面:</label><div class="pages-list">`;
    
    pages.forEach((page: any) => {
      content += `
        <div class="page-item">
          <input type="checkbox" id="page-${page._id}" name="selectedPages" value="${page._id}">
          <label for="page-${page._id}">${page.name}</label>
        </div>
      `;
    });
    
    content += `</div></div></form>`;
    
    const d = new Dialog({
      title: "选择页面",
      content: content,
      buttons: {
        translate: {
          icon: '<i class="fas fa-language"></i>',
          label: "翻译选中页面",
          callback: async (html: any) => {
            const selectedPages = html.find('input[name="selectedPages"]:checked').map(function(this: HTMLInputElement) {
              return this.value;
            }).get();
            
            if (selectedPages.length === 0) {
              ui.notifications?.warning("未选择任何页面");
              return;
            }
            
            await this.translateJournalPages(document, selectedPages, translationRequirements, useTerminology);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "取消"
        }
      },
      default: "translate",
      close: () => {}
    });
    
    d.render(true);
  }
  
  /**
   * 翻译Journal页面内容
   * @param document Journal文档
   * @param pageIds 页面ID列表，如果为null则翻译所有页面
   * @param translationRequirements 翻译要求
   * @param useTerminology 是否使用术语表
   */
  private async translateJournalPages(document: any, pageIds: string[] | null, translationRequirements: string, useTerminology: boolean = false): Promise<void> {
    const pages = document.pages?.contents || [];
    const pagesToTranslate = pageIds ? pages.filter((p: any) => pageIds.includes(p._id)) : pages;
    
    if (pagesToTranslate.length === 0) {
      if (ui && ui.notifications) {
        ui.notifications.error("未找到要翻译的页面");
      }
      return;
    }

    // 创建进度对话框
    const progressDialog = new TranslationProgressDialog(pagesToTranslate.length, document.name);
    progressDialog.render(true);
    
    try {
      // 逐页处理翻译
      for (let i = 0; i < pagesToTranslate.length; i++) {
        const page = pagesToTranslate[i];
        
        // 更新进度
        progressDialog.updateProgress(i, page.name, "正在翻译...");
        
        try {
          // 使用新的整页翻译方法
          await this.translateJournalPageWhole(page, translationRequirements, useTerminology);
          
          // 翻译页面名称（如果需要）
          if (page.name && page.name.trim() && !/^[\u4e00-\u9fa5]/.test(page.name)) {
            const translatedName = await this.translatePageName(page.name, translationRequirements);
            if (translatedName && translatedName !== page.name) {
              await page.update({ name: translatedName });
              console.log(`${MODULE_ID} | 页面名称翻译: ${page.name} -> ${translatedName}`);
            }
          }
          
          progressDialog.updateProgress(i, page.name, "翻译完成");
        } catch (pageError) {
          console.error(`${MODULE_ID} | 翻译页面失败:`, page.name, pageError);
          progressDialog.updateProgress(i, page.name, "翻译失败");
        }
      }
      
      // 完成进度
      progressDialog.complete();
      
      // 关闭所有相关的编辑窗口以确保内容更新
      this.closeRelatedEditorWindows(document);
      
      if (ui && ui.notifications) {
        ui.notifications.info("文档翻译完成");
      }
      
    } catch (error) {
      console.error(`${MODULE_ID} | 翻译过程出错:`, error);
      progressDialog.error(`翻译过程出错: ${error instanceof Error ? error.message : String(error)}`);
      
      if (ui && ui.notifications) {
        ui.notifications.error(`翻译过程出错: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * 分析HTML内容，提取可翻译的文本段落并保留HTML结构
   * @param htmlContent HTML内容
   * @returns 文本段落和HTML结构
   */
  private analyzeHtmlForTranslation(htmlContent: string): { textSegments: string[], htmlStructure: any[] } {
    console.log(`${MODULE_ID} | 分析HTML内容，提取可翻译的文本段落`);
    
    // 创建一个临时的DOM元素来解析HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const textSegments: string[] = [];
    const htmlStructure: any[] = [];
    
    // 保存this引用
    const self = this;
    
    /**
     * 递归处理DOM节点
     * @param node 当前节点
     * @param structureArray 结构数组
     */
    function processNodeRecursively(node: Node, structureArray: any[]): void {
      if (node.nodeType === Node.TEXT_NODE) {
        // 文本节点
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          // 添加到待翻译文本段落
          textSegments.push(text);
          
          // 在结构中使用占位符
          structureArray.push({
            type: 'text',
            index: textSegments.length - 1
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // 元素节点
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        
        // 不翻译这些标签内的内容
        const noTranslateTags = ['script', 'style', 'code', 'pre'];
        if (noTranslateTags.includes(tagName)) {
          structureArray.push({
            type: 'element',
            tag: tagName,
            attributes: self.getElementAttributes(element),
            content: element.outerHTML
          });
          return;
        }
        
        // 处理图片标签
        if (tagName === 'img') {
          structureArray.push({
            type: 'element',
            tag: 'img',
            attributes: self.getElementAttributes(element),
            selfClosing: true
          });
          return;
        }
        
        // 其他标签，处理子节点
        const elementStructure = {
          type: 'element',
          tag: tagName,
          attributes: self.getElementAttributes(element),
          children: []
        };
        
        structureArray.push(elementStructure);
        
        // 处理子节点
        for (const childNode of Array.from(element.childNodes)) {
          processNodeRecursively(childNode, elementStructure.children);
        }
      }
    }
    
    // 开始处理根节点
    for (const childNode of Array.from(tempDiv.childNodes)) {
      processNodeRecursively(childNode, htmlStructure);
    }
    
    console.log(`${MODULE_ID} | 提取了 ${textSegments.length} 个文本段落`);
    
    return { textSegments, htmlStructure };
  }
  
  /**
   * 获取元素的所有属性
   * @param element HTML元素
   * @returns 属性对象
   */
  private getElementAttributes(element: Element): Record<string, string> {
    const attributes: Record<string, string> = {};
    
    for (const attr of Array.from(element.attributes)) {
      attributes[attr.name] = attr.value;
    }
    
    return attributes;
  }
  
  /**
   * 使用翻译后的文本重建HTML内容
   * @param htmlStructure HTML结构
   * @param translatedSegments 翻译后的文本段落
   * @returns 重建的HTML内容
   */
  private reconstructHtmlWithTranslation(htmlStructure: any[], translatedSegments: string[]): string {
    console.log(`${MODULE_ID} | 重建HTML内容，使用翻译后的文本`);
    
    // 递归处理结构
    const processStructure = (structure: any[]): string => {
      let result = '';
      
      for (const item of structure) {
        if (item.type === 'text') {
          // 文本节点，使用翻译后的文本
          result += translatedSegments[item.index];
        } else if (item.type === 'element') {
          if (item.content) {
            // 直接使用原始内容（不翻译的标签）
            result += item.content;
          } else if (item.selfClosing) {
            // 自闭合标签（如img）
            const attributes = this.attributesToString(item.attributes);
            result += `<${item.tag}${attributes}>`;
          } else {
            // 普通标签
            const attributes = this.attributesToString(item.attributes);
            result += `<${item.tag}${attributes}>`;
            
            // 处理子节点
            if (item.children && item.children.length > 0) {
              result += processStructure(item.children);
            }
            
            result += `</${item.tag}>`;
          }
        }
      }
      
      return result;
    };
    
    return processStructure(htmlStructure);
  }
  
  /**
   * 将属性对象转换为HTML属性字符串
   * @param attributes 属性对象
   * @returns 属性字符串
   */
  private attributesToString(attributes: Record<string, string>): string {
    let result = '';
    
    for (const [name, value] of Object.entries(attributes)) {
      result += ` ${name}="${value.replace(/"/g, '&quot;')}"`;
    }
    
    return result;
  }

  /**
   * 修复和清理JSON字符串中的常见错误
   */
  private fixTranslationJsonErrors(jsonStr: string): string {
    let fixed = jsonStr.trim();
    
    // 移除markdown代码块标记
    fixed = fixed.replace(/```json\s*|\s*```/g, '');
    
    // 修复属性名没有引号的问题
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // 修复尾随逗号（在对象和数组中）
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 修复数组内多余的逗号（如：[item1,, item2]）
    fixed = fixed.replace(/,(\s*,)/g, ',');
    
    // 修复单引号为双引号
    fixed = fixed.replace(/'/g, '"');
    
    // 先处理字符串中的换行符和未转义的引号
    fixed = this.fixStringContent(fixed);
    
    // 修复数组元素之间缺少逗号的情况
    fixed = this.fixMissingCommas(fixed);
    
    return fixed;
  }

  /**
   * 修复字符串内容中的问题
   */
  private fixStringContent(jsonStr: string): string {
    let fixed = jsonStr;
    
    // 处理字符串中的未转义引号和换行符
    // 使用状态机来正确处理字符串边界
    let result = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      
      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        result += char;
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        if (!inString) {
          // 开始字符串
          inString = true;
          result += char;
        } else {
          // 结束字符串或需要转义的引号
          // 检查后面是否应该有逗号或结束符
          let j = i + 1;
          while (j < fixed.length && /\s/.test(fixed[j])) j++;
          
          if (j < fixed.length && /[,\]]/.test(fixed[j])) {
            // 这是字符串的结束
            inString = false;
            result += char;
          } else if (j < fixed.length && fixed[j] === '"') {
            // 这可能是字符串内的引号，需要转义
            result += '\\"';
          } else {
            // 默认结束字符串
            inString = false;
            result += char;
          }
        }
      } else if (inString && char === '\n') {
        // 字符串中的换行符，替换为空格
        result += ' ';
      } else if (inString && char === '\r') {
        // 忽略回车符
        continue;
      } else {
        result += char;
      }
    }
    
    return result;
  }

  /**
   * 修复数组中缺失的逗号
   */
  private fixMissingCommas(jsonStr: string): string {
    let fixed = jsonStr;
    
    // 修复字符串后直接跟字符串的情况（缺少逗号）
    // 使用更精确的模式匹配
    fixed = fixed.replace(/"(\s*\n\s*)"/g, '",\n"');
    fixed = fixed.replace(/"(\s{2,})"/g, '", "');
    
    // 修复数组元素之间的换行但缺少逗号的情况
    // 匹配：引号 + 可选空白 + 换行 + 可选空白 + 引号
    fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
    
    // 修复多个空格分隔的字符串
    fixed = fixed.replace(/"\s{2,}"/g, '", "');
    
    return fixed;
  }

  /**
   * 安全地解析翻译结果中的JSON数组
   */
  private safeParseTranslationJson(content: string): string[] | null {
    console.log(`${MODULE_ID} | 尝试解析翻译JSON内容`);
    console.log(`${MODULE_ID} | 原始内容长度: ${content.length}`);
    console.log(`${MODULE_ID} | 原始内容预览: ${content.substring(0, 500)}...`);
    
    // 尝试多种JSON提取模式
    const patterns = [
      // 标准JSON数组格式
      /\[\s*"[\s\S]*?"\s*\]/,
      // 带换行的JSON数组
      /\[\s*"[\s\S]*?"\s*,[\s\S]*?\]/,
      // 更宽松的数组匹配
      /\[[\s\S]*?\]/,
      // markdown代码块中的JSON
      /```(?:json)?\s*(\[[\s\S]*?\])\s*```/
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const jsonStr = match[1] || match[0];
        console.log(`${MODULE_ID} | 找到JSON候选: ${jsonStr.substring(0, 100)}...`);
        
        try {
          // 直接尝试解析
          const result = JSON.parse(jsonStr);
          if (Array.isArray(result)) {
            console.log(`${MODULE_ID} | 成功解析JSON数组，包含 ${result.length} 个元素`);
            return result;
          }
                 } catch (directError) {
           console.log(`${MODULE_ID} | 直接解析失败: ${directError instanceof Error ? directError.message : String(directError)}`);
           
           // 尝试修复后解析
           try {
             const fixedJson = this.fixTranslationJsonErrors(jsonStr);
             console.log(`${MODULE_ID} | 尝试修复后的JSON: ${fixedJson.substring(0, 100)}...`);
             
             const result = JSON.parse(fixedJson);
             if (Array.isArray(result)) {
               console.log(`${MODULE_ID} | 修复后成功解析JSON数组，包含 ${result.length} 个元素`);
               return result;
             }
           } catch (fixedError) {
             console.log(`${MODULE_ID} | 修复后仍然解析失败: ${fixedError instanceof Error ? fixedError.message : String(fixedError)}`);
           }
        }
      }
    }
    
    // 如果所有模式都失败，尝试最后的强力解析
    return this.fallbackParseTranslationArray(content);
  }

  /**
   * 后备的强力数组解析器
   */
  private fallbackParseTranslationArray(content: string): string[] | null {
    console.log(`${MODULE_ID} | 使用后备解析器处理翻译内容`);
    
    try {
      // 尝试提取所有被引号包围的文本
      const quotedStrings = [];
      const regex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const str = match[1];
        // 过滤掉太短或明显不是翻译内容的字符串
        if (str.length > 1 && !str.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
          quotedStrings.push(str);
        }
      }
      
      if (quotedStrings.length > 0) {
        console.log(`${MODULE_ID} | 后备解析器提取到 ${quotedStrings.length} 个字符串`);
        return quotedStrings;
      }
      
      // 如果引号提取失败，尝试按行分割
      const lines = content
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => {
          // 过滤掉明显的JSON语法和空行
          return line.length > 0 && 
                 !line.match(/^\s*[\[\]{},"']\s*$/) &&
                 !line.includes('```') &&
                 !line.startsWith('//') &&
                 !line.startsWith('/*');
        })
        .map(line => {
          // 清理行首行尾的引号和逗号
          return line.replace(/^[",\s]+|[",\s]+$/g, '');
        })
        .filter(line => line.length > 0);
      
      if (lines.length > 0) {
        console.log(`${MODULE_ID} | 后备解析器按行提取到 ${lines.length} 个段落`);
        return lines;
      }
      
    } catch (error) {
      console.log(`${MODULE_ID} | 后备解析器也失败了: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return null;
  }

  /**
   * 通用的Function Call解析器，支持所有工具调用
   */
  private parseUniversalFunctionCall(content: string, expectedFunctionName?: string): any | null {
    console.log(`${MODULE_ID} | 通用Function Call解析器，期望函数: ${expectedFunctionName || '任意'}`);
    
    // 检测各种Function Call标记格式
    const functionCallPatterns = [
      // 标准invoke格式：<invoke name="function_name">
      /<invoke name="([^"]+)">\s*<parameter name="([^"]+)">\s*([\s\S]*?)\s*<\/parameter>/g,
      // 简化invoke格式
      /<invoke name="([^"]+)">\s*([\s\S]*?)\s*<\/invoke>/g,
      // parameter only格式
      /<parameter name="([^"]+)">\s*([\s\S]*?)\s*<\/parameter>/g
    ];

    for (const pattern of functionCallPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const functionName = match[1];
        const parameterName = match[2] || 'default';
        const parameterValue = match[3] || match[2];
        
        console.log(`${MODULE_ID} | 发现Function Call: ${functionName}, 参数: ${parameterName}`);
        
        // 如果指定了期望的函数名，检查是否匹配
        if (expectedFunctionName && !functionName.includes(expectedFunctionName.replace('modify_', ''))) {
          continue;
        }
        
        try {
          // 尝试解析参数值
          let parsedValue;
          
          // 如果参数值看起来像JSON，尝试解析
          if (parameterValue.trim().startsWith('[') || parameterValue.trim().startsWith('{')) {
            parsedValue = JSON.parse(parameterValue.trim());
          } else {
            // 否则作为字符串处理
            parsedValue = parameterValue.trim();
          }
          
          console.log(`${MODULE_ID} | 成功解析Function Call: ${functionName}`);
          return {
            functionName: functionName,
            parameterName: parameterName,
            parameterValue: parsedValue,
            rawValue: parameterValue
          };
          
        } catch (parseError) {
          console.log(`${MODULE_ID} | 解析Function Call参数失败: ${parseError}`);
          continue;
        }
      }
    }
    
    return null;
  }

  /**
   * 从文本内容中解析修改指令
   */
  private parseModifyResponseFromText(content: string): DocumentModification | null {
    console.log(`${MODULE_ID} | 尝试从文本内容中解析修改指令`);
    
    // 方法0：使用通用Function Call解析器
    const functionCall = this.parseUniversalFunctionCall(content, 'modify');
    if (functionCall) {
      console.log(`${MODULE_ID} | 通用解析器找到Function Call:`, functionCall.functionName);
      
      // 处理不同类型的modify函数
      if (functionCall.functionName.startsWith('modify_')) {
        try {
          let modifications = [];
          
          // 根据参数名称确定数据结构
          if (functionCall.parameterName === 'modifications' || functionCall.parameterName === 'changes') {
            modifications = Array.isArray(functionCall.parameterValue) ? functionCall.parameterValue : [functionCall.parameterValue];
          } else if (functionCall.parameterName === 'default' && Array.isArray(functionCall.parameterValue)) {
            modifications = functionCall.parameterValue;
          } else {
            // 尝试从原始值中提取
            const rawValue = functionCall.rawValue;
            if (rawValue.includes('[') && rawValue.includes(']')) {
              const arrayMatch = rawValue.match(/\[[\s\S]*\]/);
              if (arrayMatch) {
                modifications = JSON.parse(arrayMatch[0]);
              }
            }
          }
          
          if (modifications.length > 0) {
            return {
              changes: modifications.map((change: any) => ({
                path: change.path || 'system.description.value',
                value: change.value || '',
                operation: change.operation || 'set'
              })),
              reason: `从${functionCall.functionName}标记提取的修改`
            };
          }
        } catch (error) {
          console.log(`${MODULE_ID} | 解析Function Call参数失败:`, error);
        }
      }
    }
    
    // 方法1：尝试提取JSON对象
    try {
      const jsonMatches = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || 
                         content.match(/(\{[\s\S]*?\})/) ||
                         content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      
      if (jsonMatches) {
        const jsonStr = jsonMatches[1] || jsonMatches[0];
        console.log(`${MODULE_ID} | 找到JSON内容:`, jsonStr);
        
        const parsed = JSON.parse(jsonStr);
        
        if (parsed.changes && Array.isArray(parsed.changes)) {
          return {
            changes: parsed.changes.map((change: any) => ({
              path: change.path || 'system.description.value',
              value: change.value || '',
              operation: change.operation || 'set'
            })),
            reason: parsed.reason || '从JSON提取的修改'
          };
        }
      }
    } catch (jsonError) {
      console.log(`${MODULE_ID} | JSON解析失败:`, jsonError);
    }

    // 方法2：查找描述相关的修改
    const descriptionPatterns = [
      /描述[:：]\s*(.+?)(?:\n\n|\n(?=\S)|$)/s,
      /description[:：]\s*(.+?)(?:\n\n|\n(?=\S)|$)/s,
      /翻译[:：]\s*(.+?)(?:\n\n|\n(?=\S)|$)/s,
      /内容[:：]\s*(.+?)(?:\n\n|\n(?=\S)|$)/s
    ];

    for (const pattern of descriptionPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const extractedText = match[1].trim();
        console.log(`${MODULE_ID} | 找到描述文本:`, extractedText.substring(0, 100) + '...');
        
        return {
          changes: [{
            path: 'system.description.value',
            value: extractedText,
            operation: 'set' as const
          }],
          reason: '从文本模式匹配提取的描述修改'
        };
      }
    }

    // 方法3：如果内容看起来像是翻译结果，直接使用
    const cleanContent = content.trim();
    if (cleanContent.length > 10 && 
        !cleanContent.includes('{') && 
        !cleanContent.includes('[') &&
        !cleanContent.includes('<invoke') &&
        !cleanContent.includes('<parameter') &&
        !cleanContent.includes('function_call') &&
        !cleanContent.includes('modify_item')) {
      // 看起来是纯文本翻译结果
      console.log(`${MODULE_ID} | 将内容作为翻译结果处理`);
      
      return {
        changes: [{
          path: 'system.description.value',
          value: cleanContent,
          operation: 'set' as const
        }],
        reason: '将响应内容作为翻译结果'
      };
    }

    // 方法4：尝试提取引号内的内容（过滤技术标记）
    const quotedContent = content.match(/"([^"]+)"/g);
    if (quotedContent && quotedContent.length > 0) {
      const filteredContent = quotedContent
        .map(q => q.slice(1, -1))
        .filter(text => {
          // 过滤掉技术标记和短文本
          return text.length > 5 && 
                 !text.includes('modify_item') &&
                 !text.includes('modifications') &&
                 !text.includes('operation') &&
                 !text.includes('path') &&
                 !text.includes('value') &&
                 !text.includes('system.') &&
                 !text.match(/^[a-z_]+$/); // 过滤纯英文小写变量名
        });
      
      if (filteredContent.length > 0) {
        const combinedContent = filteredContent.join(' ');
        console.log(`${MODULE_ID} | 从引号内容提取（过滤后）:`, combinedContent);
        
        return {
          changes: [{
            path: 'system.description.value',
            value: combinedContent,
            operation: 'set' as const
          }],
          reason: '从引号内容提取的修改（已过滤）'
        };
      }
    }

    return null;
  }

  /**
   * 整页翻译方法 - 保持HTML结构完整性
   */
  private async translateJournalPageWhole(page: any, translationRequirements: string, useTerminology: boolean = false): Promise<void> {
    if (page.type !== 'text' || !page.text?.content) {
      console.log(`${MODULE_ID} | 跳过非文本页面或无内容页面: ${page.name}`);
      return;
    }
    
    console.log(`${MODULE_ID} | 开始整页翻译: ${page.name}`);
    
    // 获取页面HTML内容
    const htmlContent = page.text.content;
    
    // 检查内容长度，确保在AI上下文容量内
    const contentLength = htmlContent.length;
    console.log(`${MODULE_ID} | 页面内容长度: ${contentLength} 字符`);
    
    if (contentLength > 50000) {
      console.warn(`${MODULE_ID} | 页面内容过长，回退到分段翻译`);
      return this.translateJournalPageSegmented(page, translationRequirements, useTerminology);
    }
    
    // 处理术语表
    let terminologyPrompt = '';
    if (useTerminology) {
      terminologyPrompt = await this.prepareTerminologyPrompt(htmlContent);
    }
    
    // 检查是否启用自动收集术语
    const game = getGame();
    const autoCollectTerms = game?.settings?.get(MODULE_ID, 'autoCollectTerminology') !== false;
    
    // 构建翻译提示
    const translationPrompt = this.buildWholePageTranslationPrompt(htmlContent, translationRequirements, terminologyPrompt);
    
    try {
      // 准备 Function Calling 工具（如果启用术语收集）
      let tools = undefined;
      if (autoCollectTerms) {
        tools = [{
          type: 'function' as const,
          function: {
            name: 'collect_new_terminology',
            description: '收集文档中识别出的专有名词（proper nouns），仅包括人名、地名、组织名、神祇名等需要保持翻译一致性的独特名称。不要收集游戏机制术语、通用词汇、普通物品名等。',
            parameters: {
              type: 'object',
              properties: {
                newTerms: {
                  type: 'array',
                  description: '新识别出的专有名词列表，只包含术语表中没有的、在文本中重要的专有名词',
                  items: {
                    type: 'object',
                    properties: {
                      original: {
                        type: 'string',
                        description: '英文专有名词（完整准确的原文）'
                      },
                      translation: {
                        type: 'string',
                        description: '你翻译的中文版本'
                      },
                      category: {
                        type: 'string',
                        enum: ['character', 'place', 'deity', 'organization', 'monster', 'event', 'item', 'other'],
                        description: '专有名词类别：character(人物/角色名), place(地名-城市/地区/位面), deity(神祇/魔神/传说存在), organization(组织/派系/公会), monster(特定怪物个体名字), event(历史事件名称), item(神器/传说物品名), other(其他专有名词)'
                      }
                    },
                    required: ['original', 'translation', 'category']
                  }
                }
              },
              required: ['newTerms']
            }
          }
        }];
      }
      
      // 调用AI进行整页翻译
      // tool_choice 说明：
      // - 'auto': AI 自主决定是否调用函数（可能不调用，导致收集为空）
      // - 强制调用: { type: 'function', function: { name: 'collect_new_terminology' } }
      //   这会强制 AI 必须调用函数，即使只返回空数组
      // 目前使用 'auto'，如果经常收集为空，可以考虑改为强制调用
      const response = await this.callAIAPI([
        { role: 'user', content: translationPrompt }
      ], { tools, tool_choice: autoCollectTerms ? 'auto' : undefined });
      
      if (response && response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        const translatedContent = choice.message.content;
        
        // 如果启用了术语收集，尝试从 tool_calls 中提取术语
        const message = choice.message as ToolCallMessage;
        if (autoCollectTerms) {
          console.log(`${MODULE_ID} | [术语收集] 自动收集已启用`);
          
          if (message.tool_calls && message.tool_calls.length > 0) {
            console.log(`${MODULE_ID} | [术语收集] 检测到 ${message.tool_calls.length} 个 Function Call`);
            
            for (const toolCall of message.tool_calls) {
              console.log(`${MODULE_ID} | [术语收集] Function Call: ${toolCall.function.name}`);
              
              if (toolCall.function.name === 'collect_new_terminology') {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  if (args.newTerms && Array.isArray(args.newTerms)) {
                    console.log(`${MODULE_ID} | [术语收集] ✅ AI 调用了 collect_new_terminology，返回 ${args.newTerms.length} 个术语`);
                    await this.collectNewTerminologiesFromFC(args.newTerms);
                  } else {
                    console.warn(`${MODULE_ID} | [术语收集] ⚠️ Function Call 参数中 newTerms 为空或不是数组`);
                  }
                } catch (parseError) {
                  console.error(`${MODULE_ID} | [术语收集] ❌ 解析 Function Call 参数失败:`, parseError);
                }
              }
            }
          } else {
            console.warn(`${MODULE_ID} | [术语收集] ⚠️ AI 没有调用任何 Function，尝试使用旧方法作为后备`);
            await this.collectNewTerminologies(translatedContent, true);
          }
        } else {
          console.log(`${MODULE_ID} | [术语收集] 自动收集未启用，跳过`);
        }
        
        // 提取翻译后的HTML内容
        const finalHtml = this.extractTranslatedHtml(translatedContent, htmlContent);
        
        // 更新页面内容
        await page.update({
          'text.content': finalHtml
        });
        
        // 强制刷新页面显示
        if (page.sheet && page.sheet.rendered) {
          page.sheet.render(true);
        }
        
        console.log(`${MODULE_ID} | 整页翻译成功: ${page.name}`);
      } else {
        throw new Error('AI响应为空');
      }
      
    } catch (error) {
      console.error(`${MODULE_ID} | 整页翻译失败，回退到分段翻译:`, error);
      return this.translateJournalPageSegmented(page, translationRequirements, useTerminology);
    }
  }

  /**
   * 构建整页翻译的提示
   */
  private buildWholePageTranslationPrompt(htmlContent: string, translationRequirements: string, terminologyPrompt: string): string {
    const game = getGame();
    const autoCollectTerms = game?.settings?.get(MODULE_ID, 'autoCollectTerminology') !== false;
    
    let termCollectionPrompt = '';
    if (autoCollectTerms) {
      // 获取已有术语的数量，用于提示AI
      const existingTermsCount = terminologyTranslator.getAllTerms?.()?.length || 0;
      
      termCollectionPrompt = `

【专有名词收集任务】
在翻译过程中，请识别并收集文本中的**专有名词**（proper nouns）。

**重点收集（看到就应该收集）：**
✓ 人名：任何具体的人物名字（如：Ameiko, Shalelu, Tsuto）
✓ 地名：城镇、地区、建筑物名（如：Sandpoint, Magnimar, Rusty Dragon）
✓ 组织名：派系、公会、团体（如：Pathfinder Society, Town Guard）
✓ 神祇名：神灵、魔神（如：Desna, Lamashtu, Pharasma）
✓ 特殊怪物/生物个体名：有专有名字的怪物（如：Malfeshnekor, Erylium）
✓ 历史事件：特定事件名称（如：Earthfall, Late Unpleasantness）

**不要收集（常见错误）：**
✗ 游戏术语：action, bonus, damage, strike, attack
✗ 通用物品：sword, armor, potion, ring, shield
✗ 种族名：human, elf, dwarf, goblin, orc
✗ 形容词：large, small, ancient, powerful
✗ 职业/技能：fighter, wizard, diplomacy, athletics

**判断技巧：**
- 首字母大写的词更可能是专有名词
- 在文中多次出现的名字应该收集
- 当不确定时，人名和地名优先收集

术语表现有 ${existingTermsCount} 个术语。
${terminologyPrompt ? '上方【术语知识库】中的术语已存在，不要重复。\n' : ''}
请积极收集文本中出现的专有名词，即使数量较少也要返回。

使用 collect_new_terminology 函数提交收集到的术语。
category参数选择：
- character: 人物名
- place: 地名  
- deity: 神祇
- organization: 组织
- monster: 特殊怪物个体
- event: 历史事件
- item: 神器/特殊物品
- other: 其他专有名词`;
    }
    
    return `请将以下HTML内容翻译成中文，严格保持所有HTML标签、属性和结构不变。只翻译标签内的文本内容，不要修改任何HTML标记。

翻译要求: ${translationRequirements}

${terminologyPrompt}
${termCollectionPrompt}

重要说明：
1. 保持所有HTML标签完整，包括 <h1>, <h2>, <h3>, <h4>, <h5>, <h6>, <p>, <div>, <span> 等
2. 保持所有属性不变，如 class, id, style 等
3. 保持HTML结构层次不变
4. 只翻译可见的文本内容
5. 保持换行和空格的格式
6. 不要添加或删除任何HTML标签

待翻译的HTML内容：

${htmlContent}

请直接返回翻译后的完整HTML内容。`;
  }

  /**
   * 从AI响应中提取翻译后的HTML内容
   */
  private extractTranslatedHtml(aiResponse: string, originalHtml: string): string {
    // 移除可能的markdown代码块标记
    let cleanedResponse = aiResponse.trim();
    
    // 移除 ```html 或 ``` 标记
    cleanedResponse = cleanedResponse.replace(/^```html?\s*/i, '');
    cleanedResponse = cleanedResponse.replace(/\s*```\s*$/, '');
    
    // 增强的newTerms JSON数据清理（防止被贴入文档）
    // 1. 移除完整的JSON对象格式（可能有换行和空格）
    cleanedResponse = cleanedResponse.replace(/\s*\{\s*"newTerms"\s*:\s*\[[\s\S]*?\]\s*\}\s*/gi, '');
    
    // 2. 移除JSON代码块中的newTerms
    cleanedResponse = cleanedResponse.replace(/```json\s*\{?\s*"newTerms"\s*:[\s\S]*?```/gi, '');
    cleanedResponse = cleanedResponse.replace(/```\s*\{?\s*"newTerms"\s*:[\s\S]*?```/gi, '');
    
    // 3. 移除独立的newTerms数组（可能在末尾）
    cleanedResponse = cleanedResponse.replace(/\s*"newTerms"\s*:\s*\[[\s\S]*$/gi, '');
    
    // 4. 移除任何剩余的JSON术语对象（单个术语格式）
    // 匹配类似 {"original": "xxx", "translation": "xxx", "category": "xxx"} 的格式
    cleanedResponse = cleanedResponse.replace(/\s*\{\s*"original"\s*:\s*"[^"]*"\s*,\s*"translation"\s*:\s*"[^"]*"(?:\s*,\s*"category"\s*:\s*"[^"]*")?\s*\}\s*/g, '');
    
    // 5. 移除可能残留的JSON数组标记
    cleanedResponse = cleanedResponse.replace(/^\s*\[\s*/g, '');
    cleanedResponse = cleanedResponse.replace(/\s*\]\s*$/g, '');
    
    // 6. 清理可能出现的说明性文本
    cleanedResponse = cleanedResponse.replace(/\n*以下是(新|识别出的).*?术语.*?[:：]\s*/gi, '');
    cleanedResponse = cleanedResponse.replace(/\n*新术语列表.*?[:：]\s*/gi, '');
    
    // 如果响应不包含HTML标签，可能AI只返回了文本，需要特殊处理
    if (!cleanedResponse.includes('<') || !cleanedResponse.includes('>')) {
      console.warn(`${MODULE_ID} | AI响应不包含HTML标签，可能需要回退到分段翻译`);
      return originalHtml; // 返回原始内容，让调用者处理
    }
    
    // 验证HTML结构基本正确
    const openTags = (cleanedResponse.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (cleanedResponse.match(/<\/[^>]*>/g) || []).length;
    const selfClosingTags = (cleanedResponse.match(/<[^>]*\/>/g) || []).length;
    
    // 简单的HTML完整性检查
    if (Math.abs(openTags - closeTags - selfClosingTags) > 5) {
      console.warn(`${MODULE_ID} | HTML结构可能不完整，标签数量不匹配`);
    }
    
    return cleanedResponse.trim();
  }

  /**
   * 准备术语表提示
   */
  private async prepareTerminologyPrompt(content: string): Promise<string> {
    try {
      console.log(`${MODULE_ID} | 正在准备术语表...`);
      
      // 使用术语转换器获取术语匹配并准备AI输入
      const terminologyInfo = terminologyTranslator.prepareForAI(content);
      
      if (terminologyInfo && Object.keys(terminologyInfo.terminology).length > 0) {
        console.log(`${MODULE_ID} | 找到 ${Object.keys(terminologyInfo.terminology).length} 个术语匹配项`);
        
        // 按类别组织术语
        const categorizedTerms: Record<string, Array<[string, string]>> = {};
        
        Object.entries(terminologyInfo.terminology).forEach(([term, translation]) => {
          const category = terminologyTranslator.getTermCategory?.(term) || 'other';
          if (!categorizedTerms[category]) {
            categorizedTerms[category] = [];
          }
          categorizedTerms[category].push([term, translation]);
        });
        
        // 构建分类后的术语知识库提示
        let prompt = '\n【术语知识库】\n以下是游戏专有术语的翻译参考，请在翻译时根据语境灵活使用，不需要强制替换：\n\n';
        
        // 定义类别的中文名称和优先级
        const categoryOrder = [
          { key: 'character', name: '人物名称' },
          { key: 'place', name: '地名' },
          { key: 'deity', name: '神祇' },
          { key: 'organization', name: '组织' },
          { key: 'monster', name: '怪物/生物' },
          { key: 'spell', name: '法术' },
          { key: 'item', name: '物品/装备' },
          { key: 'skill', name: '技能' },
          { key: 'action', name: '动作' },
          { key: 'other', name: '其他' }
        ];
        
        for (const { key, name } of categoryOrder) {
          if (categorizedTerms[key] && categorizedTerms[key].length > 0) {
            prompt += `【${name}】\n`;
            categorizedTerms[key].forEach(([term, translation]) => {
              prompt += `  ${term} → ${translation}\n`;
            });
            prompt += '\n';
          }
        }
        
        prompt += '翻译指导原则：\n';
        prompt += '1. 人名、地名、神祇名等专有名词应保持一致性，参考上述翻译\n';
        prompt += '2. 对于游戏机制术语（如法术、技能、动作名），在首次出现时可考虑保留英文原文\n';
        prompt += '3. 根据上下文语境选择最合适的表达方式，不需要机械替换\n';
        prompt += '4. 如果某个术语在特定语境下有更好的翻译，可以灵活调整\n';
        
        return prompt;
      } else {
        console.log(`${MODULE_ID} | 未找到术语匹配项`);
        return '';
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 处理术语表时出错:`, error);
      return '';
    }
  }

  /**
   * 分段翻译方法 - 调用原有的完整分段翻译逻辑
   */
  private async translateJournalPageSegmented(page: any, translationRequirements: string, useTerminology: boolean = false): Promise<void> {
    console.log(`${MODULE_ID} | 使用分段翻译: ${page.name}`);
    
    // 调用原有的分段翻译逻辑
    await this.translateJournalPageOriginal(page, translationRequirements, useTerminology);
  }

  /**
   * 翻译页面名称
   */
  private async translatePageName(pageName: string, translationRequirements: string): Promise<string | null> {
    try {
      console.log(`${MODULE_ID} | 翻译页面名称: ${pageName}`);
      
      // 先尝试直接从术语表中查找精确匹配
      const directTranslation = terminologyTranslator.translateEnToZh(pageName);
      if (directTranslation !== pageName) {
        console.log(`${MODULE_ID} | 页面名称直接匹配术语表: ${pageName} -> ${directTranslation}`);
        return directTranslation;
      }
      
      // 准备术语表提示
      const terminologyInfo = terminologyTranslator.prepareForAI(pageName);
      let terminologyPrompt = '';
      if (terminologyInfo && terminologyInfo.terminology && Object.keys(terminologyInfo.terminology).length > 0) {
        terminologyPrompt = `\n\n术语表参考（这些专有名词请使用指定翻译）：\n`;
        for (const [original, translation] of Object.entries(terminologyInfo.terminology)) {
          terminologyPrompt += `- ${original} -> ${translation}\n`;
        }
      }
      
      const prompt = `请将以下页面标题翻译成中文，只返回翻译结果，不要其他内容：

页面标题: ${pageName}

翻译要求: ${translationRequirements}${terminologyPrompt}

注意：
1. 如果标题中包含上述术语表中的专有名词，请使用指定的翻译
2. 直接返回翻译后的标题，不要引号或其他格式`;

      const response = await this.callAIAPI([
        { role: 'user', content: prompt }
      ]);

      if (response && response.choices && response.choices.length > 0) {
        let translatedName = response.choices[0].message.content.trim();
        
        // 移除可能的引号
        translatedName = translatedName.replace(/^["'「『]|["'」』]$/g, '');
        
        // 确保翻译结果也应用术语表（后处理）
        translatedName = terminologyTranslator.translateEnToZh(translatedName);
        
        // 简单验证翻译结果
        if (translatedName && translatedName.length > 0 && translatedName !== pageName) {
          return translatedName;
        }
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 翻译页面名称失败:`, error);
    }
    
    return null;
  }

  /**
   * 保护PF2e内联格式标记
   * 将格式标记替换为占位符，避免翻译时被破坏
   * @param text 原始文本
   * @param startCounter 起始计数器值，用于确保占位符唯一性
   * @returns { text: 处理后的文本, placeholders: 占位符映射, nextCounter: 下一个可用的计数器值 }
   */
  private preserveInlineFormats(text: string, startCounter: number = 0): { text: string; placeholders: Map<string, string>; nextCounter: number } {
    const placeholders = new Map<string, string>();
    let counter = startCounter;
    let processedText = text;

    // 定义需要保护的格式模式（按优先级排序，从具体到一般）
    const patterns = [
      // @Check 检定链接 - 包含多种变体
      /@Check\[([^\]]+)\]/gi,
      // @Damage 伤害掷骰 - 包含复杂公式
      /@Damage\[([^\]]+)\](?:\{([^}]+)\})?/gi,
      // @UUID 嵌入链接
      /@UUID\[([^\]]+)\](?:\{([^}]+)\})?/gi,
      // @Localize 本地化字符串
      /@Localize\[([^\]]+)\]/gi,
      // @Template 模板按钮
      /@Template\[([^\]]+)\]/gi,
      // 内联掷骰 [[/r ...]] 和 [[/gmr ...]]
      /\[\[\/(?:r|gmr)\s+([^\]]+)\]\](?:\{([^}]+)\})?/gi,
      // 动作符号
      /\[(?:one-action|two-actions|three-actions|reaction|free-action)\]/gi,
      // 其他方括号标记（如trait引用）
      /\[([a-z-]+)\]/gi
    ];

    // 遍历每个模式进行替换
    for (const pattern of patterns) {
      processedText = processedText.replace(pattern, (match) => {
        const placeholder = `###PLACEHOLDER_${counter}###`;
        placeholders.set(placeholder, match);
        counter++;
        return placeholder;
      });
    }

    console.log(`${MODULE_ID} | 保护了 ${placeholders.size} 个内联格式标记 (counter: ${startCounter} -> ${counter})`);
    return { text: processedText, placeholders, nextCounter: counter };
  }

  /**
   * 恢复PF2e内联格式标记
   * 将占位符还原为原始格式标记
   * @param text 翻译后的文本
   * @param placeholders 占位符映射
   * @returns 恢复格式后的文本
   */
  private restoreInlineFormats(text: string, placeholders: Map<string, string>): string {
    let restoredText = text;

    // 遍历所有占位符，将其还原
    for (const [placeholder, original] of placeholders.entries()) {
      // 使用全局替换确保所有出现的占位符都被替换
      restoredText = restoredText.split(placeholder).join(original);
    }

    console.log(`${MODULE_ID} | 恢复了 ${placeholders.size} 个内联格式标记`);
    return restoredText;
  }

  /**
   * 处理NPC翻译请求
   * @param actor NPC Actor对象
   */
  public async handleNPCTranslation(actor: any): Promise<void> {
    console.log(`${MODULE_ID} | 开始处理NPC翻译请求:`, actor.name);

    // 检查是否为GM
    const game = getGame();
    if (!game || !game.user || !game.user.isGM) {
      if (ui && ui.notifications) {
        ui.notifications.error("只有GM可以翻译NPC");
      }
      return;
    }

    // 创建翻译对话框
    const d = new Dialog({
      title: `翻译NPC: ${actor.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>翻译要求:</label>
            <textarea name="translationRequirements" rows="3" placeholder="请输入具体翻译要求，例如：保持专业术语标准，使用简体中文等..."></textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="useTerminology" checked>
              使用术语表辅助翻译
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="autoCollectTerms" checked>
              自动收集新术语
            </label>
          </div>
        </form>
      `,
      buttons: {
        translate: {
          icon: '<i class="fas fa-language"></i>',
          label: '开始翻译',
          callback: async (html: any) => {
            const requirements = html.find('[name="translationRequirements"]').val() || '';
            const useTerminology = html.find('[name="useTerminology"]').prop('checked');
            const autoCollectTerms = html.find('[name="autoCollectTerms"]').prop('checked');
            
            await this.translateNPC(actor, requirements, useTerminology, autoCollectTerms);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: '取消'
        }
      },
      default: 'translate'
    });

    d.render(true);
  }

  /**
   * 翻译NPC
   * @param actor NPC Actor对象
   * @param requirements 翻译要求
   * @param useTerminology 是否使用术语表
   * @param autoCollectTerms 是否自动收集新术语
   */
  private async translateNPC(actor: any, requirements: string, useTerminology: boolean, autoCollectTerms: boolean): Promise<void> {
    try {
      console.log(`${MODULE_ID} | 开始翻译NPC: ${actor.name}`);
      
      if (ui && ui.notifications) {
        ui.notifications.info(`正在翻译NPC: ${actor.name}，请稍候...`);
      }

      // 1. 提取可翻译内容
      const extractedContent = this.extractNPCTranslatableContent(actor);
      console.log(`${MODULE_ID} | 提取的内容:`, extractedContent);

      // 2. 保护内联格式
      const allPlaceholders = new Map<string, string>();
      const protectedContent = JSON.parse(JSON.stringify(extractedContent)); // 深拷贝
      let currentCounter = 0; // 全局计数器，确保所有占位符唯一
      
      // 保护名称中的格式
      if (protectedContent.name) {
        const { text, placeholders, nextCounter } = this.preserveInlineFormats(protectedContent.name, currentCounter);
        protectedContent.name = text;
        placeholders.forEach((v, k) => allPlaceholders.set(k, v));
        currentCounter = nextCounter; // 更新计数器
      }
      
      // 保护描述中的格式
      if (protectedContent.description) {
        const { text, placeholders, nextCounter } = this.preserveInlineFormats(protectedContent.description, currentCounter);
        protectedContent.description = text;
        placeholders.forEach((v, k) => allPlaceholders.set(k, v));
        currentCounter = nextCounter; // 更新计数器
      }
      
      // 保护items中的格式
      if (protectedContent.items && Array.isArray(protectedContent.items)) {
        protectedContent.items = protectedContent.items.map((item: any) => {
          const protectedItem = { ...item };
          if (protectedItem.name) {
            const { text, placeholders, nextCounter } = this.preserveInlineFormats(protectedItem.name, currentCounter);
            protectedItem.name = text;
            placeholders.forEach((v, k) => allPlaceholders.set(k, v));
            currentCounter = nextCounter; // 更新计数器
          }
          if (protectedItem.description) {
            const { text, placeholders, nextCounter } = this.preserveInlineFormats(protectedItem.description, currentCounter);
            protectedItem.description = text;
            placeholders.forEach((v, k) => allPlaceholders.set(k, v));
            currentCounter = nextCounter; // 更新计数器
          }
          return protectedItem;
        });
      }

      console.log(`${MODULE_ID} | 总共保护了 ${allPlaceholders.size} 个内联格式标记，计数器范围: 0-${currentCounter}`);

      // 3. 准备术语表提示
      let terminologyPrompt = '';
      if (useTerminology) {
        const allText = JSON.stringify(protectedContent);
        terminologyPrompt = await this.prepareTerminologyPrompt(allText);
      }

      // 4. 构建翻译提示词
      const translationPrompt = `你是一个专业的Pathfinder 2e游戏内容翻译助手。

任务：将以下NPC卡内容翻译成中文。

重要规则：
1. 保持所有数值、公式、占位符（如 ###PLACEHOLDER_X###）完全不变
2. 不要翻译或修改任何规则术语的英文代码（如 trait、slug 等）
3. 只翻译name和description字段的内容
4. 保持JSON结构完整
5. 保留所有HTML标签和格式
6. 占位符必须原封不动地保留在翻译结果中

${terminologyPrompt}

${autoCollectTerms ? `
【专有名词收集】
在翻译过程中，请识别文本中的专有名词（proper nouns），重点关注：
- NPC的名字（如果这是一个有名字的角色）
- 提到的地名、组织名
- 神祇或传说生物的名字
- 特定技能、法术、物品的独特名称（非通用术语）

**不要收集通用词汇**（如：attack、damage、armor、shield等游戏机制术语）

如果发现新的专有名词，请在翻译结果末尾添加：
{
  "newTerms": [
    {"original": "英文专有名词", "translation": "中文翻译", "category": "类别"}
  ]
}

类别选择：
- character: 角色/人物名
- monster: 特定怪物个体的名字
- place: 地名
- deity: 神祇名
- organization: 组织名
- item: 特殊物品名（神器等）
- other: 其他专有名词
` : ''}

${requirements ? `用户要求: ${requirements}` : ''}

待翻译的NPC内容（JSON格式）：
${JSON.stringify(protectedContent, null, 2)}

请返回翻译后的JSON对象，保持相同的结构。`;

      // 5. 调用AI翻译
      const response = await this.callAIAPI([
        { role: 'user', content: translationPrompt }
      ]);

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('AI返回空响应');
      }

      const aiResponseText = response.choices[0].message.content;
      console.log(`${MODULE_ID} | AI响应长度:`, aiResponseText.length);

      // 6. 收集新术语（如果启用）
      if (autoCollectTerms) {
        console.log(`${MODULE_ID} | [术语收集-NPC] 尝试从响应中收集术语...`);
        await this.collectNewTerminologies(aiResponseText, true);
      } else {
        console.log(`${MODULE_ID} | [术语收集-NPC] 自动收集未启用`);
      }

      // 7. 解析翻译结果
      let translatedContent;
      try {
        // 提取JSON部分（可能包含在代码块中）
        let jsonText = aiResponseText;
        const jsonMatch = aiResponseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }
        
        // 移除newTerms部分（如果存在）
        jsonText = jsonText.replace(/"newTerms"\s*:\s*\[[^\]]*\]/g, '');
        jsonText = jsonText.replace(/,\s*}/g, '}'); // 清理多余的逗号
        
        translatedContent = JSON.parse(jsonText);
      } catch (parseError) {
        console.error(`${MODULE_ID} | 解析翻译结果失败:`, parseError);
        throw new Error('无法解析AI返回的翻译结果');
      }

      // 8. 恢复内联格式
      if (translatedContent.name) {
        translatedContent.name = this.restoreInlineFormats(translatedContent.name, allPlaceholders);
      }
      if (translatedContent.description) {
        translatedContent.description = this.restoreInlineFormats(translatedContent.description, allPlaceholders);
      }
      if (translatedContent.items && Array.isArray(translatedContent.items)) {
        translatedContent.items = translatedContent.items.map((item: any) => ({
          ...item,
          name: item.name ? this.restoreInlineFormats(item.name, allPlaceholders) : item.name,
          description: item.description ? this.restoreInlineFormats(item.description, allPlaceholders) : item.description
        }));
      }

      // 9. 应用翻译
      await this.applyNPCTranslation(actor, translatedContent);

      if (ui && ui.notifications) {
        ui.notifications.info(`NPC ${actor.name} 翻译完成！`);
      }

    } catch (error) {
      console.error(`${MODULE_ID} | 翻译NPC失败:`, error);
      if (ui && ui.notifications) {
        ui.notifications.error(`翻译失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 提取NPC的可翻译内容
   * @param actor NPC Actor对象
   * @returns 提取的可翻译内容
   */
  private extractNPCTranslatableContent(actor: any): any {
    const content: any = {
      name: actor.name || '',
      description: actor.system?.details?.publicNotes || '',
      items: []
    };

    // 提取所有items的名称和描述
    if (actor.items && actor.items.contents) {
      content.items = actor.items.contents.map((item: any) => ({
        id: item.id,
        name: item.name || '',
        description: item.system?.description?.value || ''
      }));
    }

    console.log(`${MODULE_ID} | 提取了 NPC 名称、描述和 ${content.items.length} 个子物品`);
    return content;
  }

  /**
   * 应用NPC翻译结果
   * @param actor NPC Actor对象
   * @param translatedContent 翻译后的内容
   */
  private async applyNPCTranslation(actor: any, translatedContent: any): Promise<void> {
    try {
      console.log(`${MODULE_ID} | 开始应用NPC翻译`);

      // 构建更新数据
      const updateData: any = {};

      // 更新名称
      if (translatedContent.name && translatedContent.name !== actor.name) {
        updateData.name = translatedContent.name;
      }

      // 更新描述
      if (translatedContent.description) {
        updateData['system.details.publicNotes'] = translatedContent.description;
      }

      // 更新Actor本体
      if (Object.keys(updateData).length > 0) {
        await actor.update(updateData);
        console.log(`${MODULE_ID} | 已更新NPC本体数据`);
      }

      // 更新items
      if (translatedContent.items && Array.isArray(translatedContent.items)) {
        for (const translatedItem of translatedContent.items) {
          const originalItem = actor.items.get(translatedItem.id);
          if (originalItem) {
            const itemUpdateData: any = {};
            
            if (translatedItem.name && translatedItem.name !== originalItem.name) {
              itemUpdateData.name = translatedItem.name;
            }
            
            if (translatedItem.description) {
              itemUpdateData['system.description.value'] = translatedItem.description;
            }

            if (Object.keys(itemUpdateData).length > 0) {
              await originalItem.update(itemUpdateData);
              console.log(`${MODULE_ID} | 已更新item: ${originalItem.name}`);
            }
          }
        }
      }

      console.log(`${MODULE_ID} | NPC翻译应用完成`);

    } catch (error) {
      console.error(`${MODULE_ID} | 应用NPC翻译失败:`, error);
      throw error;
    }
  }

  /**
   * 从 Function Call 中收集新术语
   * @param terms 从 FC 中提取的术语数组
   */
  private async collectNewTerminologiesFromFC(terms: Array<{original: string, translation: string, category?: string}>): Promise<void> {
    try {
      console.log(`${MODULE_ID} | [术语收集] 从 Function Call 收到 ${terms.length} 个术语候选`);
      
      // 详细记录收到的术语
      if (terms.length > 0) {
        console.log(`${MODULE_ID} | [术语收集] 候选术语列表:`, terms.map(t => `${t.original} → ${t.translation} [${t.category || 'other'}]`).join(', '));
      } else {
        console.warn(`${MODULE_ID} | [术语收集] ⚠️ AI没有返回任何术语！`);
        return;
      }

      // 过滤已存在的术语
      const uniqueTerms = terms.filter(term => {
        const originalNormalized = term.original.trim();
        const translationNormalized = term.translation.trim();
        
        // 验证术语有效性
        if (!originalNormalized || !translationNormalized) {
          console.log(`${MODULE_ID} | [术语收集] ❌ 跳过空术语`);
          return false;
        }
        
        // 过滤明显的通用词汇（简单黑名单）
        const commonWords = ['large', 'medium', 'small', 'attack', 'damage', 'bonus', 'penalty', 'action', 'strike', 'sword', 'armor', 'shield', 'weapon', 'spell', 'item'];
        if (commonWords.includes(originalNormalized.toLowerCase())) {
          console.log(`${MODULE_ID} | [术语收集] ❌ 跳过通用词汇: ${originalNormalized}`);
          return false;
        }
        
        // 使用术语转换器检查是否已存在
        const translatedToZh = terminologyTranslator.translateEnToZh(originalNormalized);
        const translatedToEn = terminologyTranslator.translateZhToEn(translationNormalized);
        
        if (translatedToZh && translatedToZh !== originalNormalized) {
          console.log(`${MODULE_ID} | [术语收集] ⏭️ 已存在(英文): ${originalNormalized} -> ${translatedToZh}`);
          return false;
        }
        
        if (translatedToEn && translatedToEn !== translationNormalized) {
          console.log(`${MODULE_ID} | [术语收集] ⏭️ 已存在(中文): ${translationNormalized} -> ${translatedToEn}`);
          return false;
        }
        
        // 额外检查：获取所有现有术语进行精确比对
        const allTerms = terminologyTranslator.getAllTerms?.() || [];
        const originalLower = originalNormalized.toLowerCase();
        const translationLower = translationNormalized.toLowerCase();
        
        for (const existingTerm of allTerms) {
          const existingOrigLower = existingTerm.original?.toLowerCase().trim();
          const existingTransLower = existingTerm.translation?.toLowerCase().trim();
          
          if (existingOrigLower === originalLower) {
            console.log(`${MODULE_ID} | [术语收集] ⏭️ 已存在(英文精确): ${originalNormalized}`);
            return false;
          }
          
          if (existingTransLower === translationLower) {
            console.log(`${MODULE_ID} | [术语收集] ⏭️ 已存在(中文精确): ${translationNormalized}`);
            return false;
          }
        }
        
        console.log(`${MODULE_ID} | [术语收集] ✅ 新术语: ${originalNormalized} → ${translationNormalized}`);
        return true;
      });

      if (uniqueTerms.length === 0) {
        console.log(`${MODULE_ID} | [术语收集] 所有术语都已存在或被过滤，无需添加`);
        return;
      }

      console.log(`${MODULE_ID} | [术语收集] 过滤后剩余 ${uniqueTerms.length} 个新术语，准备添加...`);

      // 添加新术语
      const addedCount = terminologyTranslator.addNewTerms(uniqueTerms);
      
      // 保存到存储
      await this.saveTerminologyToStorage();
      
      if (ui && ui.notifications) {
        ui.notifications.info(`✅ 自动添加了 ${addedCount} 个新术语到术语表`);
      }
      
      console.log(`${MODULE_ID} | [术语收集] ✅ 成功添加 ${addedCount} 个新术语`);

    } catch (error) {
      console.error(`${MODULE_ID} | [术语收集] ❌ 从 FC 收集新术语失败:`, error);
      // 不抛出错误，避免影响翻译流程
    }
  }

  /**
   * 从AI响应中收集新术语（旧方法，作为后备）
   * @param aiResponse AI的响应文本
   * @param autoAdd 是否自动添加到术语表
   */
  private async collectNewTerminologies(aiResponse: string, autoAdd: boolean): Promise<void> {
    try {
      console.log(`${MODULE_ID} | [术语收集-后备] 开始从响应文本中提取术语...`);

      // 1. 从AI响应中提取newTerms部分
      // 支持多种格式
      let newTermsArray: Array<{original: string, translation: string, category?: string}> = [];
      
      // 尝试匹配JSON格式的newTerms
      const newTermsMatch = aiResponse.match(/"newTerms"\s*:\s*\[[\s\S]*?\]/);
      if (newTermsMatch) {
        console.log(`${MODULE_ID} | [术语收集-后备] 找到 newTerms JSON 片段`);
        try {
          // 提取JSON对象
          const jsonStr = `{${newTermsMatch[0]}}`;
          const parsed = JSON.parse(jsonStr);
          newTermsArray = parsed.newTerms || [];
          console.log(`${MODULE_ID} | [术语收集-后备] 成功解析，得到 ${newTermsArray.length} 个术语`);
        } catch (parseError) {
          console.warn(`${MODULE_ID} | [术语收集-后备] ⚠️ 解析newTerms JSON失败，尝试其他方法:`, parseError);
        }
      } else {
        console.log(`${MODULE_ID} | [术语收集-后备] 未找到标准 newTerms 格式`);
      }

      // 如果没有找到，尝试简化的格式
      if (newTermsArray.length === 0) {
        console.log(`${MODULE_ID} | [术语收集-后备] 尝试使用正则表达式提取...`);
        const termPattern = /\{"original"\s*:\s*"([^"]+)"\s*,\s*"translation"\s*:\s*"([^"]+)"(?:\s*,\s*"category"\s*:\s*"([^"]+)")?\}/g;
        let match;
        while ((match = termPattern.exec(aiResponse)) !== null) {
          newTermsArray.push({
            original: match[1],
            translation: match[2],
            category: match[3] || 'other'
          });
        }
        console.log(`${MODULE_ID} | [术语收集-后备] 正则提取到 ${newTermsArray.length} 个术语`);
      }

      if (newTermsArray.length === 0) {
        console.warn(`${MODULE_ID} | [术语收集-后备] ⚠️ AI响应中未找到任何术语数据`);
        // 输出响应的前500字符用于调试
        console.log(`${MODULE_ID} | [术语收集-后备] 响应预览（前500字符）:`, aiResponse.substring(0, 500));
        return;
      }

      console.log(`${MODULE_ID} | [术语收集-后备] 找到 ${newTermsArray.length} 个术语候选，开始过滤...`);

      // 2. 过滤已存在的术语
      const uniqueTerms = newTermsArray.filter(term => {
        // 规范化术语（去除空格，转小写用于比较）
        const originalNormalized = term.original.trim();
        const translationNormalized = term.translation.trim();
        
        // 使用术语转换器检查是否已存在
        const translatedToZh = terminologyTranslator.translateEnToZh(originalNormalized);
        const translatedToEn = terminologyTranslator.translateZhToEn(translationNormalized);
        
        // 如果英文能翻译成中文，且翻译结果不是原文本身，说明英文术语已存在
        if (translatedToZh && translatedToZh !== originalNormalized) {
          console.log(`${MODULE_ID} | 术语已存在(英文): ${originalNormalized} -> ${translatedToZh}`);
          return false;
        }
        
        // 如果中文能翻译成英文，且翻译结果不是原文本身，说明中文术语已存在
        if (translatedToEn && translatedToEn !== translationNormalized) {
          console.log(`${MODULE_ID} | 术语已存在(中文): ${translationNormalized} -> ${translatedToEn}`);
          return false;
        }
        
        // 额外检查：获取所有现有术语进行精确比对（不区分大小写）
        const allTerms = terminologyTranslator.getAllTerms?.() || [];
        const originalLower = originalNormalized.toLowerCase();
        const translationLower = translationNormalized.toLowerCase();
        
        for (const existingTerm of allTerms) {
          const existingOrigLower = existingTerm.original?.toLowerCase().trim();
          const existingTransLower = existingTerm.translation?.toLowerCase().trim();
          
          // 如果原文或译文完全匹配（不区分大小写），说明已存在
          if (existingOrigLower === originalLower) {
            console.log(`${MODULE_ID} | 术语已存在(英文精确匹配): ${originalNormalized}`);
            return false;
          }
          
          if (existingTransLower === translationLower) {
            console.log(`${MODULE_ID} | 术语已存在(中文精确匹配): ${translationNormalized}`);
            return false;
          }
        }
        
        return true;
      });

      if (uniqueTerms.length === 0) {
        console.log(`${MODULE_ID} | 所有术语都已存在，无需添加`);
        return;
      }

      console.log(`${MODULE_ID} | 过滤后剩余 ${uniqueTerms.length} 个新术语`);

      // 3. 如果启用自动添加
      if (autoAdd) {
        // 调用addNewTerms方法（将在pf2e-terminology.ts中实现）
        const addedCount = terminologyTranslator.addNewTerms(uniqueTerms);
        
        // 保存到存储
        await this.saveTerminologyToStorage();
        
        if (ui && ui.notifications) {
          ui.notifications.info(`自动添加了 ${addedCount} 个新术语到术语表`);
        }
        
        console.log(`${MODULE_ID} | 成功添加 ${addedCount} 个新术语`);
      } else {
        // 仅通知用户发现了新术语
        if (ui && ui.notifications) {
          ui.notifications.info(`发现 ${uniqueTerms.length} 个新术语（未自动添加）`);
        }
      }

    } catch (error) {
      console.error(`${MODULE_ID} | 收集新术语失败:`, error);
      // 不抛出错误，避免影响翻译流程
    }
  }

  /**
   * 保存术语表到存储
   */
  private async saveTerminologyToStorage(): Promise<void> {
    try {
      console.log(`${MODULE_ID} | 保存术语表到存储`);
      
      // 导出术语表为JSON
      const terminologyJson = terminologyTranslator.exportToJson();
      
      // 保存到模块文件
      const game = getGame();
      if (!game) {
        console.error(`${MODULE_ID} | 无法获取game对象`);
        return;
      }

      // 使用FilePicker API保存文件
      // 注意：这需要GM权限和适当的文件系统访问权限
      // 作为fallback，我们也可以保存到游戏设置
      try {
        // 尝试保存到文件（需要服务器支持）
        const response = await fetch(`/modules/${MODULE_ID}/terminology-data.json`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: terminologyJson
        });
        
        if (response.ok) {
          console.log(`${MODULE_ID} | 术语表已保存到文件`);
          return;
        }
      } catch (fileError) {
        console.warn(`${MODULE_ID} | 无法保存到文件，使用游戏设置作为备选:`, fileError);
      }

      // Fallback: 保存到游戏设置
      await game.settings.set(MODULE_ID, 'terminologyData', terminologyJson);
      console.log(`${MODULE_ID} | 术语表已保存到游戏设置`);

    } catch (error) {
      console.error(`${MODULE_ID} | 保存术语表失败:`, error);
    }
  }

  /**
   * 关闭相关的编辑器窗口以确保内容更新
   */
  private closeRelatedEditorWindows(document: any): void {
    try {
      console.log(`${MODULE_ID} | 关闭相关编辑器窗口`);
      
      // 获取所有打开的应用
      const openApps = Object.values((ui as any).windows || {});
      
      for (const app of openApps) {
        // 检查是否是Journal相关的编辑器
        if ((app as any).document && (app as any).document.id === document.id) {
          console.log(`${MODULE_ID} | 关闭Journal编辑器: ${document.name}`);
          (app as any).close();
        }
        // 检查是否是页面编辑器
        else if ((app as any).document && document.pages?.contents?.some((page: any) => page.id === (app as any).document.id)) {
          console.log(`${MODULE_ID} | 关闭页面编辑器`);
          (app as any).close();
        }
      }
      
      // 强制刷新Journal文档显示
      if (document.sheet && document.sheet.rendered) {
        setTimeout(() => {
          document.sheet.render(true);
        }, 500);
      }
      
    } catch (error) {
      console.error(`${MODULE_ID} | 关闭编辑器窗口时出错:`, error);
    }
  }
}

/**
 * 翻译进度对话框
 */
class TranslationProgressDialog extends FormApplication {
  private totalPages: number;
  private documentName: string;
  private currentProgress: number = 0;
  private progressData: Array<{ name: string; status: string }> = [];

  constructor(totalPages: number, documentName: string) {
    super({}, {
      id: "ai-pf2e-translation-progress",
      title: `翻译进度 - ${documentName}`,
      template: "modules/ai-pf2e-assistant/templates/translation-progress.hbs",
      width: 500,
      height: 400,
      resizable: true,
      closeOnSubmit: false
    });
    
    this.totalPages = totalPages;
    this.documentName = documentName;
    
    // 初始化进度数据
    for (let i = 0; i < totalPages; i++) {
      this.progressData.push({ name: `页面 ${i + 1}`, status: "等待中..." });
    }
  }

  static get defaultOptions() {
    // @ts-ignore - 使用foundry的mergeObject
    const foundry = (window as any).foundry;
    if (foundry && foundry.utils && foundry.utils.mergeObject) {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "ai-pf2e-translation-progress",
        classes: ["ai-pf2e-assistant", "translation-progress"],
        width: 500,
        height: 400,
        resizable: true,
        closeOnSubmit: false
      });
    }
    
    // 后备方案
    return {
      ...super.defaultOptions,
      id: "ai-pf2e-translation-progress",
      classes: ["ai-pf2e-assistant", "translation-progress"],
      width: 500,
      height: 400,
      resizable: true,
      closeOnSubmit: false
    };
  }

  getData() {
    return {
      documentName: this.documentName,
      totalPages: this.totalPages,
      currentProgress: this.currentProgress,
      progressPercentage: Math.round((this.currentProgress / this.totalPages) * 100),
      pages: this.progressData
    };
  }

  updateProgress(pageIndex: number, pageName: string, status: string) {
    if (pageIndex < this.progressData.length) {
      this.progressData[pageIndex].name = pageName;
      this.progressData[pageIndex].status = status;
      
      if (status === "翻译完成") {
        this.currentProgress = Math.max(this.currentProgress, pageIndex + 1);
      }
      
      // 刷新显示
      this.render(false);
    }
  }

  complete() {
    this.currentProgress = this.totalPages;
    this.render(false);
    
    // 3秒后自动关闭
    setTimeout(() => {
      this.close();
    }, 3000);
  }

  error(message: string) {
    // 显示错误信息
    const errorDiv = this.element?.find('.error-message');
    if (errorDiv && errorDiv.length > 0) {
      errorDiv.text(message).show();
    } else if (this.element) {
      this.element.find('.dialog-content').prepend(`<div class="error-message" style="color: red; margin-bottom: 10px;">${message}</div>`);
    }
  }

  activateListeners(html: any) {
    super.activateListeners(html);
    
    // 添加关闭按钮事件
    html.find('.close-button').click(() => this.close());
  }

  async _updateObject(event: any, formData: any) {
    // 不需要处理表单提交
  }
}

// 模块实例
let moduleInstance: AIPF2eAssistant | null = null;

// 预先创建模块实例，避免在初始化钩子中创建
moduleInstance = new AIPF2eAssistant();

// 注册Handlebars辅助函数
function registerHandlebarsHelpers() {
  try {
    // 注册比较辅助函数
    Handlebars.registerHelper('lt', function(a: any, b: any) {
      return a < b;
    });
    
    Handlebars.registerHelper('gt', function(a: any, b: any) {
      return a > b;
    });
    
    Handlebars.registerHelper('eq', function(a: any, b: any) {
      return a === b;
    });
    
    Handlebars.registerHelper('ne', function(a: any, b: any) {
      return a !== b;
    });
    
    Handlebars.registerHelper('lte', function(a: any, b: any) {
      return a <= b;
    });
    
    Handlebars.registerHelper('gte', function(a: any, b: any) {
      return a >= b;
    });
    
    Logger.debug('Handlebars辅助函数注册成功');
  } catch (error) {
    Logger.error('注册Handlebars辅助函数失败:', error);
  }
}

// 注册设置函数
function registerSettings() {
  const game = getGame();
  if (!game || !game.settings || typeof game.settings.register !== 'function') {
    Logger.error('无法注册设置：game.settings 对象不可用');
    return false;
  }
  
  try {
    // API设置 - GM专用
    game.settings.register(MODULE_ID, 'apiUrl', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.apiUrl.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.apiUrl.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'https://api.openai.com/v1/chat/completions'
    });

    game.settings.register(MODULE_ID, 'apiKey', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.apiKey.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.apiKey.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: '',
      onChange: () => {
        if (ui && ui.notifications) {
          ui.notifications.warn("API 密钥已更新，请重启 Foundry VTT 以使更改生效。", {permanent: true});
        }
      }
    });
    
    // API设置 - 玩家专用
    game.settings.register(MODULE_ID, 'playerApiUrl', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.playerApiUrl.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.playerApiUrl.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: ''
    });

    game.settings.register(MODULE_ID, 'playerApiKey', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.playerApiKey.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.playerApiKey.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: '',
      onChange: () => {
        if (ui && ui.notifications) {
          ui.notifications.warn("玩家API密钥已更新，请重启 Foundry VTT 以使更改生效。", {permanent: true});
        }
      }
    });
    
    // AI模型设置
    game.settings.register(MODULE_ID, 'aiModel', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.aiModel.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.aiModel.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'gpt-3.5-turbo'
    });
    
    // 图像生成API设置 - GM专用
    game.settings.register(MODULE_ID, 'imageApiUrl', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.imageApiUrl.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.imageApiUrl.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: ''
    });

    game.settings.register(MODULE_ID, 'imageApiKey', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.imageApiKey.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.imageApiKey.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: '',
      onChange: () => {
        if (ui && ui.notifications) {
          ui.notifications.warn("图像API密钥已更新，请重启 Foundry VTT 以使更改生效。", {permanent: true});
        }
      }
    });
    
    // 图像生成API设置 - 玩家专用
    game.settings.register(MODULE_ID, 'playerImageApiUrl', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.playerImageApiUrl.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.playerImageApiUrl.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: ''
    });

    game.settings.register(MODULE_ID, 'playerImageApiKey', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.playerImageApiKey.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.playerImageApiKey.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: '',
      onChange: () => {
        if (ui && ui.notifications) {
          ui.notifications.warn("玩家图像API密钥已更新，请重启 Foundry VTT 以使更改生效。", {permanent: true});
        }
      }
    });
    
    // 连接测试按钮设置
    game.settings.registerMenu(MODULE_ID, 'testConnection', {
      name: game.i18n.localize('ai-pf2e-assistant.settings.testConnection.name'),
      label: game.i18n.localize('ai-pf2e-assistant.settings.testConnection.label'),
      hint: game.i18n.localize('ai-pf2e-assistant.settings.testConnection.hint'),
      icon: "fas fa-plug",
      type: TestConnectionDialog,
      restricted: true
    });
    
    // 术语导入器按钮设置
    game.settings.registerMenu(MODULE_ID, 'terminologyImporter', {
      name: game.i18n.localize('ai-pf2e-assistant.settings.terminologyImporter.name'),
      label: game.i18n.localize('ai-pf2e-assistant.settings.terminologyImporter.label'),
      hint: game.i18n.localize('ai-pf2e-assistant.settings.terminologyImporter.hint'),
      icon: "fas fa-language",
      type: TerminologyImporterDialog,
      restricted: true
    });
    
    // 术语时间戳存储设置
    game.settings.register(MODULE_ID, 'termTimestamps', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.terminologyTimestamp.name"),
      scope: 'world',
      config: false, // 不在设置界面显示
      type: Object,
      default: {}
    });
    
    // 平衡关键词管理器按钮设置
    game.settings.registerMenu(MODULE_ID, 'balanceKeywordsManager', {
      name: game.i18n.localize('ai-pf2e-assistant.settings.balanceKeywordsManager.name'),
      label: game.i18n.localize('ai-pf2e-assistant.settings.balanceKeywordsManager.label'),
      hint: game.i18n.localize('ai-pf2e-assistant.settings.balanceKeywordsManager.hint'),
      icon: "fas fa-balance-scale",
      type: BalanceKeywordsManagerDialog,
      restricted: true
    });
    
    // 主题设置
    game.settings.register(MODULE_ID, 'activeTheme', {
      name: game.i18n.localize('ai-pf2e-assistant.settings.activeTheme.name'),
      hint: game.i18n.localize('ai-pf2e-assistant.settings.activeTheme.hint'),
      scope: 'world',
      config: true,
      type: String,
      default: 'shrine',
      choices: {
        'shrine': game.i18n.localize('ai-pf2e-assistant.settings.activeTheme.shrine'),
        'pokemon': game.i18n.localize('ai-pf2e-assistant.settings.activeTheme.pokemon')
      },
      onChange: (value: string) => {
        if (ui && ui.notifications) {
          ui.notifications.info("主题已切换，请刷新页面以生效");
        }
      }
    });
    
    // 调试模式设置
    game.settings.register(MODULE_ID, 'debugMode', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.debugMode.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.debugMode.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: (value: boolean) => {
        if (ui && ui.notifications) {
          ui.notifications.info(`调试模式已${value ? '启用' : '关闭'}，部分日志变化需刷新页面生效`);
        }
      }
    });
    
    // 图标生成设置
    game.settings.register(MODULE_ID, 'enableIconGeneration', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.enableIconGeneration.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.enableIconGeneration.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, 'imageModel', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.imageModel.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.imageModel.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'flux-pro',
      choices: {
        'dall-e-3': 'DALL-E 3',
        'dall-e-2': 'DALL-E 2', 
        'flux-pro': 'Flux Pro',
        'flux-dev': 'Flux Dev',
        'flux-schnell': 'Flux Schnell',
        'gpt-image-1': 'GPT Image-1',
        'midjourney': 'Midjourney',
        'ideogram-v2': 'Ideogram V2',
        'ideogram-v3': 'Ideogram V3',
        'stable-diffusion-xl': 'Stable Diffusion XL',
        'stable-diffusion-3': 'Stable Diffusion 3',
        'doubao-seedream-4': '豆包 SeedDream 4.0',
        'recraft-v3': 'Recraft V3'
      }
    });

    game.settings.register(MODULE_ID, 'iconSize', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.iconSize.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.iconSize.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: '1024x1024',
      choices: {
        '256x256': '256x256',
        '512x512': '512x512',
        '768x768': '768x768',
        '1024x1024': '1024x1024',
        '1024x768': '1024x768',
        '768x1024': '768x1024'
      }
    });

    game.settings.register(MODULE_ID, 'iconStyle', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.iconStyle.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.iconStyle.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'fantasy art',
      choices: {
        'fantasy art': '奇幻艺术',
        'pixel art': '像素艺术',
        'realistic': '写实风格',
        'cartoon': '卡通风格',
        'medieval': '中世纪风格'
      }
    });

    // 保留terminologyData设置以便向后兼容
    game.settings.register(MODULE_ID, 'terminologyData', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.terminology.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.terminology.hint"),
      scope: 'world',
      config: false,
      type: String,
      default: '{}'
    });

    // 术语自动收集设置
    game.settings.register(MODULE_ID, 'autoCollectTerminology', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.autoCollectTerminology.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.autoCollectTerminology.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });
    
    // 神龛系统设置
    game.settings.register(MODULE_ID, 'useShrineSystem', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.useShrineSystem.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.useShrineSystem.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: () => {
        if (ui && ui.notifications) {
          ui.notifications.info("神龛系统设置已更改，请刷新页面以生效");
        }
      }
    });

    // 神龛系统 - 设计模型（专长和法术通用）
    game.settings.register(MODULE_ID, 'shrineDesignModel', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineDesignModel.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineDesignModel.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'gpt-4o'
    });

    // 神龛系统 - 格式转换模型（专长和法术通用）
    game.settings.register(MODULE_ID, 'shrineFormatModel', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineFormatModel.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineFormatModel.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'gpt-4o'
    });

    // 神龛系统 - 直接生成模型（专长和法术通用）
    game.settings.register(MODULE_ID, 'shrineDirectModel', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineDirectModel.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineDirectModel.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'gpt-4o'
    });

    // 神龛系统 - 图标提示词模型（专长和法术通用）
    game.settings.register(MODULE_ID, 'shrineIconPromptModel', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineIconPromptModel.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineIconPromptModel.hint"),
      scope: 'world',
      config: true,
      type: String,
      default: 'gpt-4o-mini'
    });

    // 神龛系统 - 启用设计阶段
    game.settings.register(MODULE_ID, 'shrineEnableDesign', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineEnableDesignPhase.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineEnableDesignPhase.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // 神龛系统 - 启用格式化阶段
    game.settings.register(MODULE_ID, 'shrineEnableFormat', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineEnableFormatPhase.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineEnableFormatPhase.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // 神龛系统 - 法术启用设计阶段
    game.settings.register(MODULE_ID, 'shrineSpellDesignEnabled', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineSpellEnableDesignPhase.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineSpellEnableDesignPhase.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // 神龛系统 - 法术启用格式化阶段
    game.settings.register(MODULE_ID, 'shrineSpellFormatEnabled', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.shrineSpellEnableFormatPhase.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.shrineSpellEnableFormatPhase.hint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // 平衡关键词数据设置
    game.settings.register(MODULE_ID, 'balanceKeywords', {
      name: game.i18n.localize("ai-pf2e-assistant.settings.balanceKeywords.name"),
      hint: game.i18n.localize("ai-pf2e-assistant.settings.balanceKeywords.hint"),
      scope: 'world',
      config: false,
      type: String,
      default: ''
    });

    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | 注册设置时出错:`, error);
    return false;
  }
}

// 测试连接对话框
class TestConnectionDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "ai-pf2e-test-connection",
      title: "测试AI连接",
      template: `modules/${MODULE_ID}/templates/test-connection.html`,
      width: 400,
      height: "auto",
      classes: ["ai-pf2e-dialog"],
      resizable: true,
      closeOnSubmit: false
    });
  }
  
  getData(options = {}): any {
    return {
      testing: false,
      testResult: null
    };
  }
  
  // @ts-ignore - 类型问题处理
  async _updateObject(event: any, formData: any): Promise<void> {
    // 阻止默认提交行为
    event.preventDefault();
    
    // 获取表单中的元素
    const testButton = this.element.find('button[name="test"]');
    const resultElement = this.element.find('.test-result');
    
    // 更新按钮状态
    testButton.prop('disabled', true).text('测试中...');
    resultElement.empty().append('<p><i class="fas fa-spinner fa-spin"></i> 正在测试连接...</p>');
    
    try {
      // 获取模块API
      const game = getGame();
      const moduleApi = game.modules.get(MODULE_ID)?.api;
      
      if (!moduleApi) {
        throw new Error("模块API不可用");
      }
      
      // 测试连接
      const result = await moduleApi.testApiConnection();
      
      // 清空结果区域
      resultElement.empty();
      
      // 显示结果
      if (result.success) {
        resultElement.append(`
          <div class="test-success">
            <p><i class="fas fa-check-circle"></i> <strong>连接成功!</strong></p>
            <p>模型: ${result.details?.model || '未知'}</p>
            <p>回复: ${result.details?.content || '无回复内容'}</p>
            <p>Token使用: ${result.details?.usage?.total_tokens || 0}个 (提示: ${result.details?.usage?.prompt_tokens || 0}, 回复: ${result.details?.usage?.completion_tokens || 0})</p>
          </div>
        `);
      } else {
        resultElement.append(`
          <div class="test-error">
            <p><i class="fas fa-times-circle"></i> <strong>连接失败</strong></p>
            <p>错误信息: ${result.message}</p>
            ${result.details ? `<p>详细信息: ${JSON.stringify(result.details)}</p>` : ''}
          </div>
        `);
      }
    } catch (error) {
      // 显示错误
      resultElement.empty().append(`
        <div class="test-error">
          <p><i class="fas fa-times-circle"></i> <strong>测试过程出错</strong></p>
          <p>错误信息: ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      `);
    } finally {
      // 恢复按钮状态
      testButton.prop('disabled', false).text('重新测试');
    }
  }
  
  // @ts-ignore - 类型问题处理
  activateListeners(html: any): void {
    super.activateListeners(html);
    
    // 绑定测试按钮点击事件
    html.find('button[name="test"]').click(this._updateObject.bind(this));
    
    // 绑定关闭按钮点击事件
    html.find('button[name="close"]').click(() => this.close());
  }
}

// 术语导入器对话框 - 包装TerminologyImporter
class TerminologyImporterDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "ai-pf2e-terminology-importer-dialog",
      classes: ["ai-pf2e-dialog"],
      closeOnSubmit: false
    });
  }
  
  render(force?: boolean, options?: any) {
    // 直接打开terminologyImporter而不是自身
    return (terminologyImporter as any).render(force, options);
  }
}

// 初始化钩子 - 只尝试注册设置，不做其他操作
Hooks.once('init', function() {
  Logger.debug('Initializing AI PF2e Assistant');
  
  // 注册Handlebars辅助函数
  registerHandlebarsHelpers();
  
  // 尝试注册设置
  Logger.debug('Registering settings...');
  if (registerSettings()) {
    Logger.debug('Settings registered successfully');
  }
  
  // 注册战术手册配置
  Logger.debug('Registering Tactical Manual...');
  import('./tactical-manual/config').then(({ registerTacticalConfig }) => {
    registerTacticalConfig();
    Logger.debug('Tactical Manual config registered');
  }).catch(err => {
    Logger.error('Failed to register Tactical Manual config:', err);
  });
});

// setup钩子 - 为初始化做准备
Hooks.once('setup', function() {
  Logger.debug('Setup phase');
  
  // 在setup阶段再次尝试注册设置
  if (!registerSettings()) {
    // 如果init中没有成功注册设置，在setup中再次尝试
    Logger.debug('Retrying settings registration in setup phase');
  }
});

// 在setup钩子中注册Scene Control按钮（更早的时机）
Hooks.once('setup', function() {
  Logger.debug('Setup阶段，注册Scene Control按钮');
  
  // 创建实例
  if (!moduleInstance) {
    moduleInstance = new AIPF2eAssistant();
  }
  
  // 只注册Scene Control按钮
  moduleInstance.registerSceneControlButtons();
});

// 使用 ready 钩子确保游戏完全加载后再进行其他操作
Hooks.once('ready', function() {
  Logger.debug('AI PF2e Assistant is ready');
  
  // 确保实例已创建
  if (!moduleInstance) {
    moduleInstance = new AIPF2eAssistant();
    Logger.debug('创建了新的模块实例');
  }
  
  // 初始化设置（除了Scene Control按钮）
  moduleInstance.initWithoutSceneControls();
  Logger.debug('模块实例已初始化');
  
  // 集成战术手册系统
  Logger.debug('Integrating Tactical Manual...');
  import('./tactical-manual/integration').then(({ integrateTacticalManual }) => {
    integrateTacticalManual();
    Logger.debug('Tactical Manual integrated successfully');
  }).catch(err => {
    Logger.error('Failed to integrate Tactical Manual:', err);
  });
  
  // 设置 API
  const game = getGame();
  if (game && game.modules && typeof game.modules.get === 'function') {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = moduleInstance;
      Logger.debug('API exposed successfully');
    } else {
      Logger.error('无法获取模块实例');
    }
  } else {
    Logger.error('game.modules 不可用');
  }
  
  // 手动添加场景控制按钮
  Logger.debug('手动添加AI按钮到游戏界面');
  
  // 查找任何打开的角色表单并手动添加按钮
  setTimeout(() => {
    try {
      // 检查当前用户是否为GM
      const game = getGame();
      if (!game || !game.user || !game.user.isGM) {
        Logger.debug('非GM用户，跳过手动添加按钮');
        return;
      }
      
      Logger.debug('尝试检查现有应用并添加按钮');
      const $ = (window as any).$;
      if ($) {
        // 创建一个本地引用，避免在jQuery回调中使用this
        const instance = moduleInstance;
        
        $('.window-app').each(function(this: HTMLElement) {
          const appElement = this;
          const app = $(appElement).data('app');
          if (app && (app.constructor.name.includes('ActorSheet') || app.constructor.name.includes('ItemSheet'))) {
            Logger.debug('找到现有表单:', app.constructor.name);
            // 找到标题栏
            const header = $(appElement).find('.window-header');
            
            // 如果是角色表单，添加AI助手按钮
            if (app.constructor.name.includes('ActorSheet')) {
              if (header.length && !header.find('.ai-pf2e-button').length) {
                const button = $(`<a class="ai-pf2e-button"><i class="fas fa-robot"></i>AI助手</a>`);
                button.click(function() {
                  if (instance) {
                    instance.handleAIButtonClick(app);
                  }
                });
                header.find('.close').before(button);
                console.log(`${MODULE_ID} | 手动添加了AI助手按钮到:`, app.constructor.name);
              }
            }
            
            // 如果是物品表单，添加规则元素配置按钮和AI图标按钮
            if (app.constructor.name.includes('ItemSheet')) {
              // 添加规则元素配置按钮
              if (header.length && !header.find('.ai-pf2e-rule-button').length) {
                const ruleButton = $(`<a class="ai-pf2e-rule-button"><i class="fas fa-wand-magic-sparkles"></i>规则元素</a>`);
                ruleButton.click(function() {
                  if (instance) {
                    instance.handleRuleElementButtonClick(app);
                  }
                });
                header.find('.close').before(ruleButton);
                console.log(`${MODULE_ID} | 手动添加了规则元素配置按钮到:`, app.constructor.name);
              }
              
              // 添加AI图标按钮
              if (header.length && !header.find('.ai-pf2e-icon-button').length) {
                // 获取物品文档
                const item = app.document || app.item || app.object;
                
                // 动态导入使用服务来检查状态
                import('./services/item-icon-usage-service').then(({ ItemIconUsageService }) => {
                  const usageService = ItemIconUsageService.getInstance();
                  const canUse = item && usageService.canUseIconGeneration(item.id);
                  
                  // 根据使用状态设置按钮
                  let iconButton;
                  if (!canUse && item && !game.user?.isGM) {
                    // 已使用，显示禁用状态
                    iconButton = $(`<a class="ai-pf2e-icon-button" style="opacity: 0.6; pointer-events: none;"><i class="fas fa-check"></i>已使用</a>`);
                  } else {
                    // 未使用或GM用户，显示正常按钮
                    iconButton = $(`<a class="ai-pf2e-icon-button"><i class="fas fa-image"></i>AI图标</a>`);
                    iconButton.click(function() {
                      if (instance) {
                        instance.handleIconGenerationButtonClick(app);
                      }
                    });
                  }
                  
                  header.find('.close').before(iconButton);
                  console.log(`${MODULE_ID} | 手动添加了AI图标按钮到:`, app.constructor.name, canUse ? '(可用)' : '(已使用)');
                });
              }
            }
          }
        });
      }
    } catch (e) {
      console.error(`${MODULE_ID} | 手动添加按钮时出错:`, e);
    }
  }, 1000); // 延迟1秒确保界面已加载
});

/**
 * 场景控制类型声明
 */
interface SceneControl {
  name: string;
  title: string;
  icon: string;
  layer: string;
  tools: SceneControlTool[];
  [key: string]: any;
}

interface SceneControlTool {
  name: string;
  title: string;
  icon: string;
  onClick?: () => void;
  button?: boolean;
  [key: string]: any;
}

// 平衡关键词管理器对话框 - 包装BalanceKeywordsManager
class BalanceKeywordsManagerDialog extends FormApplication {
  static get defaultOptions() {
    // @ts-ignore - 全局访问 foundry
    const foundry = (window as any).foundry;
    return foundry?.utils?.mergeObject ? foundry.utils.mergeObject(super.defaultOptions, {
      id: "ai-pf2e-balance-keywords-manager-dialog",
      classes: ["ai-pf2e-assistant"],
      dragDrop: [],
      tabs: [],
      filters: [],
      scrollY: []
    }) : {
      ...super.defaultOptions,
      id: "ai-pf2e-balance-keywords-manager-dialog",
      classes: ["ai-pf2e-assistant"],
      dragDrop: [],
      tabs: [],
      filters: [],
      scrollY: []
    };
  }

  render(force?: boolean, options?: any): any {
    // 直接打开balanceKeywordsManager而不是自身
    return (balanceKeywordsManager as any).render(force, options);
  }
} 