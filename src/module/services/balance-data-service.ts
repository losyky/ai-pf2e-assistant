/**
 * PF2e平衡关键词服务
 * 管理用户自定义的数值平衡关键词配置
 */
export interface BalanceKeyword {
  level: number;
  category: string; // 'feat', 'feature', 'general'
  keywords: string[]; // 平衡关键词列表
}

export class BalanceDataService {
  private static readonly STORAGE_KEY = 'ai-pf2e-assistant.balanceKeywords';
  private balanceKeywords: BalanceKeyword[] = [];
  
  constructor() {
    this.loadBalanceKeywords();
  }

  /**
   * 加载平衡关键词配置
   */
  private loadBalanceKeywords(): void {
    try {
      // 尝试从Foundry设置中加载
      if (typeof game !== 'undefined' && game?.settings) {
        const saved = game.settings.get('ai-pf2e-assistant', 'balanceKeywords') as string;
        if (saved) {
          this.balanceKeywords = JSON.parse(saved);
          console.log('加载了平衡关键词配置:', this.balanceKeywords.length, '条');
          return;
        }
      }
    } catch (error) {
      console.warn('加载平衡关键词配置失败:', error);
    }
    
    // 加载默认配置
    this.loadDefaultKeywords();
  }

  /**
   * 加载默认的平衡关键词
   */
  private loadDefaultKeywords(): void {
    this.balanceKeywords = [
      // 1级专长
      {
        level: 1,
        category: 'feat',
        keywords: [
          '基础加值+1到+2',
          '简单的条件触发',
          '每日1次的小型能力',
          '情境性优势',
          '技能检定小幅提升'
        ]
      },
      // 5级专长
      {
        level: 5,
        category: 'feat',
        keywords: [
          '加值+2到+3',
          '每日2-3次能力',
          '条件性伤害加成',
          '移动或动作优化',
          '战术选择扩展'
        ]
      },
      // 10级专长
      {
        level: 10,
        category: 'feat',
        keywords: [
          '加值+3到+4',
          '显著的战斗优势',
          '每轮1次的强力效果',
          '多个条件的组合触发',
          '角色定义性能力'
        ]
      },
      // 15级专长
      {
        level: 15,
        category: 'feat',
        keywords: [
          '加值+4到+5',
          '改变战斗流程',
          '强力的每日能力',
          '多目标或区域效果',
          '高级战术机制'
        ]
      },
      // 20级专长
      {
        level: 20,
        category: 'feat',
        keywords: [
          '加值+5到+6',
          '终极角色能力',
          '游戏改变性效果',
          '传奇级表现',
          '巅峰级数值'
        ]
      },
      // 1级特性
      {
        level: 1,
        category: 'feature',
        keywords: [
          '建立核心机制',
          '简单而有效',
          '成长性设计',
          '职业特色体现',
          '基础数值保守'
        ]
      },
      // 5级特性
      {
        level: 5,
        category: 'feature',
        keywords: [
          '机制深化',
          '中等复杂度',
          '明显的威力提升',
          '多种使用方式',
          '策略深度增加'
        ]
      },
      // 10级特性
      {
        level: 10,
        category: 'feature',
        keywords: [
          '机制成熟',
          '强力效果',
          '角色塑造性',
          '战术核心',
          '显著影响战斗'
        ]
      },
      // 通用平衡原则
      {
        level: 0,
        category: 'general',
        keywords: [
          '动作经济平衡',
          '资源消耗合理',
          '风险收益对等',
          '数值渐进增长',
          '避免无脑选择',
          '鼓励策略思考',
          '维持游戏节奏'
        ]
      }
    ];
    
    // 保存默认配置
    this.saveBalanceKeywords();
  }

  /**
   * 保存平衡关键词配置
   */
  async saveBalanceKeywords(): Promise<void> {
    try {
      if (typeof game !== 'undefined' && game?.settings) {
        await game.settings.set('ai-pf2e-assistant', 'balanceKeywords', JSON.stringify(this.balanceKeywords));
        console.log('平衡关键词配置已保存');
      }
    } catch (error) {
      console.error('保存平衡关键词配置失败:', error);
    }
  }

  /**
   * 获取指定等级和类别的平衡关键词
   */
  getBalanceKeywords(level: number, category: string): string[] {
    // 查找精确匹配
    let match = this.balanceKeywords.find(bk => bk.level === level && bk.category === category);
    
    // 如果没有精确匹配，查找最接近的等级
    if (!match) {
      const sameCategoryKeywords = this.balanceKeywords
        .filter(bk => bk.category === category)
        .sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level));
      
      if (sameCategoryKeywords.length > 0) {
        match = sameCategoryKeywords[0];
      }
    }
    
    // 如果还是没有，使用通用关键词
    if (!match) {
      match = this.balanceKeywords.find(bk => bk.category === 'general');
    }
    
    return match ? [...match.keywords] : [];
  }

  /**
   * 获取所有平衡关键词配置
   */
  getAllKeywords(): BalanceKeyword[] {
    return [...this.balanceKeywords];
  }

  /**
   * 添加或更新平衡关键词
   */
  setKeywords(level: number, category: string, keywords: string[]): void {
    const existingIndex = this.balanceKeywords.findIndex(bk => bk.level === level && bk.category === category);
    
    if (existingIndex >= 0) {
      this.balanceKeywords[existingIndex].keywords = [...keywords];
    } else {
      this.balanceKeywords.push({ level, category, keywords: [...keywords] });
    }
    
    // 按等级和类别排序
    this.balanceKeywords.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.level - b.level;
    });
  }

  /**
   * 删除平衡关键词配置
   */
  removeKeywords(level: number, category: string): void {
    this.balanceKeywords = this.balanceKeywords.filter(bk => !(bk.level === level && bk.category === category));
  }

  /**
   * 重置为默认配置
   */
  resetToDefaults(): void {
    this.loadDefaultKeywords();
  }

  /**
   * 导出配置为JSON
   */
  exportToJson(): string {
    return JSON.stringify(this.balanceKeywords, null, 2);
  }

  /**
   * 从JSON导入配置
   */
  importFromJson(jsonStr: string): void {
    try {
      const imported = JSON.parse(jsonStr);
      if (Array.isArray(imported)) {
        this.balanceKeywords = imported.filter(item => 
          typeof item === 'object' &&
          typeof item.level === 'number' &&
          typeof item.category === 'string' &&
          Array.isArray(item.keywords)
        );
      }
    } catch (error) {
      throw new Error('无效的JSON格式');
    }
  }

  /**
   * 生成平衡指导文本
   */
  generateBalanceGuidance(level: number, category: string): string {
    const keywords = this.getBalanceKeywords(level, category);
    const generalKeywords = this.getBalanceKeywords(0, 'general');
    
    let guidance = `${level}级${this.getCategoryDisplayName(category)}平衡指导：\n`;
    
    if (keywords.length > 0) {
      guidance += keywords.map(keyword => `• ${keyword}`).join('\n');
    }
    
    if (generalKeywords.length > 0 && category !== 'general') {
      guidance += '\n\n通用平衡原则：\n';
      guidance += generalKeywords.map(keyword => `• ${keyword}`).join('\n');
    }
    
    return guidance;
  }

  /**
   * 获取类别显示名称
   */
  private getCategoryDisplayName(category: string): string {
    const categoryMap: Record<string, string> = {
      'feat': '专长',
      'feature': '特性',
      'general': '通用'
    };
    return categoryMap[category] || category;
  }

  /**
   * 兼容旧API - 获取等级数据
   */
  getLevelData(level: number): any {
    const keywords = this.getBalanceKeywords(level, 'feat');
    return {
      level,
      keywords,
      guidance: this.generateBalanceGuidance(level, 'feat')
    };
  }

  /**
   * 兼容旧API - 获取所有数据
   */
  getAllData(): any {
    return {
      keywords: this.balanceKeywords,
      generateGuidance: (level: number, category: string) => this.generateBalanceGuidance(level, category)
    };
  }
}