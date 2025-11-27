import { FeatGeneratorService } from '../services/feat-generator-service';
import { BalanceDataService } from '../services/balance-data-service';

/**
 * 专长生成器应用程序
 */
export class FeatGeneratorApp extends Application {
  private featService?: FeatGeneratorService;
  private balanceService: BalanceDataService;
  private generatedFeat: any = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'feat-generator-app',
      title: (game as any).i18n.localize('AIPF2E.FeatGenerator.title'),
      template: 'modules/ai-pf2e-assistant/templates/feat-generator-app.hbs',
      width: 600,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'feat-generator-app']
    });
  }

  constructor(options = {}) {
    super(options);
    this.balanceService = new BalanceDataService();
  }

  getData() {
    const g = (game as any).i18n;
    return {
      models: ['gpt-4o', 'claude-sonnet-4-20250514'],
      categories: [
        { value: 'general', label: g.localize('AIPF2E.FeatGenerator.categories.general') },
        { value: 'skill', label: g.localize('AIPF2E.FeatGenerator.categories.skill') },
        { value: 'combat', label: g.localize('AIPF2E.FeatGenerator.categories.combat') },
        { value: 'class', label: g.localize('AIPF2E.FeatGenerator.categories.class') },
        { value: 'ancestry', label: g.localize('AIPF2E.FeatGenerator.categories.ancestry') },
        { value: 'archetype', label: g.localize('AIPF2E.FeatGenerator.categories.archetype') }
      ],
      generatedFeat: this.generatedFeat,
      i18n: {
        featInfo: g.localize('AIPF2E.FeatGenerator.ui.featInfo'),
        prompt: g.localize('AIPF2E.FeatGenerator.prompt'),
        promptPlaceholder: g.localize('AIPF2E.FeatGenerator.promptPlaceholder'),
        level: g.localize('AIPF2E.FeatGenerator.level'),
        category: g.localize('AIPF2E.FeatGenerator.category'),
        className: g.localize('AIPF2E.FeatGenerator.className'),
        classNamePlaceholder: g.localize('AIPF2E.FeatGenerator.classNamePlaceholder'),
        settings: g.localize('AIPF2E.FeatGenerator.ui.settings'),
        enableCompendium: g.localize('AIPF2E.FeatGenerator.enableCompendium'),
        balanceGuidance: g.localize('AIPF2E.FeatGenerator.ui.balanceGuidance'),
        generate: g.localize('AIPF2E.FeatGenerator.generate'),
        result: g.localize('AIPF2E.FeatGenerator.ui.result'),
        resultPlaceholder: g.localize('AIPF2E.FeatGenerator.ui.resultPlaceholder'),
        import: g.localize('AIPF2E.FeatGenerator.import'),
        exportJson: g.localize('AIPF2E.FeatGenerator.exportJson'),
        regenerate: g.localize('AIPF2E.FeatGenerator.regenerate')
      }
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 注入样式
    this._injectStyles();

    // 绑定事件
    html.find('#generate-feat').on('click', this._onGenerateFeat.bind(this));
    html.find('#import-feat').on('click', this._onImportFeat.bind(this));
    html.find('#export-json').on('click', this._onExportJson.bind(this));
    html.find('#regenerate-feat').on('click', this._onRegenerateFeat.bind(this));
    html.find('#feat-level').on('change', this._onLevelChange.bind(this));
    html.find('#feat-category').on('change', this._onCategoryChange.bind(this));

    // 初始化界面
    this._updateLevelDisplay(html);
    this._updateCategoryDisplay(html);
  }

  /**
   * 生成专长
   */
  private async _onGenerateFeat(event: Event) {
    event.preventDefault();
    
    if (!this.featService) {
      ui.notifications.error((game as any).i18n.localize('AIPF2E.FeatGenerator.noService'));
      return;
    }

    const html = $(event.currentTarget).closest('form');
    const formData = new FormData(html[0] as HTMLFormElement);
    
    const prompt = formData.get('prompt') as string;
    const level = parseInt(formData.get('level') as string) || 1;
    const category = formData.get('category') as string || 'general';
    const className = formData.get('class-name') as string || '';
    const enableCompendiumSearch = html.find('#enable-compendium-search').prop('checked');

    if (!prompt?.trim()) {
      ui.notifications.warn((game as any).i18n.localize('AIPF2E.FeatGenerator.noPrompt'));
      return;
    }

    try {
      // 显示加载状态
      const g = (game as any).i18n;
      const originalText = html.find('#generate-feat').text();
      html.find('#generate-feat').prop('disabled', true).text(g.localize('AIPF2E.FeatGenerator.generating'));
      html.find('#feat-output').html(`<p>${g.localize('AIPF2E.FeatGenerator.generatingInfo')}</p>`);

      // 设置集合包搜索状态
      this.featService.setCompendiumSearchEnabled(enableCompendiumSearch);

      // 生成专长
      this.generatedFeat = await this.featService.generateFeat(prompt, level, category, className || undefined);
      
      // 显示结果
      this._displayFeat(html);
      
      ui.notifications.info(g.localize('AIPF2E.FeatGenerator.generateSuccess'));
      
    } catch (error) {
      console.error('专长生成失败:', error);
      const g = (game as any).i18n;
      ui.notifications.error(`${g.localize('AIPF2E.FeatGenerator.generateFailed')}: ${error.message}`);
      html.find('#feat-output').html(`<p class="error">${g.localize('AIPF2E.FeatGenerator.generateFailed')}: ${error.message}</p>`);
    } finally {
      html.find('#generate-feat').prop('disabled', false).text((game as any).i18n.localize('AIPF2E.FeatGenerator.generate'));
    }
  }

  /**
   * 重新生成专长
   */
  private async _onRegenerateFeat(event: Event) {
    event.preventDefault();
    this._onGenerateFeat(event);
  }

  /**
   * 导入专长到世界
   */
  private async _onImportFeat(event: Event) {
    event.preventDefault();
    
    if (!this.generatedFeat) {
      ui.notifications.warn((game as any).i18n.format('AIPF2E.FeatGenerator.noFeat', { action: (game as any).i18n.localize('AIPF2E.FeatGenerator.import') }));
      return;
    }

    try {
      console.log('尝试导入专长:', this.generatedFeat);
      
      let item;
      
      // 尝试多种创建方法以提高兼容性
      if (CONFIG?.Item?.documentClass) {
        console.log('尝试使用CONFIG.Item.documentClass.create方法');
        item = await CONFIG.Item.documentClass.create(this.generatedFeat);
      } else if (game.items && typeof game.items.create === 'function') {
        console.log('尝试使用game.items.create方法');
        item = await game.items.create(this.generatedFeat);
      } else if (game.items && typeof game.items.createDocuments === 'function') {
        console.log('尝试使用game.items.createDocuments方法');
        const items = await game.items.createDocuments([this.generatedFeat]);
        item = items[0];
      } else if (typeof Item !== 'undefined' && Item.create) {
        console.log('尝试使用Item.create方法');
        item = await Item.create(this.generatedFeat);
      } else if (game.collections?.items?.documentClass) {
        console.log('尝试使用game.collections.items.documentClass.create方法');
        item = await game.collections.items.documentClass.create(this.generatedFeat);
      } else {
        throw new Error('无法找到合适的物品创建方法');
      }

      console.log('成功创建的物品:', item);
      ui.notifications.success((game as any).i18n.format('AIPF2E.FeatGenerator.importSuccess', { name: this.generatedFeat.name }));
      
      // 可选：打开物品表单
      if (item && item.sheet) {
        item.sheet.render(true);
      }
      
    } catch (error) {
      console.error('导入专长失败:', error);
      console.log('Foundry VTT API 调试信息:');
      console.log('- CONFIG.Item:', CONFIG?.Item);
      console.log('- game.items方法:', game.items ? Object.getOwnPropertyNames(game.items) : '不存在');
      console.log('- Item类:', typeof Item !== 'undefined' ? Item : '不存在');
      console.log('- game.collections.items:', game.collections?.items);
      
      ui.notifications.error(`${(game as any).i18n.localize('AIPF2E.FeatGenerator.importFailed')}: ${error.message}`);
      
      // 提供备用方案：显示JSON供用户手动导入
      this._showManualImportDialog();
    }
  }

  /**
   * 显示手动导入对话框
   */
  private _showManualImportDialog() {
    if (!this.generatedFeat) return;
    
    const jsonStr = JSON.stringify(this.generatedFeat, null, 2);
    const i18n = (key: string) => (game as any).i18n.localize(`AIPF2E.FeatGenerator.manualImport.${key}`);
    
    const content = `
      <div class="manual-import-dialog">
        <p><strong>${i18n('intro')}</strong></p>
        <ol>
          <li>${i18n('step1')}</li>
          <li>${i18n('step2')}</li>
          <li>${i18n('step3')}</li>
          <li>${i18n('step4')}</li>
        </ol>
        <textarea readonly style="width: 100%; height: 300px; font-family: monospace; font-size: 12px;">${jsonStr}</textarea>
        <button type="button" onclick="navigator.clipboard.writeText(\`${jsonStr.replace(/`/g, '\\`')}\`)">${i18n('copyButton')}</button>
      </div>
    `;

    new Dialog({
      title: i18n('title'),
      content: content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: i18n('ok')
        }
      },
      width: 600,
      height: 500
    }).render(true);
  }

  /**
   * 注入样式
   */
  private _injectStyles() {
    const styleId = 'ai-pf2e-feat-generator-styles';
    
    // 检查是否已经注入过样式
    if (document.getElementById(styleId)) return;
    
    // 创建样式元素
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Scoped styles for feat-generator-app ONLY */
      .feat-generator-app {
        font-family: 'Signika', sans-serif;
      }
      
      .feat-generator-app .ai-pf2e-assistant-container {
        padding: 20px;
      }
      
      .feat-generator-app .tab-panel {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 20px;
        background: #f9f9f9;
        margin-bottom: 20px;
      }
      
      .feat-generator-app .tab-panel h3 {
        margin-top: 0;
        color: #2c3e50;
        border-bottom: 2px solid #3498db;
        padding-bottom: 10px;
      }
      
      .feat-generator-app h4 {
        color: #2c3e50;
        margin-top: 15px;
        margin-bottom: 10px;
        font-size: 1.1em;
      }
      
      .feat-generator-app .form-group {
        margin-bottom: 15px;
      }
      
      .feat-generator-app .form-group label {
        display: block;
        font-weight: bold;
        margin-bottom: 5px;
        color: #2c3e50;
      }
      
      .feat-generator-app .form-group input[type="text"],
      .feat-generator-app .form-group input[type="number"],
      .feat-generator-app .form-group select,
      .feat-generator-app .form-group textarea {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: inherit;
        box-sizing: border-box;
        line-height: 1.5;
        min-height: 34px;
      }
      
      .feat-generator-app .form-group select {
        height: auto;
        min-height: 34px;
      }
      
      .feat-generator-app .form-group textarea {
        resize: vertical;
        min-height: 100px;
      }
      
      .feat-generator-app .form-group .hint {
        font-size: 0.9em;
        color: #666;
        margin: 5px 0;
        font-style: italic;
      }
      
      .feat-generator-app .level-selector {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .feat-generator-app .level-selector input {
        width: 80px;
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      
      .feat-generator-app button,
      .feat-generator-app .form-group button {
        padding: 10px 20px;
        background: #3498db;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background 0.3s;
      }
      
      .feat-generator-app button:hover:not(:disabled),
      .feat-generator-app .form-group button:hover:not(:disabled) {
        background: #2980b9;
      }
      
      .feat-generator-app button:disabled,
      .feat-generator-app .form-group button:disabled {
        background: #bdc3c7;
        cursor: not-allowed;
      }
      
      .feat-generator-app .form-group.buttons {
        display: flex;
        gap: 10px;
      }
      
      .feat-generator-app .balance-info {
        background: #e8f4fd;
        border: 1px solid #bee5eb;
        border-radius: 4px;
        padding: 15px;
        margin-top: 10px;
      }
      
      .feat-generator-app .balance-info h4 {
        margin-top: 0;
        margin-bottom: 10px;
        color: #0c5460;
      }
      
      .feat-generator-app .balance-info ul {
        margin: 5px 0;
        padding-left: 20px;
      }
      
      .feat-generator-app .balance-info li {
        margin: 3px 0;
        font-size: 0.9em;
      }
      
      .feat-generator-app .feat-preview {
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 15px;
        background: white;
        margin-top: 15px;
      }
      
      .feat-generator-app .feat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 2px solid #3498db;
      }
      
      .feat-generator-app .feat-header h3 {
        margin: 0;
        color: #2c3e50;
        border: none;
        padding: 0;
      }
      
      .feat-generator-app .feat-level {
        background: #3498db;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8em;
      }
      
      .feat-generator-app .feat-details p {
        margin: 8px 0;
        font-size: 0.9em;
      }
      
      .feat-generator-app .form-actions {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }
    `;
    
    // 添加到文档头部
    document.head.appendChild(style);
  }

  /**
   * 导出JSON
   */
  private _onExportJson(event: Event) {
    event.preventDefault();
    
    if (!this.generatedFeat) {
      ui.notifications.warn((game as any).i18n.format('AIPF2E.FeatGenerator.noFeat', { action: (game as any).i18n.localize('AIPF2E.FeatGenerator.exportJson') }));
      return;
    }

    // 创建下载链接
    const dataStr = JSON.stringify(this.generatedFeat, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.generatedFeat.name.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    ui.notifications.info((game as any).i18n.localize('AIPF2E.FeatGenerator.exportSuccess'));
  }

  /**
   * 等级变化处理
   */
  private _onLevelChange(event: Event) {
    const html = $(event.currentTarget).closest('form');
    this._updateLevelDisplay(html);
  }

  /**
   * 类别变化处理
   */
  private _onCategoryChange(event: Event) {
    const html = $(event.currentTarget).closest('form');
    this._updateCategoryDisplay(html);
  }

  /**
   * 更新等级显示信息
   */
  private _updateLevelDisplay(html: any) {
    const level = parseInt(html.find('#feat-level').val() as string) || 1;
    const category = html.find('#feat-category').val() as string || 'general';
    
    const guidance = this.balanceService.generateBalanceGuidance(level, 'feat');
    let levelInfo = `<div class="balance-guidance">`;
    levelInfo += guidance.replace(/\n/g, '<br>').replace(/•/g, '&bull;');
    levelInfo += `</div>`;

    html.find('#level-info').html(levelInfo);
  }

  /**
   * 更新类别显示信息
   */
  private _updateCategoryDisplay(html: any) {
    const category = html.find('#feat-category').val() as string || 'general';
    
    let categoryInfo = `<h4>${this._getCategoryDisplayName(category)}类别特点:</h4>`;
    
    switch (category) {
      case 'general':
        categoryInfo += `<p>通用专长对所有角色都有价值，避免过于专业化，通常提供生活质量改善。</p>`;
        break;
      case 'skill':
        categoryInfo += `<p>技能专长增强特定技能使用，需要技能等级先决条件，解锁新用法。</p>`;
        break;
      case 'class':
        categoryInfo += `<p>职业专长体现职业特色，有较强的战斗或职业相关效果。</p>`;
        break;
      case 'ancestry':
        categoryInfo += `<p>血统专长体现种族特性，通常与血统能力或文化背景相关。</p>`;
        break;
      case 'bonus':
        categoryInfo += `<p>奖励专长通常在特定情况下获得，不占用常规专长位。</p>`;
        break;
    }

    // 根据类别显示/隐藏职业名称字段
    const classNameGroup = html.find('.class-name-group');
    if (category === 'class') {
      classNameGroup.show();
    } else {
      classNameGroup.hide();
    }

    html.find('#category-info').html(categoryInfo);
  }

  /**
   * 获取类别显示名称
   */
  private _getCategoryDisplayName(category: string): string {
    const categoryMap: Record<string, string> = {
      'general': '通用',
      'skill': '技能',
      'class': '职业',
      'ancestry': '血统',
      'bonus': '奖励'
    };
    return categoryMap[category] || category;
  }

  /**
   * 显示生成的专长
   */
  private _displayFeat(html: any) {
    if (!this.generatedFeat) return;

    const feat = this.generatedFeat;
    const description = feat.system?.description?.value || '';
    
    let output = `
      <div class="feat-display">
        <h3>${feat.name}</h3>
        <div class="feat-meta">
          <span class="feat-level">等级 ${feat.system?.level?.value || 1}</span>
          <span class="feat-category">${this._getCategoryDisplayName(feat.system?.category || 'general')}专长</span>
          <span class="feat-action">${this._getActionDisplayName(feat.system?.actionType?.value || 'passive')}</span>
        </div>
        
        ${feat.system?.traits?.value?.length > 0 ? `
        <div class="feat-traits">
          <strong>特征:</strong> ${feat.system.traits.value.join(', ')}
        </div>
        ` : ''}
        
        ${feat.system?.prerequisites?.value?.length > 0 ? `
        <div class="feat-prerequisites">
          <strong>先决条件:</strong> ${feat.system.prerequisites.value.join(', ')}
        </div>
        ` : ''}
        
        ${feat.system?.frequency ? `
        <div class="feat-frequency">
          <strong>频率:</strong> ${feat.system.frequency.max}/${this._getFrequencyDisplayName(feat.system.frequency.per)}
        </div>
        ` : ''}
        
        <div class="feat-description">
          ${description}
        </div>
        
        ${feat.system?.rules?.length > 0 ? `
        <div class="feat-rules">
          <h4>规则效果:</h4>
          <ul>
            ${feat.system.rules.map((rule: any) => `<li>${this._formatRule(rule)}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
      </div>
    `;

    html.find('#feat-output').html(output);
    
    // 显示导入和导出按钮
    html.find('#import-feat, #export-json, #regenerate-feat').show();
    html.find('.button-group').show();
  }

  /**
   * 获取动作类型显示名称
   */
  private _getActionDisplayName(actionType: string): string {
    const actionMap: Record<string, string> = {
      'passive': '被动',
      'free': '自由动作',
      'reaction': '反应',
      'action': '动作'
    };
    return actionMap[actionType] || actionType;
  }

  /**
   * 获取频率显示名称
   */
  private _getFrequencyDisplayName(frequency: string): string {
    const frequencyMap: Record<string, string> = {
      'turn': '回合',
      'round': '轮',
      'minute': '分钟',
      'hour': '小时',
      'day': '天',
      'week': '周',
      'month': '月',
      'year': '年'
    };
    return frequencyMap[frequency] || frequency;
  }

  /**
   * 格式化规则效果
   */
  private _formatRule(rule: any): string {
    if (!rule) return '';
    
    if (rule.key === 'FlatModifier') {
      return `${rule.label || rule.selector}: ${rule.value > 0 ? '+' : ''}${rule.value} ${rule.type || ''}`;
    } else if (rule.key === 'DamageDice') {
      return `${rule.label || '伤害'}: +${rule.diceNumber}${rule.dieSize} ${rule.damageType || ''}伤害`;
    } else if (rule.key === 'Note') {
      return rule.text || rule.title || '规则说明';
    } else if (rule.key === 'RollOption') {
      return `添加选项: ${rule.option}`;
    }
    
    return `${rule.key}: ${JSON.stringify(rule)}`;
  }

  /**
   * 设置AI服务
   * 这个方法应该在应用初始化后由主模块调用
   */
  setAIService(aiService: any) {
    this.featService = new FeatGeneratorService(aiService, this.balanceService.getAllData());
  }
}