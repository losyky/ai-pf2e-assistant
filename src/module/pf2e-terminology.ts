import { MODULE_ID, TERMINOLOGY_DATA_FILE, EXAMPLE_TERMS_FILE, getModuleFilePath } from './constants';

/**
 * PF2e术语对照表
 * 用于帮助AI更准确地理解和处理专业术语
 */

// 基础游戏术语 - 默认为空，完全依赖用户导入的术语
export const DEFAULT_PF2E_TERMS: Record<string, Record<string, string>> = {};

// 术语匹配结果接口
export interface TermMatch {
  term: string;       // 原始术语
  translation: string; // 翻译
  score: number;      // 匹配分数
  category: string;   // 所属类别
}

// 定义术语翻译器的接口
export interface TerminologyTranslator {
  // 基础方法
  loadTerms(terms: Record<string, Record<string, string>>, replace?: boolean): void;
  importFromJson(jsonData: string, replace?: boolean): boolean;
  exportToJson(categories?: string[]): string;
  translateEnToZh(text: string): string;
  translateZhToEn(text: string): string;
  addEntries(entries: Array<{original: string, translation: string}>): number;
  addNewTerms(terms: Array<{original: string, translation: string, category?: string}>): number;
  removeEntry(original: string): boolean;
  getAllTerms(): Array<{original: string, translation: string, category: string}>;
  getTermCategory(term: string): string;
  
  // 高级方法
  fuzzySearch(query: string, isZh?: boolean, maxResults?: number, threshold?: number): TermMatch[];
  getTermMatches(text: string): {
    exactMatches: Record<string, string>,
    fuzzyMatches: TermMatch[]
  };
  standardizeTerminology(text: string): string;
  prepareForAI(text: string): {
    processedText: string,
    termMatches: TermMatch[],
    terminology: Record<string, string>
  };
}

/**
 * 专业术语翻译功能
 * 用于在AI处理数据前进行专业术语的中英转换
 */
export class TerminologyTranslatorClass implements TerminologyTranslator {
  private static instance: TerminologyTranslatorClass;
  
  // 双向映射表
  private termsEnToZh: Map<string, string> = new Map();
  private termsZhToEn: Map<string, string> = new Map();
  
  // 术语类别映射
  private termCategories: Map<string, string> = new Map();
  
  // 已加载的术语库
  private loadedTerms: Record<string, Record<string, string>> = {};
  
  private initialized: boolean = false;

  private constructor() {
    // 不再自动加载默认术语，由用户通过CSV导入
    this.initialized = true;
    console.log(`${MODULE_ID} | 术语对照表初始化完成，等待加载术语数据`);
    
    // 尝试加载默认术语数据
    this.loadDefaultTerminology();
  }

  /**
   * 获取术语转换器单例
   */
  public static getInstance(): TerminologyTranslatorClass {
    if (!TerminologyTranslatorClass.instance) {
      TerminologyTranslatorClass.instance = new TerminologyTranslatorClass();
    }
    return TerminologyTranslatorClass.instance;
  }

  /**
   * 从Babele术语条目导入术语
   * @param entries 术语条目数组，格式为[{original: '英文', translation: '中文'}]
   * @returns 成功导入的术语数量
   */
  public addEntries(entries: Array<{original: string, translation: string}>): number {
    if (!entries || !Array.isArray(entries)) {
      console.error(`${MODULE_ID} | 导入术语失败: 无效的术语条目格式`);
      return 0;
    }
    
    let importedCount = 0;
    const importedTerms: Record<string, string> = {};
    
    // 将术语条目转换为术语映射
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && entry.original && entry.translation) {
        importedTerms[entry.original] = entry.translation;
        importedCount++;
      }
    }
    
    // 使用现有方法加载术语
    if (importedCount > 0) {
      this.loadTerms({ imported: importedTerms });
    }
    
    return importedCount;
  }

  /**
   * 批量添加新术语（支持自动分类）
   * @param terms 术语数组，格式为[{original: '英文', translation: '中文', category?: '类别'}]
   * @returns 成功添加的术语数量
   */
  public addNewTerms(terms: Array<{original: string, translation: string, category?: string}>): number {
    if (!terms || !Array.isArray(terms)) {
      console.error(`${MODULE_ID} | 添加新术语失败: 无效的术语格式`);
      return 0;
    }

    let addedCount = 0;

    for (const term of terms) {
      if (!term || !term.original || !term.translation) {
        console.warn(`${MODULE_ID} | 跳过无效术语:`, term);
        continue;
      }

      // 确定类别，如果未指定则使用'auto-collected'
      const category = term.category || 'auto-collected';

      // 确保该类别存在
      if (!this.loadedTerms[category]) {
        this.loadedTerms[category] = {};
      }

      // 检查术语是否已存在（不区分大小写）
      const existingZh = this.termsEnToZh.get(term.original.toLowerCase());
      if (existingZh) {
        console.log(`${MODULE_ID} | 术语已存在，跳过: ${term.original} -> ${existingZh}`);
        continue;
      }

      // 添加到已加载术语
      this.loadedTerms[category][term.original] = term.translation;

      // 更新映射表
      this.termsEnToZh.set(term.original.toLowerCase(), term.translation);
      this.termsZhToEn.set(term.translation, term.original);

      // 记录术语所属类别
      this.termCategories.set(term.original.toLowerCase(), category);
      this.termCategories.set(term.translation, category);

      addedCount++;
      console.log(`${MODULE_ID} | 添加新术语: ${term.original} -> ${term.translation} [${category}]`);
    }

    console.log(`${MODULE_ID} | 成功添加 ${addedCount} 个新术语`);
    return addedCount;
  }

  /**
   * 删除指定的单条术语
   * @param original 英文术语
   * @returns 是否删除成功
   */
  public removeEntry(original: string): boolean {
    if (!original) {
      console.error(`${MODULE_ID} | 删除术语失败: 术语为空`);
      return false;
    }

    const originalLower = original.toLowerCase();

    // 检查术语是否存在
    const translation = this.termsEnToZh.get(originalLower);
    if (!translation) {
      console.warn(`${MODULE_ID} | 术语不存在，无法删除: ${original}`);
      return false;
    }

    // 获取术语所属类别
    const category = this.termCategories.get(originalLower);

    // 从映射表中删除
    this.termsEnToZh.delete(originalLower);
    this.termsZhToEn.delete(translation);
    this.termCategories.delete(originalLower);
    this.termCategories.delete(translation);

    // 从已加载术语中删除
    if (category && this.loadedTerms[category]) {
      // 在类别中查找并删除（需要区分大小写匹配）
      for (const key in this.loadedTerms[category]) {
        if (key.toLowerCase() === originalLower) {
          delete this.loadedTerms[category][key];
          break;
        }
      }

      // 如果类别变空，删除该类别
      if (Object.keys(this.loadedTerms[category]).length === 0) {
        delete this.loadedTerms[category];
        console.log(`${MODULE_ID} | 类别 ${category} 已清空，已删除`);
      }
    }

    console.log(`${MODULE_ID} | 成功删除术语: ${original} -> ${translation}`);
    return true;
  }

  /**
   * 修改指定的单条术语
   * @param oldOriginal 原英文术语
   * @param newOriginal 新英文术语
   * @param newTranslation 新中文翻译
   * @param newCategory 新类别（可选）
   * @returns 是否修改成功
   */
  public updateEntry(oldOriginal: string, newOriginal: string, newTranslation: string, newCategory?: string): boolean {
    if (!oldOriginal || !newOriginal || !newTranslation) {
      console.error(`${MODULE_ID} | 修改术语失败: 参数不完整`);
      return false;
    }

    const oldOriginalLower = oldOriginal.toLowerCase();
    const newOriginalLower = newOriginal.toLowerCase();

    // 检查原术语是否存在
    const oldTranslation = this.termsEnToZh.get(oldOriginalLower);
    if (!oldTranslation) {
      console.warn(`${MODULE_ID} | 术语不存在，无法修改: ${oldOriginal}`);
      return false;
    }

    // 如果英文术语改变了，检查新术语是否已存在
    if (oldOriginalLower !== newOriginalLower) {
      const existingTranslation = this.termsEnToZh.get(newOriginalLower);
      if (existingTranslation) {
        console.warn(`${MODULE_ID} | 新术语已存在: ${newOriginal} -> ${existingTranslation}`);
        return false;
      }
    }

    // 获取原术语所属类别
    const oldCategory = this.termCategories.get(oldOriginalLower) || 'other';
    const targetCategory = newCategory || oldCategory;

    // 从映射表中删除旧术语
    this.termsEnToZh.delete(oldOriginalLower);
    this.termsZhToEn.delete(oldTranslation);
    this.termCategories.delete(oldOriginalLower);
    this.termCategories.delete(oldTranslation);

    // 从已加载术语中删除旧术语
    if (this.loadedTerms[oldCategory]) {
      for (const key in this.loadedTerms[oldCategory]) {
        if (key.toLowerCase() === oldOriginalLower) {
          delete this.loadedTerms[oldCategory][key];
          break;
        }
      }

      // 如果类别变空，删除该类别
      if (Object.keys(this.loadedTerms[oldCategory]).length === 0) {
        delete this.loadedTerms[oldCategory];
      }
    }

    // 添加新术语
    if (!this.loadedTerms[targetCategory]) {
      this.loadedTerms[targetCategory] = {};
    }

    this.loadedTerms[targetCategory][newOriginal] = newTranslation;
    this.termsEnToZh.set(newOriginalLower, newTranslation);
    this.termsZhToEn.set(newTranslation, newOriginal);
    this.termCategories.set(newOriginalLower, targetCategory);
    this.termCategories.set(newTranslation, targetCategory);

    console.log(`${MODULE_ID} | 成功修改术语: ${oldOriginal} -> ${newOriginal} (${newTranslation}) [${targetCategory}]`);
    return true;
  }

  /**
   * 获取所有术语
   * @returns 所有术语数组，格式为[{original: '英文', translation: '中文', category: '类别'}]
   */
  public getAllTerms(): Array<{original: string, translation: string, category: string}> {
    const allTerms: Array<{original: string, translation: string, category: string}> = [];
    
    // 遍历所有类别
    for (const category in this.loadedTerms) {
      const categoryTerms = this.loadedTerms[category];
      
      // 遍历该类别中的所有术语
      for (const original in categoryTerms) {
        allTerms.push({
          original: original,
          translation: categoryTerms[original],
          category: category
        });
      }
    }
    
    return allTerms;
  }

  /**
   * 获取术语的类别
   * @param term 术语（英文或中文）
   * @returns 类别名称，未找到则返回'other'
   */
  public getTermCategory(term: string): string {
    if (!term) return 'other';
    
    // 先尝试作为英文术语查找
    const categoryFromEn = this.termCategories.get(term.toLowerCase());
    if (categoryFromEn) return categoryFromEn;
    
    // 再尝试作为中文术语查找
    const categoryFromZh = this.termCategories.get(term);
    if (categoryFromZh) return categoryFromZh;
    
    return 'other';
  }

  /**
   * 加载术语库
   * @param terms 术语库对象
   * @param replace 是否替换已有术语 
   */
  public loadTerms(terms: Record<string, Record<string, string>>, replace: boolean = false): void {
    try {
      // 如果指定了替换模式且传入空对象，则清空整个术语库
      if (replace && Object.keys(terms).length === 0) {
        // 清空所有映射表
        this.termsEnToZh.clear();
        this.termsZhToEn.clear();
        this.termCategories.clear();
        this.loadedTerms = {};
        
        console.log(`${MODULE_ID} | 术语对照表已清空`);
        return;
      }
      
      // 遍历所有术语分类
      for (const category in terms) {
        // 如果指定了替换模式并且该类别已存在，先清空该类别
        if (replace && this.loadedTerms[category]) {
          // 从映射表中移除该类别的所有术语
          for (const [en, zh] of Object.entries(this.loadedTerms[category])) {
            this.termsEnToZh.delete(en.toLowerCase());
            this.termsZhToEn.delete(zh);
            this.termCategories.delete(en.toLowerCase());
            this.termCategories.delete(zh);
          }
          // 从已加载术语中删除该类别
          delete this.loadedTerms[category];
        }
        
        // 确保该类别存在
        if (!this.loadedTerms[category]) {
          this.loadedTerms[category] = {};
        }
        
        const termsInCategory = terms[category] as Record<string, string>;
        
        // 将每个分类中的术语添加到映射表
        for (const [en, zh] of Object.entries(termsInCategory)) {
          // 更新已加载术语
          this.loadedTerms[category][en] = zh;
          
          // 更新映射表
          this.termsEnToZh.set(en.toLowerCase(), zh);
          this.termsZhToEn.set(zh, en);
          
          // 记录术语所属类别
          this.termCategories.set(en.toLowerCase(), category);
          this.termCategories.set(zh, category);
        }
      }
      
      this.initialized = true;
      console.log(`${MODULE_ID} | 术语对照表加载完成: ${this.termsEnToZh.size}个术语对`);
    } catch (error) {
      console.error(`${MODULE_ID} | 术语对照表加载失败:`, error);
    }
  }
  
  /**
   * 从JSON文件导入术语库
   * @param jsonData JSON格式的术语数据
   * @param replace 是否替换已有术语
   */
  public importFromJson(jsonData: string, replace: boolean = false): boolean {
    try {
      const terms = JSON.parse(jsonData) as Record<string, Record<string, string>>;
      this.loadTerms(terms, replace);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | 从JSON导入术语失败:`, error);
      return false;
    }
  }
  
  /**
   * 导出术语库为JSON字符串
   * @param categories 指定要导出的类别，不指定则导出全部
   */
  public exportToJson(categories?: string[]): string {
    const termsToExport: Record<string, Record<string, string>> = {};
    
    // 筛选要导出的类别
    const categoriesToExport = categories || Object.keys(this.loadedTerms);
    
    // 构建导出对象
    for (const category of categoriesToExport) {
      if (this.loadedTerms[category]) {
        termsToExport[category] = this.loadedTerms[category];
      }
    }
    
    return JSON.stringify(termsToExport, null, 2);
  }

  /**
   * 英文转中文
   * @param text 要翻译的英文文本
   * @returns 翻译后的中文文本
   */
  public translateEnToZh(text: string): string {
    if (!text) return text;
    
    let result = text;
    // 从长到短排序术语，确保先替换最长的匹配
    const sortedTerms = Array.from(this.termsEnToZh.keys()).sort((a, b) => b.length - a.length);
    
    for (const term of sortedTerms) {
      const regex = new RegExp(`\\b${this.escapeRegExp(term)}\\b`, 'gi');
      const translation = this.termsEnToZh.get(term.toLowerCase());
      if (translation) {
        result = result.replace(regex, translation);
      }
    }
    
    return result;
  }

  /**
   * 中文转英文
   * @param text 要翻译的中文文本
   * @returns 翻译后的英文文本
   */
  public translateZhToEn(text: string): string {
    if (!text) return text;
    
    let result = text;
    // 从长到短排序术语，确保先替换最长的匹配
    const sortedTerms = Array.from(this.termsZhToEn.keys()).sort((a, b) => b.length - a.length);
    
    for (const term of sortedTerms) {
      const regex = new RegExp(this.escapeRegExp(term), 'g');
      const translation = this.termsZhToEn.get(term);
      if (translation) {
        result = result.replace(regex, translation);
      }
    }
    
    return result;
  }
  
  /**
   * 使用模糊搜索查找相近术语
   * @param query 搜索关键词
   * @param isZh 是否搜索中文术语
   * @param maxResults 最大结果数量
   * @param threshold 匹配阈值(0-1)
   * @returns 匹配结果数组
   */
  public fuzzySearch(query: string, isZh: boolean = false, maxResults: number = 5, threshold: number = 0.5): TermMatch[] {
    if (!query || query.length < 2) return [];
    
    const results: TermMatch[] = [];
    const lowerQuery = query.toLowerCase();
    
    // 根据搜索语言选择不同的源
    const source = isZh ? this.termsZhToEn : this.termsEnToZh;
    
    // 对每个术语计算相似度并排序
    for (const [term, translation] of source.entries()) {
      // 计算相似度分数
      const score = this.calculateSimilarity(lowerQuery, term.toLowerCase());
      
      // 如果分数超过阈值，加入结果集
      if (score >= threshold) {
        const category = this.termCategories.get(isZh ? term : term.toLowerCase()) || 'unknown';
        
        results.push({
          term,
          translation,
          score,
          category
        });
      }
    }
    
    // 按相似度排序并限制结果数量
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
  
  /**
   * 获取术语对照，不进行文本替换，仅识别匹配的术语
   * @param text 要处理的文本
   * @returns 匹配上的术语和翻译的映射表
   */
  public getTermMatches(text: string): {
    exactMatches: Record<string, string>, // 精确匹配的术语
    fuzzyMatches: TermMatch[]            // 模糊匹配的术语
  } {
    if (!text) {
      return { exactMatches: {}, fuzzyMatches: [] };
    }
    
    const exactMatches: Record<string, string> = {};
    
    // 查找文本中出现的所有中文术语
    const zhTerms = Array.from(this.termsZhToEn.keys())
      .sort((a, b) => b.length - a.length); // 从长到短排序
    
    for (const term of zhTerms) {
      if (text.includes(term)) {
        const translation = this.termsZhToEn.get(term);
        if (translation) {
          exactMatches[term] = translation;
        }
      }
    }
    
    // 查找文本中出现的所有英文术语
    const enTerms = Array.from(this.termsEnToZh.keys())
      .sort((a, b) => b.length - a.length); // 从长到短排序
    
    for (const term of enTerms) {
      const regex = new RegExp(`\\b${this.escapeRegExp(term)}\\b`, 'gi');
      if (regex.test(text)) {
        const translation = this.termsEnToZh.get(term.toLowerCase());
        if (translation) {
          exactMatches[term] = translation;
        }
      }
    }
    
    // 不再进行模糊搜索，模糊匹配会导致过多不相关的术语被识别
    
    return {
      exactMatches,
      fuzzyMatches: []
    };
  }

  /**
   * 标准化文本中的专业术语（已废弃）
   * 此方法不再进行术语替换，仅保留用于向后兼容
   * @param text 包含专业术语的文本
   * @returns 原始文本（不进行任何修改）
   */
  public standardizeTerminology(text: string): string {
    if (!text || typeof text !== 'string') return text;
    
    // 不再进行任何替换，直接返回原文
    // 术语应该作为知识库在提示词中提供，而不是强制替换
    return text;
  }
  
  /**
   * 为AI处理准备数据
   * @param text 用户输入的文本
   * @returns 处理后的信息，包含术语对照（作为知识库，不进行文本替换）
   */
  public prepareForAI(text: string): {
    processedText: string,       // 原始文本（不再进行替换）
    termMatches: TermMatch[],    // 术语匹配结果
    terminology: Record<string, string>  // 术语对照表(简化版)
  } {
    // 获取术语匹配（不进行替换）
    const { exactMatches, fuzzyMatches } = this.getTermMatches(text);
    
    // 构建完整的术语对照表
    const terminology: Record<string, string> = {};
    
    // 添加精确匹配的术语
    Object.entries(exactMatches).forEach(([term, translation]) => {
      terminology[term] = translation;
    });
    
    return {
      processedText: text, // 返回原始文本，不进行任何替换
      termMatches: [...fuzzyMatches],
      terminology
    };
  }
  
  // 辅助方法
  
  /**
   * 计算两个字符串的相似度 (简化版Levenshtein距离)
   */
  private calculateSimilarity(s1: string, s2: string): number {
    // 如果字符串完全相同
    if (s1 === s2) return 1;
    
    // 如果其中一个字符串包含另一个，给予较高分数
    if (s1.includes(s2) || s2.includes(s1)) {
      const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
      return 0.8 + (ratio * 0.2); // 0.8到1之间的分数
    }
    
    // 计算Levenshtein距离的简化版本
    const len1 = s1.length;
    const len2 = s2.length;
    
    // 针对长度差异过大的情况快速返回
    if (Math.abs(len1 - len2) > Math.min(len1, len2)) {
      return 0;
    }
    
    // 计算字符重叠度
    let matches = 0;
    const maxDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    
    const s1Chars: boolean[] = Array(len1).fill(false);
    const s2Chars: boolean[] = Array(len2).fill(false);
    
    // 计算直接匹配的字符
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - maxDistance);
      const end = Math.min(len2, i + maxDistance + 1);
      
      for (let j = start; j < end; j++) {
        if (!s2Chars[j] && s1[i] === s2[j]) {
          s1Chars[i] = s2Chars[j] = true;
          matches++;
          break;
        }
      }
    }
    
    // 如果没有匹配的字符
    if (matches === 0) return 0;
    
    // 计算相似度
    let similarity = (2.0 * matches) / (len1 + len2);
    
    return similarity;
  }
  
  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * 去除重复的匹配结果
   */
  private deduplicateMatches(matches: TermMatch[]): TermMatch[] {
    const seen = new Set<string>();
    const result: TermMatch[] = [];
    
    for (const match of matches) {
      const key = `${match.term}:${match.translation}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        result.push(match);
      }
    }
    
    // 按分数排序
    return result.sort((a, b) => b.score - a.score);
  }
  
  /**
   * 获取类别的中文名称
   */
  private getCategoryName(category: string): string {
    const categoryNames: Record<string, string> = {
      'actorTypes': '角色类型',
      'itemTypes': '物品类型',
      'abilities': '属性值',
      'actionTypes': '动作类型',
      'combatTerms': '战斗术语',
      'conditions': '状态条件',
      'damageTypes': '伤害类型',
      'commonActions': '常见动作',
      'skills': '技能',
      'spellTerms': '法术术语',
      'unknown': '未分类'
    };
    
    return categoryNames[category] || category;
  }

  /**
   * 尝试加载默认术语数据
   * 这个方法会在初始化时自动尝试从模块目录加载terminology-data.json文件
   * 如果文件不存在，将尝试从示例文件复制
   */
  private async loadDefaultTerminology(): Promise<void> {
    try {
      console.log(`${MODULE_ID} | 尝试加载默认术语数据`);
      
      // 检查是否存在术语数据文件
      const response = await fetch(getModuleFilePath(TERMINOLOGY_DATA_FILE));
      
      if (response.ok) {
        // 如果文件存在，直接加载
        const jsonData = await response.text();
        const terms = JSON.parse(jsonData);
        this.loadTerms(terms);
        console.log(`${MODULE_ID} | 从术语数据文件加载了术语`);
        return;
      }
      
      // 如果术语数据文件不存在，尝试从示例CSV转换并保存
      console.log(`${MODULE_ID} | 术语数据文件不存在，尝试加载示例术语`);
      
      // 尝试加载示例术语CSV
      const csvResponse = await fetch(getModuleFilePath(EXAMPLE_TERMS_FILE));
      
      if (!csvResponse.ok) {
        console.log(`${MODULE_ID} | 示例术语CSV不存在，跳过加载默认术语`);
        return;
      }
      
      // 读取并解析CSV
      const csvText = await csvResponse.text();
      const lines = csvText.split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(line => line.split(',').map(item => item.trim()));
      
      // 构建术语数据结构
      const defaultTerms: Record<string, Record<string, string>> = {
        "default": {}
      };
      
      for (const line of lines) {
        if (line.length >= 2) {
          const [english, chinese] = line;
          defaultTerms.default[english] = chinese;
        }
      }
      
      // 加载术语
      this.loadTerms(defaultTerms);
      console.log(`${MODULE_ID} | 从示例CSV加载了${lines.length}个默认术语`);
      
      // 尝试保存到术语数据文件
      try {
        const jsonContent = JSON.stringify(defaultTerms, null, 2);
        
        // @ts-ignore - FilePicker类型
        await FilePicker.upload("data", `modules/${MODULE_ID}`, 
          new File([jsonContent], TERMINOLOGY_DATA_FILE, { type: "application/json" }),
          {}, { notify: false }
        );
        
        console.log(`${MODULE_ID} | 默认术语已保存到术语数据文件`);
      } catch (saveError) {
        console.error(`${MODULE_ID} | 无法保存默认术语到文件:`, saveError);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 加载默认术语时出错:`, error);
    }
  }
}

/**
 * 导出术语对照表单例
 */
export const terminologyTranslator = TerminologyTranslatorClass.getInstance(); 