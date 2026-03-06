import { MODULE_ID } from '../constants';
import { IconGenerationService, IconGenerationOptions } from '../services/icon-generation-service';
import {
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS
} from '../services/prompt-templates';
import {
  parseFunctionCallResponse,
  validateAndFixEquipmentData,
  postProcessEquipment,
  getDefaultEquipmentIcon,
  getEquipmentTypeName,
  getEquipmentTypeGuidance,
  EQUIPMENT_PRICE_GUIDANCE,
  EQUIPMENT_DESCRIPTION_FORMAT
} from '../utils/pf2e-data-utils';

declare const $: any;
declare const game: any;
declare const ui: any;
declare const Item: any;
declare const Dialog: any;

/**
 * 物品生成的 Function Calling Schema
 */
const EQUIPMENT_GENERATION_SCHEMA = {
  name: "generateEquipment",
  description: "生成一个完整的PF2e物品，包含所有必需字段",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "物品名称（中文）" },
      type: {
        type: "string",
        enum: ["weapon", "equipment", "consumable", "armor", "treasure"],
        description: "物品类型"
      },
      img: { type: "string", description: "物品图标路径" },
      system: {
        type: "object",
        properties: {
          description: {
            type: "object",
            properties: {
              value: { type: "string", description: "物品完整HTML描述，包含所有效果和激活能力", minLength: 30 },
              gm: { type: "string", description: "GM描述（可选）" }
            },
            required: ["value"]
          },
          level: {
            type: "object",
            properties: { value: { type: "number", description: "物品等级 (0-20)" } },
            required: ["value"]
          },
          price: {
            type: "object",
            properties: {
              value: {
                type: "object",
                properties: {
                  gp: { type: "number" }, sp: { type: "number" }, cp: { type: "number" }
                }
              }
            },
            required: ["value"]
          },
          bulk: {
            type: "object",
            properties: { value: { type: ["number", "string"], description: "重量，数字或'L'" } },
            required: ["value"]
          },
          traits: {
            type: "object",
            properties: {
              value: { type: "array", items: { type: "string" }, description: "物品特征" },
              rarity: { type: "string", enum: ["common", "uncommon", "rare", "unique"] }
            },
            required: ["value", "rarity"]
          },
          usage: {
            type: "object",
            properties: { value: { type: "string", description: "使用方式" } },
            required: ["value"]
          },
          rules: { type: "array", items: { type: "object" }, description: "规则元素数组（可选）" },
          damage: {
            type: "object",
            properties: {
              damageType: { type: "string" }, dice: { type: "number" }, die: { type: "string" }
            },
            description: "武器伤害（仅武器类型需要）"
          },
          category: { type: "string", description: "武器类别或护甲类别" },
          group: { type: "string", description: "武器组（仅武器需要）" },
          runes: {
            type: "object",
            properties: {
              potency: { type: "number" }, property: { type: "array", items: { type: "string" } }, striking: { type: "number" }
            },
            description: "符文（仅武器需要）"
          },
          range: { type: ["number", "null"], description: "射程（仅远程武器需要）" },
          consumableType: {
            type: "object",
            properties: { value: { type: "string" } },
            description: "消耗品类型（仅消耗品需要）"
          },
          charges: {
            type: "object",
            properties: { max: { type: "number" }, value: { type: "number" } },
            description: "充能（仅消耗品需要）"
          },
          armor: {
            type: "object",
            properties: { value: { type: "number" } },
            description: "AC加值（仅护甲需要）"
          }
        },
        required: ["description", "level", "price", "bulk", "traits", "usage"]
      }
    },
    required: ["name", "type", "system"]
  }
};

export class ItemGeneratorApp {
  private generatedItem: any = null;
  private iconService: IconGenerationService;

  constructor() {
    this.iconService = IconGenerationService.getInstance();
    this.render();
  }

  async render() {
    const i18n = (key: string) => game.i18n.localize(`AIPF2E.ItemGenerator.${key}`);

    const dialogContent = `
      <div class="ai-pf2e-assistant-container item-generator">
        <div class="generator-form">
          <div class="form-group">
            <label for="item-type">${i18n('itemType')}</label>
            <select id="item-type">
              <option value="equipment">${i18n('types.equipment')}</option>
              <option value="weapon">${i18n('types.weapon')}</option>
              <option value="armor">${i18n('types.armor')}</option>
              <option value="consumable">${i18n('types.consumable')}</option>
              <option value="treasure">${i18n('types.treasure')}</option>
            </select>
          </div>

          <div class="form-group weapon-category-group" style="display:none;">
            <label for="weapon-category">${i18n('weaponCategory')}</label>
            <select id="weapon-category">
              <option value="simple">${i18n('weaponCategories.simple')}</option>
              <option value="martial">${i18n('weaponCategories.martial')}</option>
              <option value="advanced">${i18n('weaponCategories.advanced')}</option>
            </select>
          </div>

          <div class="form-group armor-category-group" style="display:none;">
            <label for="armor-category">${i18n('armorCategory')}</label>
            <select id="armor-category">
              <option value="light">${i18n('armorCategories.light')}</option>
              <option value="medium">${i18n('armorCategories.medium')}</option>
              <option value="heavy">${i18n('armorCategories.heavy')}</option>
            </select>
          </div>

          <div class="form-group consumable-type-group" style="display:none;">
            <label for="consumable-type">${i18n('consumableType')}</label>
            <select id="consumable-type">
              <option value="potion">${i18n('consumableTypes.potion')}</option>
              <option value="elixir">${i18n('consumableTypes.elixir')}</option>
              <option value="scroll">${i18n('consumableTypes.scroll')}</option>
              <option value="talisman">${i18n('consumableTypes.talisman')}</option>
              <option value="oil">${i18n('consumableTypes.oil')}</option>
              <option value="ammunition">${i18n('consumableTypes.ammunition')}</option>
              <option value="other">${i18n('consumableTypes.other')}</option>
            </select>
          </div>

          <div class="form-group">
            <label for="item-description">${i18n('description')}</label>
            <p class="hint">${i18n('descriptionHint')}</p>
            <textarea name="item-description" id="item-description" rows="5" placeholder="${i18n('descriptionPlaceholder')}"></textarea>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label for="item-level">${i18n('level')}</label>
              <input type="number" name="item-level" id="item-level" min="0" max="20" value="1">
            </div>

            <div class="form-group half">
              <label for="item-rarity">${i18n('rarity')}</label>
              <select id="item-rarity">
                <option value="common">${i18n('rarities.common')}</option>
                <option value="uncommon">${i18n('rarities.uncommon')}</option>
                <option value="rare">${i18n('rarities.rare')}</option>
                <option value="unique">${i18n('rarities.unique')}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" id="enable-compendium-search">
              ${i18n('enableCompendium')}
            </label>
            <p class="hint">${i18n('enableCompendiumHint')}</p>
          </div>

          <div class="form-group">
            <button class="generate-item" type="button">${i18n('generate')}</button>
          </div>

          <div class="form-group">
            <label>${i18n('result')}</label>
            <div id="item-preview" class="item-preview">
              <p>${i18n('resultPlaceholder')}</p>
            </div>
          </div>

          <div class="form-group buttons">
            <button class="create-item" type="button" disabled>${i18n('create')}</button>
            <button class="generate-icon-btn" type="button" disabled>${i18n('generateIcon')}</button>
            <button class="clear-preview" type="button">${i18n('clearPreview')}</button>
          </div>
        </div>

        <div class="success-status" style="display: none;">
          <div class="success-message">
            <i class="fas fa-check-circle"></i>
            <span class="message-text"></span>
          </div>
        </div>
      </div>
    `;

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
      close: () => { }
    }, {
      classes: ['dialog', 'ai-pf2e-assistant-dialog', 'item-generator-dialog'],
      width: 650,
      height: 750,
      resizable: true
    }).render(true);
  }

  private activateListeners(html: any) {
    // Type selection toggles sub-options
    html.find('#item-type').change((event: any) => {
      const type = event.target.value;
      html.find('.weapon-category-group').toggle(type === 'weapon');
      html.find('.armor-category-group').toggle(type === 'armor');
      html.find('.consumable-type-group').toggle(type === 'consumable');
    });

    html.find('.generate-item').click(async (event: any) => {
      event.preventDefault();
      await this.generateItem(html);
    });

    html.find('.create-item').click(async (event: any) => {
      event.preventDefault();
      await this.createItem(html);
    });

    html.find('.generate-icon-btn').click(async (event: any) => {
      event.preventDefault();
      await this.generateItemIcon(html);
    });

    html.find('.clear-preview').click((event: any) => {
      event.preventDefault();
      this.clearPreview(html);
    });

    this.addStyles();
  }

  // ============================================================
  // Core generation logic with Function Calling
  // ============================================================

  private async generateItem(html: any) {
    const description = html.find('#item-description').val();
    const level = parseInt(html.find('#item-level').val()) || 1;
    const itemType = html.find('#item-type').val() as string;
    const rarity = html.find('#item-rarity').val() as string;
    const enableCompendiumSearch = html.find('#enable-compendium-search').prop('checked');

    if (!description.trim()) {
      ui.notifications.warn(game.i18n.localize('AIPF2E.ItemGenerator.noDescription'));
      return;
    }

    // Get sub-category if applicable
    let subCategory = '';
    if (itemType === 'weapon') subCategory = html.find('#weapon-category').val();
    else if (itemType === 'armor') subCategory = html.find('#armor-category').val();
    else if (itemType === 'consumable') subCategory = html.find('#consumable-type').val();

    const generateButton = html.find('.generate-item');
    const originalText = generateButton.text();
    generateButton.prop('disabled', true).text(game.i18n.localize('AIPF2E.ItemGenerator.generating'));

    try {
      let compendiumContext = '';
      if (enableCompendiumSearch) {
        try {
          const searchResults = await this.searchCompendium(description, level, itemType);
          compendiumContext = this.formatCompendiumContext(searchResults);
        } catch (searchError) {
          console.warn('[ItemGenerator] 合集包搜索失败:', searchError);
        }
      }

      const systemPrompt = this.buildSystemPrompt(itemType, level, subCategory, rarity);
      const userPrompt = this.buildUserPrompt(description, level, itemType, subCategory, rarity, compendiumContext);

      console.log('=== 物品生成系统提示词 ===');
      console.log(systemPrompt);
      console.log('=== 物品生成用户提示词 ===');
      console.log(userPrompt);

      const apiUrl = game.settings.get(MODULE_ID, 'apiUrl');
      const apiKey = game.settings.get(MODULE_ID, 'apiKey');
      const model = game.settings.get(MODULE_ID, 'shrineDirectModel') || game.settings.get(MODULE_ID, 'aiModel') || 'gpt-4o';

      if (!apiUrl || !apiKey) {
        throw new Error('请先配置API设置');
      }

      // Call API with Function Calling
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          tools: [{
            type: 'function',
            function: EQUIPMENT_GENERATION_SCHEMA
          }],
          tool_choice: { type: 'function', function: { name: 'generateEquipment' } }
        })
      });

      if (!response.ok) {
        throw new Error(`API调用失败: ${response.status}`);
      }

      const data = await response.json();
      let parsedContent = parseFunctionCallResponse(data, 'generateEquipment');

      if (!parsedContent) {
        // Fallback: try plain text
        console.warn('[ItemGenerator] Function Calling 失败，尝试 fallback');
        const fallbackResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt + '\n\n请直接输出JSON格式的物品数据。' }
            ],
            temperature: 0.5
          })
        });
        const fallbackData = await fallbackResponse.json();
        parsedContent = parseFunctionCallResponse(fallbackData);
        if (!parsedContent) {
          throw new Error('无法解析AI响应');
        }
      }

      // Validate and fix the equipment data
      let equipment = validateAndFixEquipmentData(parsedContent);
      equipment = postProcessEquipment(equipment, itemType, level, subCategory);

      // Override rarity
      if (equipment.system.traits) {
        equipment.system.traits.rarity = rarity;
      }

      this.generatedItem = equipment;
      this.renderItemPreview(equipment, html);
      html.find('.create-item').prop('disabled', false);
      html.find('.generate-icon-btn').prop('disabled', false);

    } catch (error: any) {
      console.error('[ItemGenerator] 生成失败:', error);
      ui.notifications.error(`${game.i18n.localize('AIPF2E.ItemGenerator.generateFailed')}: ${error.message}`);
    } finally {
      generateButton.prop('disabled', false).text(originalText);
    }
  }

  /**
   * Build system prompt with full PF2e knowledge
   */
  private buildSystemPrompt(itemType: string, level: number, _subCategory: string, rarity: string): string {
    const typeName = getEquipmentTypeName(itemType);
    const typeGuidance = getEquipmentTypeGuidance(itemType);

    return `你是一个专业的Pathfinder 2e物品设计师。你需要根据用户描述设计一个完整的、高质量的PF2e ${typeName}。

**🌏 语言要求（最高优先级）**：
- **物品名称（name字段）使用"中文 英文"双语格式**，如"杂耍长棒 Acrobat's Staff"
- 所有描述内容（description.value）必须使用中文
- 所有结构标签必须使用中文（启动、频率、效果、需求、触发、豁免、特殊）
- 动作组件特征翻译为中文（concentrate→专注, manipulate→交互, envision→想象, command→命令）
- UUID引用显示文本使用双语格式：{恶心 Sickened 1}
- 嵌入式引用 @Damage/@Check/@Template 方括号内使用英文

---

## 物品类型：${typeName}

${typeGuidance}

---

## 价格指导

${EQUIPMENT_PRICE_GUIDANCE}

---

${EQUIPMENT_DESCRIPTION_FORMAT}

---

${DESCRIPTION_PRINCIPLE}

${PF2E_FORMAT_STANDARD}

${TECHNICAL_REQUIREMENTS}

---

## 设计要求

1. **完整的描述内容**
   - description.value 是最重要的字段
   - 包含物品的背景描述、被动效果和启动能力
   - 使用标准 PF2e HTML 格式（<p>、<strong>、<hr />）
   - 使用中文"启动"格式描述启动能力（见上方描述格式指导）
   - ❌ 禁止使用英文标签（Activate, Effect, Frequency 等）

2. **准确的数据结构**
   - 所有必需字段必须存在
   - 数值合理（价格、等级、加值等）
   - traits 包含相关特征（magical, invested 等）

3. **平衡性**
   - 效果强度匹配 ${level} 级物品
   - 价格符合同等级参考价格
   - 稀有度: ${rarity}

4. **rules 数组**（可选但推荐）
   - 为被动效果添加 FlatModifier 等规则元素
   - 格式示例: { "key": "FlatModifier", "selector": "arcana", "type": "item", "value": 2 }

请调用 generateEquipment 函数生成完整的物品数据。`;
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(description: string, level: number, itemType: string, subCategory: string, rarity: string, compendiumContext: string): string {
    const typeName = getEquipmentTypeName(itemType);
    let prompt = `请设计一个 ${level} 级的 ${typeName}`;
    if (subCategory) {
      prompt += `（类别: ${subCategory}）`;
    }
    prompt += `，稀有度: ${rarity}。\n\n`;
    prompt += `描述需求：\n${description}\n\n`;

    prompt += `要求：
- 等级: ${level}
- 类型: ${itemType}
- 稀有度: ${rarity}`;
    if (subCategory) {
      prompt += `\n- 类别: ${subCategory}`;
    }
    prompt += `
- description.value 必须包含完整的效果描述（HTML格式）
- 使用标准的 PF2e Activate 格式描述激活能力
- 价格符合同等级参考价格
- 只写游戏规则，不要写设计理念等元信息`;

    if (compendiumContext) {
      prompt += `\n\n${compendiumContext}`;
    }

    return prompt;
  }

  // ============================================================
  // Preview rendering
  // ============================================================

  private renderItemPreview(item: any, html: any) {
    const preview = html.find('#item-preview');
    const typeName = getEquipmentTypeName(item.type);
    const rarityClass = item.system?.traits?.rarity || 'common';
    const traits = item.system?.traits?.value || [];
    const price = item.system?.price?.value;
    const priceStr = price ? Object.entries(price).filter(([_, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ') : '无';

    let previewHtml = `
      <div class="item-card rarity-${rarityClass}">
        <div class="item-header">
          <div class="item-title">
            <img src="${item.img || getDefaultEquipmentIcon(item.type)}" class="item-icon" />
            <div>
              <h4>${item.name}</h4>
              <span class="item-type">${typeName}</span>
            </div>
          </div>
          <span class="item-level">Lv ${item.system?.level?.value || 1}</span>
        </div>
        <div class="item-traits">
          <span class="trait rarity-tag ${rarityClass}">${rarityClass}</span>
          ${traits.map((t: string) => `<span class="trait">${t}</span>`).join('')}
        </div>
        <div class="item-meta">
          <span><strong>价格:</strong> ${priceStr}</span>
          <span><strong>重量:</strong> ${item.system?.bulk?.value ?? 0}</span>
          <span><strong>使用:</strong> ${item.system?.usage?.value || '-'}</span>
        </div>`;

    // Type-specific details
    if (item.type === 'weapon' && item.system?.damage) {
      const dmg = item.system.damage;
      previewHtml += `<div class="item-meta">
        <span><strong>伤害:</strong> ${dmg.dice || 1}${dmg.die || 'd6'} ${dmg.damageType || ''}</span>
        <span><strong>武器类别:</strong> ${item.system.category || '-'}</span>
        <span><strong>武器组:</strong> ${item.system.group || '-'}</span>
      </div>`;
    }
    if (item.type === 'armor' && item.system?.armor) {
      previewHtml += `<div class="item-meta">
        <span><strong>AC加值:</strong> +${item.system.armor.value}</span>
        <span><strong>敏捷上限:</strong> +${item.system.dex?.value ?? '-'}</span>
        <span><strong>力量需求:</strong> ${item.system.strength?.value || 0}</span>
      </div>`;
    }

    previewHtml += `
        <div class="item-description">
          ${item.system?.description?.value || '<p>无描述</p>'}
        </div>`;

    if (item.system?.rules?.length > 0) {
      previewHtml += `<div class="item-rules">
        <strong>规则元素 (${item.system.rules.length})</strong>
        <pre>${JSON.stringify(item.system.rules, null, 2)}</pre>
      </div>`;
    }

    previewHtml += `</div>`;
    preview.html(previewHtml);
  }

  // ============================================================
  // Item creation
  // ============================================================

  private async createItem(html: any) {
    if (!this.generatedItem) {
      ui.notifications.warn(game.i18n.localize('AIPF2E.ItemGenerator.noItems'));
      return;
    }

    const createButton = html.find('.create-item');
    const originalText = createButton.text();
    createButton.prop('disabled', true).text(game.i18n.localize('AIPF2E.ItemGenerator.creating'));

    try {
      const createdItem = await Item.create(this.generatedItem);
      if (createdItem) {
        const message = game.i18n.format('AIPF2E.ItemGenerator.createSuccess', { name: this.generatedItem.name });
        this.showSuccessMessage(html, message);
        ui.notifications.info(message);
      } else {
        ui.notifications.error(game.i18n.localize('AIPF2E.ItemGenerator.generateFailed'));
      }
    } catch (error: any) {
      console.error('[ItemGenerator] 创建失败:', error);
      ui.notifications.error(`${game.i18n.localize('AIPF2E.ItemGenerator.generateFailed')}: ${error.message}`);
    } finally {
      createButton.prop('disabled', false).text(originalText);
    }
  }

  // ============================================================
  // Icon generation
  // ============================================================

  private async generateItemIcon(html: any) {
    if (!this.generatedItem) return;

    const button = html.find('.generate-icon-btn');
    const originalText = button.text();
    button.prop('disabled', true).text(game.i18n.localize('AIPF2E.ItemGenerator.generatingIcon'));

    try {
      const iconOptions: IconGenerationOptions = {
        name: this.generatedItem.name,
        description: (this.generatedItem.system?.description?.value || '').replace(/<[^>]*>/g, '').substring(0, 200),
        type: 'item',
        iconPrompt: ''
      };

      const generatedIcon = await this.iconService.generateIcon(iconOptions);
      if (generatedIcon) {
        this.generatedItem.img = generatedIcon.url || generatedIcon;
        this.renderItemPreview(this.generatedItem, html);
        button.text(game.i18n.localize('AIPF2E.ItemGenerator.iconGenerated')).addClass('icon-generated');
        ui.notifications.info(`${this.generatedItem.name} 图标已生成`);
      }
    } catch (error: any) {
      console.error('[ItemGenerator] 图标生成失败:', error);
      button.text(game.i18n.localize('AIPF2E.ItemGenerator.iconFailed')).addClass('icon-failed');
    } finally {
      setTimeout(() => {
        if (!button.hasClass('icon-generated')) {
          button.prop('disabled', false).text(originalText).removeClass('icon-failed');
        }
      }, 3000);
    }
  }

  // ============================================================
  // Compendium search
  // ============================================================

  private async searchCompendium(description: string, targetLevel: number, itemType: string): Promise<any[]> {
    const results: any[] = [];

    try {
      const packNames = itemType === 'consumable'
        ? ['pf2e.equipment-srd']
        : ['pf2e.equipment-srd'];

      for (const packName of packNames) {
        const pack = (game as any).packs?.get(packName);
        if (!pack) continue;

        const documents = await pack.getDocuments();

        for (const doc of documents) {
          const itemLevel = doc.system?.level?.value || 0;
          const levelDiff = Math.abs(targetLevel - itemLevel);
          if (levelDiff > 5) continue;

          const text = `${doc.name} ${doc.system?.description?.value || ''}`.toLowerCase();
          const descWords = description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1);
          let nameMatch = 0;
          let textMatch = 0;

          for (const word of descWords) {
            if (doc.name.toLowerCase().includes(word)) nameMatch++;
            else if (text.includes(word)) textMatch++;
          }

          const score = (nameMatch * 2 + textMatch) / Math.max(descWords.length, 1) * 0.6 +
            (levelDiff === 0 ? 0.4 : levelDiff <= 2 ? 0.3 : 0.1);

          if (score > 0.3) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              level: itemLevel,
              traits: doc.system?.traits?.value || [],
              relevance: score
            });
          }
        }
      }

      return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
    } catch (error) {
      console.warn('[ItemGenerator] 合集包搜索失败:', error);
      return [];
    }
  }

  private formatCompendiumContext(results: any[]): string {
    if (results.length === 0) return '';

    let context = '\n\n## PF2e官方参考物品\n\n请参考以下官方物品的格式和风格：\n';
    for (const result of results) {
      const cleanDesc = result.description.replace(/<[^>]*>/g, '').substring(0, 150);
      const traitsStr = result.traits?.length > 0 ? ` [${result.traits.slice(0, 4).join(', ')}]` : '';
      context += `- **${result.name}** (Lv${result.level})${traitsStr}: ${cleanDesc}...\n`;
    }
    return context;
  }

  // ============================================================
  // UI helpers
  // ============================================================

  private clearPreview(html: any) {
    html.find('#item-preview').html(`<p>${game.i18n.localize('AIPF2E.ItemGenerator.resultPlaceholder')}</p>`);
    html.find('.create-item').prop('disabled', true);
    html.find('.generate-icon-btn').prop('disabled', true);
    this.generatedItem = null;
  }

  private showSuccessMessage(html: any, message: string) {
    const successStatus = html.find('.success-status');
    successStatus.find('.message-text').text(message);
    successStatus.show();
    setTimeout(() => { successStatus.fadeOut(); }, 3000);
  }

  private addStyles() {
    if ($('#ai-pf2e-item-generator-styles').length === 0) {
      $('head').append(`
        <style id="ai-pf2e-item-generator-styles">
          .item-generator-dialog .ai-pf2e-assistant-container.item-generator { padding: 15px; }
          .item-generator-dialog .generator-form { display: flex; flex-direction: column; gap: 10px; }
          .item-generator-dialog .form-group { margin-bottom: 8px; }
          .item-generator-dialog .form-group label { display: block; font-weight: bold; margin-bottom: 4px; color: #2c3e50; }
          .item-generator-dialog .form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; }
          .item-generator-dialog .form-group select { width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; }
          .item-generator-dialog .form-group .hint { font-size: 0.85em; color: #666; margin: 3px 0; font-style: italic; }
          .item-generator-dialog .form-row { display: flex; gap: 15px; }
          .item-generator-dialog .form-group.half { flex: 1; }
          .item-generator-dialog .form-group.half input,
          .item-generator-dialog .form-group.half select { width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; }
          .item-generator-dialog .form-group button { padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
          .item-generator-dialog .form-group button:hover:not(:disabled) { background: #2980b9; }
          .item-generator-dialog .form-group button:disabled { background: #bdc3c7; cursor: not-allowed; }
          .item-generator-dialog .form-group.buttons { display: flex; gap: 8px; }
          .item-generator-dialog .item-preview { border: 1px solid #ddd; border-radius: 4px; padding: 12px; max-height: 400px; overflow-y: auto; background: white; }

          .item-generator-dialog .item-card { border: 1px solid #ccc; border-radius: 8px; padding: 12px; background: #fafafa; }
          .item-generator-dialog .item-card.rarity-uncommon { border-left: 4px solid #c45500; }
          .item-generator-dialog .item-card.rarity-rare { border-left: 4px solid #002fa7; }
          .item-generator-dialog .item-card.rarity-unique { border-left: 4px solid #800080; }
          .item-generator-dialog .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .item-generator-dialog .item-title { display: flex; align-items: center; gap: 8px; }
          .item-generator-dialog .item-icon { width: 32px; height: 32px; border-radius: 4px; }
          .item-generator-dialog .item-title h4 { margin: 0; color: #2c3e50; }
          .item-generator-dialog .item-type { font-size: 0.8em; color: #666; }
          .item-generator-dialog .item-level { background: #3498db; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.85em; font-weight: bold; }
          .item-generator-dialog .item-traits { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
          .item-generator-dialog .trait { background: #e0e0e0; padding: 1px 6px; border-radius: 3px; font-size: 0.75em; }
          .item-generator-dialog .rarity-tag.uncommon { background: #c45500; color: white; }
          .item-generator-dialog .rarity-tag.rare { background: #002fa7; color: white; }
          .item-generator-dialog .rarity-tag.unique { background: #800080; color: white; }
          .item-generator-dialog .item-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; font-size: 0.85em; color: #555; }
          .item-generator-dialog .item-description { border-top: 1px solid #ddd; padding-top: 8px; font-size: 0.9em; line-height: 1.5; }
          .item-generator-dialog .item-description p { margin: 4px 0; }
          .item-generator-dialog .item-rules { border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px; }
          .item-generator-dialog .item-rules pre { font-size: 0.75em; max-height: 120px; overflow-y: auto; background: #f0f0f0; padding: 8px; border-radius: 4px; }
          .item-generator-dialog .icon-generated { background: #27ae60 !important; }
          .item-generator-dialog .icon-failed { background: #e74c3c !important; }

          .item-generator-dialog .success-status { position: fixed; top: 50px; right: 20px; z-index: 10000; background: #27ae60; color: white; padding: 12px 18px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
          .item-generator-dialog .success-message { display: flex; align-items: center; gap: 8px; }
        </style>
      `);
    }
  }
}
