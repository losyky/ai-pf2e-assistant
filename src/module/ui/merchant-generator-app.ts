/**
 * 商人宏生成器
 * 提供可视化界面：选择预设商人类型或自定义配置，
 * 可直接生成商人、生成宏代码、创建 Foundry 宏
 */

import { MerchantService } from '../services/merchant-service';
import { RoguelikeDrawService, RoguelikeBanList } from '../services/roguelike-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';

interface TraitOption {
  value: string;
  label: string;
}

export class MerchantGeneratorApp extends FormApplication {
  private formState = {
    mode: 'preset' as 'preset' | 'custom',
    selectedTypeId: '',
    merchantName: '',
    contentTypes: ['equipment'] as string[],
    featCategories: [] as string[],
    equipmentCategories: [] as string[],
    levelMin: 0,
    levelMax: 10,
    rarityFilter: [] as string[],
    requiredTraits: [] as string[],
    excludedTraits: [] as string[],
    banListIds: [] as string[],
    itemCountMin: 5,
    itemCountMax: 15,
    priceMultiplier: 1,
    scrollPrefix: '学习卷轴：',
    scrollImg: '',
  };

  private availableTraits: TraitOption[] = [];
  private traitLabelMap: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'merchant-generator',
      title: '商人生成器',
      template: `modules/${MODULE_ID}/templates/merchant-generator-app.hbs`,
      width: 600,
      height: 740,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'merchant-generator'],
      closeOnSubmit: false,
      submitOnChange: true,
    });
  }

  override async getData(): Promise<any> {
    const merchantTypes = MerchantService.getMerchantTypes();
    const isPreset = this.formState.mode === 'preset';

    if (isPreset) {
      if (!this.formState.selectedTypeId && merchantTypes.length > 0) {
        this.formState.selectedTypeId = merchantTypes[0].id;
      }
    } else {
      await this.loadTraitsForSelectedTypes();
    }

    const typeOptions = merchantTypes.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      selected: t.id === this.formState.selectedTypeId,
    }));

    const contentTypeOptions = [
      { value: 'feat', label: '专长', checked: this.formState.contentTypes.includes('feat') },
      { value: 'spell', label: '法术', checked: this.formState.contentTypes.includes('spell') },
      { value: 'equipment', label: '装备', checked: this.formState.contentTypes.includes('equipment') },
      { value: 'action', label: '动作', checked: this.formState.contentTypes.includes('action') },
    ];

    const showFeatCategories = this.formState.contentTypes.includes('feat');
    const featCategoryOptions = showFeatCategories
      ? RoguelikeDrawService.getFeatCategoryOptions().map(opt => ({
          ...opt,
          checked: this.formState.featCategories.includes(opt.value),
        }))
      : [];

    const showEquipmentCategories = this.formState.contentTypes.includes('equipment');
    const equipmentCategoryOptions = showEquipmentCategories
      ? RoguelikeDrawService.getEquipmentCategoryOptions().map(opt => ({
          ...opt,
          checked: this.formState.equipmentCategories.includes(opt.value),
        }))
      : [];

    const rarityOptions = [
      { value: 'common', label: '普通 (Common)', checked: this.formState.rarityFilter.includes('common') },
      { value: 'uncommon', label: '罕见 (Uncommon)', checked: this.formState.rarityFilter.includes('uncommon') },
      { value: 'rare', label: '稀有 (Rare)', checked: this.formState.rarityFilter.includes('rare') },
      { value: 'unique', label: '独特 (Unique)', checked: this.formState.rarityFilter.includes('unique') },
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
      isPreset,
      isCustom: !isPreset,
      typeOptions,
      hasTypes: typeOptions.length > 0,
      contentTypeOptions,
      showFeatCategories,
      featCategoryOptions,
      showEquipmentCategories,
      equipmentCategoryOptions,
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
          if (!merged.has(t.value)) merged.set(t.value, t.label);
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

    html.find('.merchant-tag-text-input').on('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.addTraitFromInput(event.currentTarget as HTMLInputElement);
    });

    html.find('.remove-tag').on('click', (event) => {
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      const tag = el.dataset.tag;
      const container = el.closest('.merchant-tag-input') as HTMLElement;
      const field = container?.dataset.field as 'requiredTraits' | 'excludedTraits';
      if (!tag || !field) return;
      this.formState[field] = this.formState[field].filter(t => t !== tag);
      this.render(false);
    });

    html.find('.merchant-generate-btn').on('click', async () => {
      await this.generateMerchant();
    });

    html.find('.merchant-copy-code-btn').on('click', () => {
      const code = this.generateMacroCode();
      navigator.clipboard.writeText(code).then(() => {
        (globalThis as any).ui?.notifications?.info('宏代码已复制到剪贴板');
      });
    });

    html.find('.merchant-create-macro-btn').on('click', async () => {
      await this.createMacro();
    });

    html.find('.merchant-open-config-btn').on('click', async () => {
      const { MerchantConfigApp } = await import('./merchant-config-app');
      new MerchantConfigApp({}).render(true);
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
    this.formState.mode = formData.mode || 'preset';
    this.formState.selectedTypeId = formData.selectedTypeId || '';
    this.formState.merchantName = formData.merchantName || '';
    this.formState.levelMin = Number(formData.levelMin) || 0;
    this.formState.levelMax = Number(formData.levelMax) || 20;
    this.formState.itemCountMin = Number(formData.itemCountMin) || 5;
    this.formState.itemCountMax = Number(formData.itemCountMax) || 15;
    this.formState.priceMultiplier = Number(formData.priceMultiplier) || 1;
    this.formState.scrollPrefix = formData.scrollPrefix || '学习卷轴：';
    this.formState.scrollImg = formData.scrollImg || '';

    const html = this.element;

    const contentTypes: string[] = [];
    html.find('input[name="contentType"]:checked').each(function () {
      contentTypes.push((this as HTMLInputElement).value);
    });
    this.formState.contentTypes = contentTypes.length > 0 ? contentTypes : ['equipment'];

    const featCategories: string[] = [];
    html.find('input[name="featCategory"]:checked').each(function () {
      featCategories.push((this as HTMLInputElement).value);
    });
    this.formState.featCategories = featCategories;

    const equipmentCategories: string[] = [];
    html.find('input[name="equipmentCategory"]:checked').each(function () {
      equipmentCategories.push((this as HTMLInputElement).value);
    });
    this.formState.equipmentCategories = equipmentCategories;

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

    if (s.mode === 'preset' && s.selectedTypeId) {
      const lines: string[] = [];
      if (s.merchantName) {
        lines.push(`  name: '${s.merchantName.replace(/'/g, "\\'")}',`);
      }
      lines.push(`  typeId: '${s.selectedTypeId}',`);
      return `game.modules.get('${MODULE_ID}').api.merchant.generate({\n${lines.join('\n')}\n});`;
    }

    const lines: string[] = [];
    if (s.merchantName) {
      lines.push(`  name: '${s.merchantName.replace(/'/g, "\\'")}',`);
    }

    const ctArr = s.contentTypes.map(t => `'${t}'`).join(', ');
    lines.push(`  contentTypes: [${ctArr}],`);

    if (s.featCategories.length > 0 && s.contentTypes.includes('feat')) {
      lines.push(`  featCategories: [${s.featCategories.map(c => `'${c}'`).join(', ')}],`);
    }
    if (s.equipmentCategories.length > 0 && s.contentTypes.includes('equipment')) {
      lines.push(`  equipmentCategories: [${s.equipmentCategories.map(c => `'${c}'`).join(', ')}],`);
    }

    lines.push(`  levelRange: { min: ${s.levelMin}, max: ${s.levelMax} },`);
    lines.push(`  itemCount: { min: ${s.itemCountMin}, max: ${s.itemCountMax} },`);

    if (s.rarityFilter.length > 0) {
      lines.push(`  rarityFilter: [${s.rarityFilter.map(r => `'${r}'`).join(', ')}],`);
    }
    if (s.requiredTraits.length > 0) {
      lines.push(`  requiredTraits: [${s.requiredTraits.map(t => `'${t}'`).join(', ')}],`);
    }
    if (s.excludedTraits.length > 0) {
      lines.push(`  excludedTraits: [${s.excludedTraits.map(t => `'${t}'`).join(', ')}],`);
    }
    if (s.banListIds.length > 0) {
      lines.push(`  banListIds: [${s.banListIds.map(id => `'${id}'`).join(', ')}],`);
    }
    if (s.priceMultiplier !== 1) {
      lines.push(`  priceMultiplier: ${s.priceMultiplier},`);
    }

    return `game.modules.get('${MODULE_ID}').api.merchant.generate({\n${lines.join('\n')}\n});`;
  }

  private async generateMerchant(): Promise<void> {
    const s = this.formState;

    if (s.mode === 'preset' && s.selectedTypeId) {
      await MerchantService.generateMerchant({
        typeId: s.selectedTypeId,
        name: s.merchantName || undefined,
      });
    } else {
      await MerchantService.generateMerchant({
        name: s.merchantName || '商人',
        contentTypes: s.contentTypes,
        featCategories: s.featCategories,
        equipmentCategories: s.equipmentCategories,
        levelRange: { min: s.levelMin, max: s.levelMax },
        rarityFilter: s.rarityFilter.length > 0 ? s.rarityFilter : undefined,
        requiredTraits: s.requiredTraits.length > 0 ? s.requiredTraits : undefined,
        excludedTraits: s.excludedTraits.length > 0 ? s.excludedTraits : undefined,
        banListIds: s.banListIds.length > 0 ? s.banListIds : undefined,
        itemCount: { min: s.itemCountMin, max: s.itemCountMax },
        priceMultiplier: s.priceMultiplier,
        scrollPrefix: s.scrollPrefix,
        scrollImg: s.scrollImg || undefined,
      });
    }
  }

  private async createMacro(): Promise<void> {
    const code = this.generateMacroCode();
    const name = this.formState.merchantName || '生成商人';

    try {
      const Macro = (globalThis as any).Macro;
      const macro = await Macro.create({
        name,
        type: 'script',
        scope: 'global',
        command: code,
        img: 'icons/environment/settlement/market-stall.webp',
      });
      (globalThis as any).ui?.notifications?.info(`宏 "${name}" 创建成功`);
      macro?.sheet?.render(true);
    } catch (error) {
      console.error('[MerchantGenerator] 创建宏失败:', error);
      (globalThis as any).ui?.notifications?.error('创建宏失败');
    }
  }
}
