/**
 * PF2e专长知识库服务（优化版）
 * 
 * 知识库结构：
 * 1. feat_json_template_guide.json - 纯粹的JSON字段填写说明
 * 2. optimized_feat_knowledge.json - 元数据，实际格式指南在 prompt-templates.ts 中
 * 3. FEAT_KNOWLEDGE_UNIFIED_GUIDE (prompt-templates.ts) - 统一的格式书写规范
 */

import { FEAT_KNOWLEDGE_UNIFIED_GUIDE } from './prompt-templates';

export interface OptimizedKnowledgeBase {
  unified_format_guide: string;  // 统一格式规范（HTML、引用、术语、写作风格）
}

export interface ClassMechanics {
  class_name: string;
  basic_info: any;
  key_mechanics: string[];
  common_traits: Array<{trait: string; count: number}>;
  action_patterns: Record<string, number>;
  rule_patterns: Array<{rule_type: string; count: number}>;
  thematic_keywords: Array<{keyword: string; count: number}>;
}

export interface ClassDesignGuides {
  [className: string]: string;  // 每个职业的AI生成设计指南
}

/**
 * 优化的专长知识库服务
 */
export class FeatKnowledgeService {
  private static instance: FeatKnowledgeService;
  
  private knowledgeBase: OptimizedKnowledgeBase | null = null;
  private templateGuide: any = null;
  private classMechanics: Record<string, ClassMechanics> | null = null;
  private classDesignGuides: ClassDesignGuides | null = null;
  
  private loaded = false;
  
  private constructor() {}
  
  /**
   * 获取服务单例
   */
  static getInstance(): FeatKnowledgeService {
    if (!FeatKnowledgeService.instance) {
      FeatKnowledgeService.instance = new FeatKnowledgeService();
    }
    return FeatKnowledgeService.instance;
  }
  
  /**
   * 加载知识库数据
   */
  async loadKnowledgeBase(): Promise<void> {
    if (this.loaded) {
      return;
    }
    
    console.log('加载PF2e专长知识库（优化版）...');
    
    try {
      const basePath = 'modules/ai-pf2e-assistant/data/feat-knowledge';
      
      // 并行加载知识库文件
      const [knowledgeBase, templateGuide, classMechanics, classDesignGuides] = await Promise.all([
        this.loadJSON<OptimizedKnowledgeBase>(`${basePath}/optimized_feat_knowledge.json`),
        this.loadJSON<any>(`${basePath}/feat_json_template_guide.json`),
        this.loadJSON<Record<string, ClassMechanics>>(`${basePath}/class_mechanics.json`),
        this.loadJSON<ClassDesignGuides>(`${basePath}/class_design_guides.json`)
      ]);
      
      this.knowledgeBase = knowledgeBase;
      this.templateGuide = templateGuide;
      this.classMechanics = classMechanics;
      this.classDesignGuides = classDesignGuides;
      
      this.loaded = true;
      console.log('✓ PF2e专长知识库加载完成');
      console.log(`  - 统一格式指南: ${knowledgeBase.unified_format_guide ? '✓' : '✗'}`);
      console.log(`  - 职业机制数据: ${Object.keys(classMechanics).length} 个职业`);
      console.log(`  - 职业设计指南: ${Object.keys(classDesignGuides).length} 个职业`);
    } catch (error) {
      console.error('加载PF2e专长知识库失败:', error);
      // 不抛出错误，允许系统在没有知识库的情况下运行
      this.loaded = false;
    }
  }
  
  /**
   * 加载JSON文件
   */
  private async loadJSON<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`加载文件失败: ${path} (${response.status})`);
    }
    return await response.json();
  }
  
  /**
   * 确保知识库已加载
   */
  private ensureLoaded(): boolean {
    if (!this.loaded || !this.knowledgeBase) {
      console.warn('知识库尚未加载或加载失败');
      return false;
    }
    return true;
  }
  
  /**
   * 获取统一的格式规范（不分等级）
   * 包含：JSON字段、HTML格式、引用语法、术语标准、写作风格
   * 现在直接使用 prompt-templates.ts 中的常量
   */
  getUnifiedFormatGuide(): string {
    return FEAT_KNOWLEDGE_UNIFIED_GUIDE;
  }
  
  /**
   * 获取指定等级的平衡性指导（已移除）
   * 现在平衡性由balance-data-service.ts中的关键词提供
   */
  getBalanceGuidance(_level: number): string {
    // 已移除等级平衡指导
    return '';
  }
  
  /**
   * 获取JSON模板指南
   * 纯粹的字段填写说明
   */
  getTemplateGuide(): any {
    if (!this.ensureLoaded()) {
      return null;
    }
    
    return this.templateGuide;
  }
  
  /**
   * 获取完整的知识库增强提示词
   * 用于集成到神龛合成提示词中
   */
  getComprehensiveGuidance(_level: number): string {
    let guidance = '\n\n【PF2e官方标准参考】\n\n';
    guidance += '以下标准基于官方专长的深度分析，请严格遵循：\n\n';
    
    // 统一格式规范（所有等级通用）- 直接使用 TypeScript 常量
    guidance += FEAT_KNOWLEDGE_UNIFIED_GUIDE;
    guidance += '\n';
    
    return guidance;
  }
  
  /**
   * 获取格式转换智能体的增强提示词
   * 用于强化JSON格式的正确性
   */
  getFormatConversionGuidance(): string {
    let guidance = '\n\n【格式规范强化】\n\n';
    guidance += '必须遵循以下JSON格式标准：\n\n';
    
    // 直接使用 TypeScript 常量中的格式规范
    guidance += FEAT_KNOWLEDGE_UNIFIED_GUIDE;
    guidance += '\n';
    
    return guidance;
  }
  
  /**
   * 获取格式转换智能体的增强提示词（旧版本保留）
   */
  getFormatConversionGuidance_Old(): string {
    if (!this.ensureLoaded()) {
      return '';
    }
    
    let guidance = '\n\n【格式规范强化】\n\n';
    guidance += '必须遵循以下JSON格式标准：\n\n';
    
    // 提取关键字段要求
    if (this.templateGuide) {
      guidance += '**frequency字段**:\n';
      guidance += '- per字段只能使用: turn, round, PT1M, PT10M, PT1H, day, P1W, P1M\n';
      guidance += '- 示例: {"max": 1, "per": "day"}\n\n';
      
      guidance += '**actionType字段**:\n';
      guidance += '- 只能是: passive, action, reaction, free\n';
      guidance += '- passive时，actions必须为null\n';
      guidance += '- action时，actions为1/2/3\n\n';
      
      guidance += '**traits字段**:\n';
      guidance += '- value数组包含特征标签\n';
      guidance += '- rarity为: common, uncommon, rare, unique\n\n';
    }
    
    guidance += '**HTML格式要求**:\n';
    guidance += '- Requirements: <p><strong>Requirements</strong> ...</p>\n';
    guidance += '- Trigger: <p><strong>Trigger</strong> ...</p>\n';
    guidance += '- 伤害引用: @Damage[2d6[fire]]\n';
    guidance += '- 检定引用: @Check[type:fortitude|dc:20]\n';
    guidance += '- 职业DC引用: @Check[type:will|dc:resolve(@actor.attributes.classDC.value)]\n';
    guidance += '- UUID引用: @UUID[Compendium.pf2e.conditionitems.Item.Name]\n\n';
    
    return guidance;
  }
  
  /**
   * 获取职业设计指南
   * @param className 职业名称（如"fighter", "wizard"）
   */
  getClassDesignGuide(className: string): string {
    if (!this.ensureLoaded() || !this.classDesignGuides) {
      return '';
    }
    
    const guide = this.classDesignGuides[className.toLowerCase()];
    return guide || '';
  }
  
  /**
   * 获取职业机制数据
   * @param className 职业名称
   */
  getClassMechanics(className: string): ClassMechanics | null {
    if (!this.ensureLoaded() || !this.classMechanics) {
      return null;
    }
    
    return this.classMechanics[className.toLowerCase()] || null;
  }
  
  /**
   * 获取所有支持的职业列表
   */
  getSupportedClasses(): string[] {
    if (!this.ensureLoaded() || !this.classDesignGuides) {
      return [];
    }
    
    return Object.keys(this.classDesignGuides);
  }
  
  /**
   * 获取职业专长的完整指导（统一格式+等级平衡+职业特定）
   * @param level 专长等级
   * @param className 职业名称（可选）
   */
  getClassFeatGuidance(level: number, className?: string): string {
    if (!this.ensureLoaded() || !this.knowledgeBase) {
      return '';
    }
    
    let guidance = '\n\n【PF2e官方标准参考】\n\n';
    guidance += '以下标准基于5408个官方专长的深度分析，请严格遵循：\n\n';
    
    // 1. 统一格式规范（所有等级通用）
    guidance += '## 一、格式与写作规范（适用于所有等级）\n\n';
    guidance += this.knowledgeBase.unified_format_guide;
    guidance += '\n\n';
    
    // 2. 等级平衡性指导（该等级特定）
    const balanceGuide = this.getBalanceGuidance(level);
    if (balanceGuide) {
      guidance += `## 二、${level}级专长平衡性标准\n\n`;
      guidance += balanceGuide;
      guidance += '\n\n';
    }
    
    // 3. 职业特定指导（如果提供了职业名）
    if (className && this.classDesignGuides) {
      const classGuide = this.getClassDesignGuide(className);
      if (classGuide) {
        guidance += `## 三、${className.toUpperCase()}职业专长设计指南\n\n`;
        guidance += classGuide;
        guidance += '\n';
      }
    }
    
    return guidance;
  }
  
  /**
   * 获取知识库统计信息
   */
  getKnowledgeBaseStats(): string {
    if (!this.ensureLoaded() || !this.knowledgeBase) {
      return '知识库未加载';
    }
    
    const formatGuideLength = this.knowledgeBase.unified_format_guide.length;
    const classCount = this.classDesignGuides ? Object.keys(this.classDesignGuides).length : 0;
    
    return `知识库状态: ✓ 已加载
- 统一格式指南: ${formatGuideLength} 字符
- 职业设计指南: ${classCount} 个职业
- 数据来源: 官方专长深度分析`;
  }
}

/**
 * 获取知识库服务实例
 */
export function getFeatKnowledgeService(): FeatKnowledgeService {
  return FeatKnowledgeService.getInstance();
}
