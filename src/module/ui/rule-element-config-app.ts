import { RuleElementGeneratorService, RuleElementGenerationResult } from '../services/rule-element-generator-service';

const MODULE_ID = 'ai-pf2e-assistant';

/**
 * 规则元素配置应用
 * 用于预览和应用AI生成的规则元素
 */
export class RuleElementConfigApp extends Application {
  private itemData: any;
  private itemApp: any; // 物品表单应用实例
  private generationResult: RuleElementGenerationResult | null = null;
  private isGenerating: boolean = false;
  private hasAttemptedGeneration: boolean = false; // 是否已尝试生成（防止重复）
  private validationErrors: string[] = []; // 验证错误列表
  private isReviewing: boolean = false; // 是否正在复查修正
  private generatorService: RuleElementGeneratorService;
  private customRequirements: string = ''; // 人工介入的自定义要求

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'rule-element-config-app',
      title: (game as any).i18n?.localize('AIPF2E.RuleElementConfig.title') || 'PF2e Rule Element Auto Configuration',
      template: 'modules/ai-pf2e-assistant/templates/rule-element-config-app.hbs',
      width: 800,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'rule-element-config-app']
    });
  }

  constructor(itemData: any, itemApp: any, options = {}) {
    super(options);
    this.itemData = itemData;
    this.itemApp = itemApp;
    this.generatorService = RuleElementGeneratorService.getInstance();
  }

  getData() {
    const description = this.extractItemDescription(this.itemData);
    
    return {
      itemName: this.itemData.name,
      itemType: this.itemData.type,
      itemLevel: this.itemData.system?.level?.value || 'N/A',
      description: description,
      customRequirements: this.customRequirements,
      isGenerating: this.isGenerating,
      isReviewing: this.isReviewing,
      hasResult: this.generationResult !== null,
      hasValidationErrors: this.validationErrors.length > 0,
      validationErrors: this.validationErrors,
      generationResult: this.generationResult,
      rulesJson: this.generationResult ? JSON.stringify(this.generationResult.rules, null, 2) : '',
      explanation: this.generationResult?.explanation || '',
      similarItems: this.generationResult?.similarItems || []
    };
  }

  /**
   * 提取物品描述
   */
  private extractItemDescription(item: any): string {
    const description = item.system?.description?.value || item.description?.value || '';
    // 移除HTML标签但保留基本格式
    const cleanDescription = description
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
    return cleanDescription || (game as any).i18n?.localize('AIPF2E.RuleElementConfig.noDescription') || '(No description)';
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 生成按钮
    html.find('.generate-rules').click(() => this._onGenerateRules());

    // 重新生成按钮
    html.find('.regenerate-rules').click(() => this._onRegenerateRules());

    // 应用按钮（覆盖模式）
    html.find('.apply-rules').click(() => this._onApplyRules(false));

    // 追加按钮
    html.find('.append-rules').click(() => this._onAppendRules());

    // 复查修正按钮
    html.find('.review-and-fix').click(() => this._onReviewAndFix());

    // 取消按钮
    html.find('.cancel-button').click(() => this.close());

    // 查看相似物品规则
    html.find('.view-similar-rules').click((event: any) => {
      const index = $(event.currentTarget).data('index');
      this._onViewSimilarRules(index);
    });

    // 监听自定义要求文本框变化
    html.find('#custom-requirements').on('change', (event: any) => {
      this.customRequirements = $(event.currentTarget).val()?.trim() || '';
      console.log(`${MODULE_ID} | 自定义要求已更新:`, this.customRequirements);
    });

    // 移除自动触发生成 - 改为手动点击按钮
    // 用户需要先填写自定义要求（如果需要），然后手动点击生成按钮
  }

  /**
   * 生成规则元素
   */
  private async _onGenerateRules() {
    if (this.isGenerating) return;

    this.isGenerating = true;
    this.hasAttemptedGeneration = true; // 标记已尝试生成
    
    // 从表单读取最新的自定义要求
    const customReqElement = document.getElementById('custom-requirements') as HTMLTextAreaElement;
    if (customReqElement) {
      this.customRequirements = customReqElement.value?.trim() || '';
    }
    
    this.render();

    try {
      if (this.customRequirements) {
        ui.notifications?.info((game as any).i18n.localize('AIPF2E.RuleElementConfig.generatingCustom'));
      } else {
        ui.notifications?.info((game as any).i18n.localize('AIPF2E.RuleElementConfig.generatingAuto'));
      }

      this.generationResult = await this.generatorService.generateRuleElements(
        this.itemData, 
        this.customRequirements
      );

      // 验证生成的规则
      const validation = this.generatorService.validateRuleElements(this.generationResult.rules);
      if (!validation.valid) {
        console.warn(`${MODULE_ID} | 规则验证警告:`, validation.errors);
        ui.notifications?.warn((game as any).i18n.format('AIPF2E.RuleElementConfig.validationWarning', { errors: validation.errors.join(', ') }));
      }

      ui.notifications?.success((game as any).i18n.format('AIPF2E.RuleElementConfig.generateSuccess', { count: this.generationResult.rules.length }));
      this.isGenerating = false;
      this.render();
    } catch (error: any) {
      console.error(`${MODULE_ID} | 生成规则元素失败:`, error);
      ui.notifications?.error(`${(game as any).i18n.localize('AIPF2E.RuleElementConfig.generateFailed')}: ${error.message}`);
      this.isGenerating = false;
      // 失败后不渲染，避免触发重试循环
      // this.render(); // 注释掉避免重新触发自动生成
    }
  }

  /**
   * 重新生成规则元素
   */
  private async _onRegenerateRules() {
    this.generationResult = null;
    this.hasAttemptedGeneration = false; // 重置标志，允许重新生成
    await this._onGenerateRules();
  }

  /**
   * 应用规则元素（覆盖模式）
   */
  private async _onApplyRules(append: boolean = false) {
    if (!this.generationResult) {
      ui.notifications?.warn((game as any).i18n.localize('AIPF2E.RuleElementConfig.noRules'));
      return;
    }

    try {
      const item = this.itemData;
      
      // 获取当前规则
      const currentRules = item.system?.rules || [];
      
      let newRules: any[];
      if (append) {
        // 追加模式：保留现有规则，添加新规则
        newRules = [...currentRules, ...this.generationResult.rules];
        ui.notifications?.info((game as any).i18n.localize('AIPF2E.RuleElementConfig.applyingAppend'));
      } else {
        // 覆盖模式：替换所有规则
        newRules = this.generationResult.rules;
        ui.notifications?.info((game as any).i18n.localize('AIPF2E.RuleElementConfig.applyingReplace'));
      }

      // 清除之前的验证错误
      this.validationErrors = [];

      // 更新物品数据
      await item.update({
        'system.rules': newRules
      });

      // 等待一小段时间，让Foundry完成验证
      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查是否有验证错误（从控制台捕获）
      const validationErrors = this.checkForValidationErrors(item);
      
      if (validationErrors.length > 0) {
        // 发现验证错误
        this.validationErrors = validationErrors;
        
        console.warn(`${MODULE_ID} | 检测到${validationErrors.length}个验证错误:`, validationErrors);
        ui.notifications?.warn((game as any).i18n.format('AIPF2E.RuleElementConfig.validationErrors', { count: validationErrors.length }));
        
        // 重新渲染以显示错误和复查按钮
        this.render();
      } else {
        // 没有错误，应用成功
        ui.notifications?.success(
          append 
            ? (game as any).i18n.format('AIPF2E.RuleElementConfig.applySuccessAppend', { count: this.generationResult.rules.length })
            : (game as any).i18n.format('AIPF2E.RuleElementConfig.applySuccessReplace', { count: this.generationResult.rules.length })
        );

        // 刷新物品表单
        if (this.itemApp && this.itemApp.render) {
          this.itemApp.render(false);
        }

        // 关闭对话框
        this.close();
      }
    } catch (error: any) {
      console.error(`${MODULE_ID} | 应用规则元素失败:`, error);
      
      // 捕获验证错误
      this.validationErrors = this.extractValidationErrors(error);
      
      // 显示错误并提供复查选项
      ui.notifications?.error((game as any).i18n.localize('AIPF2E.RuleElementConfig.applyFailed'));
      
      console.log(`${MODULE_ID} | 验证错误详情:`, this.validationErrors);
      
      // 重新渲染以显示错误和复查按钮
      this.render();
    }
  }

  /**
   * 追加规则元素
   */
  private async _onAppendRules() {
    await this._onApplyRules(true);
  }

  /**
   * 检查物品的验证错误
   */
  private checkForValidationErrors(item: any): string[] {
    const errors: string[] = [];
    
    try {
      // 尝试从物品的规则元素中提取验证错误
      const rules = item.system?.rules || [];
      
      // 检查每个规则元素
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        
        // 检查常见的验证问题
        if (!rule.key) {
          errors.push(`规则 ${i + 1}: 缺少必需的 key 字段`);
          continue;
        }

        // 针对特定规则类型的验证
        switch (rule.key) {
          case 'EphemeralEffect':
            // 检查 affects 字段
            if (rule.affects && !['target', 'origin'].includes(rule.affects)) {
              errors.push(`规则 ${i + 1} (${rule.key}): affects 字段值 "${rule.affects}" 不合法，应为 "target" 或 "origin"`);
            }
            // 检查 selectors
            if (!rule.selectors || rule.selectors.length === 0) {
              errors.push(`规则 ${i + 1} (${rule.key}): 必须至少有一个 selector`);
            }
            break;
            
          case 'FlatModifier':
            if (!rule.selector) {
              errors.push(`规则 ${i + 1} (${rule.key}): 缺少必需的 selector 字段`);
            }
            if (rule.value === undefined && !rule.formula) {
              errors.push(`规则 ${i + 1} (${rule.key}): 必须提供 value 或 formula`);
            }
            break;
            
          case 'DamageDice':
            if (!rule.selector) {
              errors.push(`规则 ${i + 1} (${rule.key}): 缺少必需的 selector 字段`);
            }
            break;
            
          case 'ActiveEffectLike':
            errors.push(`规则 ${i + 1}: "ActiveEffectLike" 不是有效的规则元素类型，可能应该使用 "GrantItem" 或其他类型`);
            break;
        }
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | 检查验证错误时出错:`, e);
    }
    
    return errors;
  }

  /**
   * 提取验证错误信息
   */
  private extractValidationErrors(error: any): string[] {
    const errors: string[] = [];
    
    // 添加主错误消息
    if (error.message) {
      errors.push(error.message);
    }
    
    // 尝试从堆栈中提取更多信息
    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(0, 3);
      errors.push(...stackLines.filter((line: string) => line.trim()));
    }
    
    // 检查是否有Foundry的验证错误
    if (error.errors) {
      Object.entries(error.errors).forEach(([key, value]: [string, any]) => {
        errors.push(`${key}: ${value.message || value}`);
      });
    }
    
    // 如果没有提取到任何错误,添加通用消息
    if (errors.length === 0) {
      errors.push('未知验证错误');
    }
    
    return errors;
  }

  /**
   * 复查并修正规则元素
   */
  private async _onReviewAndFix() {
    if (!this.generationResult || this.validationErrors.length === 0) {
      ui.notifications?.warn((game as any).i18n.localize('AIPF2E.RuleElementConfig.noErrorsToFix'));
      return;
    }

    if (this.isReviewing) return;

    this.isReviewing = true;
    this.render();

    try {
      console.log(`${MODULE_ID} | 开始复查修正规则元素...`);
      
      // 调用AI进行修正
      const fixedResult = await this.generatorService.reviewAndFixRules(
        this.itemData,
        this.generationResult.rules,
        this.validationErrors
      );
      
      console.log(`${MODULE_ID} | 复查修正完成:`, fixedResult);
      
      // 更新生成结果
      this.generationResult = {
        ...this.generationResult,
        rules: fixedResult.rules,
        explanation: `[AI复查修正]\n${fixedResult.explanation}\n\n[原始说明]\n${this.generationResult.explanation}`
      };
      
      // 清除验证错误
      this.validationErrors = [];
      
      ui.notifications?.success((game as any).i18n.localize('AIPF2E.RuleElementConfig.fixSuccess'));
      
    } catch (error: any) {
      console.error(`${MODULE_ID} | 复查修正失败:`, error);
      ui.notifications?.error(`${(game as any).i18n.localize('AIPF2E.RuleElementConfig.fixFailed')}: ${error.message}`);
    } finally {
      this.isReviewing = false;
      this.render();
    }
  }

  /**
   * 查看相似物品的规则
   */
  private _onViewSimilarRules(index: number) {
    if (!this.generationResult || !this.generationResult.similarItems[index]) {
      return;
    }

    const item = this.generationResult.similarItems[index];
    const rulesJson = JSON.stringify(item.rules, null, 2);

    // 创建一个对话框显示规则
    const i18nInfo = (key: string) => (game as any).i18n.localize(`AIPF2E.RuleElementConfig.itemInfo.${key}`);
    new Dialog({
      title: (game as any).i18n.format('AIPF2E.RuleElementConfig.similarRulesTitle', { name: item.name }),
      content: `
        <div style="margin-bottom: 10px;">
          <strong>${i18nInfo('item')}:</strong> ${item.name}<br>
          <strong>${i18nInfo('type')}:</strong> ${item.type}<br>
          <strong>${i18nInfo('source')}:</strong> ${item.packName}<br>
          <strong>${i18nInfo('description')}:</strong> ${item.description}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>规则元素:</strong>
        </div>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; max-height: 400px; overflow-y: auto; font-size: 12px;">${rulesJson}</pre>
      `,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: (game as any).i18n.localize('AIPF2E.RuleElementConfig.closeButton')
        }
      },
      default: 'close'
    }).render(true);
  }

  /**
   * 获取模板数据
   */
  async _updateObject(event: Event, formData: any) {
    // 不需要实现，因为这不是FormApplication
  }
}

