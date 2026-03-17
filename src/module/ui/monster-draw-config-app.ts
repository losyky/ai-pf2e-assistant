import { MonsterDrawService, MonsterDrawConfig, CREATURE_SIZES } from '../services/monster-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';

interface TraitOption {
  value: string;
  label: string;
}

/**
 * 怪物抽取配置面板
 * 配置筛选参数后启动抽取流程
 */
export class MonsterDrawConfigApp extends FormApplication {
  private formState = {
    totalDraws: 3,
    monstersPerDraw: 3,
    selectablePerDraw: 1,
    levelMin: -1,
    levelMax: 25,
    rarityFilter: [] as string[],
    requiredTraits: [] as string[],
    excludedTraits: [] as string[],
    sizeFilter: [] as string[],
    allowDuplicates: false,
    sourcePacks: [] as string[],
    customTitle: '',
  };

  private availableTraits: TraitOption[] = [];
  private traitLabelMap: Map<string, string> = new Map();
  private isLoading = false;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'monster-draw-config',
      title: '怪物抽取配置',
      template: `modules/${MODULE_ID}/templates/monster-draw-config.hbs`,
      width: 560,
      height: 680,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'monster-draw-config'],
      closeOnSubmit: false,
      submitOnChange: true,
    });
  }

  override async getData(): Promise<any> {
    await this.loadTraits();

    const rarityOptions = [
      { value: 'common',   label: '普通 (Common)',   checked: this.formState.rarityFilter.includes('common') },
      { value: 'uncommon', label: '罕见 (Uncommon)', checked: this.formState.rarityFilter.includes('uncommon') },
      { value: 'rare',     label: '稀有 (Rare)',     checked: this.formState.rarityFilter.includes('rare') },
      { value: 'unique',   label: '独特 (Unique)',   checked: this.formState.rarityFilter.includes('unique') },
    ];

    const sizeOptions = MonsterDrawService.getSizeOptions().map(opt => ({
      ...opt,
      checked: this.formState.sizeFilter.includes(opt.value),
    }));

    const packOptions = MonsterDrawService.getAvailableBestiaryPacks().map(p => ({
      ...p,
      checked: this.formState.sourcePacks.length === 0 || this.formState.sourcePacks.includes(p.id),
    }));

    const requiredTraitLabels = this.formState.requiredTraits.map(v => ({
      value: v,
      label: this.traitLabelMap.get(v) || v,
    }));
    const excludedTraitLabels = this.formState.excludedTraits.map(v => ({
      value: v,
      label: this.traitLabelMap.get(v) || v,
    }));

    return {
      ...this.formState,
      rarityOptions,
      sizeOptions,
      packOptions,
      hasPacks: packOptions.length > 0,
      availableTraits: this.availableTraits,
      requiredTraitLabels,
      excludedTraitLabels,
      isLoading: this.isLoading,
    };
  }

  private async loadTraits(): Promise<void> {
    if (this.availableTraits.length > 0) return;

    try {
      const traits = await MonsterDrawService.getAvailableTraits();
      const merged = new Map<string, string>();
      for (const t of traits) {
        merged.set(t.value, t.label);
      }
      this.availableTraits = Array.from(merged.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
      this.traitLabelMap = merged;
    } catch {
      this.availableTraits = [];
    }
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.monster-tag-text-input').on('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.addTraitFromInput(event.currentTarget as HTMLInputElement);
    });

    html.find('.remove-tag').on('click', (event) => {
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      const tag = el.dataset.tag;
      const container = el.closest('.monster-tag-input') as HTMLElement;
      const field = container?.dataset.field as 'requiredTraits' | 'excludedTraits';
      if (!tag || !field) return;

      this.formState[field] = this.formState[field].filter(t => t !== tag);
      this.render(false);
    });

    html.find('.monster-start-draw-btn').on('click', async () => {
      await this.startDraw();
    });
  }

  private addTraitFromInput(input: HTMLInputElement): void {
    const field = input.dataset.field as 'requiredTraits' | 'excludedTraits';
    const rawValue = input.value.trim();
    if (!rawValue || !field) return;

    const slug = this.resolveTraitSlug(rawValue);

    if (!this.formState[field].includes(slug)) {
      this.formState[field].push(slug);
    }
    input.value = '';
    this.render(false);
  }

  private resolveTraitSlug(input: string): string {
    const lower = input.toLowerCase();
    
    // 精确匹配 value
    for (const t of this.availableTraits) {
      if (t.value === lower) {
        console.log(`[MonsterDrawConfig] 特质转换（精确value）: "${input}" → "${t.value}"`);
        return t.value;
      }
    }
    
    // 精确匹配 label
    for (const t of this.availableTraits) {
      if (t.label.toLowerCase() === lower) {
        console.log(`[MonsterDrawConfig] 特质转换（精确label）: "${input}" → "${t.value}" (label: "${t.label}")`);
        return t.value;
      }
    }
    
    // 模糊匹配
    for (const t of this.availableTraits) {
      if (t.label.toLowerCase().includes(lower) || lower.includes(t.label.toLowerCase())) {
        console.log(`[MonsterDrawConfig] 特质转换（模糊匹配）: "${input}" → "${t.value}" (label: "${t.label}")`);
        return t.value;
      }
    }
    
    console.warn(`[MonsterDrawConfig] ⚠️ 特质转换失败，使用原始输入: "${input}" (availableTraits数量: ${this.availableTraits.length})`);
    return lower;
  }

  protected override async _updateObject(_event: Event, formData: any): Promise<void> {
    this.formState.totalDraws = Number(formData.totalDraws) || 3;
    this.formState.monstersPerDraw = Number(formData.monstersPerDraw) || 3;
    this.formState.selectablePerDraw = Number(formData.selectablePerDraw) || 1;
    this.formState.levelMin = Number(formData.levelMin) ?? -1;
    this.formState.levelMax = Number(formData.levelMax) ?? 25;
    this.formState.allowDuplicates = !!formData.allowDuplicates;
    this.formState.customTitle = formData.customTitle || '';

    const html = this.element;

    const rarityFilter: string[] = [];
    html.find('input[name="rarity"]:checked').each(function () {
      rarityFilter.push((this as HTMLInputElement).value);
    });
    this.formState.rarityFilter = rarityFilter;

    const sizeFilter: string[] = [];
    html.find('input[name="size"]:checked').each(function () {
      sizeFilter.push((this as HTMLInputElement).value);
    });
    this.formState.sizeFilter = sizeFilter;

    const sourcePacks: string[] = [];
    html.find('input[name="sourcePack"]:checked').each(function () {
      sourcePacks.push((this as HTMLInputElement).value);
    });
    this.formState.sourcePacks = sourcePacks;

    this.render(false);
  }

  private async startDraw(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.render(false);

    try {
      await MonsterDrawService.initBestiaryTab();

      const config: MonsterDrawConfig = {
        totalDraws: this.formState.totalDraws,
        monstersPerDraw: this.formState.monstersPerDraw,
        selectablePerDraw: this.formState.selectablePerDraw,
        levelRange: { min: this.formState.levelMin, max: this.formState.levelMax },
        rarityFilter: this.formState.rarityFilter,
        requiredTraits: this.formState.requiredTraits,
        excludedTraits: this.formState.excludedTraits,
        sizeFilter: this.formState.sizeFilter,
        allowDuplicates: this.formState.allowDuplicates,
        sourcePacks: this.formState.sourcePacks,
        title: this.formState.customTitle || undefined,
      };

      const pool = await MonsterDrawService.buildMonsterPool(config);

      if (pool.length === 0) {
        (globalThis as any).ui?.notifications?.warn('没有找到符合条件的怪物，请调整筛选条件');
        return;
      }

      (globalThis as any).ui?.notifications?.info(`已构建怪物池，包含 ${pool.length} 个怪物`);

      const { MonsterDrawApp } = await import('./monster-draw-app');
      new MonsterDrawApp(config, pool).render(true);
      this.close();
    } catch (error) {
      console.error('[MonsterDrawConfig] 启动抽取失败:', error);
      (globalThis as any).ui?.notifications?.error('启动怪物抽取失败: ' + (error as Error).message);
    } finally {
      this.isLoading = false;
    }
  }
}
