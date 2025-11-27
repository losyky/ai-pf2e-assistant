import { BalanceDataService, BalanceKeyword } from '../services/balance-data-service';

/**
 * 平衡关键词管理器
 */
export class BalanceKeywordsManager extends FormApplication {
  private balanceService: BalanceDataService;
  private keywords: BalanceKeyword[] = [];

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ai-pf2e-balance-keywords-manager",
      title: 'PF2e 平衡关键词管理',
      template: 'modules/ai-pf2e-assistant/templates/balance-keywords-manager.hbs',
      width: 800,
      height: 600,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'balance-keywords-manager'],
      dragDrop: [],
      tabs: [],
      filters: [],
      scrollY: []
    });
  }

  constructor(options = {}) {
    super(options);
    this.keywords = [];
  }

  getData() {
    return {
      keywords: this.keywords,
      keywordCount: this.keywords.length,
      categories: [
        { value: 'feat', label: '专长' },
        { value: 'feature', label: '特性' },
        { value: 'general', label: '通用' }
      ]
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 初始化服务
    if (!this.balanceService) {
      this.balanceService = new BalanceDataService();
      this.loadKeywords();
    }

    // 绑定事件
    html.find('#add-keyword-config').on('click', this._onAddKeywordConfig.bind(this));
    html.find('#import-keywords').on('click', this._onImportKeywords.bind(this));
    html.find('#export-keywords').on('click', this._onExportKeywords.bind(this));
    html.find('#reset-keywords').on('click', this._onResetKeywords.bind(this));
    html.find('#search-keywords').on('input', this._onSearchKeywords.bind(this));

    // 关键词配置操作
    html.find('.edit-keywords').on('click', this._onEditKeywords.bind(this));
    html.find('.delete-keywords').on('click', this._onDeleteKeywords.bind(this));

    // 初始化显示
    this.renderKeywordsList();
  }

  /**
   * 加载关键词配置
   */
  private loadKeywords(): void {
    try {
      this.keywords = this.balanceService.getAllKeywords() || [];
    } catch (error) {
      console.error('加载关键词配置失败:', error);
      this.keywords = [];
    }
  }

  /**
   * 添加新的关键词配置
   */
  private async _onAddKeywordConfig(event: Event) {
    event.preventDefault();
    
    const content = `
      <div class="keyword-config-form">
        <div class="form-group">
          <label for="keyword-level">等级</label>
          <input type="number" id="keyword-level" min="0" max="20" value="1">
        </div>
        
        <div class="form-group">
          <label for="keyword-category">类别</label>
          <select id="keyword-category">
            <option value="feat">专长</option>
            <option value="feature">特性</option>
            <option value="general">通用</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="keyword-list">关键词（每行一个）</label>
          <textarea id="keyword-list" rows="6" placeholder="例如：&#10;基础加值+1到+2&#10;简单的条件触发&#10;每日1次的小型能力"></textarea>
        </div>
      </div>
    `;

    new Dialog({
      title: '添加关键词配置',
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: '保存',
          callback: async (html: any) => {
            const level = parseInt(html.find('#keyword-level').val());
            const category = html.find('#keyword-category').val();
            const keywordText = html.find('#keyword-list').val();
            
            if (isNaN(level) || !category || !keywordText.trim()) {
              ui.notifications.warn('请填写所有必需字段');
              return;
            }
            
            const keywords = keywordText.split('\n')
              .map((k: string) => k.trim())
              .filter((k: string) => k.length > 0);
            
            if (keywords.length === 0) {
              ui.notifications.warn('请至少添加一个关键词');
              return;
            }
            
            this.balanceService.setKeywords(level, category, keywords);
            await this.balanceService.saveBalanceKeywords();
            
            this.loadKeywords();
            this.renderKeywordsList();
            
            ui.notifications.info('关键词配置已保存');
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: '取消'
        }
      },
      default: 'save',
      width: 500
    }).render(true);
  }

  /**
   * 编辑关键词配置
   */
  private async _onEditKeywords(event: Event) {
    event.preventDefault();
    
    const configElement = $(event.currentTarget).closest('.keyword-config');
    const level = parseInt(configElement.data('level'));
    const category = configElement.data('category');
    
    const config = this.keywords.find(k => k.level === level && k.category === category);
    if (!config) return;
    
    const content = `
      <div class="keyword-config-form">
        <div class="form-group">
          <label for="keyword-level">等级</label>
          <input type="number" id="keyword-level" min="0" max="20" value="${config.level}">
        </div>
        
        <div class="form-group">
          <label for="keyword-category">类别</label>
          <select id="keyword-category">
            <option value="feat" ${config.category === 'feat' ? 'selected' : ''}>专长</option>
            <option value="feature" ${config.category === 'feature' ? 'selected' : ''}>特性</option>
            <option value="general" ${config.category === 'general' ? 'selected' : ''}>通用</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="keyword-list">关键词（每行一个）</label>
          <textarea id="keyword-list" rows="6">${config.keywords.join('\n')}</textarea>
        </div>
      </div>
    `;

    new Dialog({
      title: '编辑关键词配置',
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: '保存',
          callback: async (html: any) => {
            const newLevel = parseInt(html.find('#keyword-level').val());
            const newCategory = html.find('#keyword-category').val();
            const keywordText = html.find('#keyword-list').val();
            
            if (isNaN(newLevel) || !newCategory || !keywordText.trim()) {
              ui.notifications.warn('请填写所有必需字段');
              return;
            }
            
            const keywords = keywordText.split('\n')
              .map((k: string) => k.trim())
              .filter((k: string) => k.length > 0);
            
            if (keywords.length === 0) {
              ui.notifications.warn('请至少添加一个关键词');
              return;
            }
            
            // 如果等级或类别改变了，删除旧配置
            if (newLevel !== config.level || newCategory !== config.category) {
              this.balanceService.removeKeywords(config.level, config.category);
            }
            
            this.balanceService.setKeywords(newLevel, newCategory, keywords);
            await this.balanceService.saveBalanceKeywords();
            
            this.loadKeywords();
            this.renderKeywordsList();
            
            ui.notifications.info('关键词配置已更新');
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: '取消'
        }
      },
      default: 'save',
      width: 500
    }).render(true);
  }

  /**
   * 删除关键词配置
   */
  private async _onDeleteKeywords(event: Event) {
    event.preventDefault();
    
    const configElement = $(event.currentTarget).closest('.keyword-config');
    const level = parseInt(configElement.data('level'));
    const category = configElement.data('category');
    
    const confirmed = await Dialog.confirm({
      title: '确认删除',
      content: `<p>确定要删除 ${level}级${this.getCategoryDisplayName(category)} 的关键词配置吗？</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    
    if (confirmed) {
      this.balanceService.removeKeywords(level, category);
      await this.balanceService.saveBalanceKeywords();
      
      this.loadKeywords();
      this.renderKeywordsList();
      
      ui.notifications.info('关键词配置已删除');
    }
  }

  /**
   * 导入关键词配置
   */
  private _onImportKeywords(event: Event) {
    event.preventDefault();
    
    const content = `
      <div class="import-form">
        <p>请粘贴JSON格式的关键词配置：</p>
        <textarea id="import-data" rows="10" placeholder="粘贴JSON数据..."></textarea>
        <p><small>导入将替换所有现有配置</small></p>
      </div>
    `;

    new Dialog({
      title: '导入关键词配置',
      content: content,
      buttons: {
        import: {
          icon: '<i class="fas fa-upload"></i>',
          label: '导入',
          callback: async (html: any) => {
            try {
              const jsonData = html.find('#import-data').val();
              if (!jsonData.trim()) {
                ui.notifications.warn('请粘贴JSON数据');
                return;
              }
              
              this.balanceService.importFromJson(jsonData);
              await this.balanceService.saveBalanceKeywords();
              
              this.loadKeywords();
              this.renderKeywordsList();
              
              ui.notifications.info('关键词配置已导入');
            } catch (error) {
              ui.notifications.error(`导入失败: ${error.message}`);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: '取消'
        }
      },
      default: 'import',
      width: 600
    }).render(true);
  }

  /**
   * 导出关键词配置
   */
  private _onExportKeywords(event: Event) {
    event.preventDefault();
    
    const jsonData = this.balanceService.exportToJson();
    
    // 创建下载链接
    const dataBlob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pf2e-balance-keywords.json';
    link.click();
    
    URL.revokeObjectURL(url);
    ui.notifications.info('关键词配置已导出');
  }

  /**
   * 重置为默认配置
   */
  private async _onResetKeywords(event: Event) {
    event.preventDefault();
    
    const confirmed = await Dialog.confirm({
      title: '确认重置',
      content: '<p>确定要重置为默认的关键词配置吗？这将删除所有自定义配置。</p>',
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    
    if (confirmed) {
      this.balanceService.resetToDefaults();
      await this.balanceService.saveBalanceKeywords();
      
      this.loadKeywords();
      this.renderKeywordsList();
      
      ui.notifications.info('已重置为默认配置');
    }
  }

  /**
   * 搜索关键词
   */
  private _onSearchKeywords(event: Event) {
    const searchText = (event.target as HTMLInputElement).value.toLowerCase();
    this.filterKeywords(searchText);
  }

  /**
   * 过滤关键词显示
   */
  private filterKeywords(searchText: string): void {
    const rows = this.element.find('.keyword-config');
    
    rows.each((index: number, row: HTMLElement) => {
      const $row = $(row);
      const text = $row.text().toLowerCase();
      
      if (searchText === '' || text.includes(searchText)) {
        $row.show();
      } else {
        $row.hide();
      }
    });
  }

  /**
   * 渲染关键词列表
   */
  private renderKeywordsList(): void {
    if (!this.element || this.element.length === 0) return;
    
    const container = this.element.find('.keywords-list-wrapper');
    if (container.length === 0) return;
    
    console.log('渲染关键词列表，共', this.keywords.length, '个配置');
    
    // 更新计数
    this.element.find('.keyword-count').text(this.keywords.length.toString());
    
    if (this.keywords.length > 0) {
      let html = `
        <table class="keywords-table">
          <thead>
            <tr>
              <th>等级</th>
              <th>类别</th>
              <th>关键词</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody class="keywords-list">
            ${this.keywords.map(config => `
              <tr class="keyword-config" data-level="${config.level}" data-category="${config.category}">
                <td>${config.level === 0 ? '通用' : config.level + '级'}</td>
                <td>${this.getCategoryDisplayName(config.category)}</td>
                <td class="keywords-preview">
                  ${config.keywords.slice(0, 3).join(', ')}
                  ${config.keywords.length > 3 ? `... (+${config.keywords.length - 3}个)` : ''}
                </td>
                <td class="actions">
                  <button type="button" class="edit-keywords" title="编辑">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button type="button" class="delete-keywords" title="删除">
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      
      container.html(html);
      
      // 重新绑定事件
      container.find('.edit-keywords').on('click', this._onEditKeywords.bind(this));
      container.find('.delete-keywords').on('click', this._onDeleteKeywords.bind(this));
    } else {
      container.html('<p class="no-keywords">暂无关键词配置</p>');
    }
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
}

export const balanceKeywordsManager = new BalanceKeywordsManager({});