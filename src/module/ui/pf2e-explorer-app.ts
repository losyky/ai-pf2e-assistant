import { MODULE_ID } from '../constants';

// 声明全局变量
declare const $: any;
declare const game: any;
declare const ui: any;
declare const Dialog: any;

export class PF2eExplorerApp {
  constructor() {
    this.render();
  }

  async render() {
    // 获取国际化文本
    const i18n = (key: string) => game.i18n.localize(`AIPF2E.Explorer.${key}`);
    
    const dialogContent = `
      <div class="ai-pf2e-assistant-container pf2e-explorer">
        <div class="explorer-section">
          <h3>${i18n('title')}</h3>
          <p class="hint">${i18n('description')}</p>
        </div>

        <div class="explorer-tabs">
          <!-- 集合包探索 -->
          <div class="tab-panel compendium-panel">
            <h4>${i18n('compendium.title')}</h4>
            
            <div class="form-group">
              <label for="compendium-select">${i18n('compendium.select')}</label>
              <select name="compendium-select" id="compendium-select">
                <option value="">${i18n('compendium.selectPlaceholder')}</option>
              </select>
            </div>

            <div class="form-group">
              <button class="load-compendium" type="button">${i18n('compendium.load')}</button>
            </div>

            <div class="form-group">
              <label for="compendium-items">${i18n('compendium.items')}</label>
              <select name="compendium-items" id="compendium-items" size="20">
                <option value="">${i18n('compendium.itemsPlaceholder')}</option>
              </select>
            </div>

            <div class="form-group">
              <button class="analyze-item" type="button" disabled>${i18n('compendium.analyze')}</button>
            </div>
          </div>

          <!-- 世界物品探索 -->
          <div class="tab-panel world-panel">
            <h4>${i18n('world.title')}</h4>
            
            <div class="form-group">
              <label for="world-items">${i18n('world.items')}</label>
              <select name="world-items" id="world-items" size="20">
                <option value="">${i18n('world.itemsPlaceholder')}</option>
              </select>
            </div>

            <div class="form-group">
              <button class="analyze-world-item" type="button" disabled>${i18n('world.analyze')}</button>
            </div>
          </div>
        </div>

        <!-- 分析结果 -->
        <div class="analysis-section">
          <h4>${i18n('analysis.title')}</h4>
          <div class="analysis-result">
            <p>${i18n('analysis.placeholder')}</p>
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
      close: () => {}
    }, {
      classes: ['dialog', 'ai-pf2e-assistant-dialog', 'pf2e-explorer-dialog'],
      width: 1000,
      height: 800,
      resizable: true
    }).render(true);
  }

  private activateListeners(html: any) {
    // 加载集合包列表
    this.loadCompendiumList(html);
    
    // 加载世界物品列表
    this.loadWorldItems(html);

    // 绑定事件
    html.find('.load-compendium').click(async (event: any) => {
      event.preventDefault();
      await this.loadCompendiumItems(html);
    });

    html.find('.analyze-item').click(async (event: any) => {
      event.preventDefault();
      await this.analyzeCompendiumItem(html);
    });

    html.find('.analyze-world-item').click(async (event: any) => {
      event.preventDefault();
      await this.analyzeWorldItem(html);
    });

    html.find('#compendium-items').change(() => {
      html.find('.analyze-item').prop('disabled', false);
    });

    html.find('#world-items').change(() => {
      html.find('.analyze-world-item').prop('disabled', false);
    });

    this.addStyles();
  }

  private loadCompendiumList(html: any) {
    const select = html.find('#compendium-select');
    select.empty().append(`<option value="">${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.selectPlaceholder')}</option>`);

    try {
      // 获取所有PF2e相关的集合包
      const packs = game.packs.filter((pack: any) => 
        pack.metadata.type === 'Item' && 
        (pack.metadata.system === 'pf2e' || pack.metadata.packageName === 'pf2e')
      );

      packs.forEach((pack: any) => {
        select.append(`<option value="${pack.collection}">${pack.metadata.label}</option>`);
      });

      console.log(`${MODULE_ID} | 找到 ${packs.length} 个PF2e物品集合包`);
    } catch (error) {
      console.error(`${MODULE_ID} | 加载集合包列表失败:`, error);
      ui.notifications.error('加载集合包列表失败');
    }
  }

  private loadWorldItems(html: any) {
    const select = html.find('#world-items');
    select.empty();

    try {
      // 获取世界中的物品
      const items = game.items || [];
      
      if (items.length === 0) {
        select.append(`<option value="">${game.i18n.localize('ai-pf2e-assistant.explorer.world.noItems')}</option>`);
      } else {
        items.forEach((item: any) => {
          select.append(`<option value="${item.id}">${item.name} (${item.type})</option>`);
        });
      }

      console.log(`${MODULE_ID} | 找到 ${items.length} 个世界物品`);
    } catch (error) {
      console.error(`${MODULE_ID} | 加载世界物品失败:`, error);
      ui.notifications.error('加载世界物品失败');
    }
  }

  private async loadCompendiumItems(html: any) {
    const packId = html.find('#compendium-select').val();
    if (!packId) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.explorer.compendium.noCompendium'));
      return;
    }

    const itemsSelect = html.find('#compendium-items');
    const button = html.find('.load-compendium');
    const originalText = button.text();
    
    button.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.explorer.compendium.loading'));
    itemsSelect.empty().append(`<option value="">${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.loading')}</option>`);

    try {
      const pack = game.packs.get(packId);
      if (!pack) {
        throw new Error('找不到指定的集合包');
      }

      // 获取集合包索引
      const index = await pack.getIndex();
      
      itemsSelect.empty();
      
      if (index.size === 0) {
        itemsSelect.append(`<option value="">${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.itemsPlaceholder')}</option>`);
      } else {
        // 按类型分组显示
        const itemsByType: Record<string, any[]> = {};
        
        for (const [id, item] of index.entries()) {
          const type = item.type || 'unknown';
          if (!itemsByType[type]) {
            itemsByType[type] = [];
          }
          itemsByType[type].push({ id, ...item });
        }

        // 添加分组选项
        Object.keys(itemsByType).sort().forEach(type => {
          itemsSelect.append(`<optgroup label="${type} (${itemsByType[type].length})">`);
          itemsByType[type].forEach(item => {
            itemsSelect.append(`<option value="${packId}:${item.id}">${item.name}</option>`);
          });
          itemsSelect.append('</optgroup>');
        });
      }

      console.log(`${MODULE_ID} | 加载了 ${index.size} 个集合包物品`);
      ui.notifications.info(`加载了 ${index.size} 个物品`);

    } catch (error) {
      console.error(`${MODULE_ID} | 加载集合包物品失败:`, error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.load')}: ${error.message}`);
      itemsSelect.empty().append(`<option value="">${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.itemsPlaceholder')}</option>`);
    } finally {
      button.prop('disabled', false).text(originalText);
    }
  }

  private async analyzeCompendiumItem(html: any) {
    const itemRef = html.find('#compendium-items').val();
    if (!itemRef) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.explorer.compendium.noItem'));
      return;
    }

    const button = html.find('.analyze-item');
    const resultDiv = html.find('.analysis-result');
    const originalText = button.text();
    
    button.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.explorer.compendium.analyzing'));
    resultDiv.html(`<p>${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.analyzing')}</p>`);

    try {
      const [packId, itemId] = itemRef.split(':');
      const pack = game.packs.get(packId);
      
      if (!pack) {
        throw new Error('找不到指定的集合包');
      }

      // 获取完整的物品数据
      const item = await pack.getDocument(itemId);
      
      if (!item) {
        throw new Error('找不到指定的物品');
      }

      // 分析物品结构
      const analysis = this.analyzeItemStructure(item);
      this.displayAnalysis(resultDiv, analysis, item.name);

    } catch (error) {
      console.error(`${MODULE_ID} | 分析物品失败:`, error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.explorer.compendium.analyze')}: ${error.message}`);
      resultDiv.html(`<p style="color: red;">${error.message}</p>`);
    } finally {
      button.prop('disabled', false).text(originalText);
    }
  }

  private async analyzeWorldItem(html: any) {
    const itemId = html.find('#world-items').val();
    if (!itemId) {
      ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.explorer.world.noItem'));
      return;
    }

    const button = html.find('.analyze-world-item');
    const resultDiv = html.find('.analysis-result');
    const originalText = button.text();
    
    button.prop('disabled', true).text(game.i18n.localize('ai-pf2e-assistant.explorer.world.analyzing'));
    resultDiv.html(`<p>${game.i18n.localize('ai-pf2e-assistant.explorer.world.analyzing')}</p>`);

    try {
      const item = game.items.get(itemId);
      
      if (!item) {
        throw new Error('找不到指定的物品');
      }

      // 分析物品结构
      const analysis = this.analyzeItemStructure(item);
      this.displayAnalysis(resultDiv, analysis, item.name);

    } catch (error) {
      console.error(`${MODULE_ID} | 分析物品失败:`, error);
      ui.notifications.error(`${game.i18n.localize('ai-pf2e-assistant.explorer.world.analyze')}: ${error.message}`);
      resultDiv.html(`<p style="color: red;">${error.message}</p>`);
    } finally {
      button.prop('disabled', false).text(originalText);
    }
  }

  private analyzeItemStructure(item: any): any {
    const analysis = {
      basicInfo: {
        name: item.name,
        type: item.type,
        id: item.id,
        uuid: item.uuid
      },
      keyInfo: this.extractKeyInformation(item),
      systemData: {},
      flags: item.flags || {},
      effects: item.effects?.contents || [],
      fullStructure: this.extractStructure(item, -1) // 无深度限制
    };

    // 提取system数据的关键字段
    if (item.system) {
      analysis.systemData = {
        level: item.system.level,
        price: item.system.price,
        quantity: item.system.quantity,
        weight: item.system.weight,
        traits: item.system.traits,
        description: item.system.description,
        // 根据物品类型添加特定字段
        ...(item.type === 'weapon' && item.system.damage ? { damage: item.system.damage } : {}),
        ...(item.type === 'armor' && item.system.armor ? { armor: item.system.armor } : {}),
        ...(item.type === 'consumable' && item.system.consumableType ? { consumableType: item.system.consumableType } : {}),
        ...(item.type === 'spell' && item.system.area ? { area: item.system.area } : {}),
        ...(item.type === 'feat' && item.system.actionType ? { actionType: item.system.actionType } : {}),
        ...(item.type === 'equipment' && item.system.usage ? { usage: item.system.usage } : {})
      };
    }

    return analysis;
  }

  private extractKeyInformation(item: any): any {
    const keyInfo: any = {
      名称: item.name,
      类型: item.type,
      等级: item.system?.level?.value || item.system?.level || 'N/A',
      价格: this.formatPrice(item.system?.price),
      重量: this.formatWeight(item.system?.weight || item.system?.bulk),
      稀有度: item.system?.traits?.rarity || 'N/A',
      特质: this.formatTraits(item.system?.traits),
      描述: this.formatDescription(item.system?.description),
      规则效果: this.extractRules(item.system?.rules)
    };

    // 根据不同类型添加特定信息
    switch (item.type) {
      case 'weapon':
        keyInfo.武器信息 = this.extractWeaponInfo(item.system);
        break;
      case 'armor':
        keyInfo.护甲信息 = this.extractArmorInfo(item.system);
        break;
      case 'spell':
        keyInfo.法术信息 = this.extractSpellInfo(item.system);
        break;
      case 'consumable':
        keyInfo.消耗品信息 = this.extractConsumableInfo(item.system);
        break;
      case 'feat':
        keyInfo.专长信息 = this.extractFeatInfo(item.system);
        break;
      case 'equipment':
        keyInfo.装备信息 = this.extractEquipmentInfo(item.system);
        break;
      case 'effect':
        keyInfo.效果信息 = this.extractEffectInfo(item.system);
        break;
    }

    return keyInfo;
  }

  private formatPrice(price: any): string {
    if (!price) return 'N/A';
    if (typeof price === 'string') return price;
    if (typeof price === 'object') {
      const parts = [];
      if (price.value) {
        if (typeof price.value === 'object') {
          if (price.value.gp) parts.push(`${price.value.gp}gp`);
          if (price.value.sp) parts.push(`${price.value.sp}sp`);
          if (price.value.cp) parts.push(`${price.value.cp}cp`);
        } else {
          parts.push(`${price.value}gp`);
        }
      }
      return parts.join(' ') || 'N/A';
    }
    return String(price);
  }

  private formatWeight(weight: any): string {
    if (!weight) return 'N/A';
    if (typeof weight === 'number') return `${weight}`;
    if (weight.value !== undefined) {
      if (weight.value === 0) return '轻量';
      return `${weight.value}`;
    }
    return String(weight);
  }

  private formatTraits(traits: any): string[] {
    if (!traits) return [];
    if (Array.isArray(traits)) return traits;
    if (traits.value && Array.isArray(traits.value)) return traits.value;
    if (traits.value && typeof traits.value === 'object') {
      return Object.keys(traits.value).filter(key => traits.value[key]);
    }
    return [];
  }

  private formatDescription(description: any): string {
    if (!description) return 'N/A';
    if (typeof description === 'string') return description.substring(0, 200) + '...';
    if (description.value) {
      const text = description.value.replace(/<[^>]*>/g, ''); // 移除HTML标签
      return text.substring(0, 200) + (text.length > 200 ? '...' : '');
    }
    return 'N/A';
  }

  private extractRules(rules: any): any[] {
    if (!rules || !Array.isArray(rules)) return [];
    return rules.map(rule => {
      const ruleInfo: any = {
        key: rule.key
      };
      
      // 添加其他有用的规则信息
      if (rule.label) ruleInfo.label = rule.label;
      if (rule.value !== undefined) ruleInfo.value = rule.value;
      if (rule.selector) ruleInfo.selector = rule.selector;
      if (rule.type) ruleInfo.type = rule.type;
      if (rule.predicate) ruleInfo.predicate = rule.predicate;
      if (rule.mode) ruleInfo.mode = rule.mode;
      if (rule.choices) ruleInfo.choices = rule.choices;
      
      return ruleInfo;
    });
  }

  private extractWeaponInfo(system: any): any {
    return {
      伤害: system.damage,
      射程: system.range,
      装备组: system.group,
      类别: system.category,
      重装时间: system.reload,
      特殊性质: system.specific
    };
  }

  private extractArmorInfo(system: any): any {
    return {
      AC加值: system.armor?.value,
      敏捷上限: system.armor?.dex,
      检定减值: system.armor?.check,
      速度减值: system.armor?.speed,
      护甲组: system.group,
      类别: system.category
    };
  }

  private extractSpellInfo(system: any): any {
    return {
      法术等级: system.level?.value,
      学派: system.school?.value,
      施法时间: system.time?.value,
      射程: system.range?.value,
      区域: system.area,
      持续时间: system.duration?.value,
      豁免: system.save?.value,
      传统: system.traditions?.value
    };
  }

  private extractConsumableInfo(system: any): any {
    return {
      消耗品类型: system.consumableType?.value,
      使用次数: system.uses,
      激活: system.activation,
      特殊用法: system.usage
    };
  }

  private extractFeatInfo(system: any): any {
    return {
      动作类型: system.actionType?.value,
      动作: system.actions?.value,
      先决条件: system.prerequisites?.value,
      频率: system.frequency,
      触发: system.trigger
    };
  }

  private extractEquipmentInfo(system: any): any {
    return {
      使用方式: system.usage?.value,
      装备位置: system.equipped,
      容量: system.capacity,
      堆叠: system.stackGroup
    };
  }

  private extractEffectInfo(system: any): any {
    return {
      持续时间: system.duration ? {
        值: system.duration.value,
        单位: system.duration.unit,
        到期: system.duration.expiry,
        维持: system.duration.sustained
      } : 'N/A',
      开始: system.start,
      图标显示: system.tokenIcon?.show,
      标记: system.badge,
      上下文: system.context,
      未识别: system.unidentified
    };
  }

  private extractStructure(obj: any, maxDepth: number, currentDepth: number = 0): any {
    if (obj === null || obj === undefined) {
      return typeof obj;
    }

    // 如果设置了深度限制且已达到最大深度
    if (maxDepth > 0 && currentDepth >= maxDepth) {
      return typeof obj;
    }

    if (Array.isArray(obj)) {
      return obj.length > 0 ? [this.extractStructure(obj[0], maxDepth, currentDepth + 1)] : [];
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = this.extractStructure(obj[key], maxDepth, currentDepth + 1);
        }
      }
      return result;
    }

    return typeof obj;
  }

  private displayAnalysis(container: any, analysis: any, itemName: string) {
    const i18n = (key: string) => game.i18n.localize(`AIPF2E.Explorer.analysis.${key}`);
    
    const html = `
      <div class="item-analysis">
        <h5>${game.i18n.format('ai-pf2e-assistant.explorer.analysis.itemTitle', { name: itemName })}</h5>
        
        <div class="analysis-tabs">
          <button class="tab-button active" data-tab="key-info">${i18n('keyInfo')}</button>
          <button class="tab-button" data-tab="basic-info">${i18n('basicInfo')}</button>
          <button class="tab-button" data-tab="system-data">${i18n('systemData')}</button>
          <button class="tab-button" data-tab="full-structure">${i18n('fullStructure')}</button>
        </div>

        <div class="tab-content active" data-tab="key-info">
          <div class="analysis-section">
            <h6>${i18n('keyInfo')}</h6>
            <div class="key-info-grid">
              ${this.renderKeyInfoGrid(analysis.keyInfo)}
            </div>
          </div>
        </div>

        <div class="tab-content" data-tab="basic-info">
          <div class="analysis-section">
            <h6>${i18n('basicInfo')}</h6>
            <pre>${JSON.stringify(analysis.basicInfo, null, 2)}</pre>
          </div>
        </div>

        <div class="tab-content" data-tab="system-data">
          <div class="analysis-section">
            <h6>${i18n('systemData')}</h6>
            <pre>${JSON.stringify(analysis.systemData, null, 2)}</pre>
          </div>
        </div>

        <div class="tab-content" data-tab="full-structure">
          <div class="analysis-section">
            <h6>${i18n('fullStructure')}</h6>
            <pre class="full-structure">${JSON.stringify(analysis.fullStructure, null, 2)}</pre>
          </div>
        </div>

        <div class="analysis-section">
          <h6>${i18n('effects')}</h6>
          <p><strong>${i18n('effectCount')}</strong> ${analysis.effects.length}</p>
          <p><strong>${i18n('flagCount')}</strong> ${Object.keys(analysis.flags).length}</p>
        </div>

        <div class="analysis-actions">
          <button class="copy-key-info" data-info="${encodeURIComponent(JSON.stringify(analysis.keyInfo, null, 2))}">${i18n('copyKeyInfo')}</button>
          <button class="copy-structure" data-structure="${encodeURIComponent(JSON.stringify(analysis.fullStructure, null, 2))}">${i18n('copyStructure')}</button>
          <button class="log-full-item" data-item-name="${itemName}">${i18n('logItem')}</button>
        </div>
      </div>
    `;

    container.html(html);

    // 绑定标签页切换
    container.find('.tab-button').click((event: any) => {
      const tabName = event.target.dataset.tab;
      
      // 移除所有活动状态
      container.find('.tab-button').removeClass('active');
      container.find('.tab-content').removeClass('active');
      
      // 激活选中的标签页
      container.find(`[data-tab="${tabName}"]`).addClass('active');
    });

    // 绑定复制按钮
    container.find('.copy-key-info').click((event: any) => {
      const info = decodeURIComponent(event.target.dataset.info);
      navigator.clipboard.writeText(info).then(() => {
        ui.notifications.info(game.i18n.localize('ai-pf2e-assistant.explorer.analysis.copied'));
      }).catch(() => {
        ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.explorer.analysis.copyFailed'));
      });
    });

    container.find('.copy-structure').click((event: any) => {
      const structure = decodeURIComponent(event.target.dataset.structure);
      navigator.clipboard.writeText(structure).then(() => {
        ui.notifications.info(game.i18n.localize('ai-pf2e-assistant.explorer.analysis.copied'));
      }).catch(() => {
        ui.notifications.warn(game.i18n.localize('ai-pf2e-assistant.explorer.analysis.copyFailed'));
      });
    });

    // 绑定控制台输出按钮
    container.find('.log-full-item').click((event: any) => {
      const itemName = event.target.dataset.itemName;
      console.log(`${MODULE_ID} | ${itemName} 完整数据:`, analysis);
      ui.notifications.info(game.i18n.localize('ai-pf2e-assistant.explorer.analysis.logged'));
    });
  }

  private renderKeyInfoGrid(keyInfo: any): string {
    let html = '';
    
    for (const [key, value] of Object.entries(keyInfo)) {
      if (value === null || value === undefined || value === 'N/A') continue;
      
      let displayValue = '';
      
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        displayValue = value.join(', ');
      } else if (typeof value === 'object') {
        displayValue = `<pre class="inline-json">${JSON.stringify(value, null, 2)}</pre>`;
      } else {
        displayValue = String(value);
      }
      
      if (!displayValue.trim()) continue;
      
      html += `
        <div class="key-info-item">
          <div class="key-info-label">${key}:</div>
          <div class="key-info-value">${displayValue}</div>
        </div>
      `;
    }
    
    return html;
  }

  private addStyles() {
    if ($('#ai-pf2e-explorer-styles').length === 0) {
      $('head').append(`
        <style id="ai-pf2e-explorer-styles">
          /* Scoped styles for pf2e-explorer-dialog ONLY */
          .pf2e-explorer-dialog {
            font-family: 'Signika', sans-serif;
          }
          
          .pf2e-explorer-dialog .ai-pf2e-assistant-container.pf2e-explorer {
            padding: 20px;
          }
          
          .pf2e-explorer-dialog .explorer-section {
            margin-bottom: 20px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 8px;
          }
          
          .pf2e-explorer-dialog .explorer-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          
          .pf2e-explorer-dialog .tab-panel {
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 20px;
            background: #f9f9f9;
          }
          
          .pf2e-explorer-dialog .tab-panel h4 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
          }
          
          .pf2e-explorer-dialog .form-group {
            margin-bottom: 15px;
          }
          
          .pf2e-explorer-dialog .form-group label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
            color: #2c3e50;
          }
          
          .pf2e-explorer-dialog .form-group select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: inherit;
          }
          
          .pf2e-explorer-dialog .pf2e-explorer .form-group select[size] {
            min-height: 400px;
          }
          
          .pf2e-explorer-dialog .form-group button {
            padding: 10px 20px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.3s;
          }
          
          .pf2e-explorer-dialog .form-group button:hover:not(:disabled) {
            background: #2980b9;
          }
          
          .pf2e-explorer-dialog .form-group button:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
          }
          
          .pf2e-explorer-dialog .analysis-section {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            background: white;
            margin-bottom: 15px;
          }
          
          .pf2e-explorer-dialog .analysis-section h4,
          .pf2e-explorer-dialog .analysis-section h5,
          .pf2e-explorer-dialog .analysis-section h6 {
            margin-top: 0;
            color: #2c3e50;
          }
          
          .pf2e-explorer-dialog .analysis-tabs {
            display: flex;
            border-bottom: 2px solid #ddd;
            margin-bottom: 20px;
          }
          
          .pf2e-explorer-dialog .tab-button {
            padding: 10px 20px;
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-bottom: none;
            cursor: pointer;
            transition: background 0.3s;
            margin-right: 2px;
          }
          
          .pf2e-explorer-dialog .tab-button:hover {
            background: #e9ecef;
          }
          
          .pf2e-explorer-dialog .tab-button.active {
            background: white;
            border-top: 2px solid #3498db;
            font-weight: bold;
          }
          
          .pf2e-explorer-dialog .tab-content {
            display: none;
          }
          
          .pf2e-explorer-dialog .tab-content.active {
            display: block;
          }
          
          .pf2e-explorer-dialog .key-info-grid {
            display: grid;
            gap: 10px;
            grid-template-columns: 1fr;
          }
          
          .pf2e-explorer-dialog .key-info-item {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 4px solid #3498db;
          }
          
          .pf2e-explorer-dialog .key-info-label {
            font-weight: bold;
            color: #2c3e50;
          }
          
          .pf2e-explorer-dialog .key-info-value {
            word-break: break-word;
          }
          
          .pf2e-explorer-dialog .inline-json {
            background: #f1f3f4;
            border: 1px solid #e1e5e9;
            border-radius: 3px;
            padding: 5px;
            font-size: 11px;
            margin: 0;
            max-height: 150px;
            overflow-y: auto;
          }
          
          .pf2e-explorer-dialog .item-analysis pre {
            background: #f8f8f8;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 10px;
            overflow-x: auto;
            font-size: 12px;
            max-height: 400px;
            overflow-y: auto;
          }
          
          .pf2e-explorer-dialog .full-structure {
            max-height: 600px !important;
          }
          
          .pf2e-explorer-dialog .analysis-actions {
            margin-top: 15px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }
          
          .pf2e-explorer-dialog .analysis-actions button {
            padding: 8px 16px;
            background: #27ae60;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          }
          
          .pf2e-explorer-dialog .analysis-actions button:hover {
            background: #219a52;
          }
          
          .pf2e-explorer-dialog .hint {
            font-size: 0.9em;
            color: #666;
            font-style: italic;
          }
        </style>
      `);
    }
  }
}