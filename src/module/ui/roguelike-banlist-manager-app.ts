import { RoguelikeBanList, RoguelikeBanListItem } from '../services/roguelike-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';
const SETTING_KEY = 'roguelikeBanlists';

const CONTENT_TYPE_CONFIG: { type: string; icon: string; labelKey: string }[] = [
  { type: 'feat',      icon: 'fa-fist-raised', labelKey: 'AIPF2E.Roguelike.feat' },
  { type: 'spell',     icon: 'fa-magic',       labelKey: 'AIPF2E.Roguelike.spell' },
  { type: 'equipment', icon: 'fa-shield-alt',   labelKey: 'AIPF2E.Roguelike.equipment' },
  { type: 'action',    icon: 'fa-bolt',         labelKey: 'AIPF2E.Roguelike.action' },
];

interface CategoryData {
  type: string;
  icon: string;
  label: string;
  items: RoguelikeBanListItem[];
  collapsed: boolean;
}

export class RoguelikeBanlistManagerApp extends FormApplication {
  private editingId: string | null = null;
  private collapsedCategories: Set<string> = new Set();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'roguelike-banlist-manager',
      title: (game as any).i18n?.localize('AIPF2E.Roguelike.banlist.managerTitle') || 'Roguelike Ban List',
      template: 'modules/ai-pf2e-assistant/templates/roguelike-banlist-manager-app.hbs',
      width: 520,
      height: 600,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'roguelike-banlist-manager', 'pf2e'],
      closeOnSubmit: false,
      submitOnChange: false,
    });
  }

  private static getBanlists(): RoguelikeBanList[] {
    try {
      return (game as any).settings.get(MODULE_ID, SETTING_KEY) || [];
    } catch {
      return [];
    }
  }

  private static async saveBanlists(lists: RoguelikeBanList[]): Promise<void> {
    await (game as any).settings.set(MODULE_ID, SETTING_KEY, lists);
  }

  override async getData(): Promise<any> {
    const banlists = RoguelikeBanlistManagerApp.getBanlists();
    const editingList = this.editingId
      ? banlists.find(b => b.id === this.editingId) || null
      : null;

    const g = game as any;
    let categories: CategoryData[] | undefined;
    if (editingList) {
      categories = CONTENT_TYPE_CONFIG.map(cfg => ({
        type: cfg.type,
        icon: cfg.icon,
        label: g.i18n?.localize(cfg.labelKey) || cfg.type,
        items: editingList.items.filter(i => i.sourceTab === cfg.type),
        collapsed: this.collapsedCategories.has(cfg.type),
      }));
    }

    return {
      banlists,
      editingList,
      isEditing: !!editingList,
      categories,
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.banlist-new-btn').on('click', () => this.createBanList());

    html.find('.banlist-edit-btn').on('click', (ev) => {
      this.editingId = (ev.currentTarget as HTMLElement).dataset.id || null;
      this.render(false);
    });

    html.find('.banlist-delete-btn').on('click', async (ev) => {
      const id = (ev.currentTarget as HTMLElement).dataset.id;
      if (!id) return;
      const confirmed = await this.confirmDelete();
      if (!confirmed) return;
      const lists = RoguelikeBanlistManagerApp.getBanlists().filter(b => b.id !== id);
      await RoguelikeBanlistManagerApp.saveBanlists(lists);
      if (this.editingId === id) this.editingId = null;
      this.render(false);
    });

    html.find('.banlist-back-btn').on('click', () => {
      this.editingId = null;
      this.render(false);
    });

    html.find('.banlist-rename-input').on('change', async (ev) => {
      const newName = (ev.currentTarget as HTMLInputElement).value.trim();
      if (!newName || !this.editingId) return;
      const lists = RoguelikeBanlistManagerApp.getBanlists();
      const list = lists.find(b => b.id === this.editingId);
      if (list) {
        list.name = newName;
        await RoguelikeBanlistManagerApp.saveBanlists(lists);
      }
    });

    html.find('.banlist-browse-btn').on('click', () => this.openCompendiumBrowser());

    html.find('.banlist-category-header').on('click', (ev) => {
      const type = (ev.currentTarget as HTMLElement).closest('.banlist-category')?.getAttribute('data-type');
      if (!type) return;
      if (this.collapsedCategories.has(type)) {
        this.collapsedCategories.delete(type);
      } else {
        this.collapsedCategories.add(type);
      }
      this.render(false);
    });

    html.find('.banlist-remove-item').on('click', async (ev) => {
      const uuid = (ev.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid || !this.editingId) return;
      const lists = RoguelikeBanlistManagerApp.getBanlists();
      const list = lists.find(b => b.id === this.editingId);
      if (list) {
        list.items = list.items.filter(i => i.uuid !== uuid);
        await RoguelikeBanlistManagerApp.saveBanlists(lists);
        this.render(false);
      }
    });

    html.find('.banlist-item-name').on('click', async (ev) => {
      ev.preventDefault();
      const uuid = (ev.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid) return;
      const doc = await (globalThis as any).fromUuid(uuid);
      doc?.sheet?.render(true);
    });

    const form = html[0];
    if (form && this.editingId) {
      form.addEventListener('dragover', (ev: DragEvent) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        form.querySelector('.banlist-drop-zone')?.classList.add('drag-over');
      });
      form.addEventListener('dragleave', (ev: DragEvent) => {
        const related = ev.relatedTarget as HTMLElement | null;
        if (!related || !form.contains(related)) {
          form.querySelector('.banlist-drop-zone')?.classList.remove('drag-over');
        }
      });
      form.addEventListener('drop', (ev: DragEvent) => {
        ev.preventDefault();
        form.querySelector('.banlist-drop-zone')?.classList.remove('drag-over');
        this.handleDrop(ev);
      });
    }
  }

  protected override async _updateObject(): Promise<void> {}

  private async createBanList(): Promise<void> {
    const g = game as any;
    const lists = RoguelikeBanlistManagerApp.getBanlists();
    const defaultName = (g.i18n?.localize('AIPF2E.Roguelike.banlist.defaultName') || '屏蔽列表') + ' ' + (lists.length + 1);
    const newList: RoguelikeBanList = {
      id: foundry.utils.randomID(),
      name: defaultName,
      items: [],
    };
    lists.push(newList);
    await RoguelikeBanlistManagerApp.saveBanlists(lists);
    this.editingId = newList.id;
    this.render(false);
  }

  private confirmDelete(): Promise<boolean> {
    return new Promise((resolve) => {
      const g = game as any;
      const Dialog = (globalThis as any).Dialog;
      new Dialog({
        title: g.i18n?.localize('AIPF2E.Roguelike.banlist.confirmDeleteTitle') || '确认删除',
        content: `<p>${g.i18n?.localize('AIPF2E.Roguelike.banlist.confirmDeleteContent') || '确定要删除这个屏蔽列表吗？'}</p>`,
        buttons: {
          yes: { label: g.i18n?.localize('AIPF2E.Roguelike.banlist.delete') || '删除', icon: '<i class="fas fa-trash"></i>', callback: () => resolve(true) },
          no:  { label: g.i18n?.localize('AIPF2E.Roguelike.banlist.cancel') || '取消', icon: '<i class="fas fa-times"></i>', callback: () => resolve(false) },
        },
        default: 'no',
        close: () => resolve(false),
      }).render(true);
    });
  }

  private openCompendiumBrowser(): void {
    const browser = (game as any).pf2e?.compendiumBrowser;
    if (browser) {
      browser.render(true);
    } else {
      (globalThis as any).ui?.notifications?.warn('Compendium Browser not available');
    }
  }

  private async handleDrop(ev: DragEvent): Promise<void> {
    if (!this.editingId || !ev.dataTransfer) return;

    let data: any;
    try {
      data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }

    if (!data.uuid && !data.type) return;

    const uuid: string = data.uuid || '';
    if (!uuid) return;

    try {
      const doc = await (globalThis as any).fromUuid(uuid);
      if (!doc) {
        (globalThis as any).ui?.notifications?.warn('无法解析物品');
        return;
      }

      const sourceTab = this.resolveSourceTab(doc);
      if (!sourceTab) {
        (globalThis as any).ui?.notifications?.warn('不支持的物品类型');
        return;
      }

      const item: RoguelikeBanListItem = {
        uuid,
        name: doc.name || 'Unknown',
        img: doc.img || 'icons/svg/mystery-man.svg',
        sourceTab,
        category: doc.system?.category || '',
        level: doc.system?.level?.value ?? doc.system?.rank ?? doc.system?.level ?? undefined,
      };

      const lists = RoguelikeBanlistManagerApp.getBanlists();
      const list = lists.find(b => b.id === this.editingId);
      if (!list) return;

      list.items.push(item);
      await RoguelikeBanlistManagerApp.saveBanlists(lists);
      const g = game as any;
      (globalThis as any).ui?.notifications?.info(
        `"${item.name}" ${g.i18n?.localize('AIPF2E.Roguelike.banlist.addedToList') || '已添加到屏蔽列表'}`
      );
      this.render(false);
    } catch (err) {
      console.error('[RoguelikeBanlistManager] Drop failed', err);
    }
  }

  private resolveSourceTab(doc: any): string | null {
    const type = doc.type;
    if (type === 'feat') return 'feat';
    if (type === 'spell') return 'spell';
    if (type === 'equipment' || type === 'armor' || type === 'weapon' || type === 'shield' || type === 'backpack' || type === 'treasure' || type === 'consumable' || type === 'kit') return 'equipment';
    if (type === 'action') return 'action';
    return null;
  }

  /**
   * 注册 Hook，在 PF2e CompendiumBrowser 渲染时注入「批量添加到屏蔽列表」按钮
   */
  static registerCompendiumBrowserHook(): void {
    const g = game as any;
    try {
      if (g.settings?.get(MODULE_ID, 'roguelikeEnabled') === false) return;
    } catch { /* default to enabled */ }

    const inject = (app: any) => {
      const el = document.getElementById('compendium-browser');
      if (!el) return;
      if (el.querySelector('.banlist-batch-add-btn')) return;

      const btnLabel = (game as any).i18n?.localize('AIPF2E.Roguelike.banlist.batchAddBtn') || '批量添加到屏蔽列表';

      const btn = document.createElement('a');
      btn.classList.add('banlist-batch-add-btn');
      btn.innerHTML = `<i class="fas fa-ban"></i> ${btnLabel}`;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        RoguelikeBanlistManagerApp.batchAddFromBrowser(app);
      });

      const nav = el.querySelector('nav.tabs, .tabs');
      if (nav) {
        nav.appendChild(btn);
      }
    };

    const HooksGlobal = (globalThis as any).Hooks;
    if (!HooksGlobal) return;

    for (const hookName of ['renderApplication', 'renderCompendiumBrowser', 'renderApplicationV2']) {
      HooksGlobal.on(hookName, (app: any, _html: any) => {
        const id = app?.id || app?.options?.id || '';
        const name = app?.constructor?.name || '';
        if (id === 'compendium-browser' || name.includes('CompendiumBrowser')) {
          setTimeout(() => inject(app), 150);
        }
      });
    }
  }

  /**
   * 从 CompendiumBrowser 当前活跃 tab 的筛选结果中批量添加到选定的 banlist
   */
  private static async batchAddFromBrowser(browser: any): Promise<void> {
    const g = game as any;
    const banlists = this.getBanlists();

    if (banlists.length === 0) {
      (globalThis as any).ui?.notifications?.warn(
        g.i18n?.localize('AIPF2E.Roguelike.banlist.noBanlistsExist') || '请先创建屏蔽列表'
      );
      return;
    }

    const { tabName, tab } = this.resolveActiveTab(browser);

    if (!tab) {
      (globalThis as any).ui?.notifications?.warn(
        g.i18n?.localize('AIPF2E.Roguelike.banlist.noActiveTab') || '无法获取当前浏览器标签页'
      );
      return;
    }

    if (!tab.isInitialized) {
      await tab.init();
    }

    const currentResults: any[] = tab.currentIndex || tab.indexData || [];
    if (currentResults.length === 0) {
      (globalThis as any).ui?.notifications?.warn(
        g.i18n?.localize('AIPF2E.Roguelike.banlist.noFilteredResults') || '当前筛选条件下没有结果'
      );
      return;
    }

    const listOptions = banlists.map((b: RoguelikeBanList) =>
      `<option value="${b.id}">${b.name} (${b.items.length})</option>`
    ).join('');

    const content = `
      <form class="banlist-batch-dialog">
        <p>${g.i18n?.format('AIPF2E.Roguelike.banlist.batchAddInfo', { count: String(currentResults.length) }) || `当前共筛选出 ${currentResults.length} 个物品。`}</p>
        <div class="form-group">
          <label>${g.i18n?.localize('AIPF2E.Roguelike.banlist.selectList') || '选择屏蔽列表'}</label>
          <select name="banlistId">${listOptions}</select>
        </div>
      </form>
    `;

    const resolvedTabName = tabName;
    const Dialog = (globalThis as any).Dialog;
    new Dialog({
      title: g.i18n?.localize('AIPF2E.Roguelike.banlist.batchAddTitle') || '批量添加到屏蔽列表',
      content,
      buttons: {
        add: {
          label: g.i18n?.localize('AIPF2E.Roguelike.banlist.batchConfirm') || '添加',
          icon: '<i class="fas fa-plus"></i>',
          callback: async (dialogHtml: any) => {
            const selectedId = dialogHtml.find('select[name="banlistId"]').val() as string;
            if (!selectedId) return;
            await RoguelikeBanlistManagerApp.executeBatchAdd(selectedId, currentResults, resolvedTabName);
          },
        },
        cancel: {
          label: g.i18n?.localize('AIPF2E.Roguelike.banlist.cancel') || '取消',
          icon: '<i class="fas fa-times"></i>',
        },
      },
      default: 'add',
    }).render(true);
  }

  private static resolveActiveTab(browser: any): { tabName: string; tab: any } {
    const tabs = browser.tabs;
    if (!tabs || typeof tabs !== 'object') return { tabName: '', tab: null };

    // 1) browser.activeTab (string key)
    if (browser.activeTab && tabs[browser.activeTab]) {
      return { tabName: browser.activeTab, tab: tabs[browser.activeTab] };
    }

    // 2) browser.tab (string key)
    if (browser.tab && tabs[browser.tab]) {
      return { tabName: browser.tab, tab: tabs[browser.tab] };
    }

    // 3) browser._activeTab
    if (browser._activeTab && tabs[browser._activeTab]) {
      return { tabName: browser._activeTab, tab: tabs[browser._activeTab] };
    }

    // 4) check DOM for the currently visible tab panel
    const el = document.getElementById('compendium-browser');
    if (el) {
      const activeNav = el.querySelector('.tabs .item.active, nav .tab.active, [role="tab"][aria-selected="true"], .tabs a.active');
      if (activeNav) {
        const tabKey = (activeNav as HTMLElement).dataset.tab || activeNav.getAttribute('data-tab') || activeNav.textContent?.trim().toLowerCase() || '';
        if (tabKey && tabs[tabKey]) {
          return { tabName: tabKey, tab: tabs[tabKey] };
        }
      }
    }

    // 5) find tab with active flag
    for (const [key, tabObj] of Object.entries(tabs)) {
      if ((tabObj as any)?.active) {
        return { tabName: key, tab: tabObj };
      }
    }

    // 6) fallback: first initialized tab
    for (const [key, tabObj] of Object.entries(tabs)) {
      if ((tabObj as any)?.isInitialized) {
        return { tabName: key, tab: tabObj };
      }
    }

    return { tabName: '', tab: null };
  }

  private static async executeBatchAdd(banlistId: string, entries: any[], tabName: string): Promise<void> {
    const lists = this.getBanlists();
    const list = lists.find(b => b.id === banlistId);
    if (!list) return;

    let addedCount = 0;
    for (const entry of entries) {
      const item: RoguelikeBanListItem = {
        uuid: entry.uuid,
        name: entry.name,
        img: entry.img || 'icons/svg/mystery-man.svg',
        sourceTab: tabName,
        category: entry.category || '',
        level: entry.level ?? entry.rank ?? undefined,
      };
      list.items.push(item);
      addedCount++;
    }

    await this.saveBanlists(lists);
    const g = game as any;
    (globalThis as any).ui?.notifications?.info(
      g.i18n?.format('AIPF2E.Roguelike.banlist.batchAddSuccess', { count: String(addedCount), name: list.name })
        || `已将 ${addedCount} 个物品添加到「${list.name}」`
    );

    const openManager = Object.values((globalThis as any).ui?.windows || {}).find(
      (w: any) => w.id === 'roguelike-banlist-manager'
    ) as any;
    openManager?.render(false);
  }
}
