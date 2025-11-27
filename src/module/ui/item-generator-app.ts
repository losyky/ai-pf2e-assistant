import { MODULE_ID } from '../constants';
import { IconGenerationService, IconGenerationOptions } from '../services/icon-generation-service';

// 声明全局变量
declare const $: any;
declare const game: any;
declare const ui: any;
declare const Item: any;
declare const Dialog: any;

// 简化的API调用函数
async function callAPI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiUrl = game.settings.get(MODULE_ID, 'apiUrl');
  const apiKey = game.settings.get(MODULE_ID, 'apiKey');
  const aiModel = game.settings.get(MODULE_ID, 'aiModel');

  if (!apiUrl || !apiKey) {
    throw new Error('请先配置API设置');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`API调用失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export class ItemGeneratorApp {
  private generatedItems: any[] = [];
  private generatedConsumables: any[] = [];
  private iconService: IconGenerationService;

  constructor() {
    this.iconService = IconGenerationService.getInstance();
    this.render();
  }

  async render() {
    // 获取国际化文本
    const i18n = (key: string) => game.i18n.localize(`AIPF2E.ItemGenerator.${key}`);
    
    // 创建对话框HTML
    const dialogContent = `
      <div class="ai-pf2e-assistant-container item-generator">
        <!-- 分栏容器 -->
        <div class="generator-tabs">
          <!-- 装备生成分栏 -->
          <div class="tab-panel equipment-panel">
            <h3>${i18n('equipment.title')}</h3>
            
            <div class="form-group">
              <label for="equipment-description">${i18n('equipment.description')}</label>
              <p class="hint">${i18n('equipment.descriptionHint')}</p>
              <textarea name="equipment-description" id="equipment-description" rows="6" placeholder="${i18n('equipment.descriptionPlaceholder')}"></textarea>
            </div>

            <div class="form-group">
              <label for="equipment-level">${i18n('equipment.level')}</label>
              <div class="level-selector">
                <input type="number" name="equipment-level" id="equipment-level" min="1" max="20" value="1">
                <span class="hint">${i18n('equipment.levelHint')}</span>
              </div>
            </div>

            <div class="form-group">
              <label for="equipment-count">${i18n('equipment.count')}</label>
              <div class="count-selector">
                <input type="number" name="equipment-count" id="equipment-count" min="1" max="10" value="3">
                <span class="hint">${i18n('equipment.countHint')}</span>
              </div>
            </div>

            <div class="form-group">
              <label for="equipment-traits">${i18n('equipment.traits')}</label>
              <input type="text" name="equipment-traits" id="equipment-traits" placeholder="${i18n('equipment.traitsPlaceholder')}">
              <p class="hint">${i18n('equipment.traitsHint')}</p>
            </div>

            <div class="form-group">
              <label>
                <input type="checkbox" id="enable-equipment-compendium-search">
                ${i18n('equipment.enableCompendium')}
              </label>
              <p class="hint">${i18n('equipment.enableCompendiumHint')}</p>
            </div>

            <div class="form-group">
              <button class="generate-equipment" type="button">${i18n('equipment.generate')}</button>
            </div>

            <div class="form-group">
              <label for="equipment-result">${i18n('equipment.result')}</label>
              <div id="equipment-preview" class="equipment-preview">
                <p>${i18n('equipment.resultPlaceholder')}</p>
              </div>
            </div>

            <div class="form-group buttons">
              <button class="create-equipment" type="button" disabled>${i18n('equipment.create')}</button>
              <button class="clear-equipment-preview" type="button">${i18n('equipment.clearPreview')}</button>
            </div>
          </div>

          <!-- 消耗品生成分栏 -->
          <div class="tab-panel consumables-panel">
            <h3>${i18n('consumable.title')}</h3>
            
            <div class="form-group">
              <label for="consumable-description">${i18n('consumable.description')}</label>
              <p class="hint">${i18n('consumable.descriptionHint')}</p>
              <textarea name="consumable-description" id="consumable-description" rows="6" placeholder="${i18n('consumable.descriptionPlaceholder')}"></textarea>
            </div>

            <div class="form-group">
              <label for="consumable-level">${i18n('consumable.level')}</label>
              <div class="level-selector">
                <input type="number" name="consumable-level" id="consumable-level" min="1" max="20" value="1">
                <span class="hint">${i18n('consumable.levelHint')}</span>
              </div>
            </div>

            <div class="form-group">
              <label for="consumable-count">${i18n('consumable.count')}</label>
              <div class="count-selector">
                <input type="number" name="consumable-count" id="consumable-count" min="1" max="15" value="5">
                <span class="hint">${i18n('consumable.countHint')}</span>
              </div>
            </div>

            <div class="form-group">
              <label for="consumable-traits">${i18n('consumable.traits')}</label>
              <input type="text" name="consumable-traits" id="consumable-traits" placeholder="${i18n('consumable.traitsPlaceholder')}">
              <p class="hint">${i18n('consumable.traitsHint')}</p>
            </div>

            <div class="form-group">
              <label>
                <input type="checkbox" id="enable-consumable-compendium-search">
                ${i18n('consumable.enableCompendium')}
              </label>
              <p class="hint">${i18n('consumable.enableCompendiumHint')}</p>
            </div>

            <div class="form-group">
              <button class="generate-consumables" type="button">${i18n('consumable.generate')}</button>
            </div>

            <div class="form-group">
              <label for="consumable-result">${i18n('consumable.result')}</label>
              <div id="consumable-preview" class="consumable-preview">
                <p>${i18n('consumable.resultPlaceholder')}</p>
              </div>
            </div>

            <div class="form-group buttons">
              <button class="create-consumables" type="button" disabled>${i18n('consumable.create')}</button>
              <button class="clear-consumable-preview" type="button">${i18n('consumable.clearPreview')}</button>
            </div>
          </div>
        </div>

        <!-- 成功状态显示 -->
        <div class="success-status" style="display: none;">
          <div class="success-message">
            <i class="fas fa-check-circle"></i>
            <span class="message-text"></span>
          </div>
        </div>
      </div>
    `;

    // 创建对话框
    new Dialog({
      title: i18n('title'),
      content: dialogContent,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: i18n('close')
        }
      },
      default: 'close',
      render: (html: any) => this.activateListeners(html),
      close: () => {}
    }, {
      classes: ['dialog', 'ai-pf2e-assistant-dialog', 'item-generator-dialog'],
      width: 900,
      height: 700,
      resizable: true
    }).render(true);
  }

  private activateListeners(html: any) {
    // 装备生成按钮
    html.find('.generate-equipment').click(async (event: any) => {
      event.preventDefault();
      await this.generateEquipment(html);
    });

    // 消耗品生成按钮  
    html.find('.generate-consumables').click(async (event: any) => {
      event.preventDefault();
      await this.generateConsumables(html);
    });

    // 创建装备按钮
    html.find('.create-equipment').click(async (event: any) => {
      event.preventDefault();
      await this.createEquipmentItems(html);
    });

    // 创建消耗品按钮
    html.find('.create-consumables').click(async (event: any) => {
      event.preventDefault();
      await this.createConsumableItems(html);
    });

    // 清空预览按钮
    html.find('.clear-equipment-preview').click((event: any) => {
      event.preventDefault();
      this.clearEquipmentPreview(html);
    });

    html.find('.clear-consumable-preview').click((event: any) => {
      event.preventDefault();
      this.clearConsumablePreview(html);
    });

    // 添加样式
    this.addStyles();
  }

  private async generateEquipment(html: any) {
    const description = html.find('#equipment-description').val();
    const level = parseInt(html.find('#equipment-level').val()) || 1;
    const count = parseInt(html.find('#equipment-count').val()) || 3;
    const traitsInput = html.find('#equipment-traits').val() || '';
    const enableCompendiumSearch = html.find('#enable-equipment-compendium-search').prop('checked');

    if (!description.trim()) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.noDescription'));
      return;
    }

    const generateButton = html.find('.generate-equipment');
    const originalText = generateButton.text();
    generateButton.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.generating'));

    try {
      let compendiumContext = '';
      
      // 可选步骤：合集包搜索
      if (enableCompendiumSearch) {
        console.log('正在搜索装备合集包相关内容...');
        try {
          const desiredTraits = this.parseTraitsInput(traitsInput);
          const searchResults = await this.searchEquipmentByTraits(description, level, desiredTraits);
          compendiumContext = this.formatCompendiumContext(searchResults);
          console.log('装备合集包搜索完成，找到', searchResults.length, '个相关条目');
        } catch (searchError) {
          console.warn('装备合集包搜索失败，继续生成:', searchError);
        }
      }
      const systemPrompt = `你是一个专业的Pathfinder 2e装备设计师。请根据用户的描述生成符合PF2e规则的装备。

请为每个装备提供以下信息：
1. 名称：简洁而富有特色的中文名称
2. 类型：武器、护甲、盾牌、工具等
3. 等级：${level}级装备
4. 价格：符合PF2e规则的价格
5. 描述：装备的外观、历史背景和使用方法
6. 功能：装备的特殊能力、效果和自动化规则（以文本形式描述，包括具体的游戏机制）
7. 特征：PF2e特征标签数组（如["magical", "fire", "invested"]）
8. 图标提示词：用于AI生成图标的英文描述

功能部分应该包含：
- 具体的游戏效果和数值
- 激活条件和使用方法
- 持续时间和频率限制
- 可能的自动化规则（如触发条件、自动计算等）

**重要**：请严格按照以下JSON格式返回，不要添加任何markdown标记或额外文本：

[
  {
    "名称": "装备名称",
    "类型": "装备类型",
    "等级": 数字,
    "价格": "价格字符串",
    "描述": "描述文本",
    "功能": "功能描述文本",
    "特征": ["特征1", "特征2"],
    "图标提示词": "英文描述"
  }
]

请严格遵循PF2e的装备规则和平衡性。`;

      const userPrompt = `请生成${count}件符合以下描述的PF2e装备：${description}

要求：
- 等级为${level}级
- 符合PF2e规则和平衡性
- 提供完整的装备信息
- 包含适合的功能和自动化规则${compendiumContext}`;

      const result = await callAPI(systemPrompt, userPrompt);
      const equipmentData = this.parseItemData(result);

      if (equipmentData && equipmentData.length > 0) {
        this.generatedItems = equipmentData;
        this.renderEquipmentPreview(equipmentData, html);
        html.find('.create-equipment').prop('disabled', false);
      } else {
        ui.notifications.error(game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.generateFailed'));
      }

    } catch (error: any) {
      console.error('Equipment generation failed:', error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.generateFailed')}: ${error.message}`);
    } finally {
      generateButton.prop('disabled', false).text(originalText);
    }
  }

  private async generateConsumables(html: any) {
    const description = html.find('#consumable-description').val();
    const level = parseInt(html.find('#consumable-level').val()) || 1;
    const count = parseInt(html.find('#consumable-count').val()) || 5;
    const traitsInput = html.find('#consumable-traits').val() || '';
    const enableCompendiumSearch = html.find('#enable-consumable-compendium-search').prop('checked');

    if (!description.trim()) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.noDescription'));
      return;
    }

    const generateButton = html.find('.generate-consumables');
    const originalText = generateButton.text();
    generateButton.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.generating'));

    try {
      let compendiumContext = '';
      
      // 可选步骤：合集包搜索
      if (enableCompendiumSearch) {
        console.log('正在搜索消耗品合集包相关内容...');
        try {
          const desiredTraits = this.parseTraitsInput(traitsInput);
          const searchResults = await this.searchConsumablesByTraits(description, level, desiredTraits);
          compendiumContext = this.formatCompendiumContext(searchResults);
          console.log('消耗品合集包搜索完成，找到', searchResults.length, '个相关条目');
        } catch (searchError) {
          console.warn('消耗品合集包搜索失败，继续生成:', searchError);
        }
      }
      const systemPrompt = `你是一个专业的Pathfinder 2e物品设计师。请根据用户的描述生成符合PF2e规则的消耗品。

请为每个消耗品提供以下信息：
1. 名称：简洁而富有特色的中文名称
2. 类型：药剂、卷轴、炸弹、符文等
3. 等级：${level}级消耗品
4. 价格：符合PF2e规则的价格
5. 描述：物品的外观、制作方法和背景
6. 功能：具体的游戏效果、使用方法、激活动作、持续时间和自动化规则（以文本形式描述）
7. 特征：PF2e特征标签数组（如["magical", "consumable", "healing"]）
8. 图标提示词：用于AI生成图标的英文描述

功能部分应该包含：
- 激活动作类型（动作、反应、自由动作等）
- 具体的游戏效果和数值
- 持续时间和范围
- 使用限制和条件
- 可能的自动化规则（如自动计算伤害、自动应用状态等）

**重要**：请严格按照以下JSON格式返回，不要添加任何markdown标记或额外文本：

[
  {
    "名称": "消耗品名称",
    "类型": "消耗品类型",
    "等级": 数字,
    "价格": "价格字符串",
    "描述": "描述文本",
    "功能": "功能描述文本",
    "特征": ["特征1", "特征2"],
    "图标提示词": "英文描述"
  }
]

请严格遵循PF2e的物品规则和平衡性。`;

      const userPrompt = `请生成${count}件符合以下描述的PF2e消耗品：${description}

要求：
- 等级为${level}级
- 符合PF2e规则和平衡性
- 提供完整的使用信息
- 包含明确的效果描述和自动化规则${compendiumContext}`;

      const result = await callAPI(systemPrompt, userPrompt);
      const consumableData = this.parseItemData(result);

      if (consumableData && consumableData.length > 0) {
        this.generatedConsumables = consumableData;
        this.renderConsumablePreview(consumableData, html);
        html.find('.create-consumables').prop('disabled', false);
      } else {
        ui.notifications.error(game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.generateFailed'));
      }

    } catch (error: any) {
      console.error('Consumable generation failed:', error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.generateFailed')}: ${error.message}`);
    } finally {
      generateButton.prop('disabled', false).text(originalText);
    }
  }

  private parseItemData(jsonString: string): any[] {
    try {
      console.log('原始响应:', jsonString);
      
      // 更强力的清理markdown标记和其他文本
      let cleanJson = jsonString.trim();
      
      // 移除markdown代码块标记
      cleanJson = cleanJson.replace(/```json\s*/gi, '');
      cleanJson = cleanJson.replace(/```\s*/g, '');
      
      // 查找JSON数组的开始和结束
      const jsonStart = cleanJson.indexOf('[');
      const jsonEnd = cleanJson.lastIndexOf(']');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
      }
      
      // 移除可能的额外文本（在JSON之前或之后）
      cleanJson = cleanJson.replace(/^[^[\{]*/, ''); // 移除开头的非JSON文本
      cleanJson = cleanJson.replace(/[^\]\}]*$/, ''); // 移除结尾的非JSON文本
      
      console.log('清理后的JSON:', cleanJson);
      
      // 尝试解析JSON
      const data = JSON.parse(cleanJson);
      
      if (Array.isArray(data)) {
        console.log('成功解析数组，包含', data.length, '个物品');
        return data;
      } else if (data.items && Array.isArray(data.items)) {
        console.log('成功解析对象，包含', data.items.length, '个物品');
        return data.items;
      } else if (typeof data === 'object' && data !== null) {
        // 如果是单个对象，包装成数组
        console.log('解析为单个对象，包装成数组');
        return [data];
      } else {
        console.warn('意外的数据格式:', data);
        return [];
      }
    } catch (error) {
      console.error('JSON解析失败:', error);
      console.log('原始响应:', jsonString);
      
      // 尝试更激进的清理和解析
      try {
        return this.fallbackParseItemData(jsonString);
      } catch (fallbackError) {
        console.error('备用解析也失败:', fallbackError);
        ui.notifications.error('物品数据解析失败，请检查AI响应格式');
        return [];
      }
    }
  }

  /**
   * 备用的物品数据解析方法
   */
  private fallbackParseItemData(jsonString: string): any[] {
    console.log('尝试备用解析方法');
    
    // 尝试提取JSON部分
    const jsonMatches = jsonString.match(/\[[\s\S]*\]/);
    if (jsonMatches) {
      const jsonPart = jsonMatches[0];
      console.log('提取的JSON部分:', jsonPart);
      
      try {
        const data = JSON.parse(jsonPart);
        if (Array.isArray(data)) {
          return data;
        }
      } catch (error) {
        console.error('备用解析失败:', error);
      }
    }
    
    // 如果还是失败，尝试逐行解析
    const lines = jsonString.split('\n');
    let jsonLines: string[] = [];
    let inJson = false;
    
    for (const line of lines) {
      if (line.trim().startsWith('[') || line.trim().startsWith('{')) {
        inJson = true;
      }
      
      if (inJson) {
        jsonLines.push(line);
      }
      
      if (line.trim().endsWith(']') || line.trim().endsWith('}')) {
        break;
      }
    }
    
    if (jsonLines.length > 0) {
      const reconstructedJson = jsonLines.join('\n');
      console.log('重构的JSON:', reconstructedJson);
      
      try {
        const data = JSON.parse(reconstructedJson);
        if (Array.isArray(data)) {
          return data;
        } else if (typeof data === 'object' && data !== null) {
          return [data];
        }
      } catch (error) {
        console.error('重构JSON解析失败:', error);
      }
    }
    
    throw new Error('所有解析方法都失败了');
  }

  private renderEquipmentPreview(equipment: any[], html: any) {
    const preview = html.find('#equipment-preview');
    let previewHtml = '<div class="equipment-list">';

    equipment.forEach((item, index) => {
      previewHtml += `
        <div class="equipment-item" data-index="${index}">
          <div class="item-header">
            <h4>${item.名称 || item.name || '未命名装备'}</h4>
            <span class="item-level">等级 ${item.等级 || item.level || 1}</span>
          </div>
          <div class="item-details">
            <p><strong>类型：</strong>${item.类型 || item.type || '未知'}</p>
            <p><strong>价格：</strong>${item.价格 || item.price || '未知'}</p>
            <p><strong>描述：</strong>${item.描述 || item.description || '无描述'}</p>
            <p><strong>功能：</strong>${item.功能 || item.特性 || item.traits || item.features || '无'}</p>
          </div>
          <div class="item-actions">
            <button class="generate-icon" data-index="${index}" data-type="equipment">${game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.generateIcon')}</button>
          </div>
        </div>
      `;
    });

    previewHtml += '</div>';
    preview.html(previewHtml);

    // 绑定图标生成按钮
    preview.find('.generate-icon').click(async (event: any) => {
      const index = parseInt($(event.target).data('index'));
      await this.generateItemIcon(equipment[index], 'item', event.target);
    });
  }

  private renderConsumablePreview(consumables: any[], html: any) {
    const preview = html.find('#consumable-preview');
    let previewHtml = '<div class="consumable-list">';

    consumables.forEach((item, index) => {
      previewHtml += `
        <div class="consumable-item" data-index="${index}">
          <div class="item-header">
            <h4>${item.名称 || item.name || '未命名消耗品'}</h4>
            <span class="item-level">等级 ${item.等级 || item.level || 1}</span>
          </div>
          <div class="item-details">
            <p><strong>类型：</strong>${item.类型 || item.type || '未知'}</p>
            <p><strong>价格：</strong>${item.价格 || item.price || '未知'}</p>
            <p><strong>描述：</strong>${item.描述 || item.description || '无描述'}</p>
            <p><strong>功能：</strong>${item.功能 || item.效果 || item.effect || item.使用方法 || item.usage || '无功能'}</p>
          </div>
          <div class="item-actions">
            <button class="generate-icon" data-index="${index}" data-type="consumable">${game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.generateIcon')}</button>
          </div>
        </div>
      `;
    });

    previewHtml += '</div>';
    preview.html(previewHtml);

    // 绑定图标生成按钮
    preview.find('.generate-icon').click(async (event: any) => {
      const index = parseInt($(event.target).data('index'));
      await this.generateItemIcon(consumables[index], 'item', event.target);
    });
  }

  private async generateItemIcon(item: any, type: 'item', buttonElement: any) {
    const button = $(buttonElement);
    const originalText = button.text();
    const itemType = type === 'item' ? 'equipment' : 'consumable';
    const i18nKey = `ai-pf2e-assistant.itemGenerator.${itemType}`;
    
    button.prop('disabled', true).text(game.i18n.localize(`${i18nKey}.generating`));

    try {
      const iconOptions: IconGenerationOptions = {
        name: item.名称 || item.name || '未命名物品',
        description: item.描述 || item.description || '',
        type: type,
        iconPrompt: item.图标提示词 || item.iconPrompt || ''
      };

      const generatedIcon = await this.iconService.generateIcon(iconOptions);
      
      if (generatedIcon) {
        // 将图标信息保存到物品数据中
        item.generatedIcon = generatedIcon;
        
        // 更新按钮显示
        button.text(game.i18n.localize(`${i18nKey}.iconGenerated`)).addClass('icon-generated');
        
        ui.notifications.info(`${item.名称 || item.name}${game.i18n.localize(`${i18nKey}.iconGenerated`)}`);
      } else {
        button.text(game.i18n.localize(`${i18nKey}.iconFailed`)).addClass('icon-failed');
      }
    } catch (error: any) {
      console.error('Icon generation failed:', error);
      button.text(game.i18n.localize(`${i18nKey}.iconFailed`)).addClass('icon-failed');
      ui.notifications.warn(`${game.i18n.localize(`${i18nKey}.iconFailed`)}: ${error.message}`);
    } finally {
      setTimeout(() => {
        if (!button.hasClass('icon-generated')) {
          button.prop('disabled', false).text(originalText).removeClass('icon-failed');
        }
      }, 3000);
    }
  }

  private async createEquipmentItems(html: any) {
    if (!this.generatedItems || this.generatedItems.length === 0) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.noItems'));
      return;
    }

    const createButton = html.find('.create-equipment');
    const originalText = createButton.text();
    createButton.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.creating'));

    try {
      let successCount = 0;

      for (const equipment of this.generatedItems) {
        try {
          const itemData = this.buildPF2eItemData(equipment, 'equipment');
          
          // 创建物品
          const createdItem = await Item.create(itemData);
          
          if (createdItem) {
            successCount++;
          }
        } catch (error) {
          console.error('Failed to create equipment:', equipment, error);
        }
      }

      if (successCount > 0) {
        const message = game.i18n.format('ai-pf2e-assistant.itemGenerator.equipment.createSuccess', { count: successCount });
        this.showSuccessMessage(html, message);
        ui.notifications.info(message);
      } else {
        ui.notifications.error(game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.generateFailed'));
      }

    } catch (error: any) {
      console.error('Equipment creation failed:', error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.generateFailed')}: ${error.message}`);
    } finally {
      createButton.prop('disabled', false).text(originalText);
    }
  }

  private async createConsumableItems(html: any) {
    if (!this.generatedConsumables || this.generatedConsumables.length === 0) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.noItems'));
      return;
    }

    const createButton = html.find('.create-consumables');
    const originalText = createButton.text();
    createButton.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.creating'));

    try {
      let successCount = 0;

      for (const consumable of this.generatedConsumables) {
        try {
          const itemData = this.buildPF2eItemData(consumable, 'consumable');
          
          // 创建物品
          const createdItem = await Item.create(itemData);
          
          if (createdItem) {
            successCount++;
          }
        } catch (error) {
          console.error('Failed to create consumable:', consumable, error);
        }
      }

      if (successCount > 0) {
        const message = game.i18n.format('ai-pf2e-assistant.itemGenerator.consumable.createSuccess', { count: successCount });
        this.showSuccessMessage(html, message);
        ui.notifications.info(message);
      } else {
        ui.notifications.error(game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.generateFailed'));
      }

    } catch (error: any) {
      console.error('Consumable creation failed:', error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.generateFailed')}: ${error.message}`);
    } finally {
      createButton.prop('disabled', false).text(originalText);
    }
  }

  private buildPF2eItemData(item: any, category: 'equipment' | 'consumable'): any {
    const name = item.名称 || item.name || '未命名物品';
    const description = item.描述 || item.description || '';
    
    // 处理复杂的功能结构
    let features = '';
    if (item.功能) {
      if (typeof item.功能 === 'string') {
        features = item.功能;
      } else if (typeof item.功能 === 'object') {
        // 将功能对象转换为文本描述
        features = this.formatComplexFeatures(item.功能);
      }
    } else {
      features = item.特性 || item.traits || item.features || item.effect || item.效果 || '';
    }
    
    const level = item.等级 || item.level || 1;
    const price = item.价格 || item.price || '0 gp';
    
    // 构建完整的描述内容：描述在前，功能在后
    let fullDescription = '';
    if (description) {
      fullDescription += `<p>${description}</p>`;
    }
    if (features) {
      if (description) {
        fullDescription += '<hr>';
      }
      fullDescription += `<p><strong>功能：</strong>${features}</p>`;
    }
    
    // 确定物品类型
    let itemType = 'equipment';
    if (category === 'consumable') {
      const type = (item.类型 || item.type || '').toLowerCase();
      if (type.includes('药剂') || type.includes('potion')) {
        itemType = 'consumable';
      } else if (type.includes('卷轴') || type.includes('scroll')) {
        itemType = 'consumable';
      } else {
        itemType = 'consumable';
      }
    }

    // 构建基础数据
    const itemData: any = {
      name: name,
      type: itemType,
      img: item.generatedIcon?.url || this.iconService.getDefaultIcon('item'),
      system: {
        description: {
          value: fullDescription || '<p>无描述</p>',
          chat: '',
          unidentified: ''
        },
        level: {
          value: level
        },
        price: {
          value: this.parsePrice(price)
        },
        quantity: 1,
        weight: {
          value: 0
        },
        equipped: {
          value: false
        },
        identification: {
          status: 'identified'
        },
        usage: {
          value: 'held-in-one-hand'
        }
      }
    };

    // 添加特定于类别的数据
    if (category === 'equipment') {
      // 解析特性标签用于系统识别
      const traitsArray = this.parseTraitsFromItem(item, features);
      itemData.system.traits = {
        value: traitsArray,
        rarity: 'common'
      };
      
      // 尝试生成自动化规则
      const automationRules = this.generateAutomationRules(item, features);
      if (automationRules.length > 0) {
        itemData.system.rules = automationRules;
      }
    } else if (category === 'consumable') {
      itemData.system.consumableType = {
        value: this.getConsumableType(item.类型 || item.type || '')
      };
      itemData.system.uses = {
        value: 1,
        max: 1,
        autoDestroy: true
      };
      // 消耗品也需要特性标签
      const traitsArray = this.parseTraitsFromItem(item, features);
      itemData.system.traits = {
        value: traitsArray,
        rarity: 'common'
      };
      
      // 尝试生成自动化规则
      const automationRules = this.generateAutomationRules(item, features);
      if (automationRules.length > 0) {
        itemData.system.rules = automationRules;
      }
    }

    return itemData;
  }

  /**
   * 格式化复杂的功能结构
   */
  private formatComplexFeatures(functionsObj: any): string {
    let result = '';
    
    try {
      if (typeof functionsObj === 'object' && functionsObj !== null) {
        for (const [key, value] of Object.entries(functionsObj)) {
          if (typeof value === 'string') {
            result += `**${key}**: ${value}\n\n`;
          } else if (Array.isArray(value)) {
            result += `**${key}**:\n`;
            for (const item of value) {
              if (typeof item === 'string') {
                result += `- ${item}\n`;
              } else if (typeof item === 'object' && item !== null) {
                // 处理复杂的能力对象
                if (item.名称 || item.name) {
                  result += `- **${item.名称 || item.name}**`;
                  if (item.动作 || item.action) {
                    result += ` (${item.动作 || item.action})`;
                  }
                  if (item.频率 || item.frequency) {
                    result += ` [${item.频率 || item.frequency}]`;
                  }
                  result += '\n';
                  if (item.效果 || item.effect) {
                    result += `  ${item.效果 || item.effect}\n`;
                  }
                }
              }
            }
            result += '\n';
          } else if (typeof value === 'object' && value !== null) {
            result += `**${key}**: ${JSON.stringify(value)}\n\n`;
          }
        }
      }
    } catch (error) {
      console.warn('格式化复杂功能失败:', error);
      return JSON.stringify(functionsObj);
    }
    
    return result.trim();
  }

  /**
   * 从物品中解析特性标签
   */
  private parseTraitsFromItem(item: any, features: string): string[] {
    let traits: string[] = [];
    
    // 首先尝试从特征数组中获取
    if (item.特征 && Array.isArray(item.特征)) {
      traits = traits.concat(item.特征);
    } else if (item.traits && Array.isArray(item.traits)) {
      traits = traits.concat(item.traits);
    }
    
    // 然后从功能文本中解析
    const textTraits = this.parseTraits(features);
    traits = traits.concat(textTraits);
    
    // 去重并过滤
    return [...new Set(traits)]
      .filter(trait => trait && trait.length > 0)
      .slice(0, 8); // 限制特性数量
  }

  private parsePrice(priceString: string): any {
    // 简单的价格解析，可以根据需要扩展
    const match = priceString.match(/(\d+)\s*(gp|sp|cp)/i);
    if (match) {
      const value = parseInt(match[1]);
      const currency = match[2].toLowerCase();
      
      switch (currency) {
        case 'gp': return { gp: value };
        case 'sp': return { sp: value };
        case 'cp': return { cp: value };
        default: return { gp: value };
      }
    }
    return { gp: 0 };
  }

  private parseTraits(traitsString: string): string[] {
    if (!traitsString) return [];
    
    // 简单的特性解析
    return traitsString.split(/[,，]/)
      .map(trait => trait.trim())
      .filter(trait => trait.length > 0)
      .slice(0, 5); // 限制特性数量
  }

  private getConsumableType(typeString: string): string {
    const type = typeString.toLowerCase();
    
    if (type.includes('药剂') || type.includes('potion')) {
      return 'potion';
    } else if (type.includes('卷轴') || type.includes('scroll')) {
      return 'scroll';
    } else if (type.includes('符文') || type.includes('talisman')) {
      return 'talisman';
    } else {
      return 'other';
    }
  }

  /**
   * 生成自动化规则
   * 根据PF2e官方标准生成规则元素
   */
  private generateAutomationRules(item: any, features: string): any[] {
    const rules: any[] = [];
    
    // 解析数值加成 - 使用PF2e标准格式
    const bonusPatterns = [
      { 
        pattern: /\+(\d+)\s*(?:物品|item)?\s*攻击加值/gi, 
        rule: (value: number) => ({
          key: 'FlatModifier',
          selector: 'attack-roll',
          type: 'item',
          value: value,
          label: `${item.名称 || item.name || '物品'}攻击加值`
        })
      },
      { 
        pattern: /\+(\d+)\s*(?:物品|item)?\s*伤害(?:加值)?/gi, 
        rule: (value: number) => ({
          key: 'FlatModifier',
          selector: 'damage',
          type: 'item',
          value: value,
          label: `${item.名称 || item.name || '物品'}伤害加值`
        })
      },
      { 
        pattern: /\+(\d+)\s*(?:物品|item)?\s*(?:AC|防御|护甲)(?:加值)?/gi, 
        rule: (value: number) => ({
          key: 'FlatModifier',
          selector: 'ac',
          type: 'item',
          value: value,
          label: `${item.名称 || item.name || '物品'}AC加值`
        })
      },
      { 
        pattern: /\+(\d+)\s*(?:物品|item)?\s*(?:所有|全部)?(?:技能|skill)(?:加值|检定)?/gi, 
        rule: (value: number) => ({
          key: 'FlatModifier',
          selector: 'skill-check',
          type: 'item',
          value: value,
          label: `${item.名称 || item.name || '物品'}技能加值`
        })
      },
      { 
        pattern: /\+(\d+)\s*(?:物品|item)?\s*(?:所有|全部)?(?:豁免|saving)(?:加值|throw)?/gi, 
        rule: (value: number) => ({
          key: 'FlatModifier',
          selector: 'saving-throw',
          type: 'item',
          value: value,
          label: `${item.名称 || item.name || '物品'}豁免加值`
        })
      }
    ];

    for (const bonusPattern of bonusPatterns) {
      let match;
      bonusPattern.pattern.lastIndex = 0; // 重置正则表达式
      while ((match = bonusPattern.pattern.exec(features)) !== null) {
        const bonus = parseInt(match[1]);
        if (bonus > 0 && bonus <= 10) { // 合理的加值范围
          rules.push(bonusPattern.rule(bonus));
        }
      }
    }

    // 解析抗性 - 使用PF2e标准伤害类型
    const resistancePattern = /(?:对\s*)?(\w+)(?:伤害\s*)?抗性\s*(\d+)/gi;
    let resistanceMatch;
    resistancePattern.lastIndex = 0;
    while ((resistanceMatch = resistancePattern.exec(features)) !== null) {
      const damageType = this.translateDamageType(resistanceMatch[1]);
      const value = parseInt(resistanceMatch[2]);
      if (damageType && value > 0 && value <= 20) { // 合理的抗性范围
        rules.push({
          key: 'Resistance',
          type: damageType,
          value: value,
          label: `${item.名称 || item.name || '物品'}${resistanceMatch[1]}抗性`
        });
      }
    }

    // 解析免疫 - 使用PF2e标准状态和伤害类型
    const immunityPattern = /(?:对\s*)?(\w+)(?:伤害\s*|状态\s*)?免疫/gi;
    let immunityMatch;
    immunityPattern.lastIndex = 0;
    while ((immunityMatch = immunityPattern.exec(features)) !== null) {
      const immunityType = this.translateImmunityType(immunityMatch[1]);
      if (immunityType) {
        rules.push({
          key: 'Immunity',
          type: immunityType,
          label: `${item.名称 || item.name || '物品'}${immunityMatch[1]}免疫`
        });
      }
    }

    // 解析感官能力
    if (/黑暗视觉|darkvision/i.test(features)) {
      const rangeMatch = features.match(/(\d+)(?:\s*尺|feet|ft)/i);
      const range = rangeMatch ? parseInt(rangeMatch[1]) : 60;
      rules.push({
        key: 'Sense',
        selector: 'darkvision',
        range: Math.min(range, 120), // 限制合理范围
        label: `${item.名称 || item.name || '物品'}黑暗视觉`
      });
    }

    if (/低光视觉|low.?light/i.test(features)) {
      rules.push({
        key: 'Sense',
        selector: 'lowLightVision',
        label: `${item.名称 || item.name || '物品'}低光视觉`
      });
    }

    // 解析移动速度加成
    const speedPattern = /(?:移动|速度|speed)(?:加值|bonus)?\s*\+?(\d+)(?:\s*尺|feet|ft)?/gi;
    let speedMatch;
    speedPattern.lastIndex = 0;
    while ((speedMatch = speedPattern.exec(features)) !== null) {
      const speedBonus = parseInt(speedMatch[1]);
      if (speedBonus > 0 && speedBonus <= 30) { // 合理的速度加成范围
        rules.push({
          key: 'FlatModifier',
          selector: 'land-speed',
          type: 'item',
          value: speedBonus,
          label: `${item.名称 || item.name || '物品'}移动速度加值`
        });
      }
    }

    return rules;
  }

  /**
   * 翻译伤害类型 - 使用PF2e官方标准
   */
  private translateDamageType(chineseType: string): string | null {
    const typeMap: { [key: string]: string } = {
      // 基础伤害类型
      '火焰': 'fire',
      '火': 'fire',
      '寒冷': 'cold',
      '冰': 'cold',
      '闪电': 'electricity',
      '电': 'electricity',
      '雷电': 'electricity',
      '酸液': 'acid',
      '酸': 'acid',
      '音波': 'sonic',
      '声音': 'sonic',
      
      // 能量伤害类型
      '力场': 'force',
      '负能量': 'negative',
      '正能量': 'positive',
      '精神': 'mental',
      '心灵': 'mental',
      
      // 物理伤害类型
      '钝击': 'bludgeoning',
      '穿刺': 'piercing',
      '挥砍': 'slashing',
      
      // 特殊伤害类型
      '毒素': 'poison',
      '毒': 'poison',
      '流血': 'bleed',
      '持续伤害': 'persistent'
    };
    
    const lowerType = chineseType.toLowerCase();
    for (const [chinese, english] of Object.entries(typeMap)) {
      if (lowerType.includes(chinese.toLowerCase())) {
        return english;
      }
    }
    return null;
  }

  /**
   * 翻译免疫类型 - 使用PF2e官方标准
   */
  private translateImmunityType(chineseType: string): string | null {
    const typeMap: { [key: string]: string } = {
      // 伤害类型免疫
      '火焰': 'fire',
      '火': 'fire',
      '寒冷': 'cold',
      '冰': 'cold',
      '闪电': 'electricity',
      '电': 'electricity',
      '酸液': 'acid',
      '酸': 'acid',
      '音波': 'sonic',
      '毒素': 'poison',
      '毒': 'poison',
      '负能量': 'negative',
      '正能量': 'positive',
      '精神': 'mental',
      '心灵': 'mental',
      
      // 状态免疫
      '疾病': 'disease',
      '魅惑': 'charmed',
      '恐惧': 'frightened',
      '害怕': 'frightened',
      '麻痹': 'paralyzed',
      '瘫痪': 'paralyzed',
      '石化': 'petrified',
      '睡眠': 'unconscious', // PF2e中睡眠通常是unconscious状态
      '昏迷': 'unconscious',
      '失明': 'blinded',
      '耳聋': 'deafened',
      '眩晕': 'stunned',
      '困惑': 'confused',
      '迷惑': 'confused',
      '虚弱': 'enfeebled',
      '笨拙': 'clumsy',
      '愚钝': 'stupefied'
    };
    
    const lowerType = chineseType.toLowerCase();
    for (const [chinese, english] of Object.entries(typeMap)) {
      if (lowerType.includes(chinese.toLowerCase())) {
        return english;
      }
    }
    return null;
  }

  private clearEquipmentPreview(html: any) {
    html.find('#equipment-preview').html(`<p>${game.i18n.localize('ai-pf2e-assistant.itemGenerator.equipment.resultPlaceholder')}</p>`);
    html.find('.create-equipment').prop('disabled', true);
    this.generatedItems = [];
  }

  private clearConsumablePreview(html: any) {
    html.find('#consumable-preview').html(`<p>${game.i18n.localize('ai-pf2e-assistant.itemGenerator.consumable.resultPlaceholder')}</p>`);
    html.find('.create-consumables').prop('disabled', true);
    this.generatedConsumables = [];
  }

  private showSuccessMessage(html: any, message: string) {
    const successStatus = html.find('.success-status');
    successStatus.find('.message-text').text(message);
    successStatus.show();
    
    setTimeout(() => {
      successStatus.fadeOut();
    }, 3000);
  }

  /**
   * 解析特征输入
   */
  private parseTraitsInput(traitsInput: string): string[] {
    if (!traitsInput.trim()) return [];
    
    return traitsInput
      .split(',')
      .map(trait => trait.trim().toLowerCase())
      .filter(trait => trait.length > 0);
  }

  /**
   * 提取搜索关键词（备用方法）
   */
  private async extractSearchKeywords(prompt: string): Promise<string[]> {
    const keywordPrompt = `请从以下文本中提取2-3个最重要的搜索关键词，用于在Pathfinder 2e装备合集包中搜索相关内容。
请只返回关键词，用逗号分隔，不要其他解释。

文本: ${prompt}`;

    try {
      const response = await callAPI('你是一个关键词提取专家。', keywordPrompt);
      const keywords = response
        ?.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .slice(0, 3) || [];

      return keywords;
    } catch (error) {
      console.warn('关键词提取失败:', error);
      return this.extractKeywordsFallback(prompt);
    }
  }

  /**
   * 备用关键词提取方法
   */
  private extractKeywordsFallback(prompt: string): string[] {
    // 简单的关键词提取逻辑
    const words = prompt.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1)
      .slice(0, 3);
    
    return words;
  }

  /**
   * 基于特征搜索装备
   */
  private async searchEquipmentByTraits(description: string, targetLevel: number, desiredTraits: string[]): Promise<any[]> {
    const results: any[] = [];
    
    try {
      // 搜索装备相关的合集包
      const packNames = ['pf2e.equipment-srd', 'pf2e.consumables', 'pf2e.treasure'];
      
      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;
        
        // 获取集合包内容
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          // 过滤掉消耗品类型（在装备搜索中）
          if (doc.type === 'consumable') continue;
          
          const itemLevel = doc.system?.level?.value || 0;
          const itemTraits = (doc.system?.traits?.value || []).map((t: string) => t.toLowerCase());
          
          // 计算综合相关性分数
          const score = this.calculateTraitBasedRelevance(
            doc, 
            description, 
            targetLevel, 
            itemLevel, 
            desiredTraits, 
            itemTraits
          );
          
          if (score > 0) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              source: packName,
              relevance: score,
              level: itemLevel,
              traits: itemTraits,
              traitOverlap: this.calculateTraitOverlap(desiredTraits, itemTraits)
            });
          }
        }
      }
      
      // 按相关性排序，确保5-20个结果
      const sortedResults = results
        .sort((a, b) => b.relevance - a.relevance);
      
      // 确保至少5个，最多20个
      const minResults = 5;
      const maxResults = 20;
      
      if (sortedResults.length < minResults) {
        // 如果结果不足，降低阈值重新搜索
        return this.searchEquipmentFallback(description, targetLevel, minResults);
      }
      
      return sortedResults.slice(0, maxResults);
        
    } catch (error) {
      console.warn('基于特征的装备搜索失败:', error);
      return this.searchEquipmentFallback(description, targetLevel, 5);
    }
  }

  /**
   * 搜索装备合集包（旧方法，作为备用）
   */
  private async searchEquipmentCompendium(keywords: string[]): Promise<any[]> {
    const results: any[] = [];
    
    try {
      // 搜索装备相关的合集包
      const packNames = ['pf2e.equipment-srd', 'pf2e.consumables', 'pf2e.treasure'];
      
      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;
        
        // 获取集合包内容
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          const relevance = this.calculateRelevance(doc, keywords);
          if (relevance > 0.3) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              source: packName,
              relevance: relevance,
              level: doc.system?.level?.value || 0,
              traits: doc.system?.traits?.value || []
            });
          }
        }
      }
      
      // 按相关性排序并限制结果数量
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
        
    } catch (error) {
      console.warn('装备合集包搜索失败:', error);
      return [];
    }
  }

  /**
   * 基于特征搜索消耗品
   */
  private async searchConsumablesByTraits(description: string, targetLevel: number, desiredTraits: string[]): Promise<any[]> {
    const results: any[] = [];
    
    try {
      // 搜索消耗品相关的合集包
      const packNames = ['pf2e.consumables', 'pf2e.equipment-srd'];
      
      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;
        
        // 获取集合包内容
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          // 只搜索消耗品类型
          if (doc.type !== 'consumable' && !doc.system?.consumableType) continue;
          
          const itemLevel = doc.system?.level?.value || 0;
          const itemTraits = (doc.system?.traits?.value || []).map((t: string) => t.toLowerCase());
          
          // 计算综合相关性分数
          const score = this.calculateTraitBasedRelevance(
            doc, 
            description, 
            targetLevel, 
            itemLevel, 
            desiredTraits, 
            itemTraits
          );
          
          if (score > 0) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              source: packName,
              relevance: score,
              level: itemLevel,
              traits: itemTraits,
              consumableType: doc.system?.consumableType?.value || 'other',
              traitOverlap: this.calculateTraitOverlap(desiredTraits, itemTraits)
            });
          }
        }
      }
      
      // 按相关性排序，确保5-20个结果
      const sortedResults = results
        .sort((a, b) => b.relevance - a.relevance);
      
      // 确保至少5个，最多20个
      const minResults = 5;
      const maxResults = 20;
      
      if (sortedResults.length < minResults) {
        // 如果结果不足，降低阈值重新搜索
        return this.searchConsumableFallback(description, targetLevel, minResults);
      }
      
      return sortedResults.slice(0, maxResults);
        
    } catch (error) {
      console.warn('基于特征的消耗品搜索失败:', error);
      return this.searchConsumableFallback(description, targetLevel, 5);
    }
  }

  /**
   * 搜索消耗品合集包（旧方法，作为备用）
   */
  private async searchConsumableCompendium(keywords: string[]): Promise<any[]> {
    const results: any[] = [];
    
    try {
      // 搜索消耗品相关的合集包
      const packNames = ['pf2e.consumables', 'pf2e.equipment-srd'];
      
      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;
        
        // 获取集合包内容
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          // 只搜索消耗品类型
          if (doc.type === 'consumable' || doc.system?.consumableType) {
            const relevance = this.calculateRelevance(doc, keywords);
            if (relevance > 0.3) {
              results.push({
                name: doc.name,
                type: doc.type,
                description: doc.system?.description?.value || '',
                source: packName,
                relevance: relevance,
                level: doc.system?.level?.value || 0,
                consumableType: doc.system?.consumableType?.value || 'other'
              });
            }
          }
        }
      }
      
      // 按相关性排序并限制结果数量
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
        
    } catch (error) {
      console.warn('消耗品合集包搜索失败:', error);
      return [];
    }
  }

  /**
   * 计算基于特征的相关性分数
   */
  private calculateTraitBasedRelevance(
    doc: any, 
    description: string, 
    targetLevel: number, 
    itemLevel: number, 
    desiredTraits: string[], 
    itemTraits: string[]
  ): number {
    let score = 0;
    
    // 1. 等级匹配分数 (权重: 40%)
    const levelDiff = Math.abs(targetLevel - itemLevel);
    let levelScore = 0;
    if (levelDiff === 0) {
      levelScore = 1.0; // 完全匹配
    } else if (levelDiff <= 2) {
      levelScore = 0.8; // 接近匹配
    } else if (levelDiff <= 5) {
      levelScore = 0.5; // 可接受范围
    } else {
      levelScore = 0.2; // 差距较大但仍可参考
    }
    score += levelScore * 0.4;
    
    // 2. 特征重合度分数 (权重: 35%)
    const traitOverlap = this.calculateTraitOverlap(desiredTraits, itemTraits);
    score += traitOverlap * 0.35;
    
    // 3. 描述相关性分数 (权重: 25%)
    const descriptionScore = this.calculateDescriptionRelevance(doc, description);
    score += descriptionScore * 0.25;
    
    return score;
  }

  /**
   * 计算特征重合度
   */
  private calculateTraitOverlap(desiredTraits: string[], itemTraits: string[]): number {
    if (desiredTraits.length === 0) return 0.5; // 没有指定特征时给予中等分数
    
    const matchingTraits = desiredTraits.filter(desired => 
      itemTraits.some(item => item.includes(desired) || desired.includes(item))
    );
    
    return matchingTraits.length / desiredTraits.length;
  }

  /**
   * 计算描述相关性
   */
  private calculateDescriptionRelevance(doc: any, description: string): number {
    const text = `${doc.name} ${doc.system?.description?.value || ''}`.toLowerCase();
    const descWords = description.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    let matches = 0;
    for (const word of descWords) {
      if (text.includes(word)) {
        matches++;
        // 名称匹配权重更高
        if (doc.name.toLowerCase().includes(word)) {
          matches += 0.5;
        }
      }
    }
    
    return Math.min(matches / Math.max(descWords.length, 1), 1.0);
  }

  /**
   * 装备搜索备用方法
   */
  private async searchEquipmentFallback(description: string, targetLevel: number, minResults: number): Promise<any[]> {
    const results: any[] = [];
    
    try {
      const packNames = ['pf2e.equipment-srd', 'pf2e.treasure'];
      
      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;
        
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          if (doc.type === 'consumable') continue;
          
          const itemLevel = doc.system?.level?.value || 0;
          const itemTraits = (doc.system?.traits?.value || []).map((t: string) => t.toLowerCase());
          
          // 使用简化的相关性计算
          const score = this.calculateDescriptionRelevance(doc, description) * 0.7 +
                       (Math.abs(targetLevel - itemLevel) <= 5 ? 0.3 : 0.1);
          
          if (score > 0.2) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              source: packName,
              relevance: score,
              level: itemLevel,
              traits: itemTraits,
              traitOverlap: 0
            });
          }
        }
      }
      
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, Math.max(minResults, 10));
        
    } catch (error) {
      console.warn('装备备用搜索失败:', error);
      return [];
    }
  }

  /**
   * 消耗品搜索备用方法
   */
  private async searchConsumableFallback(description: string, targetLevel: number, minResults: number): Promise<any[]> {
    const results: any[] = [];
    
    try {
      const packNames = ['pf2e.consumables'];
      
      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;
        
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          if (doc.type !== 'consumable' && !doc.system?.consumableType) continue;
          
          const itemLevel = doc.system?.level?.value || 0;
          const itemTraits = (doc.system?.traits?.value || []).map((t: string) => t.toLowerCase());
          
          // 使用简化的相关性计算
          const score = this.calculateDescriptionRelevance(doc, description) * 0.7 +
                       (Math.abs(targetLevel - itemLevel) <= 5 ? 0.3 : 0.1);
          
          if (score > 0.2) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              source: packName,
              relevance: score,
              level: itemLevel,
              traits: itemTraits,
              consumableType: doc.system?.consumableType?.value || 'other',
              traitOverlap: 0
            });
          }
        }
      }
      
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, Math.max(minResults, 10));
        
    } catch (error) {
      console.warn('消耗品备用搜索失败:', error);
      return [];
    }
  }

  /**
   * 计算相关性分数（旧方法）
   */
  private calculateRelevance(doc: any, keywords: string[]): number {
    const text = `${doc.name} ${doc.system?.description?.value || ''}`.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (text.includes(lowerKeyword)) {
        score += 1;
        // 名称匹配权重更高
        if (doc.name.toLowerCase().includes(lowerKeyword)) {
          score += 0.5;
        }
      }
    }
    
    return score / keywords.length;
  }

  /**
   * 格式化合集包上下文
   */
  private formatCompendiumContext(results: any[]): string {
    if (results.length === 0) return '';
    
    let context = '\n\n=== PF2e官方参考内容（请严格遵循其书写格式和术语标准）===\n';
    context += `找到 ${results.length} 个相关参考物品：\n\n`;
    
    for (const result of results) {
      const cleanDescription = result.description.replace(/<[^>]*>/g, '').substring(0, 120);
      const traitsText = result.traits && result.traits.length > 0 ? 
        ` [特征: ${result.traits.slice(0, 4).join(', ')}]` : '';
      const overlapText = result.traitOverlap > 0 ? 
        ` (特征匹配度: ${Math.round(result.traitOverlap * 100)}%)` : '';
      
      context += `- **${result.name}** (等级${result.level || '?'})${traitsText}${overlapText}\n`;
      context += `  ${cleanDescription}...\n\n`;
    }
    
    context += '**重要提醒**：请参考上述官方内容的书写格式、术语使用、特征标签和表述方式，确保生成的内容符合PF2e标准。\n';
    context += '**特征要求**：生成的物品应包含相关的特征标签，并遵循官方的特征使用规范。\n';
    
    return context;
  }

  private addStyles() {
    if ($('#ai-pf2e-item-generator-styles').length === 0) {
      $('head').append(`
        <style id="ai-pf2e-item-generator-styles">
          /* Scoped styles for item-generator-dialog ONLY */
          .item-generator-dialog {
            font-family: 'Signika', sans-serif;
          }
          
          .item-generator-dialog .ai-pf2e-assistant-container.item-generator {
            padding: 20px;
          }
          
          .item-generator-dialog .generator-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
          }
          
          .item-generator-dialog .tab-panel {
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 20px;
            background: #f9f9f9;
          }
          
          .item-generator-dialog .tab-panel h3 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
          }
          
          .item-generator-dialog .form-group {
            margin-bottom: 15px;
          }
          
          .item-generator-dialog .form-group label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
            color: #2c3e50;
          }
          
          .item-generator-dialog .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
            font-family: inherit;
          }
          
          .item-generator-dialog .form-group .hint {
            font-size: 0.9em;
            color: #666;
            margin: 5px 0;
            font-style: italic;
          }
          
          .item-generator-dialog .count-selector,
          .item-generator-dialog .level-selector {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          
          .item-generator-dialog .count-selector input,
          .item-generator-dialog .level-selector input {
            width: 80px;
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          
          .item-generator-dialog .form-group button {
            padding: 10px 20px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.3s;
          }
          
          .item-generator-dialog .form-group button:hover:not(:disabled) {
            background: #2980b9;
          }
          
          .item-generator-dialog .form-group button:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
          }
          
          .item-generator-dialog .form-group.buttons {
            display: flex;
            gap: 10px;
          }
          
          .item-generator-dialog .equipment-preview,
          .item-generator-dialog .consumable-preview {
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
            max-height: 400px;
            overflow-y: auto;
            background: white;
          }
          
          .item-generator-dialog .equipment-item,
          .item-generator-dialog .consumable-item {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            background: #fafafa;
          }
          
          .item-generator-dialog .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          
          .item-generator-dialog .item-header h4 {
            margin: 0;
            color: #2c3e50;
          }
          
          .item-generator-dialog .item-level {
            background: #3498db;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8em;
          }
          
          .item-generator-dialog .item-details p {
            margin: 5px 0;
            font-size: 0.9em;
          }
          
          .item-generator-dialog .item-actions {
            margin-top: 10px;
            text-align: right;
          }
          
          .item-generator-dialog .item-actions button {
            padding: 5px 10px;
            font-size: 0.8em;
            background: #27ae60;
          }
          
          .item-generator-dialog .item-actions button:hover:not(:disabled) {
            background: #219a52;
          }
          
          .item-generator-dialog .item-actions button.icon-generated {
            background: #27ae60;
          }
          
          .item-generator-dialog .item-actions button.icon-failed {
            background: #e74c3c;
          }
          
          .item-generator-dialog .success-status {
            position: fixed;
            top: 50px;
            right: 20px;
            z-index: 10000;
            background: #27ae60;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          
          .item-generator-dialog .success-message {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          
          .item-generator-dialog .success-message i {
            font-size: 1.2em;
          }
        </style>
      `);
    }
  }
}