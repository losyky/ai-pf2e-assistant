/**
 * 商人类型配置管理器
 * 管理多个商人模板配置（左侧列表 + 右侧编辑表单）
 */

import { MerchantService, MerchantTypeConfig } from '../services/merchant-service';
import { RoguelikeDrawService, RoguelikeBanList } from '../services/roguelike-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';

interface TraitOption {
  value: string;
  label: string;
}

export class MerchantConfigApp extends FormApplication {
  private merchantTypes: MerchantTypeConfig[] = [];
  private selectedId: string | null = null;
  private availableTraits: TraitOption[] = [];
  private traitLabelMap: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'merchant-config-manager',
      title: '商人类型配置',
      template: `modules/${MODULE_ID}/templates/merchant-config-app.hbs`,
      width: 780,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'merchant-config-manager'],
      closeOnSubmit: false,
      submitOnChange: true,
    });
  }

  override async getData(): Promise<any> {
    this.merchantTypes = MerchantService.getMerchantTypes();

    if (this.selectedId && !this.merchantTypes.find(t => t.id === this.selectedId)) {
      this.selectedId = null;
    }

    const selected = this.selectedId
      ? this.merchantTypes.find(t => t.id === this.selectedId) || null
      : null;

    if (selected) {
      await this.loadTraitsForSelectedTypes(selected.contentTypes);
    }

    const contentTypeOptions = [
      { value: 'feat', label: '专长', checked: selected?.contentTypes?.includes('feat') ?? false },
      { value: 'spell', label: '法术', checked: selected?.contentTypes?.includes('spell') ?? false },
      { value: 'equipment', label: '装备', checked: selected?.contentTypes?.includes('equipment') ?? false },
      { value: 'action', label: '动作', checked: selected?.contentTypes?.includes('action') ?? false },
    ];

    const showFeatCategories = selected?.contentTypes?.includes('feat') ?? false;
    const featCategoryOptions = showFeatCategories
      ? RoguelikeDrawService.getFeatCategoryOptions().map(opt => ({
          ...opt,
          checked: selected?.featCategories?.includes(opt.value) ?? false,
        }))
      : [];

    const showEquipmentCategories = selected?.contentTypes?.includes('equipment') ?? false;
    const equipmentCategoryOptions = showEquipmentCategories
      ? RoguelikeDrawService.getEquipmentCategoryOptions().map(opt => ({
          ...opt,
          checked: selected?.equipmentCategories?.includes(opt.value) ?? false,
        }))
      : [];

    const rarityOptions = [
      { value: 'common', label: '普通 (Common)', checked: selected?.rarityFilter?.includes('common') ?? false },
      { value: 'uncommon', label: '罕见 (Uncommon)', checked: selected?.rarityFilter?.includes('uncommon') ?? false },
      { value: 'rare', label: '稀有 (Rare)', checked: selected?.rarityFilter?.includes('rare') ?? false },
      { value: 'unique', label: '独特 (Unique)', checked: selected?.rarityFilter?.includes('unique') ?? false },
    ];

    const allBanlists = this.getAllBanlists();
    const banlistOptions = allBanlists.map((b: RoguelikeBanList) => ({
      id: b.id,
      name: b.name,
      itemCount: b.items.length,
      checked: selected?.banListIds?.includes(b.id) ?? false,
    }));

    const requiredTraitLabels = (selected?.requiredTraits || []).map(v => ({
      value: v,
      label: this.traitLabelMap.get(v) || v,
    }));
    const excludedTraitLabels = (selected?.excludedTraits || []).map(v => ({
      value: v,
      label: this.traitLabelMap.get(v) || v,
    }));

    return {
      merchantTypes: this.merchantTypes,
      selectedId: this.selectedId,
      selected,
      hasSelected: !!selected,
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
    };
  }

  private getAllBanlists(): RoguelikeBanList[] {
    try {
      return (game as any).settings?.get(MODULE_ID, 'roguelikeBanlists') || [];
    } catch {
      return [];
    }
  }

  private async loadTraitsForSelectedTypes(contentTypes: string[]): Promise<void> {
    const merged = new Map<string, string>();
    for (const tabName of contentTypes) {
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

    html.find('.merchant-type-item').on('click', (event) => {
      const id = (event.currentTarget as HTMLElement).dataset.id;
      if (id) {
        this.selectedId = id;
        this.render(false);
      }
    });

    html.find('.merchant-add-type-btn').on('click', () => {
      this.addNewType();
    });

    html.find('.merchant-delete-type-btn').on('click', () => {
      if (this.selectedId) this.deleteSelectedType();
    });

    html.find('.merchant-duplicate-type-btn').on('click', () => {
      if (this.selectedId) this.duplicateSelectedType();
    });

    html.find('.merchant-tag-text-input').on('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.addTraitFromInput(event.currentTarget as HTMLInputElement);
    });

    html.find('.remove-tag').on('click', (event) => {
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      const tag = el.dataset.tag;
      const field = (el.closest('.merchant-tag-input') as HTMLElement)?.dataset.field as 'requiredTraits' | 'excludedTraits';
      if (!tag || !field || !this.selectedId) return;

      const selected = this.merchantTypes.find(t => t.id === this.selectedId);
      if (selected && selected[field]) {
        selected[field] = selected[field]!.filter(t => t !== tag);
        this.saveAndRender();
      }
    });
  }

  private addTraitFromInput(input: HTMLInputElement): void {
    const field = input.dataset.field as 'requiredTraits' | 'excludedTraits';
    const rawValue = input.value.trim();
    if (!rawValue || !field || !this.selectedId) return;

    const selected = this.merchantTypes.find(t => t.id === this.selectedId);
    if (!selected) return;

    const slug = this.resolveTraitSlug(rawValue);
    if (!selected[field]) selected[field] = [];
    if (!selected[field]!.includes(slug)) {
      selected[field]!.push(slug);
    }
    input.value = '';
    this.saveAndRender();
  }

  private resolveTraitSlug(input: string): string {
    const lower = input.toLowerCase();
    
    // 精确匹配 value
    for (const t of this.availableTraits) {
      if (t.value === lower) {
        console.log(`[MerchantConfig] 特质转换（精确value）: "${input}" → "${t.value}"`);
        return t.value;
      }
    }
    
    // 精确匹配 label
    for (const t of this.availableTraits) {
      if (t.label.toLowerCase() === lower) {
        console.log(`[MerchantConfig] 特质转换（精确label）: "${input}" → "${t.value}" (label: "${t.label}")`);
        return t.value;
      }
    }
    
    // 模糊匹配
    for (const t of this.availableTraits) {
      if (t.label.toLowerCase().includes(lower) || lower.includes(t.label.toLowerCase())) {
        console.log(`[MerchantConfig] 特质转换（模糊匹配）: "${input}" → "${t.value}" (label: "${t.label}")`);
        return t.value;
      }
    }
    
    console.warn(`[MerchantConfig] ⚠️ 特质转换失败，使用原始输入: "${input}" (availableTraits数量: ${this.availableTraits.length})`);
    return lower;
  }

  private addNewType(): void {
    const id = foundry.utils.randomID(16);
    const newType: MerchantTypeConfig = {
      id,
      name: '新商人类型',
      description: '',
      contentTypes: ['equipment'],
      featCategories: [],
      equipmentCategories: [],
      levelRange: { min: 0, max: 10 },
      rarityFilter: [],
      requiredTraits: [],
      excludedTraits: [],
      banListIds: [],
      itemCount: { min: 5, max: 15 },
      priceMultiplier: 1,
      scrollPrefix: '学习卷轴：',
      scrollImg: '',
    };
    this.merchantTypes.push(newType);
    this.selectedId = id;
    this.saveAndRender();
  }

  private deleteSelectedType(): void {
    if (!this.selectedId) return;
    const name = this.merchantTypes.find(t => t.id === this.selectedId)?.name || '';

    const Dialog = (globalThis as any).Dialog;
    Dialog.confirm({
      title: '删除商人类型',
      content: `<p>确定要删除商人类型 "${name}" 吗？此操作不可撤销。</p>`,
      yes: () => {
        this.merchantTypes = this.merchantTypes.filter(t => t.id !== this.selectedId);
        this.selectedId = this.merchantTypes.length > 0 ? this.merchantTypes[0].id : null;
        this.saveAndRender();
      },
    });
  }

  private duplicateSelectedType(): void {
    const source = this.merchantTypes.find(t => t.id === this.selectedId);
    if (!source) return;

    const id = foundry.utils.randomID(16);
    const copy: MerchantTypeConfig = {
      ...JSON.parse(JSON.stringify(source)),
      id,
      name: source.name + ' (副本)',
    };
    this.merchantTypes.push(copy);
    this.selectedId = id;
    this.saveAndRender();
  }

  private async saveAndRender(): Promise<void> {
    await MerchantService.saveMerchantTypes(this.merchantTypes);
    this.render(false);
  }

  protected override async _updateObject(_event: Event, formData: any): Promise<void> {
    if (!this.selectedId) return;
    const selected = this.merchantTypes.find(t => t.id === this.selectedId);
    if (!selected) return;

    selected.name = formData.typeName || selected.name;
    selected.description = formData.typeDescription || '';
    selected.levelRange = {
      min: Number(formData.levelMin) || 0,
      max: Number(formData.levelMax) || 20,
    };
    selected.itemCount = {
      min: Number(formData.itemCountMin) || 5,
      max: Number(formData.itemCountMax) || 15,
    };
    selected.priceMultiplier = Number(formData.priceMultiplier) || 1;
    selected.scrollPrefix = formData.scrollPrefix || '学习卷轴：';
    selected.scrollImg = formData.scrollImg || '';

    const html = this.element;

    const contentTypes: string[] = [];
    html.find('input[name="contentType"]:checked').each(function () {
      contentTypes.push((this as HTMLInputElement).value);
    });
    selected.contentTypes = contentTypes.length > 0 ? contentTypes : ['equipment'];

    const featCategories: string[] = [];
    html.find('input[name="featCategory"]:checked').each(function () {
      featCategories.push((this as HTMLInputElement).value);
    });
    selected.featCategories = featCategories;

    const equipmentCategories: string[] = [];
    html.find('input[name="equipmentCategory"]:checked').each(function () {
      equipmentCategories.push((this as HTMLInputElement).value);
    });
    selected.equipmentCategories = equipmentCategories;

    const rarityFilter: string[] = [];
    html.find('input[name="rarity"]:checked').each(function () {
      rarityFilter.push((this as HTMLInputElement).value);
    });
    selected.rarityFilter = rarityFilter;

    const banListIds: string[] = [];
    html.find('input[name="banList"]:checked').each(function () {
      banListIds.push((this as HTMLInputElement).value);
    });
    selected.banListIds = banListIds;

    await this.saveAndRender();
  }
}
