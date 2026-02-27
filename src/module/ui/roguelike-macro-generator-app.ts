import { RoguelikeDrawService, RoguelikeBanList } from '../services/roguelike-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';

interface TraitOption {
  value: string;
  label: string;
}

/**
 * Roguelike 宏生成器
 * 提供可视化界面配置抽取参数，生成可直接使用的 Foundry 宏代码
 * 仅 GM 可使用
 */
export class RoguelikeMacroGeneratorApp extends FormApplication {
  private formState = {
    totalDraws: 3,
    itemsPerDraw: 3,
    selectablePerDraw: 1,
    contentTypes: ['feat'] as string[],
    featCategories: [] as string[],
    levelMin: 0,
    levelMax: 20,
    rarityFilter: [] as string[],
    requiredTraits: [] as string[],
    excludedTraits: [] as string[],
    banListIds: [] as string[],
    allowDuplicates: false,
    useToken: false,
    customTitle: '',
  };

  private availableTraits: TraitOption[] = [];
  private traitLabelMap: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'roguelike-macro-generator',
      title: 'Roguelike 宏生成器',
      template: 'modules/ai-pf2e-assistant/templates/roguelike-macro-generator-app.hbs',
      width: 580,
      height: 720,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'roguelike-macro-generator'],
      closeOnSubmit: false,
      submitOnChange: true,
    });
  }

  override async getData(): Promise<any> {
    await this.loadTraitsForSelectedTypes();

    const contentTypeOptions = [
      { value: 'feat',      label: '专长', checked: this.formState.contentTypes.includes('feat') },
      { value: 'spell',     label: '法术', checked: this.formState.contentTypes.includes('spell') },
      { value: 'equipment', label: '装备', checked: this.formState.contentTypes.includes('equipment') },
      { value: 'action',    label: '动作', checked: this.formState.contentTypes.includes('action') },
    ];

    const showFeatCategories = this.formState.contentTypes.includes('feat');
    const featCategoryOptions = showFeatCategories
      ? RoguelikeDrawService.getFeatCategoryOptions().map(opt => ({
          ...opt,
          checked: this.formState.featCategories.includes(opt.value),
        }))
      : [];

    const rarityOptions = [
      { value: 'common',   label: '普通 (Common)',   checked: this.formState.rarityFilter.includes('common') },
      { value: 'uncommon', label: '罕见 (Uncommon)', checked: this.formState.rarityFilter.includes('uncommon') },
      { value: 'rare',     label: '稀有 (Rare)',     checked: this.formState.rarityFilter.includes('rare') },
      { value: 'unique',   label: '独特 (Unique)',   checked: this.formState.rarityFilter.includes('unique') },
    ];

    const allBanlists = this.getAllBanlists();
    const banlistOptions = allBanlists.map((b: RoguelikeBanList) => ({
      id: b.id,
      name: b.name,
      itemCount: b.items.length,
      checked: this.formState.banListIds.includes(b.id),
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
      contentTypeOptions,
      showFeatCategories,
      featCategoryOptions,
      rarityOptions,
      availableTraits: this.availableTraits,
      requiredTraitLabels,
      excludedTraitLabels,
      banlistOptions,
      hasBanlists: banlistOptions.length > 0,
      macroCode: this.generateMacroCode(),
    };
  }

  private getAllBanlists(): RoguelikeBanList[] {
    try {
      return (game as any).settings?.get(MODULE_ID, 'roguelikeBanlists') || [];
    } catch {
      return [];
    }
  }

  private async loadTraitsForSelectedTypes(): Promise<void> {
    const merged = new Map<string, string>();

    for (const tabName of this.formState.contentTypes) {
      try {
        const traits = await RoguelikeDrawService.getAvailableTraits(tabName);
        for (const t of traits) {
          if (!merged.has(t.value)) {
            merged.set(t.value, t.label);
          }
        }
      } catch { /* ignore */ }
    }

    this.availableTraits = Array.from(merged.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    this.traitLabelMap = merged;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.roguelike-tag-text-input').on('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.addTraitFromInput(event.currentTarget as HTMLInputElement);
    });

    html.find('.remove-tag').on('click', (event) => {
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      const tag = el.dataset.tag;
      const container = el.closest('.roguelike-tag-input') as HTMLElement;
      const field = container?.dataset.field as 'requiredTraits' | 'excludedTraits';
      if (!tag || !field) return;

      this.formState[field] = this.formState[field].filter(t => t !== tag);
      this.render(false);
    });

    html.find('.roguelike-copy-code-btn').on('click', () => {
      const code = this.generateMacroCode();
      navigator.clipboard.writeText(code).then(() => {
        (globalThis as any).ui?.notifications?.info('宏代码已复制到剪贴板');
      });
    });

    html.find('.roguelike-create-macro-btn').on('click', async () => {
      await this.createMacro();
    });

    html.find('.roguelike-open-banlist-btn').on('click', async () => {
      const { RoguelikeBanlistManagerApp } = await import('./roguelike-banlist-manager-app');
      new RoguelikeBanlistManagerApp({}).render(true);
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
    for (const t of this.availableTraits) {
      if (t.value === lower) return t.value;
    }
    for (const t of this.availableTraits) {
      if (t.label.toLowerCase() === lower) return t.value;
    }
    for (const t of this.availableTraits) {
      if (t.label.toLowerCase().includes(lower) || lower.includes(t.label.toLowerCase())) {
        return t.value;
      }
    }
    return lower;
  }

  protected override async _updateObject(_event: Event, formData: any): Promise<void> {
    this.formState.totalDraws = Number(formData.totalDraws) || 3;
    this.formState.itemsPerDraw = Number(formData.itemsPerDraw) || 3;
    this.formState.selectablePerDraw = Number(formData.selectablePerDraw) || 1;
    this.formState.levelMin = Number(formData.levelMin) || 0;
    this.formState.levelMax = Number(formData.levelMax) || 20;
    this.formState.allowDuplicates = !!formData.allowDuplicates;
    this.formState.useToken = !!formData.useToken;
    this.formState.customTitle = formData.customTitle || '';

    const html = this.element;

    const contentTypes: string[] = [];
    html.find('input[name="contentType"]:checked').each(function () {
      contentTypes.push((this as HTMLInputElement).value);
    });
    this.formState.contentTypes = contentTypes.length > 0 ? contentTypes : ['feat'];

    const featCategories: string[] = [];
    html.find('input[name="featCategory"]:checked').each(function () {
      featCategories.push((this as HTMLInputElement).value);
    });
    this.formState.featCategories = featCategories;

    const rarityFilter: string[] = [];
    html.find('input[name="rarity"]:checked').each(function () {
      rarityFilter.push((this as HTMLInputElement).value);
    });
    this.formState.rarityFilter = rarityFilter;

    const banListIds: string[] = [];
    html.find('input[name="banList"]:checked').each(function () {
      banListIds.push((this as HTMLInputElement).value);
    });
    this.formState.banListIds = banListIds;

    this.render(false);
  }

  private generateMacroCode(): string {
    const s = this.formState;
    const lines: string[] = [];

    if (s.useToken) {
      lines.push('  actor: canvas.tokens.controlled[0]?.actor,');
    }

    lines.push('  totalDraws: ' + s.totalDraws + ',');
    lines.push('  itemsPerDraw: ' + s.itemsPerDraw + ',');
    lines.push('  selectablePerDraw: ' + s.selectablePerDraw + ',');

    const ctArr = s.contentTypes.map(function(t) { return "'" + t + "'"; }).join(', ');
    lines.push('  contentTypes: [' + ctArr + '],');

    if (s.featCategories.length > 0 && s.contentTypes.includes('feat')) {
      const fcArr = s.featCategories.map(function(c) { return "'" + c + "'"; }).join(', ');
      lines.push('  featCategories: [' + fcArr + '],');
    }

    lines.push('  levelRange: { min: ' + s.levelMin + ', max: ' + s.levelMax + ' },');

    if (s.rarityFilter.length > 0) {
      const rArr = s.rarityFilter.map(function(r) { return "'" + r + "'"; }).join(', ');
      lines.push('  rarityFilter: [' + rArr + '],');
    }

    if (s.requiredTraits.length > 0) {
      const rtArr = s.requiredTraits.map(function(t) { return "'" + t + "'"; }).join(', ');
      lines.push('  requiredTraits: [' + rtArr + '],');
    }

    if (s.excludedTraits.length > 0) {
      const etArr = s.excludedTraits.map(function(t) { return "'" + t + "'"; }).join(', ');
      lines.push('  excludedTraits: [' + etArr + '],');
    }

    if (s.banListIds.length > 0) {
      const blArr = s.banListIds.map(function(id) { return "'" + id + "'"; }).join(', ');
      lines.push('  banListIds: [' + blArr + '],');
    }

    if (s.allowDuplicates) {
      lines.push('  allowDuplicates: true,');
    }

    if (s.customTitle) {
      lines.push("  title: '" + s.customTitle.replace(/'/g, "\\'") + "',");
    }

    return "game.modules.get('ai-pf2e-assistant').api.roguelike.draw({\n" + lines.join('\n') + '\n});';
  }

  private async createMacro(): Promise<void> {
    const code = this.generateMacroCode();
    const name = this.formState.customTitle || 'Roguelike 抽取';

    try {
      const Macro = (globalThis as any).Macro;
      const macro = await Macro.create({
        name,
        type: 'script',
        scope: 'global',
        command: code,
        img: 'icons/svg/dice-target.svg',
      });
      (globalThis as any).ui?.notifications?.info('宏 "' + name + '" 创建成功');
      macro?.sheet?.render(true);
    } catch (error) {
      console.error('[RoguelikeMacroGenerator] 创建宏失败:', error);
      (globalThis as any).ui?.notifications?.error('创建宏失败');
    }
  }
}
