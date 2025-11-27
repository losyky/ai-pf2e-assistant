import { FragmentGeneratorService, FragmentData } from '../services/fragment-generator-service';
import { BalanceDataService } from '../services/balance-data-service';

/**
 * 词条碎片生成器应用程序
 * 专供GM使用的工具，用于创建包含隐藏AI提示词的词条碎片物品
 */
export class FragmentGeneratorApp extends Application {
  private fragmentService?: FragmentGeneratorService;
  private balanceService: BalanceDataService;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'fragment-generator-app',
      title: (game as any).i18n.localize('AIPF2E.FragmentGenerator.title'),
      template: 'modules/ai-pf2e-assistant/templates/fragment-generator-app.hbs',
      width: 700,
      height: 600,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'fragment-generator-app']
    });
  }

  constructor(options = {}) {
    super(options);
    this.balanceService = new BalanceDataService();
  }

  /**
   * 设置AI服务实例
   */
  setAIService(aiService: any) {
    this.fragmentService = new FragmentGeneratorService(aiService);
  }

  getData() {
    const g = (game as any).i18n;
    return {
      isGM: game.user?.isGM,
      rarityOptions: [
        { value: 'common', label: g.localize('AIPF2E.FragmentGenerator.rarities.common') },
        { value: 'uncommon', label: g.localize('AIPF2E.FragmentGenerator.rarities.uncommon') },
        { value: 'rare', label: g.localize('AIPF2E.FragmentGenerator.rarities.rare') },
        { value: 'unique', label: g.localize('AIPF2E.FragmentGenerator.rarities.unique') }
      ],
      i18n: {
        gmOnly: g.localize('AIPF2E.FragmentGenerator.gmOnly'),
        singleFragment: g.localize('AIPF2E.FragmentGenerator.singleFragment'),
        fragmentSet: g.localize('AIPF2E.FragmentGenerator.fragmentSet'),
        createSingle: g.localize('AIPF2E.FragmentGenerator.createSingle'),
        createSingleDescription: g.localize('AIPF2E.FragmentGenerator.createSingleDescription'),
        generateSetDescription: g.localize('AIPF2E.FragmentGenerator.generateSetDescription'),
        requirement: g.localize('AIPF2E.FragmentGenerator.requirement'),
        requirementPlaceholder: g.localize('AIPF2E.FragmentGenerator.requirementPlaceholder'),
        requirementHint: g.localize('AIPF2E.FragmentGenerator.requirementHint'),
        rarity: g.localize('AIPF2E.FragmentGenerator.rarity'),
        rarityHint: g.localize('AIPF2E.FragmentGenerator.rarityHint'),
        generateSingle: g.localize('AIPF2E.FragmentGenerator.generateSingle'),
        theme: g.localize('AIPF2E.FragmentGenerator.theme'),
        themePlaceholder: g.localize('AIPF2E.FragmentGenerator.themePlaceholder'),
        fragmentCount: g.localize('AIPF2E.FragmentGenerator.fragmentCount'),
        generateSet: g.localize('AIPF2E.FragmentGenerator.generateSet'),
        usageInstructions: g.localize('AIPF2E.FragmentGenerator.usageInstructions'),
        roleDescription: g.localize('AIPF2E.FragmentGenerator.roleDescription'),
        rolePoint1: g.localize('AIPF2E.FragmentGenerator.rolePoint1'),
        rolePoint2: g.localize('AIPF2E.FragmentGenerator.rolePoint2'),
        rolePoint3: g.localize('AIPF2E.FragmentGenerator.rolePoint3')
      }
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 注入样式
    this._injectStyles();

    // 绑定标签页切换事件
    html.find('.tabs .item').on('click', this._onTabClick.bind(this));

    // 绑定事件
    html.find('#generate-single-fragment').on('click', this._onGenerateSingleFragment.bind(this));
    html.find('#generate-fragment-set').on('click', this._onGenerateFragmentSet.bind(this));
    html.find('#fragment-count').on('change', this._onFragmentCountChange.bind(this));
  }

  /**
   * 注入样式
   */
  private _injectStyles() {
    const styleId = 'ai-pf2e-fragment-generator-styles';
    
    // 检查是否已经注入过样式
    if (document.getElementById(styleId)) return;
    
    // 创建样式元素
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Scoped styles for fragment-generator-app ONLY */
      .fragment-generator-app {
        font-family: 'Signika', sans-serif;
      }
      
      .fragment-generator-app .ai-pf2e-assistant-container {
        padding: 20px;
      }
      
      .fragment-generator-app .tabs {
        display: flex;
        border-bottom: 2px solid #ddd;
        margin-bottom: 20px;
      }
      
      .fragment-generator-app .tabs .item {
        padding: 10px 20px;
        cursor: pointer;
        border: 1px solid transparent;
        border-bottom: none;
        background: #f0f0f0;
        margin-right: 5px;
        border-radius: 4px 4px 0 0;
        transition: background 0.3s;
      }
      
      .fragment-generator-app .tabs .item:hover {
        background: #e0e0e0;
      }
      
      .fragment-generator-app .tabs .item.active {
        background: white;
        border-color: #ddd;
        border-bottom-color: white;
        font-weight: bold;
        position: relative;
        bottom: -2px;
      }
      
      .fragment-generator-app .tab {
        display: none;
      }
      
      .fragment-generator-app .tab.active {
        display: block;
      }
      
      .fragment-generator-app .tab-panel {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 20px;
        background: #f9f9f9;
        margin-bottom: 20px;
      }
      
      .fragment-generator-app .tab-panel h3 {
        margin-top: 0;
        color: #2c3e50;
        border-bottom: 2px solid #9b59b6;
        padding-bottom: 10px;
      }
      
      .fragment-generator-app h4 {
        color: #2c3e50;
        margin-top: 15px;
        margin-bottom: 10px;
        font-size: 1.1em;
      }
      
      .fragment-generator-app .form-group {
        margin-bottom: 15px;
      }
      
      .fragment-generator-app .form-group label {
        display: block;
        font-weight: bold;
        margin-bottom: 5px;
        color: #2c3e50;
      }
      
      .fragment-generator-app .form-group input[type="text"],
      .fragment-generator-app .form-group input[type="number"],
      .fragment-generator-app .form-group select,
      .fragment-generator-app .form-group textarea {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: inherit;
        box-sizing: border-box;
        line-height: 1.5;
        min-height: 34px;
      }
      
      .fragment-generator-app .form-group select {
        height: auto;
        min-height: 34px;
      }
      
      .fragment-generator-app .form-group textarea {
        resize: vertical;
        min-height: 100px;
      }
      
      .fragment-generator-app .form-group .hint {
        font-size: 0.9em;
        color: #666;
        margin: 5px 0;
        font-style: italic;
      }
      
      .fragment-generator-app .count-selector {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .fragment-generator-app .count-selector input {
        width: 80px;
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      
      .fragment-generator-app button,
      .fragment-generator-app .form-group button {
        padding: 10px 20px;
        background: #9b59b6;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background 0.3s;
      }
      
      .fragment-generator-app button:hover:not(:disabled),
      .fragment-generator-app .form-group button:hover:not(:disabled) {
        background: #8e44ad;
      }
      
      .fragment-generator-app button:disabled,
      .fragment-generator-app .form-group button:disabled {
        background: #bdc3c7;
        cursor: not-allowed;
      }
      
      .fragment-generator-app .form-group.buttons {
        display: flex;
        gap: 10px;
      }
      
      .fragment-generator-app .fragment-preview {
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 15px;
        background: white;
        margin-top: 15px;
      }
      
      .fragment-generator-app .fragment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 2px solid #9b59b6;
      }
      
      .fragment-generator-app .fragment-header h3 {
        margin: 0;
        color: #2c3e50;
        border: none;
        padding: 0;
      }
      
      .fragment-generator-app .fragment-rarity {
        background: #9b59b6;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8em;
      }
      
      .fragment-generator-app .fragment-details p {
        margin: 8px 0;
        font-size: 0.9em;
      }
      
      .fragment-generator-app .usage-info {
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        border-radius: 4px;
        padding: 15px;
        margin-top: 20px;
      }
      
      .fragment-generator-app .usage-info h4 {
        margin-top: 0;
        margin-bottom: 10px;
        color: #856404;
      }
      
      .fragment-generator-app .usage-info ul {
        margin: 5px 0;
        padding-left: 20px;
      }
      
      .fragment-generator-app .usage-info li {
        margin: 3px 0;
        font-size: 0.9em;
      }
      
      .fragment-generator-app .form-actions {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }
    `;
    
    // 添加到文档头部
    document.head.appendChild(style);
  }

  /**
   * 标签页切换事件
   */
  private _onTabClick(event: Event) {
    event.preventDefault();
    
    const clickedTab = $(event.currentTarget);
    const targetTab = clickedTab.data('tab');
    const html = $(this.element);
    
    // 移除所有活动状态
    html.find('.tabs .item').removeClass('active');
    html.find('.tab').removeClass('active');
    
    // 激活当前标签
    clickedTab.addClass('active');
    html.find(`[data-tab="${targetTab}"]`).addClass('active');
  }

  /**
   * 生成单个碎片
   */
  private async _onGenerateSingleFragment(event: Event) {
    event.preventDefault();
    
    if (!this.fragmentService) {
      ui.notifications.error((game as any).i18n.localize('AIPF2E.FragmentGenerator.noService'));
      return;
    }

    const html = $(event.currentTarget).closest('form');
    const formData = new FormData(html[0] as HTMLFormElement);
    
    const requirement = formData.get('fragment-requirement') as string;
    const rarity = formData.get('fragment-rarity') as string;

    if (!requirement?.trim()) {
      ui.notifications.warn((game as any).i18n.localize('AIPF2E.FragmentGenerator.noRequirement'));
      return;
    }

    try {
      const g = (game as any).i18n;
      html.find('#generate-single-fragment').prop('disabled', true).text(g.localize('AIPF2E.FragmentGenerator.generating'));

      // 使用AI生成碎片概念
      const fragmentIdea = await this.fragmentService.generateFragmentIdea(requirement.trim(), rarity as any);
      
      // 显示预览并让用户确认
      this._showFragmentPreview(fragmentIdea, rarity as any, html);
      
    } catch (error) {
      console.error('碎片生成失败:', error);
      const g = (game as any).i18n;
      ui.notifications.error(`${g.localize('AIPF2E.FragmentGenerator.generateFailed')}: ${error.message}`);
    } finally {
      html.find('#generate-single-fragment').prop('disabled', false).text((game as any).i18n.localize('AIPF2E.FragmentGenerator.generateSingle'));
    }
  }

  /**
   * 生成碎片集合
   */
  private async _onGenerateFragmentSet(event: Event) {
    event.preventDefault();
    
    if (!this.fragmentService) {
      ui.notifications.error((game as any).i18n.localize('AIPF2E.FragmentGenerator.noService'));
      return;
    }

    const html = $(event.currentTarget).closest('form');
    const formData = new FormData(html[0] as HTMLFormElement);
    
    const theme = formData.get('fragment-theme') as string;
    const count = parseInt(formData.get('fragment-count') as string) || 3;

    if (!theme?.trim()) {
      ui.notifications.warn((game as any).i18n.localize('AIPF2E.FragmentGenerator.noTheme'));
      return;
    }

    try {
      const g = (game as any).i18n;
      html.find('#generate-fragment-set').prop('disabled', true).text(g.localize('AIPF2E.FragmentGenerator.generating'));

      const fragments = await this.fragmentService.generateFragmentSet(theme.trim(), count);
      
      // 显示碎片集合预览
      this._showFragmentSetPreview(fragments, theme.trim(), html);
      
    } catch (error) {
      console.error('碎片集合生成失败:', error);
      const g = (game as any).i18n;
      ui.notifications.error(`${g.localize('AIPF2E.FragmentGenerator.generateSetFailed')}: ${error.message}`);
    } finally {
      html.find('#generate-fragment-set').prop('disabled', false).text((game as any).i18n.localize('AIPF2E.FragmentGenerator.generateSet'));
    }
  }



  /**
   * 碎片数量改变事件
   */
  private _onFragmentCountChange(event: Event) {
    const count = parseInt((event.target as HTMLInputElement).value);
    const html = $(this.element);
    html.find('#fragment-count-display').text(count);
  }

  /**
   * 显示碎片预览并等待确认
   */
  private _showFragmentPreview(fragmentData: FragmentData, rarity: string, html: any) {
    const i18n = (key: string) => (game as any).i18n.localize(`AIPF2E.FragmentGenerator.preview.${key}`);
    const dialogContent = `
      <div class="fragment-preview">
        <h3>${i18n('title')}</h3>
        <div class="preview-content">
          <div class="preview-field">
            <label>${i18n('name')}:</label>
            <div class="preview-value">${fragmentData.name}</div>
          </div>
          
          <div class="preview-field">
            <label>${i18n('rarity')}:</label>
            <div class="preview-value rarity-${rarity}">${this._getRarityDisplayName(rarity)}</div>
          </div>
          
          <div class="preview-field">
            <label>${i18n('description')}:</label>
            <div class="preview-value description">${fragmentData.description}</div>
          </div>
          
          <div class="preview-field">
            <label>${i18n('hiddenPrompt')}:</label>
            <div class="preview-value hidden-prompt">${fragmentData.hiddenPrompt}</div>
          </div>
        </div>
      </div>
      
      <style>
        .fragment-preview {
          padding: 15px;
          max-width: 600px;
        }
        
        .preview-field {
          margin-bottom: 15px;
        }
        
        .preview-field label {
          display: block;
          font-weight: bold;
          margin-bottom: 5px;
          color: #495057;
        }
        
        .preview-value {
          padding: 8px;
          background: #f8f9fa;
          border: 1px solid #ddd;
          border-radius: 3px;
          min-height: 20px;
        }
        
        .preview-value.description {
          font-style: italic;
          color: #6c757d;
        }
        
        .preview-value.hidden-prompt {
          background: #fff3cd;
          border-color: #ffc107;
          font-family: monospace;
          font-size: 0.9em;
        }
        
        .rarity-common { color: #6c757d; }
        .rarity-uncommon { color: #28a745; }
        .rarity-rare { color: #007bff; }
        .rarity-unique { color: #6f42c1; }
      </style>
    `;

    const dialog = new Dialog({
      title: i18n('title'),
      content: dialogContent,
      buttons: {
        confirm: {
          label: i18n('confirm'),
          icon: '<i class="fas fa-check"></i>',
          callback: async () => {
            try {
              // 生成碎片物品数据
              const fragment = await this.fragmentService!.generateFragment(fragmentData);
              
              // 直接创建到世界中
              const createdItem = await Item.create(fragment);
              
              // 清空表单
              html.find('#fragment-requirement').val('');
              
              ui.notifications.info((game as any).i18n.format('AIPF2E.FragmentGenerator.createSuccess', { name: fragment.name }));
              console.log('成功创建碎片物品:', createdItem);
              
            } catch (error) {
              console.error('碎片创建失败:', error);
              ui.notifications.error(`${(game as any).i18n.localize('AIPF2E.FragmentGenerator.createFailed')}: ${error.message}`);
            }
          }
        },
        regenerate: {
          label: i18n('regenerate'),
          icon: '<i class="fas fa-redo"></i>',
          callback: () => {
            dialog.close();
            // 重新触发生成
            const event = new Event('click');
            this._onGenerateSingleFragment(event);
          }
        },
        cancel: {
          label: i18n('cancel'),
          icon: '<i class="fas fa-times"></i>',
          callback: () => {}
        }
      },
      default: "confirm"
    });
    
    dialog.render(true);
  }

  /**
   * 显示碎片集合预览并等待确认
   */
  private _showFragmentSetPreview(fragments: any[], theme: string, html: any) {
    const i18n = (key: string) => (game as any).i18n.localize(`AIPF2E.FragmentGenerator.preview.${key}`);
    let previewContent = `
      <div class="fragment-set-preview">
        <h3>${i18n('setTitle')}</h3>
        <p>${i18n('theme')}: <strong>${theme}</strong> | ${i18n('count')}: <strong>${fragments.length}</strong>${i18n('countSuffix')}</p>
        <div class="fragments-preview">
    `;

    fragments.forEach((fragment, index) => {
      const rarity = fragment.system?.traits?.rarity || 'common';
      previewContent += `
        <div class="fragment-preview-item">
          <div class="fragment-preview-header">
            <h4>${fragment.name}</h4>
            <span class="rarity-badge rarity-${rarity}">${this._getRarityDisplayName(rarity)}</span>
          </div>
          <div class="fragment-preview-description">
            ${this._extractVisibleDescription(fragment)}
          </div>
          <div class="fragment-preview-prompt">
            <strong>${i18n('aiPrompt')}:</strong>
            <div class="prompt-content">${fragment.flags['ai-pf2e-assistant'].hiddenPrompt}</div>
          </div>
        </div>
      `;
    });

    previewContent += `
        </div>
      </div>
      
      <style>
        .fragment-set-preview {
          padding: 15px;
          max-width: 800px;
          max-height: 600px;
          overflow-y: auto;
        }
        
        .fragments-preview {
          margin-top: 15px;
        }
        
        .fragment-preview-item {
          background: #f8f9fa;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 12px;
          margin-bottom: 12px;
        }
        
        .fragment-preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .fragment-preview-header h4 {
          margin: 0;
          color: #495057;
        }
        
        .rarity-badge {
          padding: 3px 8px;
          border-radius: 3px;
          font-size: 0.8em;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .fragment-preview-description {
          font-style: italic;
          color: #6c757d;
          margin-bottom: 8px;
          padding: 8px;
          background: white;
          border-radius: 3px;
        }
        
        .fragment-preview-prompt {
          margin-top: 8px;
        }
        
        .prompt-content {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 3px;
          padding: 8px;
          font-family: monospace;
          font-size: 0.9em;
          margin-top: 5px;
        }
      </style>
    `;

    const dialog = new Dialog({
      title: i18n('setTitle'),
      content: previewContent,
      buttons: {
        confirm: {
          label: i18n('confirmSet'),
          icon: '<i class="fas fa-check"></i>',
          callback: async () => {
            try {
              const createdItems = [];
              for (const fragment of fragments) {
                const createdItem = await Item.create(fragment);
                createdItems.push(createdItem);
              }
              
              // 清空主题输入
              html.find('#fragment-theme').val('');
              
              ui.notifications.info((game as any).i18n.format('AIPF2E.FragmentGenerator.createSetSuccess', { count: createdItems.length }));
              console.log('成功创建碎片集合:', createdItems);
              
            } catch (error) {
              console.error('碎片集合创建失败:', error);
              ui.notifications.error(`${(game as any).i18n.localize('AIPF2E.FragmentGenerator.createSetFailed')}: ${error.message}`);
            }
          }
        },
        regenerate: {
          label: i18n('regenerate'),
          icon: '<i class="fas fa-redo"></i>',
          callback: () => {
            dialog.close();
            // 重新触发生成
            const event = new Event('click');
            this._onGenerateFragmentSet(event);
          }
        },
        cancel: {
          label: i18n('cancel'),
          icon: '<i class="fas fa-times"></i>',
          callback: () => {}
        }
      },
      default: "confirm"
    });
    
    dialog.render(true);
  }



  /**
   * 获取稀有度显示名称
   */
  private _getRarityDisplayName(rarity: string): string {
    const g = (game as any).i18n;
    const rarityKey = `AIPF2E.FragmentGenerator.rarities.${rarity}`;
    return g.localize(rarityKey);
  }

  /**
   * 从碎片物品中提取可见描述
   */
  private _extractVisibleDescription(fragment: any): string {
    const descriptionHtml = fragment.system?.description?.value || '';
    // 提取第一个<p>标签的内容作为可见描述
    const match = descriptionHtml.match(/<p[^>]*>(.*?)<\/p>/i);
    if (match) {
      return match[1];
    }
    return (game as any).i18n.localize('AIPF2E.FragmentGenerator.preview.noDescription');
  }
}
