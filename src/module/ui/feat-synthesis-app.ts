import { FeatSynthesisService, SynthesisMaterial, SynthesisConfig, SynthesisResult } from '../services/feat-synthesis-service';
import { BalanceDataService } from '../services/balance-data-service';

/**
 * 专长合成器应用程序
 * 允许玩家使用词条碎片和其他材料合成新的专长
 */
export class FeatSynthesisApp extends Application {
  private synthesisService?: FeatSynthesisService;
  private balanceService: BalanceDataService;
  private selectedMaterials: SynthesisMaterial[] = [];
  private actorData: any = null;
  private lastSynthesisResult: SynthesisResult | null = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'feat-synthesis-app',
      title: 'PF2e 专长合成器',
      template: 'modules/ai-pf2e-assistant/templates/feat-synthesis-app.hbs',
      width: 800,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'feat-synthesis-app'],
      dragDrop: [{ dragSelector: '.item-list .item', dropSelector: '.synthesis-area' }]
    });
  }

  constructor(actor?: any, options = {}) {
    super(options);
    this.balanceService = new BalanceDataService();
    
    if (actor) {
      this.actorData = {
        id: actor.id,
        name: actor.name,
        level: actor.system?.details?.level?.value || 1,
        class: actor.system?.details?.class?.value || actor.class?.name,
        ancestry: actor.system?.details?.ancestry?.value || actor.ancestry?.name
      };
    }
  }

  /**
   * 设置AI服务实例
   */
  setAIService(aiService: any) {
    this.synthesisService = new FeatSynthesisService(aiService, this.balanceService.getAllData());
  }

  getData() {
    const availableItems = this.getAvailableItems();
    const compatibility = this.selectedMaterials.length > 0 
      ? this.synthesisService?.validateMaterialCompatibility(this.selectedMaterials)
      : null;

    return {
      actor: this.actorData,
      availableItems,
      selectedMaterials: this.selectedMaterials,
      compatibility,
      levelOptions: Array.from({length: 20}, (_, i) => ({ value: i + 1, label: `${i + 1}级` })),
      categoryOptions: [
        { value: 'general', label: '通用专长' },
        { value: 'skill', label: '技能专长' },
        { value: 'ancestry', label: '族裔专长' },
        { value: 'class', label: '职业专长' },
        { value: 'bonus', label: '额外专长' }
      ],
      lastSynthesisResult: this.lastSynthesisResult
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 绑定事件
    html.find('#synthesize-feat').on('click', this._onSynthesizeFeat.bind(this));
    html.find('#clear-materials').on('click', this._onClearMaterials.bind(this));
    html.find('#import-synthesized-feat').on('click', this._onImportSynthesizedFeat.bind(this));
    html.find('.remove-material').on('click', this._onRemoveMaterial.bind(this));
    html.find('.add-material').on('click', this._onAddMaterial.bind(this));
    html.find('#synthesis-level').on('change', this._onLevelChange.bind(this));
    html.find('#synthesis-category').on('change', this._onCategoryChange.bind(this));

    // 初始化界面
    this._updateSynthesisArea(html);
    this._updateCompatibilityDisplay(html);
  }

  /**
   * 获取可用的物品（包括碎片和其他物品）
   */
  private getAvailableItems(): any[] {
    const items: any[] = [];

    // 如果有角色，获取角色的物品
    if (this.actorData) {
      const actor = game.actors?.get(this.actorData.id);
      if (actor) {
        items.push(...actor.items.filter((item: any) => 
          item.type === 'equipment' || 
          item.flags?.['ai-pf2e-assistant']?.fragmentType === 'feat-fragment'
        ));
      }
    }

    // 获取世界中的碎片物品
    const worldItems = game.items?.filter((item: any) => 
      item.flags?.['ai-pf2e-assistant']?.fragmentType === 'feat-fragment'
    ) || [];
    
    items.push(...worldItems);

    // 去重并排序
    const uniqueItems = items.filter((item, index, array) => 
      array.findIndex(i => i.id === item.id) === index
    );

    return uniqueItems.sort((a, b) => {
      // 碎片优先
      const aIsFragment = a.flags?.['ai-pf2e-assistant']?.fragmentType === 'feat-fragment';
      const bIsFragment = b.flags?.['ai-pf2e-assistant']?.fragmentType === 'feat-fragment';
      
      if (aIsFragment && !bIsFragment) return -1;
      if (!aIsFragment && bIsFragment) return 1;
      
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * 合成专长
   */
  private async _onSynthesizeFeat(event: Event) {
    event.preventDefault();
    
    if (!this.synthesisService) {
      ui.notifications.error('AI服务未初始化');
      return;
    }

    if (this.selectedMaterials.length === 0) {
      ui.notifications.warn('请选择至少一个合成材料');
      return;
    }

    const html = $(event.currentTarget).closest('form');
    const formData = new FormData(html[0] as HTMLFormElement);
    
    const level = parseInt(formData.get('synthesis-level') as string) || 1;
    const category = formData.get('synthesis-category') as string || 'general';
    const className = formData.get('class-name') as string || '';

    // 验证材料兼容性
    const compatibility = this.synthesisService.validateMaterialCompatibility(this.selectedMaterials);
    if (!compatibility.isCompatible) {
      const proceed = await Dialog.confirm({
        title: '兼容性警告',
        content: `<p>检测到以下问题：</p><ul>${compatibility.warnings.map(w => `<li>${w}</li>`).join('')}</ul><p>是否继续合成？</p>`
      });
      
      if (!proceed) return;
    }

    try {
      html.find('#synthesize-feat').prop('disabled', true).text('合成中...');
      html.find('#synthesis-output').html('<p class="synthesis-progress">正在进行神秘的合成仪式，请稍候...</p>');

      const config: SynthesisConfig = {
        level,
        category: category as any,
        className: className || undefined,
        actorData: this.actorData
      };

      this.lastSynthesisResult = await this.synthesisService.synthesizeFeat(this.selectedMaterials, config);
      
      this._displaySynthesisResult(html);
      ui.notifications.info('专长合成完成！');
      
    } catch (error) {
      console.error('专长合成失败:', error);
      ui.notifications.error(`专长合成失败: ${error.message}`);
      html.find('#synthesis-output').html(`<p class="error">合成失败: ${error.message}</p>`);
    } finally {
      html.find('#synthesize-feat').prop('disabled', false).text('开始合成');
    }
  }

  /**
   * 清空合成材料
   */
  private _onClearMaterials(event: Event) {
    event.preventDefault();
    
    this.selectedMaterials = [];
    this._updateSynthesisArea($(this.element));
    this._updateCompatibilityDisplay($(this.element));
    ui.notifications.info('已清空合成材料');
  }

  /**
   * 导入合成的专长
   */
  private async _onImportSynthesizedFeat(event: Event) {
    event.preventDefault();
    
    if (!this.lastSynthesisResult) {
      ui.notifications.error('没有可导入的专长');
      return;
    }

    try {
      if (this.actorData) {
        // 导入到角色
        const actor = game.actors?.get(this.actorData.id);
        if (actor) {
          await actor.createEmbeddedDocuments('Item', [this.lastSynthesisResult.feat]);
          ui.notifications.info(`专长 "${this.lastSynthesisResult.feat.name}" 已添加到角色 ${this.actorData.name}`);
        } else {
          throw new Error('找不到目标角色');
        }
      } else {
        // 导入到世界
        await Item.create(this.lastSynthesisResult.feat);
        ui.notifications.info(`专长 "${this.lastSynthesisResult.feat.name}" 已创建到世界中`);
      }
      
      // 清空合成材料和结果
      this.selectedMaterials = [];
      this.lastSynthesisResult = null;
      this._updateSynthesisArea($(this.element));
      this._updateCompatibilityDisplay($(this.element));
      
    } catch (error) {
      console.error('导入专长失败:', error);
      ui.notifications.error(`导入专长失败: ${error.message}`);
    }
  }

  /**
   * 移除合成材料
   */
  private _onRemoveMaterial(event: Event) {
    event.preventDefault();
    
    const materialId = $(event.currentTarget).data('material-id');
    this.selectedMaterials = this.selectedMaterials.filter(m => m.id !== materialId);
    
    this._updateSynthesisArea($(this.element));
    this._updateCompatibilityDisplay($(this.element));
  }

  /**
   * 添加合成材料
   */
  private _onAddMaterial(event: Event) {
    event.preventDefault();
    
    const itemId = $(event.currentTarget).data('item-id');
    const availableItems = this.getAvailableItems();
    const item = availableItems.find(i => i.id === itemId);
    
    if (!item) {
      ui.notifications.error('找不到指定的物品');
      return;
    }

    // 检查是否已经添加
    if (this.selectedMaterials.some(m => m.id === item.id)) {
      ui.notifications.warn('该材料已经添加过了');
      return;
    }

    // 提取材料信息
    const materials = this.synthesisService?.extractSynthesisMaterials([item]) || [];
    if (materials.length > 0) {
      this.selectedMaterials.push(materials[0]);
      this._updateSynthesisArea($(this.element));
      this._updateCompatibilityDisplay($(this.element));
      ui.notifications.info(`已添加材料: ${item.name}`);
    }
  }

  /**
   * 等级改变事件
   */
  private _onLevelChange(event: Event) {
    this._updateCompatibilityDisplay($(this.element));
  }

  /**
   * 类别改变事件
   */
  private _onCategoryChange(event: Event) {
    const category = (event.target as HTMLSelectElement).value;
    const html = $(this.element);
    
    // 显示/隐藏职业名称输入
    if (category === 'class') {
      html.find('.class-name-group').show();
    } else {
      html.find('.class-name-group').hide();
    }
  }

  /**
   * 处理拖拽物品到合成区域
   */
  async _onDrop(event: DragEvent) {
    event.preventDefault();
    
    if (!event.dataTransfer?.getData('text/plain')) return;
    
    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));
      
      if (data.type === 'Item') {
        const item = await Item.fromDropData(data);
        if (item) {
          // 检查是否已经添加
          if (this.selectedMaterials.some(m => m.id === item.id)) {
            ui.notifications.warn('该材料已经添加过了');
            return;
          }

          // 提取材料信息
          const materials = this.synthesisService?.extractSynthesisMaterials([item]) || [];
          if (materials.length > 0) {
            this.selectedMaterials.push(materials[0]);
            this._updateSynthesisArea($(this.element));
            this._updateCompatibilityDisplay($(this.element));
            ui.notifications.info(`已添加材料: ${item.name}`);
          }
        }
      }
    } catch (error) {
      console.error('处理拖拽失败:', error);
    }
  }

  /**
   * 更新合成区域显示
   */
  private _updateSynthesisArea(html: any) {
    const synthesisArea = html.find('#synthesis-materials');
    
    if (this.selectedMaterials.length === 0) {
      synthesisArea.html('<p class="no-materials">拖拽物品到此处或点击下方的添加按钮</p>');
      return;
    }

    let materialsHtml = '';
    this.selectedMaterials.forEach((material, index) => {
      const typeIcon = material.type === 'fragment' ? 'fas fa-puzzle-piece' : 'fas fa-cube';
      const rarityClass = `rarity-${material.rarity || 'common'}`;
      
      materialsHtml += `
        <div class="synthesis-material" data-material-id="${material.id}">
          <div class="material-header">
            <i class="${typeIcon}"></i>
            <span class="material-name">${material.name}</span>
            <span class="material-rarity ${rarityClass}">${this._getRarityDisplayName(material.rarity || 'common')}</span>
            <button type="button" class="remove-material" data-material-id="${material.id}">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="material-description">
            ${material.description}
          </div>
          ${material.hiddenPrompt ? `
            <div class="material-prompt">
              <strong>设计概念:</strong> ${material.hiddenPrompt}
            </div>
          ` : ''}
        </div>
      `;
    });

    synthesisArea.html(materialsHtml);
    
    // 重新绑定移除按钮事件
    html.find('.remove-material').on('click', this._onRemoveMaterial.bind(this));
  }

  /**
   * 更新兼容性显示
   */
  private _updateCompatibilityDisplay(html: any) {
    const compatibilityArea = html.find('#compatibility-info');
    
    if (this.selectedMaterials.length === 0) {
      compatibilityArea.html('');
      return;
    }

    const compatibility = this.synthesisService?.validateMaterialCompatibility(this.selectedMaterials);
    if (!compatibility) return;

    let compatibilityHtml = '<div class="compatibility-analysis">';
    
    if (compatibility.isCompatible) {
      compatibilityHtml += '<div class="compatibility-status success"><i class="fas fa-check-circle"></i> 材料兼容性良好</div>';
    } else {
      compatibilityHtml += '<div class="compatibility-status warning"><i class="fas fa-exclamation-triangle"></i> 检测到兼容性问题</div>';
    }

    if (compatibility.warnings.length > 0) {
      compatibilityHtml += '<div class="compatibility-warnings"><h5>警告:</h5><ul>';
      compatibility.warnings.forEach(warning => {
        compatibilityHtml += `<li>${warning}</li>`;
      });
      compatibilityHtml += '</ul></div>';
    }

    if (compatibility.suggestions.length > 0) {
      compatibilityHtml += '<div class="compatibility-suggestions"><h5>建议:</h5><ul>';
      compatibility.suggestions.forEach(suggestion => {
        compatibilityHtml += `<li>${suggestion}</li>`;
      });
      compatibilityHtml += '</ul></div>';
    }

    compatibilityHtml += '</div>';
    compatibilityArea.html(compatibilityHtml);
  }

  /**
   * 显示合成结果
   */
  private _displaySynthesisResult(html: any) {
    if (!this.lastSynthesisResult) return;

    const result = this.lastSynthesisResult;
    const feat = result.feat;
    
    let outputHtml = `
      <div class="synthesis-result">
        <div class="feat-display">
          <div class="feat-header">
            <h3>${feat.name}</h3>
            <div class="feat-meta">
              <span class="feat-level">等级 ${feat.system?.level?.value || 1}</span>
              <span class="feat-category">${this._getCategoryDisplayName(feat.system?.category || 'general')}专长</span>
            </div>
          </div>
          
          ${feat.system?.traits?.value?.length > 0 ? `
          <div class="feat-traits">
            <strong>特征:</strong> ${feat.system.traits.value.join(', ')}
          </div>
          ` : ''}
          
          <div class="feat-description">
            ${feat.system?.description?.value || ''}
          </div>
        </div>
        
        <div class="synthesis-details">
          <div class="used-materials">
            <h4><i class="fas fa-list"></i> 使用的材料</h4>
            <ul>
              ${result.usedMaterials.map(m => `<li>${m.name}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div class="result-actions">
          <button type="button" id="import-synthesized-feat" class="success-button">
            <i class="fas fa-download"></i> ${this.actorData ? '添加到角色' : '导入到世界'}
          </button>
        </div>
      </div>
    `;

    html.find('#synthesis-output').html(outputHtml);
    
    // 重新绑定导入按钮事件
    html.find('#import-synthesized-feat').on('click', this._onImportSynthesizedFeat.bind(this));
  }

  /**
   * 获取稀有度显示名称
   */
  private _getRarityDisplayName(rarity: string): string {
    const rarityMap: Record<string, string> = {
      'common': '普通',
      'uncommon': '罕见',
      'rare': '稀有',
      'unique': '独特'
    };
    return rarityMap[rarity] || rarity;
  }

  /**
   * 获取类别显示名称
   */
  private _getCategoryDisplayName(category: string): string {
    const categoryMap: Record<string, string> = {
      'general': '通用',
      'skill': '技能',
      'ancestry': '族裔',
      'class': '职业',
      'bonus': '额外'
    };
    return categoryMap[category] || category;
  }
}
