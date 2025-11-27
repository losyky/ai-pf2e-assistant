import { FeatStorageService } from '../services/feat-storage-service';
import { SpellStorageService } from '../services/spell-storage-service';

/**
 * 物品储存箱界面（支持专长和法术）
 * 使用PF2e原生Item对象和方法
 * 物品存储在flags中，不会激活规则元素
 */
export class FeatStorageSheet extends ActorSheet {
  private actor: any;
  private currentTab: 'feats' | 'spells' = 'feats'; // 当前分页

  constructor(actor: any, options: Partial<ActorSheetOptions> = {}) {
    super(actor, options);
    this.actor = actor;
    // 从options中读取初始tab
    if ((options as any).initialTab) {
      this.currentTab = (options as any).initialTab;
    }
  }

  static override get defaultOptions(): ActorSheetOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['pf2e', 'sheet', 'actor', 'character', 'feat-storage'],
      width: 800,
      height: 800,
      template: 'modules/ai-pf2e-assistant/templates/feat-storage-sheet.hbs',
      scrollY: ['.sheet-body'],
      dragDrop: [{ dragSelector: 'li.slot[data-item-id]', dropSelector: '.sheet-body' }],
      sheetConfig: false,
      title: (game as any).i18n?.localize('AIPF2E.FeatStorage.title') || 'Feat Storage'
    } as any);
  }

  /** 避免与真正的角色表单冲突 */
  override get id(): string {
    return `feat-storage-${this.actor.id}`;
  }

  override get title(): string {
    return (game as any).i18n?.format('AIPF2E.FeatStorage.sheetTitle', { name: this.actor.name }) || `Item Storage - ${this.actor.name}`;
  }

  /**
   * 移除不需要的头部按钮，只保留关闭按钮
   */
  protected override _getHeaderButtons(): ApplicationHeaderButton[] {
    return super._getHeaderButtons().filter((b) => b.class === 'close');
  }

  override async getData(options?: ActorSheetOptions): Promise<any> {
    const baseData = await super.getData(options);
    
    // 创建临时Item文档的通用方法
    const createItemsFromData = async (itemsData: any[]) => {
      const items = await Promise.all(itemsData.map(async (itemData) => {
        try {
          // 创建一个临时的Item实例用于渲染
          const ItemClass = CONFIG.Item.documentClass;
          const item = new ItemClass(itemData, { parent: this.actor });
          return item;
        } catch (error) {
          console.error('创建临时Item失败:', error);
          return null;
        }
      }));
      return items.filter(item => item !== null);
    };

    // 获取专长数据
    const unconfirmedFeatsData = FeatStorageService.getUnconfirmedFeats(this.actor);
    const confirmedFeatsData = FeatStorageService.getConfirmedFeats(this.actor);
    const unconfirmedFeats = await createItemsFromData(unconfirmedFeatsData);
    const confirmedFeats = await createItemsFromData(confirmedFeatsData);
    const allFeats = [...unconfirmedFeats, ...confirmedFeats];

    // 获取法术数据
    const unconfirmedSpellsData = SpellStorageService.getUnconfirmedSpells(this.actor);
    const confirmedSpellsData = SpellStorageService.getConfirmedSpells(this.actor);
    const unconfirmedSpells = await createItemsFromData(unconfirmedSpellsData);
    const confirmedSpells = await createItemsFromData(confirmedSpellsData);
    const allSpells = [...unconfirmedSpells, ...confirmedSpells];

    return {
      ...baseData,
      actor: this.actor,
      currentTab: this.currentTab,
      // 专长数据
      feats: allFeats,
      unconfirmedFeats: unconfirmedFeats,
      confirmedFeats: confirmedFeats,
      featTotalCount: allFeats.length,
      featUnconfirmedCount: unconfirmedFeats.length,
      featConfirmedCount: confirmedFeats.length,
      hasUnconfirmedFeats: unconfirmedFeats.length > 0,
      hasAnyFeats: allFeats.length > 0,
      // 法术数据
      spells: allSpells,
      unconfirmedSpells: unconfirmedSpells,
      confirmedSpells: confirmedSpells,
      spellTotalCount: allSpells.length,
      spellUnconfirmedCount: unconfirmedSpells.length,
      spellConfirmedCount: confirmedSpells.length,
      hasUnconfirmedSpells: unconfirmedSpells.length > 0,
      hasAnySpells: allSpells.length > 0,
      // 通用数据（为了向后兼容，使用当前tab的数据）
      totalCount: this.currentTab === 'feats' ? allFeats.length : allSpells.length,
      unconfirmedCount: this.currentTab === 'feats' ? unconfirmedFeats.length : unconfirmedSpells.length,
      confirmedCount: this.currentTab === 'feats' ? confirmedFeats.length : confirmedSpells.length,
      hasUnconfirmed: this.currentTab === 'feats' ? unconfirmedFeats.length > 0 : unconfirmedSpells.length > 0,
      editable: this.isEditable,
      owner: this.actor.isOwner
    };
  }

  override activateListeners($html: JQuery<HTMLElement>): void {
    super.activateListeners($html);
    const html = $html[0];

    // 动态注入关键样式以确保布局正确
    this._injectCriticalStyles(html);

    // 使用事件委托处理所有点击
    html.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest('[data-action]') as HTMLElement;
      
      if (!action) return;
      
      const actionType = action.dataset.action;
      
      switch (actionType) {
        case 'delete-item':
          event.preventDefault();
          await this._onDeleteItem(event);
          break;
        case 'edit-item':
          event.preventDefault();
          await this._onEditItem(event);
          break;
        case 'toggle-summary':
          event.preventDefault();
          await this._onToggleSummary(event);
          break;
        case 'item-to-chat':
          event.preventDefault();
          await this._onItemToChat(event);
          break;
        case 'clear-unconfirmed':
          event.preventDefault();
          await this._onClearUnconfirmed(event);
          break;
        case 'switch-tab':
          event.preventDefault();
          this._onSwitchTab(event);
          break;
      }
    });

    // 添加拖放悬停效果
    const sheetBody = html.querySelector('.sheet-body');
    if (sheetBody) {
      sheetBody.addEventListener('dragover', (event) => {
        event.preventDefault();
        sheetBody.classList.add('drag-hover');
        
        // 为拖放目标区域添加高亮
        const target = event.target as HTMLElement;
        const targetSection = target.closest('.feat-storage-section[data-storage-area]') as HTMLElement;
        
        // 移除所有区域的高亮
        html.querySelectorAll('.feat-storage-section').forEach(section => {
          section.classList.remove('drop-target-hover');
        });
        
        // 为当前目标区域添加高亮
        if (targetSection) {
          targetSection.classList.add('drop-target-hover');
        }
      });

      sheetBody.addEventListener('dragleave', (event) => {
        const relatedTarget = event.relatedTarget as HTMLElement;
        if (!sheetBody.contains(relatedTarget)) {
          sheetBody.classList.remove('drag-hover');
          // 移除所有区域的高亮
          html.querySelectorAll('.feat-storage-section').forEach(section => {
            section.classList.remove('drop-target-hover');
          });
        }
      });

      sheetBody.addEventListener('drop', () => {
        sheetBody.classList.remove('drag-hover');
        // 移除所有区域的高亮
        html.querySelectorAll('.feat-storage-section').forEach(section => {
          section.classList.remove('drop-target-hover');
        });
      });
    }
  }

  /**
   * 动态注入关键样式以确保布局正确
   */
  private _injectCriticalStyles(html: HTMLElement): void {
    // 获取所有专长和法术列表项
    const items = html.querySelectorAll('.feats-list li.slot, .spells-list li.slot');
    
    items.forEach((item) => {
      const li = item as HTMLElement;
      
      // 为 li.slot 强制设置 grid 布局
      li.style.display = 'grid';
      li.style.alignItems = 'center';
      li.style.grid = '"name ctrl" min-content "content content" min-content / 1fr min-content';
      
      // 为 .item-name 应用样式
      const itemName = item.querySelector('.item-name') as HTMLElement;
      if (itemName) {
        itemName.style.display = 'flex';
        itemName.style.alignItems = 'center';
        itemName.style.flex = '1';
        itemName.style.gap = '0.5rem';
        itemName.style.minWidth = '0';
        itemName.style.overflow = 'hidden';
        itemName.style.gridArea = 'name';
      }

      // 为 .item-image 应用样式
      const itemImage = item.querySelector('.item-image') as HTMLElement;
      if (itemImage) {
        itemImage.style.display = 'inline-flex';
        itemImage.style.flex = '0 0 auto';
        itemImage.style.flexShrink = '0';
        itemImage.style.flexGrow = '0';
        itemImage.style.width = '1.5rem';
        itemImage.style.height = '1.5rem';
        itemImage.style.minWidth = '1.5rem';
        itemImage.style.maxWidth = '1.5rem';
        itemImage.style.position = 'relative';
        itemImage.style.overflow = 'hidden';
      }

      // 为 .item-image img 应用样式
      const itemImageImg = item.querySelector('.item-image img') as HTMLElement;
      if (itemImageImg) {
        itemImageImg.style.width = '100%';
        itemImageImg.style.height = '100%';
        itemImageImg.style.objectFit = 'cover';
      }

      // 为 .item-image i 应用样式
      const itemImageIcon = item.querySelector('.item-image i') as HTMLElement;
      if (itemImageIcon) {
        itemImageIcon.style.position = 'absolute';
        itemImageIcon.style.top = '0';
        itemImageIcon.style.left = '0';
        itemImageIcon.style.width = '100%';
        itemImageIcon.style.height = '100%';
      }

      // 为 h4 应用样式
      const h4 = item.querySelector('.item-name h4') as HTMLElement;
      if (h4) {
        h4.style.minWidth = '0';
        h4.style.flexShrink = '1';
        h4.style.overflow = 'hidden';
      }

      // 为 h4 a 应用样式
      const h4Link = item.querySelector('.item-name h4 a') as HTMLElement;
      if (h4Link) {
        h4Link.style.overflow = 'hidden';
        h4Link.style.textOverflow = 'ellipsis';
        h4Link.style.whiteSpace = 'nowrap';
      }

      // 为 .item-controls 应用样式（确保按钮在同一行）
      const itemControls = item.querySelector('.item-controls') as HTMLElement;
      if (itemControls) {
        itemControls.style.display = 'flex';
        itemControls.style.alignItems = 'center';
        itemControls.style.gap = '0.25rem';
        itemControls.style.flexShrink = '0';
        itemControls.style.gridArea = 'ctrl';
        itemControls.style.width = 'auto'; // 覆盖CSS中的 width: 100%
        itemControls.style.height = 'auto'; // 覆盖CSS中的 height: 100%
      }
    });
  }

  /**
   * 处理物品拖动开始
   */
  protected override _onDragStart(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    const itemId = target.dataset.itemId;
    const itemType = target.dataset.itemType;
    
    if (!itemId || !itemType) return;

    let item: any = null;
    if (itemType === 'feat') {
      item = FeatStorageService.getStoredFeat(this.actor, itemId);
    } else if (itemType === 'spell') {
      item = SpellStorageService.getStoredSpell(this.actor, itemId);
    }
    
    if (!item) return;

    // 设置拖动数据，与PF2e系统兼容
    const dragData = {
      type: 'Item',
      uuid: `Actor.${this.actor.id}.Item.${itemId}`, // 虽然是虚拟的UUID
      data: item // 完整数据用于创建
    };

    event.dataTransfer?.setData('text/plain', JSON.stringify(dragData));
  }


  /**
   * 删除物品（专长或法术）
   */
  private async _onDeleteItem(event: Event): Promise<void> {
    event.preventDefault();
    
    const target = event.target as HTMLElement;
    const listItem = target.closest('li[data-item-id]') as HTMLElement;
    const itemId = listItem?.dataset.itemId;
    const itemType = listItem?.dataset.itemType;
    
    if (!itemId || !itemType) return;

    if (itemType === 'feat') {
      const feat = FeatStorageService.getStoredFeat(this.actor, itemId);
      if (!feat) return;

      // 确认对话框
      const confirmed = await Dialog.confirm({
        title: (game as any).i18n.localize('AIPF2E.FeatStorage.deleteFeat'),
        content: `<p>${(game as any).i18n.format('AIPF2E.FeatStorage.confirmDeleteFeat', { name: feat.name })}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (!confirmed) return;

      try {
        await FeatStorageService.removeFeat(this.actor, itemId);
        ui.notifications?.info(`专长 "${feat.name}" 已从储存箱移除`);
        this.render(false);
      } catch (error: any) {
        ui.notifications?.error(`删除专长失败: ${error.message}`);
      }
    } else if (itemType === 'spell') {
      const spell = SpellStorageService.getStoredSpell(this.actor, itemId);
      if (!spell) return;

      // 确认对话框
      const confirmed = await Dialog.confirm({
        title: (game as any).i18n.localize('AIPF2E.FeatStorage.deleteSpell'),
        content: `<p>${(game as any).i18n.format('AIPF2E.FeatStorage.confirmDeleteSpell', { name: spell.name })}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (!confirmed) return;

      try {
        await SpellStorageService.removeSpell(this.actor, itemId);
        ui.notifications?.info(`法术 "${spell.name}" 已从储存箱移除`);
        this.render(false);
      } catch (error: any) {
        ui.notifications?.error(`删除法术失败: ${error.message}`);
      }
    }
  }

  /**
   * 一键清除所有未确认的物品
   */
  private async _onClearUnconfirmed(event: Event): Promise<void> {
    event.preventDefault();
    
    if (this.currentTab === 'feats') {
      const unconfirmedFeats = FeatStorageService.getUnconfirmedFeats(this.actor);
      
      if (unconfirmedFeats.length === 0) {
        ui.notifications?.info('普通存储区已经是空的');
        return;
      }

      // 确认对话框
      const confirmed = await Dialog.confirm({
        title: (game as any).i18n.localize('AIPF2E.FeatStorage.clearNormalStorage'),
        content: `<p>${(game as any).i18n.format('AIPF2E.FeatStorage.confirmClearFeats', { count: unconfirmedFeats.length })}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (!confirmed) return;

      try {
        await FeatStorageService.clearUnconfirmed(this.actor);
        ui.notifications?.info(`已清除 ${unconfirmedFeats.length} 个未确认的专长`);
        this.render(false);
      } catch (error: any) {
        ui.notifications?.error(`清除失败: ${error.message}`);
      }
    } else if (this.currentTab === 'spells') {
      const unconfirmedSpells = SpellStorageService.getUnconfirmedSpells(this.actor);
      
      if (unconfirmedSpells.length === 0) {
        ui.notifications?.info('普通存储区已经是空的');
        return;
      }

      // 确认对话框
      const confirmed = await Dialog.confirm({
        title: (game as any).i18n.localize('AIPF2E.FeatStorage.clearNormalStorage'),
        content: `<p>${(game as any).i18n.format('AIPF2E.FeatStorage.confirmClearSpells', { count: unconfirmedSpells.length })}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (!confirmed) return;

      try {
        await SpellStorageService.clearUnconfirmed(this.actor);
        ui.notifications?.info(`已清除 ${unconfirmedSpells.length} 个未确认的法术`);
        this.render(false);
      } catch (error: any) {
        ui.notifications?.error(`清除失败: ${error.message}`);
      }
    }
  }

  /**
   * 切换分页
   */
  private _onSwitchTab(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest('[data-tab]') as HTMLElement;
    const tab = button?.dataset.tab as 'feats' | 'spells';
    
    if (tab && tab !== this.currentTab) {
      this.currentTab = tab;
      this.render(false);
    }
  }

  /**
   * 编辑物品 - 使用PF2e原生的item sheet
   */
  private async _onEditItem(event: Event): Promise<void> {
    const target = event.target as HTMLElement;
    const listItem = target.closest('li[data-item-id]') as HTMLElement;
    const itemId = listItem?.dataset.itemId;
    const itemType = listItem?.dataset.itemType;
    
    if (!itemId || !itemType) return;

    let itemData: any = null;
    if (itemType === 'feat') {
      itemData = FeatStorageService.getStoredFeat(this.actor, itemId);
    } else if (itemType === 'spell') {
      itemData = SpellStorageService.getStoredSpell(this.actor, itemId);
    }
    
    if (!itemData) return;

    try {
      // 创建临时Item实例并打开其表单
      const ItemClass = CONFIG.Item.documentClass;
      const tempItem = new ItemClass(itemData, { parent: this.actor });
      tempItem.sheet.render(true);
    } catch (error) {
      console.error('打开物品表单失败:', error);
      ui.notifications?.error(`无法打开${itemType === 'feat' ? '专长' : '法术'}详情`);
    }
  }

  /**
   * 发送物品到聊天 - 使用PF2e原生方法
   */
  private async _onItemToChat(event: Event): Promise<void> {
    const target = event.target as HTMLElement;
    const listItem = target.closest('li[data-item-id]') as HTMLElement;
    const itemId = listItem?.dataset.itemId;
    const itemType = listItem?.dataset.itemType;
    
    if (!itemId || !itemType) return;

    let itemData: any = null;
    if (itemType === 'feat') {
      itemData = FeatStorageService.getStoredFeat(this.actor, itemId);
    } else if (itemType === 'spell') {
      itemData = SpellStorageService.getStoredSpell(this.actor, itemId);
    }
    
    if (!itemData) return;

    try {
      // 创建临时Item实例并发送到聊天
      const ItemClass = CONFIG.Item.documentClass;
      const tempItem = new ItemClass(itemData, { parent: this.actor });
      await tempItem.toMessage(event);
    } catch (error) {
      console.error('发送物品到聊天失败:', error);
      ui.notifications?.error(`无法发送${itemType === 'feat' ? '专长' : '法术'}到聊天`);
    }
  }

  /**
   * 切换物品描述显示
   */
  private async _onToggleSummary(event: Event): Promise<void> {
    const target = event.target as HTMLElement;
    const listItem = target.closest('li[data-item-id]') as HTMLElement;
    const itemId = listItem?.dataset.itemId;
    const itemType = listItem?.dataset.itemType;
    
    if (!listItem || !itemId || !itemType) return;

    const summary = listItem.querySelector('.item-summary') as HTMLElement;
    if (!summary) return;

    // 简单的toggle逻辑，不使用动画以避免问题
    const isHidden = summary.hasAttribute('hidden');
    
    if (isHidden) {
      // 如果内容为空，先加载
      if (!summary.innerHTML.trim()) {
        let itemData: any = null;
        if (itemType === 'feat') {
          itemData = FeatStorageService.getStoredFeat(this.actor, itemId);
        } else if (itemType === 'spell') {
          itemData = SpellStorageService.getStoredSpell(this.actor, itemId);
        }
        
        if (itemData) {
          try {
            // 创建临时Item来获取聊天数据
            const ItemClass = CONFIG.Item.documentClass;
            const tempItem = new ItemClass(itemData, { parent: this.actor });
            const chatData = await tempItem.getChatData();
            
            // 渲染描述
            if (chatData.description?.value) {
              summary.innerHTML = chatData.description.value;
            } else {
              summary.innerHTML = '<p class="no-description">无描述</p>';
            }
          } catch (error) {
            console.error('加载物品描述失败:', error);
            summary.innerHTML = '<p class="no-description">加载失败</p>';
          }
        }
      }
      
      // 显示
      summary.removeAttribute('hidden');
    } else {
      // 隐藏
      summary.setAttribute('hidden', '');
    }
  }

  /**
   * 覆盖_onDrop以处理从角色卡拖入的物品或在区域间移动
   */
  protected override async _onDrop(event: DragEvent): Promise<boolean | void> {
    event.preventDefault();
    event.stopPropagation();
    
    const data = TextEditor.getDragEventData(event);
    
    // 只处理物品类型
    if (data.type !== 'Item') {
      return false;
    }

    try {
      // 确定放置的目标区域
      const dropTarget = event.target as HTMLElement;
      const targetSection = dropTarget.closest('.item-storage-section[data-storage-area]') as HTMLElement;
      const targetArea = targetSection?.dataset.storageArea; // 'confirmed' 或 'unconfirmed'
      
      let item: any = null;
      let itemData: any = null;
      let isInternalMove = false;
      
      // 检查是否是内部移动（从一个区域拖到另一个区域）
      if (data.uuid && data.uuid.includes(`Actor.${this.actor.id}.Item.`)) {
        // 可能是内部移动
        const itemId = data.uuid.split('.').pop();
        const storedFeat = FeatStorageService.getStoredFeat(this.actor, itemId);
        const storedSpell = SpellStorageService.getStoredSpell(this.actor, itemId);
        
        if (storedFeat) {
          // 确实是内部移动（专长）
          isInternalMove = true;
          itemData = storedFeat;
          
          // 如果有明确的目标区域，更新confirmed状态
          if (targetArea) {
            const newConfirmedState = targetArea === 'confirmed';
            await FeatStorageService.setConfirmed(this.actor, itemId, newConfirmedState);
            ui.notifications?.info(`专长 "${storedFeat.name}" 已移动到${newConfirmedState ? '确认' : '普通'}存储区`);
            this.render(false);
            return true;
          }
        } else if (storedSpell) {
          // 确实是内部移动（法术）
          isInternalMove = true;
          itemData = storedSpell;
          
          // 如果有明确的目标区域，更新confirmed状态
          if (targetArea) {
            const newConfirmedState = targetArea === 'confirmed';
            await SpellStorageService.setConfirmed(this.actor, itemId, newConfirmedState);
            ui.notifications?.info(`法术 "${storedSpell.name}" 已移动到${newConfirmedState ? '确认' : '普通'}存储区`);
            this.render(false);
            return true;
          }
        }
      }
      
      // 如果不是内部移动，从外部添加
      if (!isInternalMove) {
        // 如果有UUID，从UUID获取
        if (data.uuid) {
          item = await fromUuid(data.uuid);
        } else if (data.data) {
          // 直接使用提供的数据
          itemData = data.data;
        }
        
        if (!item && !itemData) {
          console.warn('无法获取拖放的物品');
          return false;
        }

        // 获取物品类型
        const itemType = item?.type || itemData?.type;
        
        // 根据当前tab和物品类型决定是否接受
        if (this.currentTab === 'feats' && itemType !== 'feat') {
          ui.notifications?.warn('当前在专长分页，只能添加专长');
          return false;
        }
        if (this.currentTab === 'spells' && itemType !== 'spell') {
          ui.notifications?.warn('当前在法术分页，只能添加法术');
          return false;
        }

        // 获取完整的物品数据
        if (item) {
          itemData = item.toObject();
        }
        
        // 根据放置区域决定confirmed状态
        const confirmed = targetArea === 'confirmed';
        
        // 添加到储存箱
        if (itemType === 'feat') {
          await FeatStorageService.addFeat(this.actor, itemData, confirmed);
        } else if (itemType === 'spell') {
          await SpellStorageService.addSpell(this.actor, itemData, confirmed);
        }
        
        const targetAreaName = confirmed ? '确认存储区' : '普通存储区';
        const itemTypeName = itemType === 'feat' ? '专长' : '法术';
        ui.notifications?.info(`${itemTypeName} "${itemData.name}" 已添加到${targetAreaName}`);
        
        // 刷新界面
        this.render(false);
      }
      
      return true;
    } catch (error: any) {
      console.error('拖放失败:', error);
      ui.notifications?.error(`操作失败: ${error.message}`);
      return false;
    }
  }

}

