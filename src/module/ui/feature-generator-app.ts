import { MODULE_ID } from '../constants';
import { FeatureGeneratorService, PF2eItemFormat } from '../services/feature-generator-service';
import { BalanceDataService } from '../services/balance-data-service';

declare const ui: any;
declare const game: any;
declare class FormApplication {
  constructor(object?: any, options?: any);
  static get defaultOptions(): any;
  getData(): any;
  activateListeners(html: any): void;
  render(force?: boolean): any;
  close(): Promise<void>;
}

/**
 * 特性生成器应用界面
 */
export class FeatureGeneratorApp extends FormApplication {
  private featureService: FeatureGeneratorService;
  private balanceService: BalanceDataService;
  private generatedFeature: PF2eItemFormat | null = null;

  constructor() {
    super({}, {});
    
    // 初始化服务
    this.balanceService = new BalanceDataService();
    
    // 这里需要传入AI服务实例，暂时使用null
    // TODO: 从主模块获取AI服务实例
    this.featureService = new FeatureGeneratorService(null as any, this.balanceService.getAllData());
  }

  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      id: 'feature-generator-app',
      title: (game as any).i18n.localize('AIPF2E.FeatureGenerator.title'),
      template: 'modules/ai-pf2e-assistant/templates/feature-generator-app.hbs',
      width: 800,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant', 'feature-generator']
    };
  }

  getData() {
    const g = (game as any).i18n;
    return {
      title: g.localize('AIPF2E.FeatureGenerator.title'),
      generatedFeature: this.generatedFeature,
      hasFeature: this.generatedFeature !== null,
      levels: Array.from({length: 20}, (_, i) => i + 1),
      i18n: {
        title: g.localize('AIPF2E.FeatureGenerator.title'),
        description: g.localize('AIPF2E.FeatureGenerator.description'),
        prompt: g.localize('AIPF2E.FeatureGenerator.prompt'),
        promptPlaceholder: g.localize('AIPF2E.FeatureGenerator.promptPlaceholder'),
        level: g.localize('AIPF2E.FeatureGenerator.level'),
        levelSuffix: g.localize('AIPF2E.FeatureGenerator.ui.levelSuffix'),
        className: g.localize('AIPF2E.FeatureGenerator.className'),
        classNamePlaceholder: g.localize('AIPF2E.FeatureGenerator.classNamePlaceholder'),
        enableCompendium: g.localize('AIPF2E.FeatureGenerator.enableCompendium'),
        compendiumSearchHint: g.localize('AIPF2E.FeatureGenerator.compendiumSearchHint'),
        generate: g.localize('AIPF2E.FeatureGenerator.generate'),
        generatedFeature: g.localize('AIPF2E.FeatureGenerator.generatedFeature'),
        actions: g.localize('AIPF2E.FeatureGenerator.actions'),
        prerequisites: g.localize('AIPF2E.FeatureGenerator.prerequisites'),
        ruleElements: g.localize('AIPF2E.FeatureGenerator.ruleElements'),
        viewRuleDetails: g.localize('AIPF2E.FeatureGenerator.viewRuleDetails'),
        import: g.localize('AIPF2E.FeatureGenerator.import'),
        exportJson: g.localize('AIPF2E.FeatureGenerator.exportJson'),
        regenerate: g.localize('AIPF2E.FeatureGenerator.regenerate'),
        helpTitle: g.localize('AIPF2E.FeatureGenerator.helpTitle'),
        levelInfo: g.localize('AIPF2E.FeatureGenerator.levelInfo')
      }
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 生成按钮
    html.find('#generate-feature').click(this._onGenerateFeature.bind(this));
    
    // 导入到世界按钮
    html.find('#import-feature').click(this._onImportFeature.bind(this));
    
    // 导出JSON按钮
    html.find('#export-json').click(this._onExportJson.bind(this));
    
    // 重新生成按钮
    html.find('#regenerate-feature').click(this._onRegenerateFeature.bind(this));

    // 等级变化时更新简单信息显示
    html.find('#feature-level').change(this._onLevelChange.bind(this));

    // 初始显示等级信息
    this._updateLevelDisplay(html);
  }

  /**
   * 生成特性
   */
  private async _onGenerateFeature(event: Event) {
    event.preventDefault();
    
    const html = $(event.currentTarget).closest('form');
    const prompt = html.find('#feature-prompt').val() as string;
    const level = parseInt(html.find('#feature-level').val() as string) || 1;
    const className = html.find('#class-name').val() as string;
    const enableCompendiumSearch = html.find('#enable-compendium-search').prop('checked') as boolean;

    if (!prompt.trim()) {
      ui.notifications.warn(game.i18n.localize('AIPF2E.FeatureGenerator.noPrompt'));
      return;
    }

    // 显示加载状态
    const generateBtn = html.find('#generate-feature');
    const originalText = generateBtn.text();
    generateBtn.prop('disabled', true).text(game.i18n.localize('AIPF2E.FeatureGenerator.generating'));

    try {
      ui.notifications.info(game.i18n.localize('AIPF2E.FeatureGenerator.generatingInfo'));
      
      // 设置集合包搜索功能
      this.featureService.setCompendiumSearchEnabled(enableCompendiumSearch);
      
      // 调用特性生成服务
      this.generatedFeature = await this.featureService.generateFeature(prompt, level, className);
      
      ui.notifications.info(game.i18n.localize('AIPF2E.FeatureGenerator.generateSuccess'));
      
      // 重新渲染界面以显示生成的特性
      this.render();
      
    } catch (error) {
      console.error('生成特性时出错:', error);
      ui.notifications.error(`${game.i18n.localize('AIPF2E.FeatureGenerator.generateFailed')}: ${error.message || error}`);
    } finally {
      generateBtn.prop('disabled', false).text(originalText);
    }
  }

  /**
   * 重新生成特性
   */
  private async _onRegenerateFeature(event: Event) {
    event.preventDefault();
    
    if (!this.generatedFeature) {
      ui.notifications.warn(game.i18n.format('AIPF2E.FeatureGenerator.noFeature', { action: game.i18n.localize('AIPF2E.FeatureGenerator.regenerate') }));
      return;
    }

    // 使用相同参数重新生成
    const html = $(event.currentTarget).closest('form');
    await this._onGenerateFeature(event);
  }

  /**
   * 导入特性到世界
   */
  private async _onImportFeature(event: Event) {
    event.preventDefault();
    
    if (!this.generatedFeature) {
      ui.notifications.warn(game.i18n.format('AIPF2E.FeatureGenerator.noFeature', { action: game.i18n.localize('AIPF2E.FeatureGenerator.import') }));
      return;
    }

    try {
      let item;
      
      // 方法1：使用CONFIG.Item.documentClass.create (推荐方法)
      if (CONFIG?.Item?.documentClass) {
        console.log('尝试使用CONFIG.Item.documentClass.create方法');
        item = await CONFIG.Item.documentClass.create(this.generatedFeature);
      }
      // 方法2：使用game.items.create
      else if (game.items && typeof game.items.create === 'function') {
        console.log('尝试使用game.items.create方法');
        item = await game.items.create(this.generatedFeature);
      }
      // 方法3：使用game.items.createDocuments
      else if (game.items && typeof game.items.createDocuments === 'function') {
        console.log('尝试使用game.items.createDocuments方法');
        const items = await game.items.createDocuments([this.generatedFeature]);
        item = items[0];
      }
      // 方法4：使用Item类构造器
      else if (typeof Item !== 'undefined' && Item.create) {
        console.log('尝试使用Item.create方法');
        item = await Item.create(this.generatedFeature);
      }
      // 方法5：通过collections访问
      else if (game.collections?.items?.documentClass) {
        console.log('尝试使用game.collections.items.documentClass.create方法');
        item = await game.collections.items.documentClass.create(this.generatedFeature);
      }
      else {
        throw new Error('无法找到合适的物品创建方法');
      }
      
      if (item) {
        ui.notifications.info(game.i18n.format('AIPF2E.FeatureGenerator.importSuccess', { name: this.generatedFeature.name }));
        console.log('成功创建的物品:', item);
        
        // 可选：打开物品表单
        if (item.sheet && typeof item.sheet.render === 'function') {
          item.sheet.render(true);
        }
      } else {
        throw new Error('物品创建失败，返回了空值');
      }
      
    } catch (error) {
      console.error('导入特性时出错:', error);
      console.log('调试信息:');
      console.log('- CONFIG.Item:', CONFIG?.Item);
      console.log('- CONFIG.Item.documentClass:', CONFIG?.Item?.documentClass);
      console.log('- game.items:', game.items);
      console.log('- game.items方法:', game.items ? Object.getOwnPropertyNames(game.items) : '不存在');
      console.log('- Item类:', typeof Item !== 'undefined' ? Item : '不存在');
      console.log('- game.collections.items:', game.collections?.items);
      
      ui.notifications.error(`${game.i18n.localize('AIPF2E.FeatureGenerator.importFailed')}: ${error.message}`);
      
      // 提供备用方案：显示JSON供用户手动导入
      this._showManualImportDialog();
    }
  }

  /**
   * 显示手动导入对话框
   */
  private _showManualImportDialog() {
    if (!this.generatedFeature) return;
    
    const jsonStr = JSON.stringify(this.generatedFeature, null, 2);
    const i18n = (key: string) => game.i18n.localize(`AIPF2E.FeatureGenerator.manualImport.${key}`);
    
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
   * 导出JSON
   */
  private _onExportJson(event: Event) {
    event.preventDefault();
    
    if (!this.generatedFeature) {
      ui.notifications.warn(game.i18n.format('AIPF2E.FeatureGenerator.noFeature', { action: game.i18n.localize('AIPF2E.FeatureGenerator.exportJson') }));
      return;
    }

    // 创建下载链接
    const dataStr = JSON.stringify(this.generatedFeature, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.generatedFeature.name.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    ui.notifications.info(game.i18n.localize('AIPF2E.FeatureGenerator.exportSuccess'));
  }



  /**
   * 等级变化处理
   */
  private _onLevelChange(event: Event) {
    const html = $(event.currentTarget).closest('form');
    this._updateLevelDisplay(html);
  }

  /**
   * 更新等级显示信息
   */
  private _updateLevelDisplay(html: any) {
    const level = parseInt(html.find('#feature-level').val() as string) || 1;
    
    const guidance = this.balanceService.generateBalanceGuidance(level, 'feature');
    let levelInfo = `<div class="balance-guidance">`;
    levelInfo += guidance.replace(/\n/g, '<br>').replace(/•/g, '&bull;');
    levelInfo += `</div>`;
    levelInfo += `<p><em>${game.i18n.localize('AIPF2E.FeatureGenerator.levelInfo')}</em></p>`;

    html.find('#level-info').html(levelInfo);
  }



  /**
   * 设置AI服务
   * 这个方法应该在应用初始化后由主模块调用
   */
  setAIService(aiService: any) {
    this.featureService = new FeatureGeneratorService(aiService, this.balanceService.getAllData());
  }
}