import { ThemeMapping, getCurrentTheme, getThemeById, AVAILABLE_THEMES } from '../../config/theme-mappings.js';

/**
 * 主题管理服务
 * 处理主题切换和文本映射
 */
export class ThemeService {
  private static instance: ThemeService;
  private currentTheme: ThemeMapping;
  
  constructor() {
    this.currentTheme = getCurrentTheme();
  }
  
  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }
  
  /**
   * 获取当前主题
   */
  getCurrentTheme(): ThemeMapping {
    return this.currentTheme;
  }
  
  /**
   * 设置当前主题
   */
  setTheme(themeId: string): void {
    this.currentTheme = getThemeById(themeId);
    // 不再保存到配置，直接使用神龛主题
  }
  
  /**
   * 获取所有可用主题
   */
  getAvailableThemes(): ThemeMapping[] {
    return AVAILABLE_THEMES;
  }
  
  /**
   * 获取主题化的文本
   */
  getText(path: string): string {
    const keys = path.split('.');
    let current: any = this.currentTheme;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        console.warn(`主题文本路径不存在: ${path}`);
        return path; // 返回原始路径作为后备
      }
    }
    
    return typeof current === 'string' ? current : path;
  }
  
  /**
   * 获取概念映射
   */
  getConcept(concept: keyof ThemeMapping['concepts']): string {
    return this.currentTheme.concepts[concept] || concept;
  }
  
  /**
   * 获取UI文本
   */
  getUIText(path: string): string {
    return this.getText(`ui.${path}`);
  }
  
  /**
   * 获取主题颜色
   */
  getColor(color: keyof ThemeMapping['colors']): string {
    return this.currentTheme.colors[color] || '#000000';
  }
  
  /**
   * 获取按钮文本
   */
  getButtonText(button: keyof ThemeMapping['ui']['buttons']): string {
    return this.currentTheme.ui.buttons[button];
  }
  
  /**
   * 获取消息文本
   */
  getMessage(message: keyof ThemeMapping['ui']['messages']): string {
    return this.currentTheme.ui.messages[message];
  }
  
  /**
   * 获取材料类型文本
   */
  getMaterialTypeText(type: keyof ThemeMapping['ui']['materialTypes']): string {
    return this.currentTheme.ui.materialTypes[type];
  }
  
  /**
   * 获取描述文本
   */
  getDescription(desc: keyof ThemeMapping['ui']['descriptions']): string {
    return this.currentTheme.ui.descriptions[desc];
  }
  
  /**
   * 获取AI提示词上下文
   */
  getPromptContext(context: keyof ThemeMapping['prompts']): string {
    return this.currentTheme.prompts[context];
  }
  
  /**
   * 主题化消息通知
   */
  showNotification(messageKey: keyof ThemeMapping['ui']['messages'], type: 'info' | 'warn' | 'error' = 'info'): void {
    const message = this.getMessage(messageKey);
    if (ui?.notifications) {
      ui.notifications[type](message);
    }
  }
  
  /**
   * 主题化的材料描述
   */
  getMaterialDescription(materialType: 'divinity' | 'offering' | 'fragment' | 'shrine'): string {
    const typeText = this.getMaterialTypeText(materialType);
    const theme = this.getCurrentTheme();
    
    switch (materialType) {
      case 'divinity':
        return theme.id === 'pokemon' 
          ? `强大的${typeText}，蕴含着传说级别的力量`
          : `蕴含${typeText}力量的珍贵材料`;
          
      case 'offering': 
        return theme.id === 'pokemon'
          ? `记录着爱达梦${theme.concepts.offering}的${typeText}`
          : `向神明献上的${typeText}`;
          
      case 'fragment':
        return theme.id === 'pokemon'
          ? `用于捕获爱达梦的${typeText}`
          : `蕴含神秘力量的${typeText}`;
          
      case 'shrine':
        return theme.id === 'pokemon'
          ? `进行爱达梦学习的${typeText}`
          : `进行神圣合成的${typeText}`;
          
      default:
        return typeText;
    }
  }
  
  /**
   * 主题化的专长/特性名称
   */
  getFeatTypeName(): string {
    return this.getConcept('feat');
  }
  
  /**
   * 主题化的合成/融合名称
   */
  getSynthesisTypeName(): string {
    return this.getConcept('synthesis');
  }
}
