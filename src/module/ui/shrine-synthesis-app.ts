import { ShrineSynthesisService, ShrineSynthesisMaterial, ShrineSynthesisConfig, ShrineSynthesisResult } from '../services/shrine-synthesis-service';
import { SpellSynthesisService, SpellSynthesisMaterial, SpellSynthesisConfig, SpellSynthesisResult } from '../services/spell-synthesis-service';
import { EquipmentSynthesisService, EquipmentSynthesisMaterial, EquipmentSynthesisConfig, EquipmentSynthesisResult } from '../services/equipment-synthesis-service';
import { ShrineItemService } from '../services/shrine-item-service';
import { BalanceDataService } from '../services/balance-data-service';
import { CircularSynthesisComponent } from './circular-synthesis-component';
import { ThemeService } from '../services/theme-service.js';
import { ShrinePointService } from '../services/shrine-point-service';
import { ShrinePointManager } from '../applications/shrine-point-manager';
import { Logger } from '../utils/logger';

/**
 * 神龛合成器应用程序
 * 基于神龛和神圣材料合成专长/法术/物品的环形界面
 * 支持三模式：专长合成、法术合成和物品合成
 */
export class ShrineSynthesisApp extends Application {
  private synthesisService?: ShrineSynthesisService | SpellSynthesisService | EquipmentSynthesisService;
  private balanceService: BalanceDataService;
  private selectedMaterials: ShrineSynthesisMaterial[] = [];
  private selectedShrine: ShrineSynthesisMaterial | null = null;
  private actorData: any = null;
  private lastSynthesisResult: ShrineSynthesisResult | SpellSynthesisResult | EquipmentSynthesisResult | null = null;
  private validation: any = null;
  private circularComponent?: CircularSynthesisComponent;
  private themeService: ThemeService;
  private synthesisMode: 'feat' | 'spell' | 'equipment' = 'feat';  // 合成模式
  private spellTradition: string = 'arcane';  // 法术施法传统（仅spell模式有效）

  static get defaultOptions() {
    const themeService = ThemeService.getInstance();
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'shrine-synthesis-app',
      title: `PF2e ${themeService.getUIText('synthesisTitle')} - ${themeService.getUIText('messages.blessing')}`,
      template: 'modules/ai-pf2e-assistant/templates/shrine-synthesis-app.hbs',
      width: 1000,
      height: 800,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'shrine-synthesis-app'],
      dragDrop: [{ dragSelector: null, dropSelector: ".circular-synthesis-container" }]
    });
  }

  constructor(actor?: any, options: any = {}) {
    super(options);
    this.balanceService = new BalanceDataService();
    this.themeService = ThemeService.getInstance();
    
    // 支持从外部设置合成模式
    // 模式由入口决定：从专长页面进入 = 'feat'，从法术页面进入 = 'spell'
    if (options.synthesisMode) {
      this.synthesisMode = options.synthesisMode;
    }
    
    // 支持从外部设置施法传统（仅spell模式有效）
    if (options.spellTradition) {
      this.spellTradition = options.spellTradition;
    }
    
    if (actor) {
      this.actorData = {
        id: actor.id,
        name: actor.name,
        level: actor.system?.details?.level?.value || 1,
        class: actor.system?.details?.class?.value || actor.class?.name,
        ancestry: actor.system?.details?.ancestry?.value || actor.ancestry?.name,
        _actor: actor // 保存对原始Actor对象的引用
      };
    }
  }

  /**
   * 设置AI服务实例
   */
  setAIService(aiService: any) {
    // 根据当前模式创建对应的服务
    if (this.synthesisMode === 'spell') {
      this.synthesisService = new SpellSynthesisService(aiService);
    } else if (this.synthesisMode === 'equipment') {
      this.synthesisService = new EquipmentSynthesisService(aiService);
    } else {
      this.synthesisService = new ShrineSynthesisService(aiService);
    }
  }

  /**
   * 获取图标路径配置
   */
  private getIconPaths() {
    const basePath = 'modules/ai-pf2e-assistant/icons/aztec/';
    return {
      shrineAltar: `${basePath}shrine-altar.svg`,
      obsidianMirror: `${basePath}obsidian-mirror.svg`,
      divineFragment: `${basePath}divine-fragment.svg`,
      sunStone: `${basePath}sun-stone.svg`,
      sacredOffering: `${basePath}sacred-offering.svg`,
      featheredSerpent: `${basePath}feathered-serpent.svg`,
      rainGod: `${basePath}rain-god.svg`,
      flowerGoddess: `${basePath}flower-goddess.svg`,
      deathLord: `${basePath}death-lord.svg`
    };
  }

  getData() {
    // 验证当前选择
    this.validation = null;
    if (this.selectedShrine && this.selectedMaterials.length > 0) {
      const allMaterials = [...this.selectedMaterials, this.selectedShrine];
      this.validation = this.synthesisService?.validateSynthesisMaterials(allMaterials, this.selectedShrine);
    }

    // 计算空槽位
    const maxSlots = 8;
    const emptySlots = [];
    for (let i = this.selectedMaterials.length; i < maxSlots; i++) {
      emptySlots.push(i);
    }

    // 获取当前主题的文字
    const currentTheme = this.themeService.currentTheme;
    const themeTexts = {
      blessing: currentTheme.ui.messages.blessing,
      synthesisAction: currentTheme.ui.messages.synthesisAction,
      synthesisButton: currentTheme.ui.messages.synthesisButton,
      description: currentTheme.ui.messages.description,
      clearMaterials: currentTheme.ui.messages.clearMaterials,
      progressWorking: currentTheme.ui.messages.progressWorking,
      progressPreparing: currentTheme.ui.messages.progressPreparing,
      synthesisCompleteTitle: currentTheme.ui.messages.synthesisCompleteTitle,
      dragShrineHere: currentTheme.ui.messages.dragShrineHere
    };

    // 获取点数相关信息
    const isGM = ShrinePointService.isGM();
    const currentActor = this.getCurrentActor();
    const shrinePoints = currentActor ? ShrinePointService.getActorPoints(currentActor) : 0;

    return {
      actor: this.actorData,
      availableShrines: [], // 不在渲染时加载神龛列表，改为在需要时动态获取
      selectedMaterials: this.selectedMaterials,
      selectedShrine: this.selectedShrine,
      validation: this.validation,
      iconPaths: this.getIconPaths(),
      emptySlots: emptySlots,
      lastSynthesisResult: this.lastSynthesisResult,
      themeTexts: themeTexts, // 提供主题化文字给模板
      isGM,
      shrinePoints
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 绑定事件
    html.find('.shrine-card').on('click', this._onSelectShrine.bind(this));
    html.find('#synthesize-feat').on('click', this._onSynthesizeFeat.bind(this));
    html.find('#clear-materials').on('click', this._onClearMaterials.bind(this));
    html.find('#manage-points').on('click', this._onManagePoints.bind(this));

    // 初始化SVG环形组件
    this._initializeCircularComponent(html);

    // 只应用SVG主题色，不修改文字（文字已在渲染时正确处理）
    setTimeout(() => {
      this._applySVGThemeColors(html);
    }, 100);

    // 初始化界面
    this._updateSynthesisDisplay(html);
  }

  /**
   * 应用SVG主题颜色（仅处理SVG元素，不处理文字）
   */
  private _applySVGThemeColors(html: any) {
    try {
      const currentTheme = this.themeService.currentTheme;
      const colors = currentTheme.colors;
      
      Logger.debug('当前主题:', currentTheme.id, currentTheme.name);
      Logger.debug('主题颜色:', colors);
      
      // 找到合成环容器并应用背景
      const synthesisContainer = html.find('.synthesis-circle-svg');
      Logger.debug('找到合成环容器:', synthesisContainer.length);
      
      if (synthesisContainer.length > 0) {
        // 根据主题设置不同的环颜色、文字和背景
        if (currentTheme.id === 'pokemon') {
          // 爱达梦主题：蓝色系环和背景
          this._updateRingColors(html, {
            divinities: colors.primary,    // 蓝色
            offerings: colors.secondary,   // 标准蓝色  
            fragments: colors.ringGlow     // 淡蓝发光
          });
          
          // 更新圆形背景为淡蓝色
          this._updateCircleBackground(html, currentTheme);
          
          // 更新环标签文字
          this._updateRingLabels(html, {
            divinities: currentTheme.ui.materialTypes.divinity,   // '指导'
            offerings: currentTheme.ui.materialTypes.offering,    // '技能机'
            fragments: currentTheme.ui.materialTypes.fragment     // '个性'
          });
          
          // 注意：UI文字已在渲染时处理，这里不需要再次更新
          
        } else {
          // 神龛主题：原始环颜色、背景和文字
          this._updateRingColors(html, {
            divinities: '#FFD700',  // 金色
            offerings: '#FF6B35',   // 橙色
            fragments: '#4ECDC4'    // 青色
          });
          
          // 恢复原始圆形背景
          this._updateCircleBackground(html, currentTheme);
          
          // 恢复原始标签文字
          this._updateRingLabels(html, {
            divinities: '神性',
            offerings: '贡品',
            fragments: '碎片'
          });
          
          // 注意：UI文字已在渲染时处理，这里不需要再次更新
        }
        
        Logger.debug('主题色应用成功');
      } else {
        console.warn('AI PF2e Assistant | 未找到合成环容器');
      }
      
    } catch (error) {
      console.error('AI PF2e Assistant | 应用主题色失败:', error);
    }
  }
  
  /**
   * 更新SVG环的颜色
   */
  private _updateRingColors(html: any, colors: {divinities: string, offerings: string, fragments: string}) {
    // 这个方法将通过CircularSynthesisComponent来更新SVG颜色
    if (this.circularComponent) {
      this.circularComponent.updateRingColors(colors);
    }
  }
  
  /**
   * 更新SVG环的标签文字
   */
  private _updateRingLabels(html: any, labels: {divinities: string, offerings: string, fragments: string}) {
    // 这个方法将通过CircularSynthesisComponent来更新SVG标签文字
    if (this.circularComponent) {
      this.circularComponent.updateRingLabels(labels);
    }
  }
  
  /**
   * 更新圆形背景
   */
  private _updateCircleBackground(html: any, theme: any) {
    // 这个方法将通过CircularSynthesisComponent来更新圆形背景
    if (this.circularComponent) {
      this.circularComponent.updateCircleBackground(theme);
    }
  }
  
  /**
   * 更新其他UI文字
   */
  private _updateUITexts(html: any, theme: any) {
    try {
      // 更新所有带有data-theme-text属性的元素
      const themeTextElements = html.find('[data-theme-text]');
      Logger.debug('找到主题文字元素数量:', themeTextElements.length);
      
      themeTextElements.each((index: number, element: HTMLElement) => {
        const textKey = element.getAttribute('data-theme-text');
        const newText = theme.ui.messages[textKey];
        
        if (textKey && newText) {
          element.textContent = newText;
          Logger.debug(`已更新: "${textKey}" -> "${newText}"`);
        }
      });
      
      // 更新SVG组件中的占位符文字
      if (this.circularComponent) {
        this.circularComponent.updatePlaceholderText(theme.ui.messages.dragShrineHere);
      }
      
      Logger.debug('UI文字更新完成');
    } catch (error) {
      console.error('AI PF2e Assistant | 更新UI文字失败:', error);
    }
  }

  /**
   * 初始化环形合成组件
   */
  private _initializeCircularComponent(html: any) {
    const container = html.find('#circular-synthesis-container')[0];
    if (container) {
      // 销毁旧组件
      if (this.circularComponent) {
        this.circularComponent.destroy();
      }

      // 创建新组件
      this.circularComponent = new CircularSynthesisComponent(container, this.getIconPaths());
      
      // 设置事件处理器
      this.circularComponent.setEventHandlers(
        (material) => this._onMaterialAdd(material),
        (material) => this._onMaterialRemove(material),
        (shrine) => this._onShrineAdd(shrine)
      );

      // 更新当前状态
      this.circularComponent.updateMaterials(this.selectedMaterials);
      this.circularComponent.updateShrine(this.selectedShrine);
    }
  }

  /**
   * 处理材料添加
   */
  private async _onMaterialAdd(item: any, itemType?: string) {
    // 如果没有传入类型，则识别一次
    if (!itemType) {
      itemType = ShrineItemService.getItemType(item);
    }
    Logger.debug('添加材料:', item.name, '类型已识别为:', itemType, 'traits:', item.system?.traits?.value);
    
    // 拒绝无效物品类型
    if (itemType === 'unknown') {
      this.themeService.showNotification('invalidMaterial', 'warn');
      return;
    }
    
    // 神龛不能作为合成材料
    if (itemType === 'shrine') {
      ui.notifications.warn(`${this.themeService.getConcept('shrine')}不能作为合成材料，请在${this.themeService.getConcept('shrine')}选择区域选择${this.themeService.getConcept('shrine')}`);
      return;
    }
    
    // 检查是否已经添加
    if (this.selectedMaterials.some(m => m.id === item.id)) {
      this.themeService.showNotification('materialExists', 'warn');
      return;
    }

    // 如果没有神龛，提示先添加神龛
    if (!this.selectedShrine) {
      this.themeService.showNotification('selectShrine', 'warn');
      return;
    }

    // 检查材料类型的数量限制
    const materialTypeCounts = this.countMaterialsByType();
    const typeKey = this.getTypeKeyForItemType(itemType);
    const requirements = ShrineItemService.extractSynthesisRequirements(this.selectedShrine?.originalItem) || {
      fragments: { min: 2, max: 4 },
      divinities: { min: 1, max: 2 },
      offerings: { min: 0, max: 1 }
    };
    
    if (typeKey && requirements[typeKey]) {
      const currentCount = materialTypeCounts[typeKey] || 0;
      const maxCount = requirements[typeKey].max;
      
      if (maxCount && currentCount >= maxCount) {
        ui.notifications.warn(`${this._getItemTypeDisplayName(itemType)}已达到最大数量限制 (${maxCount})`);
        return;
      }
    }

    // 检查总材料槽位限制
    if (this.selectedMaterials.length >= 8) {
      ui.notifications.warn((game as any).i18n.localize('AIPF2E.ShrineSynthesis.maxMaterials'));
      return;
    }

    // 转换为神龛合成材料对象，传递已知类型避免重复识别
    // 注意：模式由入口决定（专长页面/法术页面/物品页面），不根据贡品类型自动切换
    let materials: any[] = [];
    if (this.synthesisMode === 'spell' && this.synthesisService instanceof SpellSynthesisService) {
      materials = (this.synthesisService as SpellSynthesisService).extractSpellMaterials([item], [itemType]);
    } else if (this.synthesisMode === 'equipment' && this.synthesisService instanceof EquipmentSynthesisService) {
      materials = (this.synthesisService as EquipmentSynthesisService).extractEquipmentMaterials([item], [itemType]);
    } else if (this.synthesisService instanceof ShrineSynthesisService) {
      materials = (this.synthesisService as ShrineSynthesisService).extractShrineMaterials([item], [itemType]);
    }
    
    if (materials.length > 0) {
      this.selectedMaterials.push(materials[0]);
      this._updateSynthesisDisplay($(this.element));
      ui.notifications.info(`${this.themeService.getMessage('materialAdded')}: ${item.name} (${this._getItemTypeDisplayName(itemType)})`);
    } else {
      console.error('无法转换材料:', item);
      ui.notifications.warn((game as any).i18n.localize('AIPF2E.ShrineSynthesis.addMaterialFailed'));
    }
  }

  /**
   * 统计材料类型数量
   */
  private countMaterialsByType(): { [key: string]: number } {
    const counts = { fragments: 0, divinities: 0, offerings: 0 };
    
    this.selectedMaterials.forEach(material => {
      // 使用ShrineSynthesisMaterial的type字段，不需要重新识别
      const typeKey = this.getTypeKeyForItemType(material.type);
      if (typeKey) {
        counts[typeKey]++;
      }
    });
    
    return counts;
  }

  /**
   * 将物品类型映射到需求类型键
   */
  private getTypeKeyForItemType(itemType: string): string | null {
    switch (itemType) {
      case 'fragment': return 'fragments';
      case 'divinity': return 'divinities';
      case 'offering': return 'offerings';
      default: return null;
    }
  }

  /**
   * 处理材料移除
   */
  private _onMaterialRemove(material: any) {
    this.selectedMaterials = this.selectedMaterials.filter(m => m.id !== material.id);
    this._updateSynthesisDisplay($(this.element));
  }

  /**
   * 处理神龛拖拽添加
   */
  private async _onShrineAdd(item: any, itemType?: string) {
    // 如果没有传入类型，则识别一次
    if (!itemType) {
      itemType = ShrineItemService.getItemType(item);
    }
    Logger.debug('添加神龛:', item.name, '类型已识别为:', itemType, 'traits:', item.system?.traits?.value);
    
    // 验证是否为神龛物品
    if (itemType !== 'shrine') {
      ui.notifications.warn(`"${item.name}" 不是${this.themeService.getConcept('shrine')}物品。只能将${this.themeService.getConcept('shrine')}拖拽到中央位置。`);
      return;
    }
    
    // 设置神龛，传递已知类型避免重复识别
    // 根据模式使用对应的提取方法
    if (this.synthesisMode === 'spell' && this.synthesisService instanceof SpellSynthesisService) {
      this.selectedShrine = (this.synthesisService as SpellSynthesisService).extractSpellMaterials([item], [itemType])[0] || null;
    } else if (this.synthesisMode === 'equipment' && this.synthesisService instanceof EquipmentSynthesisService) {
      this.selectedShrine = (this.synthesisService as EquipmentSynthesisService).extractEquipmentMaterials([item], [itemType])[0] || null;
    } else if (this.synthesisService instanceof ShrineSynthesisService) {
      this.selectedShrine = (this.synthesisService as ShrineSynthesisService).extractShrineMaterials([item], [itemType])[0] || null;
    }
    
    // 从神龛的隐藏提示词中解析等级和类别配置
    this._parseShrineSynthesisConfig(item);
    
    // 更新SVG组件的神龛显示
    if (this.circularComponent) {
      this.circularComponent.updateShrine(this.selectedShrine);
    }
    
    this._updateSynthesisDisplay($(this.element));
    ui.notifications.info(`${this.themeService.getMessage('shrineSelected')}: ${item.name}`);
  }

  /**
   * 获取可用的神龛物品（延迟加载，只在需要时调用）
   * 不在窗口初始化时调用，避免遍历所有物品
   */
  private getAvailableShrines(): any[] {
    // 此方法现在只在真正需要神龛列表时才调用
    // 比如在拖拽验证或特定UI需要时
    Logger.debug('延迟加载神龛列表');
    
    const shrines: any[] = [];

    // 如果有角色，获取角色的神龛（只检查已知是神龛的物品）
    if (this.actorData) {
      const actor = game.actors?.get(this.actorData.id);
      if (actor) {
        // 优化：只检查有'神龛'特征标签的物品
        shrines.push(...actor.items.filter((item: any) => {
          const traits = item.system?.traits?.value || [];
          return traits.includes('神龛') || traits.includes('shrine');
        }));
      }
    }

    // 获取世界中的神龛（优化：只检查有神龛特征的物品）
    const worldShrines = game.items?.filter((item: any) => {
      const traits = item.system?.traits?.value || [];
      return traits.includes('神龛') || traits.includes('shrine');
    }) || [];
    
    shrines.push(...worldShrines);

    // 去重并提取合成需求
    const uniqueShrines = shrines.filter((shrine, index, array) => 
      array.findIndex(s => s.id === shrine.id) === index
    );

    return uniqueShrines.map(shrine => ({
      ...shrine,
      shrineType: this._extractShrineType(shrine),
      synthesisRequirements: ShrineItemService.extractSynthesisRequirements(shrine)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 提取神龛类型信息
   */
  private _extractShrineType(shrine: any): string {
    if (!shrine.system?.description?.gm) return '通用神龛';
    
    const hiddenPrompt = shrine.system.description.gm;
    const typeMatch = hiddenPrompt.match(/类型[：:]?\s*([^\n]+)/);
    return typeMatch ? typeMatch[1].trim() : '通用神龛';
  }

  /**
   * 选择神龛（已废弃，现在只通过拖拽添加神龛）
   */
  private _onSelectShrine(event: Event) {
    event.preventDefault();
    
    // 不再支持通过点击选择神龛，只能通过拖拽
    ui.notifications.info((game as any).i18n.localize('AIPF2E.ShrineSynthesis.dragShrineHint'));
  }

  /**
   * 从神龛中解析合成配置
   */
  private _parseShrineSynthesisConfig(shrine: any) {
    // 首先从标准的GM描述字段获取配置
    const configText = shrine.system?.description?.gm || '';
    
    // 使用新的结构化解析方法
    const config = ShrineItemService.extractShrineConfig(shrine);
    
    Logger.debug('解析神龛配置:', config, '当前模式:', this.synthesisMode);
    
    // 根据当前合成模式，检查神龛配置是否匹配
    let configMatches = false;
    if (this.synthesisMode === 'equipment' && config?.equipmentType) {
      // 物品模式：需要equipmentType配置
      configMatches = true;
    } else if (this.synthesisMode === 'spell' && config?.rank !== undefined) {
      // 法术模式：需要rank配置
      configMatches = true;
    } else if (this.synthesisMode === 'feat' && config?.category) {
      // 专长模式：需要category配置
      configMatches = true;
    }
    
    if (config) {
      // 如果配置存在且匹配当前模式
      if (config.level !== undefined) {
        $(this.element).find('#synthesis-level').val(config.level);
        
        // 只在专长模式下设置category和className
        if (this.synthesisMode === 'feat') {
          $(this.element).find('#synthesis-category').val(config.category || 'general');
          if (config.className) {
            $(this.element).find('#class-name').val(config.className);
          }
        }
        
        if (configMatches) {
          Logger.debug('神龛配置匹配当前模式，已应用配置');
          return;
        } else {
          console.warn(`神龛配置不匹配当前模式（${this.synthesisMode}），将使用默认值`);
        }
      }
    }
    
    // 如果神龛没有配置LEVEL或配置不匹配，使用角色等级作为默认值
    if (this.actorData && this.actorData.level) {
      const actorLevel = this.actorData.level;
      $(this.element).find('#synthesis-level').val(actorLevel);
      Logger.debug(`神龛未配置等级或配置不匹配，使用角色等级: ${actorLevel}`);
    }
    
    // 回退：如果没有配置文本，检查flags（兼容旧数据）
    const fallbackText = configText || shrine.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    if (!fallbackText) return;
    
    // 解析等级配置（会覆盖角色等级）
    const levelMatch = fallbackText.match(/等级[：:]?\s*(\d+)/);
    if (levelMatch) {
      const level = parseInt(levelMatch[1], 10);
      $(this.element).find('#synthesis-level').val(level);
    }
    
    // 解析专长类别（默认为general）
    const categoryMatch = fallbackText.match(/类别[：:]?\s*(general|skill|ancestry|class|bonus|通用|技能|族裔|职业|额外)/);
    if (categoryMatch) {
      let category = categoryMatch[1];
      
      // 转换中文为英文
      const categoryMap: { [key: string]: string } = {
        '通用': 'general',
        '技能': 'skill', 
        '族裔': 'ancestry',
        '职业': 'class',
        '额外': 'bonus'
      }
      
      if (categoryMap[category]) {
        category = categoryMap[category];
      }
      
      // 验证类别是否有效，无效的映射为general
      const validCategories = ['general', 'skill', 'ancestry', 'class', 'bonus'];
      if (!validCategories.includes(category)) {
        Logger.debug(`无效的专长类别"${category}"，映射为general`);
        category = 'general';
      }
      
      $(this.element).find('#synthesis-category').val(category);
      
      // 如果是职业专长，解析职业名称
      if (category === 'class') {
        const classMatch = fallbackText.match(/职业[：:]?\s*([^\s\n，。]+)/);
        if (classMatch) {
          $(this.element).find('#class-name').val(classMatch[1]);
        }
      }
    }
  }

  /**
   * 更新进度条
   */
  private updateProgress(stage: string, percentage: number) {
    const html = $(this.element);
    const progressStage = html.find('#progress-stage');
    const progressFill = html.find('#progress-fill');
    const progressPercentage = html.find('#progress-percentage');
    
    progressStage.text(stage);
    progressFill.css('width', `${percentage}%`);
    progressPercentage.text(`${percentage}%`);
  }

  /**
   * 显示进度条
   */
  private showProgress() {
    const html = $(this.element);
    html.find('#synthesis-progress').show();
    html.find('#synthesize-feat').prop('disabled', true).text('神圣仪式进行中...');
  }

  /**
   * 隐藏进度条
   */
  private hideProgress() {
    const html = $(this.element);
    html.find('#synthesis-progress').hide();
    html.find('#synthesize-feat').prop('disabled', false).text(this.themeService.getButtonText('synthesize'));
  }

  /**
   * 合成专长
   */
  private async _onSynthesizeFeat(event: Event) {
    event.preventDefault();
    
    if (!this.synthesisService || !this.selectedShrine || this.selectedMaterials.length === 0) {
      ui.notifications.warn((game as any).i18n.localize('AIPF2E.ShrineSynthesis.selectMaterialsFirst'));
      return;
    }

    const html = $(this.element);
    const uiLevel = parseInt(html.find('#synthesis-level').val() as string) || undefined;
    const category = html.find('#synthesis-category').val() as string || 'general';
    const className = html.find('#class-name').val() as string || '';

    try {
      // 显示进度条
      this.showProgress();
      this.updateProgress(`净化${this.themeService.getConcept('altar')}...`, 5);
      await this.delay(300);
      
      this.updateProgress(`召唤${this.themeService.getConcept('power')}...`, 15);
      await this.delay(400);
      
      // 将神龛添加到材料数组中进行合成
      const allMaterials = [...this.selectedMaterials];
      if (this.selectedShrine) {
        allMaterials.push(this.selectedShrine);
      }
      
      // 从神龛配置中提取配置（所有合成类型通用）
      // 注意：this.selectedShrine 是 ShrineSynthesisMaterial，需要使用 originalItem
      const shrineItemForConfig = this.selectedShrine?.originalItem || this.selectedShrine;
      const shrineConfig = ShrineItemService.extractShrineConfig(shrineItemForConfig);
      console.log('[合成] 提取的神龛配置:', shrineConfig);
      
      // 等级优先级：神龛配置 > 角色等级 > UI 输入 > 默认值1
      const baseLevel = shrineConfig?.level || this.actorData?.level || uiLevel || 1;
      
      // 阶段1: 准备合成
      this.updateProgress(`摆放${this.themeService.getConcept('sacred')}材料...`, 25);
      await this.delay(500);
      
      this.updateProgress(`开始${this.themeService.getConcept('blessing')}仪式...`, 35);
      await this.delay(300);
      
      // 阶段2: 执行合成
      this.updateProgress(`正在${this.themeService.getConcept('synthesis')}材料...`, 45);
      
      // 根据模式选择合成方法
      if (this.synthesisMode === 'spell' && this.synthesisService instanceof SpellSynthesisService) {
        // 法术合成：等级除以2向上取整得到环级
        const rank = Math.ceil(baseLevel / 2);
        const traditions = [this.spellTradition];  // 使用从按钮传入的施法传统
        
        const spellConfig: SpellSynthesisConfig = {
          rank,
          traditions,
          actorData: this.actorData,
          shrineItem: this.selectedShrine as any
        };
        
        console.log('法术合成配置:', { 
          角色等级: baseLevel, 
          法术环级: rank, 
          traditions, 
          等级来源: shrineConfig?.level ? '神龛配置' : (this.actorData?.level ? '角色等级' : (uiLevel ? 'UI输入' : '默认值'))
        });
        this.lastSynthesisResult = await (this.synthesisService as SpellSynthesisService).synthesizeSpell(allMaterials as any, spellConfig);
        this.updateProgress('法术设计完成', 65);
      } else if (this.synthesisMode === 'equipment' && this.synthesisService instanceof EquipmentSynthesisService) {
        // 物品合成
        const equipmentType = shrineConfig?.equipmentType || 'equipment';
        const equipmentCategory = shrineConfig?.equipmentCategory;
        const mechanismComplexity = shrineConfig?.mechanismComplexity || 'moderate';
        
        const equipmentConfig: EquipmentSynthesisConfig = {
          level: baseLevel,
          equipmentType: equipmentType as any,
          equipmentCategory: equipmentCategory,
          actorData: this.actorData,
          shrineItem: this.selectedShrine as any
        };
        
        console.log('物品合成配置:', { 
          level: baseLevel, 
          equipmentType, 
          equipmentCategory, 
          mechanismComplexity,
          等级来源: shrineConfig?.level ? '神龛配置' : (this.actorData?.level ? '角色等级' : (uiLevel ? 'UI输入' : '默认值'))
        });
        this.lastSynthesisResult = await (this.synthesisService as EquipmentSynthesisService).synthesizeEquipment(allMaterials as any, equipmentConfig);
        this.updateProgress('物品设计完成', 65);
      } else {
        // 专长合成
        console.log('[专长合成] shrineConfig详情:', shrineConfig);
        console.log('[专长合成] category来源: UI=', category, ', 神龛=', shrineConfig?.category);
        
        // 类别优先级：神龛配置 > UI 输入
        const finalCategory = shrineConfig?.category || category;
        
        // 职业名称优先级：神龛配置（处理 self） > UI 输入
        const finalClassName = shrineConfig?.className === 'self' 
          ? (this.actorData?.class?.name || className) 
          : (shrineConfig?.className || className);
        
        const mechanismComplexity = shrineConfig?.mechanismComplexity || 'moderate';
        
        const config: ShrineSynthesisConfig = {
          level: baseLevel,
          category: finalCategory as any,
          className: finalClassName || undefined,
          actorData: this.actorData,
          shrineItem: this.selectedShrine,
          mechanismComplexity
        };
        
        console.log('专长合成配置:', { 
          level: baseLevel, 
          category: finalCategory, 
          className: finalClassName, 
          mechanismComplexity,
          等级来源: shrineConfig?.level ? '神龛配置' : (this.actorData?.level ? '角色等级' : (uiLevel ? 'UI输入' : '默认值')),
          类别来源: shrineConfig?.category ? '神龛配置' : 'UI输入',
          职业来源: shrineConfig?.className ? '神龛配置' : 'UI输入'
        });
        this.lastSynthesisResult = await (this.synthesisService as ShrineSynthesisService).synthesizeFeat(allMaterials, config);
        this.updateProgress(`${this.themeService.getFeatTypeName()}设计完成`, 65);
      }
      
      await this.delay(400);
      
      // 阶段3: 检查是否需要生成图标
      const enableIconGeneration = game.settings.get('ai-pf2e-assistant', 'enableIconGeneration');
      if (enableIconGeneration && this.lastSynthesisResult.iconPrompt) {
        this.updateProgress(`正在描绘${this.themeService.getConcept('sacred')}图标...`, 75);
        await this.generateFeatIcon();
        this.updateProgress(`${this.themeService.getConcept('sacred')}图标创造完成`, 85);
        await this.delay(300);
      } else {
        // 不生成图标时，优先使用第一个贡品的图标，其次使用默认图标
        let iconToUse: string | null = null;
        
        // 尝试从贡品中获取图标
        const offerings = allMaterials.filter(m => m.type === 'offering');
        if (offerings.length > 0 && offerings[0].img) {
          iconToUse = offerings[0].img;
          console.log('使用第一个贡品的图标:', iconToUse);
        } else {
          // 使用默认图标
        if (this.synthesisMode === 'spell') {
            iconToUse = 'icons/magic/symbols/rune-sigil-rough-white-teal.webp';  // 法术默认图标
        } else if (this.synthesisMode === 'equipment') {
            iconToUse = 'icons/containers/bags/pack-leather-brown.webp';  // 物品默认图标
          } else {
            iconToUse = 'icons/sundries/books/book-red-exclamation.webp';  // 专长默认图标
          }
          console.log('没有贡品图标，使用默认图标:', iconToUse);
        }
        
        // 根据模式设置对应的图标
        if (this.synthesisMode === 'spell' && this.lastSynthesisResult?.spell) {
          this.lastSynthesisResult.spell.img = iconToUse;
          console.log('法术图标设置完成:', iconToUse);
        } else if (this.synthesisMode === 'equipment' && (this.lastSynthesisResult as any)?.equipment) {
          (this.lastSynthesisResult as any).equipment.img = iconToUse;
          console.log('物品图标设置完成:', iconToUse);
        } else if (this.lastSynthesisResult?.feat) {
          this.lastSynthesisResult.feat.img = iconToUse;
          console.log('专长图标设置完成:', iconToUse);
        }
        this.updateProgress('跳过图标生成', 85);
        await this.delay(200);
      }
      
      // 阶段4: 自动导入
      this.updateProgress('将恩赐注入灵魂...', 90);
      await this.autoImportFeat();
      
      this.updateProgress('收纳神圣力量...', 95);
      await this.delay(300);
      
      this.updateProgress('神圣仪式完成！', 100);
      
      // 短暂延迟后隐藏进度条并显示结果
      setTimeout(() => {
        this.hideProgress();
        this._updateSynthesisDisplay(html);
        // 重新渲染界面以更新点数显示
        this.render(false);
        
        // 根据模式显示不同的完成消息
        if (this.synthesisMode === 'spell') {
          const spellName = this.lastSynthesisResult?.spell?.name || '法术';
          ui.notifications.info(`${spellName} 已成功导入到世界物品库！`);
        } else {
          ui.notifications.info(this.themeService.getMessage('synthesisComplete'));
        }
      }, 1500);
      
    } catch (error) {
      console.error('神圣合成失败:', error);
      this.hideProgress();
      ui.notifications.error(`神明拒绝了这次合成: ${error.message}`);
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 生成专长图标
   */
  private async generateFeatIcon(): Promise<void> {
    // 获取当前物品（专长或法术）
    const item = this.lastSynthesisResult?.feat || this.lastSynthesisResult?.spell;
    if (!this.lastSynthesisResult?.iconPrompt || !item) {
      console.log('图标生成跳过: 缺少iconPrompt或物品数据');
      return;
    }

    // 根据模式设置默认图标
    let defaultIcon = 'icons/sundries/books/book-red-exclamation.webp';  // 专长默认
    if (this.synthesisMode === 'spell') {
      defaultIcon = 'icons/magic/symbols/rune-sigil-rough-white-teal.webp';  // 法术默认
    } else if (this.synthesisMode === 'equipment') {
      defaultIcon = 'icons/containers/bags/pack-leather-brown.webp';  // 物品默认
    }

    try {
      // 调用图标生成服务
      const iconGeneratorService = game.modules.get('ai-pf2e-assistant')?.api?.iconGeneratorService;
      if (iconGeneratorService) {
        const options = {
          name: item.name,
          description: item.system?.description?.value || '',
          type: 'item' as const,
          iconPrompt: this.lastSynthesisResult.iconPrompt
        };
        
        console.log(`开始生成${this.synthesisMode === 'spell' ? '法术' : '专长'}图标:`, item.name);
        const generatedIcon = await iconGeneratorService.generateIcon(options);
        
        if (generatedIcon) {
          // 更新物品的图标路径
          item.img = generatedIcon.url;
          console.log('图标生成成功:', generatedIcon.filename);
        } else {
          // 生成失败，使用默认图标
          item.img = defaultIcon;
          console.log('图标生成返回空值，使用默认图标:', defaultIcon);
        }
      } else {
        // 服务不可用，使用默认图标
        item.img = defaultIcon;
        console.log('图标生成服务不可用，使用默认图标:', defaultIcon);
      }
    } catch (error) {
      // 生成失败，使用默认图标
      item.img = defaultIcon;
      console.warn('图标生成失败，使用默认图标:', error);
    }
  }

  /**
   * 自动导入专长/法术/物品
   */
  private async autoImportFeat() {
    if (!this.lastSynthesisResult) {
      throw new Error('没有可导入的内容');
    }

    try {
      // 获取要导入的物品
      const itemData = (this.lastSynthesisResult as any).feat || (this.lastSynthesisResult as any).spell || (this.lastSynthesisResult as any).equipment;
      if (!itemData) {
        throw new Error('没有可导入的物品数据');
      }

      // 根据模式决定导入位置
      if (this.synthesisMode === 'spell') {
        // 法术：存入储存箱而非直接添加到角色
        if (this.actorData) {
          const actor = game.actors?.get(this.actorData.id);
          if (actor) {
            // 导入SpellStorageService
            const { SpellStorageService } = await import('../services/spell-storage-service.js');
            await SpellStorageService.addSpell(actor, itemData);
            console.log('法术已添加到储存箱:', actor.name);
            ui.notifications.info(`法术 ${itemData.name} 已存入储存箱，请从储存箱拖出使用`);
          } else {
            throw new Error('找不到目标角色');
          }
        } else {
          // 如果没有角色，导入到世界
          await Item.create(itemData);
          console.log('法术已导入到世界');
        ui.notifications.info(`法术 ${itemData.name} 已导入到世界物品库`);
        }
      } else if (this.synthesisMode === 'equipment') {
        // 物品模式：同时添加到角色物品栏和物品文件夹
        if (this.actorData) {
          const actor = game.actors?.get(this.actorData.id);
          if (actor) {
            // 导入ItemFolderStorageService
            const { ItemFolderStorageService } = await import('../services/item-folder-storage-service.js');
            await ItemFolderStorageService.addEquipmentToActorAndFolder(actor, itemData);
            console.log('物品已添加到角色和文件夹:', actor.name);
            ui.notifications.info(`物品 ${itemData.name} 已添加到角色物品栏，并存入"${actor.name}物品"文件夹`);
          } else {
            throw new Error('找不到目标角色');
          }
        } else {
          // 如果没有角色，导入到世界
          await Item.create(itemData);
          console.log('物品已导入到世界');
          ui.notifications.info(`物品 ${itemData.name} 已导入到世界物品库`);
        }
      } else {
        // 专长模式：存入储存箱而非直接添加到角色
        if (this.actorData) {
          const actor = game.actors?.get(this.actorData.id);
          if (actor) {
            // 导入FeatStorageService
            const { FeatStorageService } = await import('../services/feat-storage-service.js');
            await FeatStorageService.addFeat(actor, itemData);
            console.log('专长已添加到储存箱:', actor.name);
            ui.notifications.info(`专长 ${itemData.name} 已存入储存箱，请从储存箱拖出使用`);
          } else {
            throw new Error('找不到目标角色');
          }
        } else {
          // 如果没有角色，导入到世界
          await Item.create(itemData);
          console.log('专长已导入到世界');
          ui.notifications.info(`专长 ${itemData.name} 已导入到世界物品库`);
        }
      }
    } catch (error: any) {
      console.error('导入失败:', error);
      throw new Error(`导入失败: ${error.message}`);
    }
  }

  /**
   * 清空材料
   */
  private _onClearMaterials(event: Event) {
    event.preventDefault();
    
    this.selectedMaterials = [];
    this.lastSynthesisResult = null;
    this._updateSynthesisDisplay($(this.element));
    
    ui.notifications.info((game as any).i18n.localize('AIPF2E.ShrineSynthesis.materialsCleared'));
  }

  /**
   * 移除单个材料
   */
  private _onRemoveMaterial(event: Event) {
    event.preventDefault();
    
    const materialId = $(event.currentTarget).data('material-id');
    this.selectedMaterials = this.selectedMaterials.filter(m => m.id !== materialId);
    
    this._updateSynthesisDisplay($(this.element));
  }




  /**
   * 获取物品类型显示名称
   */
  private _getItemTypeDisplayName(itemType: string): string {
    const typeMap: { [key: string]: string } = {
      'fragment': '碎片',
      'divinity': '神性',
      'offering': '贡品',
      'shrine': '神龛'
    };
    return typeMap[itemType] || itemType;
  }

  /**
   * 更新合成显示（避免重新渲染，只更新必要的SVG组件）
   */
  private _updateSynthesisDisplay(html: any) {
    // 只更新SVG组件，不重新渲染整个界面
    if (this.circularComponent) {
      this.circularComponent.updateMaterials(this.selectedMaterials);
      this.circularComponent.updateShrine(this.selectedShrine);
    }
    
    // 如果需要更新按钮状态等，可以在这里直接操作DOM
    const synthesizeBtn = $(this.element).find('#synthesize-feat');
    const hasRequiredItems = this.selectedShrine && this.selectedMaterials.length > 0;
    synthesizeBtn.prop('disabled', !hasRequiredItems);
  }


  /**
   * Foundry拖拽处理 - 检查是否可以拖拽
   */
  _canDragDrop(selector: string): boolean {
    return true;
  }

  /**
   * Foundry拖拽处理 - 处理拖拽数据
   */
  _onDragStart(event: DragEvent): void {
    // 这个方法处理从本应用开始的拖拽，我们主要接收外部拖拽
  }

  /**
   * Foundry拖拽处理 - 处理拖拽放下
   */
  _onDrop(event: DragEvent): void {
    if (!event.dataTransfer) return;

    let dragData;
    try {
      dragData = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      console.warn('无法解析拖拽数据:', err);
      return;
    }

    console.log('Foundry拖拽数据:', dragData);

    // 获取物品数据
    this._handleFoundryDrop(dragData);
  }

  /**
   * 处理Foundry拖拽数据
   */
  private async _handleFoundryDrop(dragData: any) {
    if (dragData.type !== 'Item') {
      ui.notifications?.warn('只能拖拽物品到神龛合成器');
      return;
    }

    console.log('拖拽数据详情:', dragData);

    // 获取物品数据 - 使用更完整的查找逻辑
    let item;
    
    try {
      // 首先尝试使用UUID
      if (dragData.uuid) {
        item = await fromUuid(dragData.uuid);
        console.log('通过UUID获取物品:', item);
      }
      
      // 如果UUID失败，尝试其他方法
      if (!item) {
        if (dragData.pack) {
          // 来自合集的物品
          const pack = game.packs.get(dragData.pack);
          item = await pack?.getDocument(dragData.id);
        } else if (dragData.id) {
          // 来自世界的物品
          item = game.items?.get(dragData.id);
        } else if (dragData.actorId && dragData.data) {
          // 来自角色的物品
          const actor = game.actors?.get(dragData.actorId);
          item = actor?.items?.get(dragData.data._id);
        }
      }

      // 如果还是没有，尝试使用内联数据
      if (!item && dragData.data) {
        console.log('使用拖拽中的物品数据:', dragData.data);
        item = dragData.data;
      }

    } catch (error) {
      console.error('获取拖拽物品时出错:', error);
    }

    if (!item) {
      console.error('无法找到拖拽的物品，拖拽数据:', dragData);
      ui.notifications?.warn('无法找到拖拽的物品');
      return;
    }

    console.log('成功获取物品:', item.name, '完整数据:', item);

    // 识别物品类型
    const itemType = ShrineItemService.getItemType(item);
    console.log('物品类型识别结果:', itemType);

    // 根据类型处理，传递已识别的类型避免重复识别
    if (itemType === 'shrine') {
      this._onShrineAdd(item, itemType);
    } else if (['fragment', 'divinity', 'offering'].includes(itemType)) {
      this._onMaterialAdd(item, itemType);
    } else {
      ui.notifications?.warn(`"${item.name}" 不是有效的神圣材料`);
    }
  }

  /**
   * 获取当前角色
   */
  private getCurrentActor(): any {
    try {
      // 如果有存储的角色数据，尝试获取对应的角色
      if (this.actorData?.id) {
        const actor = game.actors?.get(this.actorData.id);
        if (actor) {
          return actor;
        }
      }

      // 优先使用当前选中的token对应的角色
      const controlled = canvas?.tokens?.controlled;
      if (controlled && controlled.length > 0) {
        return controlled[0].actor;
      }

      // 其次使用当前用户的角色
      const user = game.user;
      if (user?.character) {
        return user.character;
      }

      // 最后使用第一个拥有的角色
      const ownedActors = game.actors?.filter((actor: any) => 
        actor.type === 'character' && actor.isOwner
      );
      
      return ownedActors && ownedActors.length > 0 ? ownedActors[0] : null;
    } catch (error) {
      console.warn('获取当前角色失败:', error);
      return null;
    }
  }

  /**
   * 处理点数管理按钮点击
   */
  private _onManagePoints(event: JQuery.ClickEvent): void {
    event.preventDefault();
    ShrinePointManager.show();
  }

  /**
   * 销毁时清理SVG组件
   */
  close(options?: any) {
    if (this.circularComponent) {
      this.circularComponent.destroy();
      this.circularComponent = undefined;
    }
    return super.close(options);
  }
}