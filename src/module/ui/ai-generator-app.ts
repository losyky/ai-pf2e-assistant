import { MODULE_ID, MODULE_NAME } from '../constants';
import { ui } from '../../foundry-imports';

// 直接从window获取Application类型 - Foundry VTT v12+ 版本路径
// @ts-ignore - 全局访问Foundry的类
const FoundryApplication = (window as any).foundry?.applications?.Application || (window as any).Application;
// @ts-ignore - 全局访问Foundry的对话框类
const FoundryDialog = (window as any).foundry?.applications?.Dialog || (window as any).Dialog;

// 定义jQuery和相关接口
interface JQueryStatic {
  (selector: string | any): JQuery;
  (html: string): JQuery;
}

interface JQuery {
  find(selector: string): JQuery;
  on(event: string, handler: (event: any) => void): JQuery;
  off(event: string, handler?: (event: any) => void): JQuery;
  text(): string;
  text(text: string): JQuery;
  val(): any;
  val(value: any): JQuery;
  prop(name: string, value: any): JQuery;
  append(content: string | JQuery): JQuery;
  prepend(content: string | JQuery): JQuery;
  empty(): JQuery;
  css(properties: Record<string, string | number>): JQuery;
  closest(selector: string): JQuery;
  remove(): JQuery;
  position(): { top: number, left: number };
  hide(): JQuery;
  show(): JQuery;
  draggable: (options: any) => JQuery;
  resizable: (options: any) => JQuery;
}

// 辅助函数：安全获取game对象
function getGame(): any {
  // @ts-ignore - 全局访问
  return window.game || null;
}

// 辅助函数：安全获取jQuery
function getJQuery(): JQueryStatic | null {
  // @ts-ignore - 全局访问
  return window.$ || null;
}

// 导入新的生成器
import { ItemGeneratorApp } from './item-generator-app';

// 内容生成类型
enum ContentType {
  Monster = 'monster',
  Item = 'item',
  Spell = 'spell',
  NPC = 'npc',
  Encounter = 'encounter'
}

/**
 * 简单的应用程序实现(当无法找到Foundry Application时使用)
 * 模拟Foundry VTT v12的Application类基本功能
 */
class SimpleApplication {
  element: HTMLElement | null = null;
  html: JQuery | null = null;
  options: any;
  title: string;
  isDragging: boolean = false;
  dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  position: { left: number; top: number; width: number; height: number; scale: number };
  _minimized: boolean = false;
  protected _state: number = 0; // 模拟 Application.RENDER_STATES
  
  // 回调函数
  protected _activateListeners?: (html: JQuery | HTMLElement) => void;
  protected _getData?: (options?: any) => any;
  protected _template?: string;

  constructor(options: any = {}) {
    this.options = options;
    this.title = options.title || 'AI PF2e 助手';
    this._activateListeners = options.activateListeners;
    this._getData = options.getData;
    this._template = options.template;
    
    // 初始化位置
    this.position = {
      left: options.left || 100,
      top: options.top || 100,
      width: options.width || 600,
      height: options.height || 500,
      scale: 1
    };
  }

  // 模拟Foundry VTT Application.RENDER_STATES
  static get RENDER_STATES() {
    return {
      NONE: 0,
      RENDERING: 1,
      RENDERED: 2,
      CLOSING: 3,
      CLOSED: 4
    };
  }

  // 添加activateListeners方法到基类
  activateListeners(html: JQuery | HTMLElement): void {
    if (this._activateListeners) {
      this._activateListeners(html);
    }
  }

  // 获取渲染数据
  getData(options?: any): any {
    if (this._getData) {
      // 确保正确传递参数
      try {
        return this._getData(options);
      } catch (e) {
        // 如果带参数调用失败，尝试不带参数调用
        return this._getData();
      }
    }
    return {};
  }

  // 渲染模板
  async _renderTemplate(template: string, data: any): Promise<string> {
    // 如果是hbs模板，尝试使用Foundry的模板引擎
    if (template && template.endsWith('.hbs')) {
      // @ts-ignore - 全局访问
      if (window.Handlebars) {
        try {
          // 首先尝试获取缓存的模板
          // @ts-ignore - 全局访问
          const cached = window._templateCache?.[template];
          if (cached) {
            // @ts-ignore - 全局访问
            return window.Handlebars.compile(cached)(data);
          }
          
          // 如果没有缓存，尝试加载模板
          const response = await fetch(template);
          if (response.ok) {
            const templateText = await response.text();
            // @ts-ignore - 全局访问
            return window.Handlebars.compile(templateText)(data);
          }
        } catch (e) {
          console.error(`${MODULE_ID} | 渲染模板失败:`, e);
        }
      }
    }
    
    // 回退到内联模板
    return this._renderInlineTemplate(data);
  }

  // 渲染内联模板（当无法加载外部模板时）
  _renderInlineTemplate(data: any): string {
    // 基于getData的内容，生成一个基本的HTML表单
    const contentTypes = data.contentTypes || [];
    const hasDocument = data.hasDocument || false;
    const documentName = data.documentName || '';
    const documentType = data.documentType || '';
    
    // 文档信息部分
    const documentInfoHtml = hasDocument 
      ? `<div class="current-document-info">
          <h3><i class="fas fa-file-alt"></i> 当前文档</h3>
          <div class="document-details">
            <p><strong>名称：</strong>${documentName}</p>
            <p><strong>类型：</strong>${documentType}</p>
          </div>
        </div>`
      : `<div class="no-document-warning">
          <i class="fas fa-exclamation-triangle"></i>
          <p>未选择文档。请从角色卡或物品表单的标题栏按钮打开AI助手。</p>
        </div>`;
    
    return `
    <div class="ai-pf2e-assistant-container">
      ${documentInfoHtml}

      <div class="form-group">
        <label for="user-request">创作需求</label>
        <p class="hint">请描述您想要AI如何修改当前文档</p>
        <textarea name="user-request" id="user-request" rows="5" 
          placeholder="例如：'增加武器的伤害，添加火焰特性，提高等级到5级。'或'帮我编写一段背景故事，重点突出角色的战士身份和北方出身。'" 
          ${hasDocument ? '' : 'disabled'}></textarea>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" name="use-mechanics-knowledge" id="use-mechanics-knowledge" checked ${hasDocument ? '' : 'disabled'}>
          <span class="checkbox-text">使用 PF2e 规则知识库</span>
          <i class="fas fa-question-circle knowledge-help-icon" title="启用后，AI将参考完整的PF2e规则机制知识，生成更符合游戏平衡的修改建议"></i>
        </label>
        <p class="hint knowledge-hint">💡 推荐开启：AI将了解动作系统、修正值类型、伤害平衡等核心规则</p>
      </div>

      <div class="form-group">
        <button class="generate" type="button" ${hasDocument ? '' : 'disabled'}>生成修改</button>
        ${hasDocument ? '' : '<p class="hint error-hint">请先从文档表单打开AI助手</p>'}
      </div>

      <div class="form-group">
        <label for="result">修改建议</label>
        <div id="modification-preview" class="modification-preview">
          <p>待生成修改内容...</p>
        </div>
      </div>

      <div class="form-group buttons">
        <button class="apply-changes" type="button" disabled>应用修改</button>
        <button class="copy-result" type="button" disabled>复制结果</button>
      </div>
    </div>`;
  }

  // 添加最小化/最大化功能
  minimize(): Promise<void> {
    if (this._minimized) return Promise.resolve();
    
    const $ = getJQuery();
    if ($ && this.element) {
      const content = $(this.element).find('.ai-pf2e-content');
      content.hide();
      this._minimized = true;
    }
    
    return Promise.resolve();
  }
  
  maximize(): Promise<void> {
    if (!this._minimized) return Promise.resolve();
    
    const $ = getJQuery();
    if ($ && this.element) {
      const content = $(this.element).find('.ai-pf2e-content');
      content.show();
      this._minimized = false;
    }
    
    return Promise.resolve();
  }

  // 主渲染方法，模拟Foundry VTT v12 Application.render
  render(_force = false, options: any = {}): Promise<this> {
    // 更新渲染状态
    const states = (this.constructor as typeof SimpleApplication).RENDER_STATES;
    this._state = states.RENDERING;
    
    return new Promise<this>(async (resolve) => {
      // 检查是否已存在实例并移除
      const $ = getJQuery();
      if ($) {
        $('.ai-pf2e-simple-application').remove();
      }

      // 注入CSS样式
      this._injectStyles();

      // 创建主容器
      this.element = document.createElement('div');
      this.element.className = 'ai-pf2e-simple-application';
      
      // 应用基本样式
      this.element.style.position = 'fixed';
      this.element.style.top = `${this.position.top}px`;
      this.element.style.left = `${this.position.left}px`;
      this.element.style.backgroundColor = '#f0f0f0';
      this.element.style.border = '1px solid #999';
      this.element.style.borderRadius = '5px';
      this.element.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
      this.element.style.zIndex = '100';
      this.element.style.minWidth = `${this.position.width}px`;
      this.element.style.maxWidth = `${this.position.width * 1.5}px`;
      this.element.style.minHeight = this._minimized ? 'auto' : `${this.position.height}px`;
      this.element.style.display = 'flex';
      this.element.style.flexDirection = 'column';
      this.element.style.overflow = 'hidden';

      // 创建标题栏
      const titleBar = document.createElement('div');
      titleBar.className = 'ai-pf2e-title-bar';
      titleBar.style.padding = '8px 12px';
      titleBar.style.backgroundColor = '#4b4a44';
      titleBar.style.color = '#f0f0f0';
      titleBar.style.fontWeight = 'bold';
      titleBar.style.display = 'flex';
      titleBar.style.justifyContent = 'space-between';
      titleBar.style.alignItems = 'center';
      titleBar.style.cursor = 'move';
      titleBar.style.borderTopLeftRadius = '5px';
      titleBar.style.borderTopRightRadius = '5px';
      
      // 标题栏左侧：标题文本
      const titleText = document.createElement('div');
      titleText.textContent = this.title;
      titleBar.appendChild(titleText);
      
      // 标题栏右侧：控制按钮
      const controls = document.createElement('div');
      controls.className = 'window-controls';
      controls.style.display = 'flex';
      controls.style.gap = '5px';
      
      // 最小化/最大化按钮
      const minMaxButton = document.createElement('button');
      minMaxButton.innerHTML = this._minimized ? '□' : '_';
      minMaxButton.style.background = 'none';
      minMaxButton.style.border = 'none';
      minMaxButton.style.color = '#f0f0f0';
      minMaxButton.style.fontSize = '16px';
      minMaxButton.style.cursor = 'pointer';
      minMaxButton.style.padding = '0 5px';
      minMaxButton.title = this._minimized ? '最大化' : '最小化';
      
      // 关闭按钮
      const closeButton = document.createElement('button');
      closeButton.innerHTML = '×';
      closeButton.style.background = 'none';
      closeButton.style.border = 'none';
      closeButton.style.color = '#f0f0f0';
      closeButton.style.fontSize = '20px';
      closeButton.style.cursor = 'pointer';
      closeButton.style.padding = '0 5px';
      closeButton.title = '关闭';
      
      controls.appendChild(minMaxButton);
      controls.appendChild(closeButton);
      titleBar.appendChild(controls);
      
      // 内容容器
      const contentContainer = document.createElement('div');
      contentContainer.className = 'ai-pf2e-content';
      contentContainer.style.padding = '10px';
      contentContainer.style.overflow = 'auto';
      contentContainer.style.flexGrow = '1';
      
      // 如果是最小化状态，隐藏内容
      if (this._minimized) {
        contentContainer.style.display = 'none';
      }

      // 获取渲染数据
      const data = this.getData(options);

      // 尝试渲染模板
      let content = '';
      if (this._template) {
        try {
          content = await this._renderTemplate(this._template, data);
        } catch (e) {
          console.error(`${MODULE_ID} | 渲染模板失败，使用备用内联模板:`, e);
          content = this._renderInlineTemplate(data);
        }
      } else {
        content = this._renderInlineTemplate(data);
      }

      // 设置内容
      contentContainer.innerHTML = content;
      
      // 将标题栏和内容容器添加到主容器
      this.element.appendChild(titleBar);
      this.element.appendChild(contentContainer);
      
      // 添加到文档
      document.body.appendChild(this.element);
      
      // 包装为jQuery对象
      if ($) {
        this.html = $(this.element);
        
        // 实现拖拽功能
        const $titleBar = $(titleBar);
        const $dialog = $(this.element);
        
        $titleBar.on('mousedown', (event) => {
          this.isDragging = true;
          const position = $dialog.position();
          this.dragOffset = {
            x: event.clientX - position.left,
            y: event.clientY - position.top
          };
          
          event.preventDefault();
        });
        
        $(document).on('mousemove.ai-pf2e-drag', (event) => {
          if (this.isDragging) {
            const left = event.clientX - this.dragOffset.x;
            const top = event.clientY - this.dragOffset.y;
            
            $dialog.css({
              left: left,
              top: top
            });
            
            // 更新位置
            this.position.left = left;
            this.position.top = top;
          }
        });
        
        $(document).on('mouseup.ai-pf2e-drag', () => {
          this.isDragging = false;
        });
        
        // 最小化/最大化按钮事件
        $(minMaxButton).on('click', () => {
          if (this._minimized) {
            this.maximize();
            minMaxButton.innerHTML = '_';
            minMaxButton.title = '最小化';
          } else {
            this.minimize();
            minMaxButton.innerHTML = '□';
            minMaxButton.title = '最大化';
          }
        });
        
        // 关闭按钮事件
        $(closeButton).on('click', () => {
          this.close();
        });
      }
      
      // 调用构造函数中传入的activateListeners
      if (typeof this._activateListeners === 'function') {
        if (this.html) {
          this._activateListeners(this.html);
        } else if (this.element) {
          // 如果没有jQuery，就使用原生元素
          const contentEl = this.element.querySelector('.ai-pf2e-content') as HTMLElement;
          if (contentEl) {
            this._activateListeners(contentEl);
          }
        }
      }
      
      // 更新渲染状态
      this._state = states.RENDERED;
      
      console.log(`${MODULE_ID} | 简单应用已渲染`);
      resolve(this);
    });
  }

  // 注入模块CSS样式到页面
  private _injectStyles() {
    const styleId = 'ai-pf2e-assistant-styles';
    
    // 检查是否已经注入过样式
    if (document.getElementById(styleId)) return;
    
    // 创建样式元素
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .ai-pf2e-assistant-container {
        padding: 1rem;
      }
      
      .ai-pf2e-assistant-container .form-group {
        margin-bottom: 1rem;
      }
      
      .ai-pf2e-assistant-container label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: bold;
      }
      
      .ai-pf2e-assistant-container .hint {
        font-size: 0.85em;
        color: #666;
        margin: 0 0 0.5rem 0;
      }
      
      .ai-pf2e-assistant-container select {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        background-color: #fff;
      }
      
      .ai-pf2e-assistant-container textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        min-height: 60px;
        font-family: monospace;
        resize: vertical;
      }
      
      .ai-pf2e-assistant-container textarea[name="result"] {
        min-height: 150px;
        background-color: #f9f9f9;
      }
      
      .ai-pf2e-assistant-container button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      }
      
      .ai-pf2e-assistant-container button.generate {
        background-color: #4a7c59;
        color: white;
      }
      
      .ai-pf2e-assistant-container button.generate:hover {
        background-color: #3a6349;
      }
      
      .ai-pf2e-assistant-container button.copy-result,
      .ai-pf2e-assistant-container button.apply-changes {
        background-color: #5c80bc;
        color: white;
        margin-right: 0.5rem;
      }
      
      .ai-pf2e-assistant-container button.copy-result:hover,
      .ai-pf2e-assistant-container button.apply-changes:hover {
        background-color: #4c70ac;
      }
      
      .ai-pf2e-assistant-container button.apply-changes {
        background-color: #4a7c59;
      }
      
      .ai-pf2e-assistant-container button.apply-changes:hover {
        background-color: #3a6349;
      }
      
      .ai-pf2e-assistant-container button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
      }
      
      .ai-pf2e-assistant-container .buttons {
        display: flex;
        justify-content: flex-start;
      }
    `;
    
    // 添加到文档头部
    document.head.appendChild(style);
  }

  close(): Promise<void> {
    // 更新渲染状态
    const states = (this.constructor as typeof SimpleApplication).RENDER_STATES;
    this._state = states.CLOSING;
    
    return new Promise((resolve) => {
      const $ = getJQuery();
      if ($ && this.html) {
        // 移除事件监听器
        $(document).off('mousemove.ai-pf2e-drag');
        $(document).off('mouseup.ai-pf2e-drag');
        // 移除元素
        this.html.remove();
      } else if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      
      this.html = null;
      this.element = null;
      
      // 更新渲染状态
      this._state = states.CLOSED;
      
      console.log(`${MODULE_ID} | 简单应用已关闭`);
      resolve();
    });
  }
  
  // Foundry VTT Application 常用方法
  setPosition(options: any = {}): this {
    // 更新位置信息
    if (options.left !== undefined) this.position.left = options.left;
    if (options.top !== undefined) this.position.top = options.top;
    if (options.width !== undefined) this.position.width = options.width;
    if (options.height !== undefined) this.position.height = options.height;
    if (options.scale !== undefined) this.position.scale = options.scale;
    
    // 应用到元素
    if (this.element) {
      this.element.style.left = `${this.position.left}px`;
      this.element.style.top = `${this.position.top}px`;
      this.element.style.minWidth = `${this.position.width}px`;
      this.element.style.minHeight = this._minimized ? 'auto' : `${this.position.height}px`;
      this.element.style.transform = `scale(${this.position.scale})`;
    }
    
    return this;
  }
  
  bringToTop(): this {
    // 确保当前窗口在最上层
    if (this.element) {
      this.element.style.zIndex = '100';
    }
    return this;
  }
}

/**
 * AI 生成器应用
 * 在类内部尝试直接使用全局Application类或回退到SimpleApplication
 */
export class AIGeneratorApp {
  element!: JQuery;
  private _appInstance: any;
  private currentModification: any;
  private document: any; // 保存文档引用，避免依赖全局状态
  private documentType: string = ''; // 保存文档类型（用于显示）
  private documentName: string = ''; // 保存文档名称（用于显示）

  constructor(document?: any) {
    this.document = document;
    
    // 从文档中提取信息用于显示
    if (document) {
      this.documentName = document.name || (game as any).i18n.localize('ai-pf2e-assistant.aiGenerator.unnamed');
      
      // 确定文档类型的友好名称
      const g = (game as any).i18n;
      if (document.documentName === 'Actor') {
        if (document.type === 'character') {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.character');
        } else if (document.type === 'npc') {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.npc');
        } else {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.creature');
        }
      } else if (document.documentName === 'Item') {
        if (document.type === 'spell') {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.spell');
        } else if (document.type === 'weapon') {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.weapon');
        } else if (document.type === 'armor') {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.armor');
        } else if (document.type === 'equipment') {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.equipment');
        } else {
          this.documentType = g.localize('ai-pf2e-assistant.aiGenerator.item');
        }
      } else {
        this.documentType = document.documentName || g.localize('ai-pf2e-assistant.aiGenerator.unknown');
      }
    }
    
    try {
      // 在构造函数中尝试创建应用实例
      this._createApp();
    } catch (e) {
      console.error(`${MODULE_ID} | 创建应用失败:`, e);
    }
  }

  /**
   * 创建应用实例
   */
  private _createApp() {
    // 尝试使用全局Application类
    // @ts-ignore - 访问全局类
    if (typeof Application !== 'undefined') {
      // 使用Foundry VTT的原生Application类
      this._createNativeApp();
    } else {
      // 使用简单实现
      this._createSimpleApp();
    }
  }

  /**
   * 创建原生应用实例
   */
  private _createNativeApp() {
    try {
      // 获取当前实例的引用
      const self = this;
      
      // @ts-ignore - 使用全局Application类
      class NativeApp extends Application {
        constructor() {
          super({
            id: 'ai-pf2e-assistant',
            title: MODULE_NAME,
            template: `modules/${MODULE_ID}/templates/ai-generator-app.hbs`,
            width: 600,
            height: 700,
            resizable: true,
            classes: ['ai-pf2e-assistant']
          });
        }

        static get defaultOptions() {
          // @ts-ignore - 使用全局Application类
          const options = super.defaultOptions;
          return {
            ...options,
            id: 'ai-pf2e-assistant',
            title: MODULE_NAME,
            template: `modules/${MODULE_ID}/templates/ai-generator-app.hbs`,
            width: 600,
            height: 700,
            resizable: true,
            classes: ['ai-pf2e-assistant']
          };
        }

        getData() {
          // 转换枚举为选择列表
          const contentTypes = Object.entries(ContentType).map(([key, value]) => ({
            id: value,
            name: key
          }));

          const g = (game as any).i18n;
          return { 
            contentTypes,
            hasDocument: !!self.document,
            documentName: self.documentName,
            documentType: self.documentType,
            i18n: {
              currentDocument: g.localize('ai-pf2e-assistant.aiGenerator.currentDocument'),
              name: g.localize('ai-pf2e-assistant.aiGenerator.name'),
              type: g.localize('ai-pf2e-assistant.aiGenerator.type'),
              noDocument: g.localize('ai-pf2e-assistant.aiGenerator.noDocument'),
              userRequest: g.localize('ai-pf2e-assistant.aiGenerator.userRequest'),
              userRequestHint: g.localize('ai-pf2e-assistant.aiGenerator.userRequestHint'),
              userRequestPlaceholder: g.localize('ai-pf2e-assistant.aiGenerator.userRequestPlaceholder'),
              useMechanicsKnowledge: g.localize('ai-pf2e-assistant.aiGenerator.useMechanicsKnowledge'),
              mechanicsKnowledgeTooltip: g.localize('ai-pf2e-assistant.aiGenerator.mechanicsKnowledgeTooltip'),
              mechanicsKnowledgeHint: g.localize('ai-pf2e-assistant.aiGenerator.mechanicsKnowledgeHint'),
              generate: g.localize('ai-pf2e-assistant.aiGenerator.generate'),
              pleaseOpenFromDocument: g.localize('ai-pf2e-assistant.aiGenerator.pleaseOpenFromDocument'),
              modificationSuggestion: g.localize('ai-pf2e-assistant.aiGenerator.modificationSuggestion'),
              waitingForGeneration: g.localize('ai-pf2e-assistant.aiGenerator.waitingForGeneration'),
              applyChanges: g.localize('ai-pf2e-assistant.aiGenerator.applyChanges'),
              copyResult: g.localize('ai-pf2e-assistant.aiGenerator.copyResult')
            }
          };
        }

        activateListeners(html: JQuery) {
          // @ts-ignore - 使用全局Application类
          super.activateListeners(html);
          
          // 保存元素引用
          self.element = html;
          
          // 注册事件处理器
          html.find('button.generate').on('click', (event) => self.onGenerateContent(event));
          html.find('button.copy-result').on('click', (event) => self.onCopyResult(event));
          html.find('button.apply-changes').on('click', (event) => self.onApplyChanges(event));
        }
      }
      
      this._appInstance = new NativeApp();
      console.log(`${MODULE_ID} | 成功创建原生应用实例`);
    } catch (e) {
      console.error(`${MODULE_ID} | 创建原生应用失败，回退到简单实现:`, e);
      this._createSimpleApp();
    }
  }

  /**
   * 创建简单应用实例（当无法使用Foundry VTT的Application类时）
   */
  private _createSimpleApp() {
    console.log(`${MODULE_ID} | 创建简单应用实例`);
    
    this._appInstance = new SimpleApplication({
      id: 'ai-pf2e-assistant',
      title: MODULE_NAME,
      template: `modules/${MODULE_ID}/templates/ai-generator-app.hbs`,
      getData: () => {
        return {
          contentTypes: Object.entries(ContentType).map(([key, value]) => ({
            id: value,
            name: key
          })),
          hasDocument: !!this.document,
          documentName: this.documentName,
          documentType: this.documentType
        };
      },
      activateListeners: (html: JQuery | HTMLElement) => {
        // 保存元素引用
        this.element = html as JQuery;
        
        // 注册事件处理器
        (html as JQuery).find('button.generate').on('click', (event: any) => this.onGenerateContent(event));
        (html as JQuery).find('button.copy-result').on('click', (event: any) => this.onCopyResult(event));
        (html as JQuery).find('button.apply-changes').on('click', (event: any) => this.onApplyChanges(event));
      }
    });
  }

  /**
   * 渲染应用
   */
  render(force?: boolean): any {
    // 如果有实例，使用实例的render方法
    if (this._appInstance && typeof this._appInstance.render === 'function') {
      try {
        console.log(`${MODULE_ID} | 尝试渲染应用实例`);
        return this._appInstance.render(force);
      } catch (e) {
        console.error(`${MODULE_ID} | 渲染应用失败:`, e);
      }
    } else {
      console.error(`${MODULE_ID} | 没有可用的应用实例或render方法`);
    }
    
    // 如果没有实例或渲染失败，尝试使用Dialog作为后备
    try {
      // 使用预定义的Dialog类
      if (FoundryDialog) {
        console.log(`${MODULE_ID} | 使用Dialog作为后备`);
        return new FoundryDialog({
          title: MODULE_NAME,
          content: `<p>无法加载AI生成器应用界面。请检查控制台错误信息。</p>`,
          buttons: {
            close: {
              label: "关闭"
            }
          }
        }).render(true);
      }
    } catch (dialogError) {
      console.error(`${MODULE_ID} | 创建对话框失败:`, dialogError);
      alert(`${MODULE_NAME} 无法加载。请检查控制台错误信息。`);
    }
    
    return null;
  }

  /**
   * 处理生成内容按钮点击
   * @param event 点击事件
   */
  onGenerateContent(event: any): Promise<void> {
    event.preventDefault();
    
    // 获取jQuery
    const $ = getJQuery();
    if (!$ || !this.element) {
      console.error(`${MODULE_ID} | 缺少必要的DOM操作函数`);
      return Promise.resolve();
    }
    
    // 显示加载中状态
    const button = $(event.currentTarget);
    const originalText = button.text();
    button.text('生成中...').prop('disabled', true);
    
    return new Promise<void>(async (resolve) => {
      try {
        // 从文档自动推断类型
        let type = 'item'; // 默认类型
        if (this.document) {
          if (this.document.documentName === 'Actor') {
            if (this.document.type === 'character' || this.document.type === 'npc') {
              type = 'npc';
            } else {
              type = 'monster';
            }
          } else if (this.document.documentName === 'Item') {
            if (this.document.type === 'spell') {
              type = 'spell';
            } else {
              type = 'item';
            }
          }
        }
        
        // 获取用户需求
        const userRequest = this.element.find('textarea[name="user-request"]').val() as string;
        
        // 获取是否使用规则知识库
        const useMechanicsKnowledge = this.element.find('input[name="use-mechanics-knowledge"]').prop('checked') as boolean;
        console.log(`${MODULE_ID} | 用户选择${useMechanicsKnowledge ? '启用' : '不启用'}规则知识库`);
        
        // 验证用户需求不为空
        if (!userRequest.trim()) {
          throw new Error("请输入您的创作需求");
        }
        
        // 获取 AI 助手实例
        const game = getGame();
        if (!game || !game.modules) {
          throw new Error("游戏系统未完全加载");
        }
        
        const moduleApi = game.modules.get(MODULE_ID)?.api;
        if (!moduleApi) {
          throw new Error("AI助手模块未正确加载");
        }
        
        // 使用实例的文档引用而不是全局状态
        if (!this.document) {
          throw new Error("没有可用的文档数据。请从角色卡或物品表单的标题栏按钮打开AI助手。");
        }
        
        // 获取文档数据
        const cleanData = moduleApi.extractCleanData(this.document);
        
        // 调用文档修改功能，传递是否使用规则知识库的选项
        const result = await moduleApi.generateDocumentModification(type, cleanData, userRequest, useMechanicsKnowledge);
        
        // 存储当前修改结果
        this.currentModification = result;
        
        // 显示修改预览
        this.renderModificationPreview(result);
        
        // 启用应用修改按钮
        this.element.find('button.apply-changes').prop('disabled', false);
        this.element.find('button.copy-result').prop('disabled', false);
        
        // 显示成功消息
        if (ui && ui.notifications) {
          ui.notifications.info(`成功生成修改建议`);
        }
      } catch (error: any) {
        // 显示错误消息
        console.error(error);
        if (ui && ui.notifications) {
          ui.notifications.error(`生成修改建议失败：${error.message || '未知错误'}`);
        }
      } finally {
        // 恢复按钮状态
        button.text(originalText).prop('disabled', false);
        resolve();
      }
    });
  }
  
  /**
   * 渲染修改预览
   * @param modification 修改数据
   */
  renderModificationPreview(modification: any): void {
    if (!this.element) return;
    
    const $ = getJQuery();
    if (!$) return;
    
    const previewContainer = this.element.find('#modification-preview');
    previewContainer.empty();
    
    // 添加修改原因说明
    if (modification.reason) {
      previewContainer.append(`<div class="modification-reason"><h3>修改原因</h3><p>${modification.reason}</p></div>`);
    }
    
    // 添加变更列表
    if (modification.changes && modification.changes.length > 0) {
      const changesHtml = $('<div class="modification-changes"><h3>变更列表</h3><ul></ul></div>');
      const changesList = changesHtml.find('ul');
      
      modification.changes.forEach((change: any) => {
        let valueDisplay = '';
        
        // 根据值类型格式化显示
        if (typeof change.value === 'object') {
          if (Array.isArray(change.value)) {
            valueDisplay = JSON.stringify(change.value);
          } else {
            valueDisplay = JSON.stringify(change.value);
          }
        } else {
          valueDisplay = String(change.value);
        }
        
        // 根据操作类型添加不同样式
        let operationText = '设置';
        let operationClass = 'operation-set';
        
        if (change.operation === 'add') {
          operationText = '添加';
          operationClass = 'operation-add';
        } else if (change.operation === 'remove') {
          operationText = '移除';
          operationClass = 'operation-remove';
        }
        
        changesList.append(`
          <li class="change-item ${operationClass}">
            <div class="change-operation">${operationText}</div>
            <div class="change-path">${change.path}</div>
            <div class="change-value">${valueDisplay}</div>
          </li>
        `);
      });
      
      previewContainer.append(changesHtml);
    } else {
      previewContainer.append('<p>没有变更需要应用</p>');
    }
  }
  
  /**
   * 处理应用修改按钮点击
   * @param event 点击事件
   */
  onApplyChanges(event: any): Promise<void> {
    event.preventDefault();
    
    // 获取jQuery
    const $ = getJQuery();
    if (!$ || !this.element) {
      console.error(`${MODULE_ID} | 缺少必要的DOM操作函数`);
      return Promise.resolve();
    }
    
    // 显示加载中状态
    const button = $(event.currentTarget);
    const originalText = button.text();
    button.text('应用中...').prop('disabled', true);
    
    return new Promise<void>(async (resolve) => {
      try {
        // 确保有修改数据
        if (!this.currentModification || !this.currentModification.changes) {
          throw new Error("没有修改数据可应用");
        }
        
        // 获取 AI 助手实例
        const game = getGame();
        if (!game || !game.modules) {
          throw new Error("游戏系统未完全加载");
        }
        
        const moduleApi = game.modules.get(MODULE_ID)?.api;
        if (!moduleApi) {
          throw new Error("AI助手模块未正确加载");
        }
        
        // 使用实例的文档引用
        if (!this.document) {
          throw new Error("没有可用的文档");
        }
        
        // 应用修改
        const success = await moduleApi.applyChangesToDocument(
          this.document, 
          this.currentModification.changes
        );
        
        if (success) {
          // 显示成功消息
          if (ui && ui.notifications) {
            ui.notifications.info(`成功应用修改`);
          }
          
          // 禁用应用按钮
          this.element.find('button.apply-changes').prop('disabled', true);
          
          // 添加应用成功标记
          this.element.find('#modification-preview').prepend(
            '<div class="changes-applied-marker">✓ 已应用变更</div>'
          );
        } else {
          throw new Error("应用修改失败");
        }
      } catch (error: any) {
        // 显示错误消息
        console.error(error);
        if (ui && ui.notifications) {
          ui.notifications.error(`应用修改失败：${error.message || '未知错误'}`);
        }
      } finally {
        // 恢复按钮状态
        button.text(originalText).prop('disabled', false);
        resolve();
      }
    });
  }

  /**
   * 处理复制结果按钮点击
   * @param event 点击事件
   */
  onCopyResult(event: any): void {
    event.preventDefault();
    
    if (!this.element || !this.currentModification) return;
    
    // 转换修改内容为文本
    const resultText = JSON.stringify(this.currentModification, null, 2);
    
    // 复制到剪贴板
    const textArea = document.createElement('textarea');
    textArea.value = resultText;
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      if (ui && ui.notifications) {
        ui.notifications.info(`已复制结果到剪贴板`);
      }
    } catch (err) {
      console.error('复制失败:', err);
      if (ui && ui.notifications) {
        ui.notifications.warn(`复制失败，请手动选择并复制内容`);
      }
    }
    
    document.body.removeChild(textArea);
  }
} 