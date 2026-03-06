import { MonsterModifierAIService, ModificationRecipe } from '../services/monster-modifier-ai-service';

const MODULE_ID = 'ai-pf2e-assistant';
const SETTING_KEY = 'monsterModTemplates';

declare const game: any;
declare const foundry: any;

export interface MonsterModTemplate {
  id: string;
  name: string;
  description: string;
  promptInstructions: string;
  levelAdjustment?: number;
  traitModifications?: {
    add?: string[];
    remove?: string[];
  };
  templateType: 'ai' | 'recipe';
  recipe?: ModificationRecipe;
}

export class MonsterModTemplateManagerApp extends FormApplication {
  private editingId: string | null = null;
  private isGeneratingRecipe: boolean = false;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'monster-mod-template-manager',
      title: '怪物改造模板管理',
      template: `modules/${MODULE_ID}/templates/monster-mod-template-manager.hbs`,
      width: 650,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'monster-mod-template-manager'],
      closeOnSubmit: false,
      submitOnChange: false,
    });
  }

  static getTemplates(): MonsterModTemplate[] {
    try {
      const templates = (game as any).settings.get(MODULE_ID, SETTING_KEY) || [];
      return templates.map((t: any) => ({
        ...t,
        templateType: t.templateType || 'ai',
      }));
    } catch {
      return [];
    }
  }

  static async saveTemplates(templates: MonsterModTemplate[]): Promise<void> {
    await (game as any).settings.set(MODULE_ID, SETTING_KEY, templates);
  }

  async getData(): Promise<any> {
    const templates = MonsterModTemplateManagerApp.getTemplates().map(t => ({
      ...t,
      levelAdjustmentDisplay: t.levelAdjustment
        ? (t.levelAdjustment > 0 ? `+${t.levelAdjustment}` : `${t.levelAdjustment}`)
        : null,
      isAI: t.templateType === 'ai',
      isRecipe: t.templateType === 'recipe',
      typeLabel: t.templateType === 'recipe' ? '规则模板' : 'AI 模板',
    }));
    const editingTemplate = this.editingId
      ? templates.find(t => t.id === this.editingId) || null
      : null;

    let recipeSummary: string[] = [];
    if (editingTemplate?.recipe) {
      recipeSummary = this.buildRecipeSummary(editingTemplate.recipe);
    }

    return {
      templates,
      editingTemplate,
      isEditing: !!editingTemplate,
      hasTemplates: templates.length > 0,
      editingTraitsAdd: editingTemplate?.traitModifications?.add?.join(', ') || '',
      editingTraitsRemove: editingTemplate?.traitModifications?.remove?.join(', ') || '',
      isGeneratingRecipe: this.isGeneratingRecipe,
      recipeSummary,
      hasRecipe: !!editingTemplate?.recipe,
    };
  }

  private buildRecipeSummary(recipe: ModificationRecipe): string[] {
    const lines: string[] = [];
    const adj = recipe.statAdjustments;

    if (adj.level) lines.push(`等级 ${adj.level > 0 ? '+' : ''}${adj.level}`);
    if (adj.hpPercent && adj.hpPercent !== 1) lines.push(`HP ×${adj.hpPercent}`);
    if (adj.hpFlat) lines.push(`HP ${adj.hpFlat > 0 ? '+' : ''}${adj.hpFlat}`);
    if (adj.acAdjust) lines.push(`AC ${adj.acAdjust > 0 ? '+' : ''}${adj.acAdjust}`);
    if (adj.attackAdjust) lines.push(`攻击 ${adj.attackAdjust > 0 ? '+' : ''}${adj.attackAdjust}`);
    if (adj.saveAdjust) lines.push(`豁免 ${adj.saveAdjust > 0 ? '+' : ''}${adj.saveAdjust}`);
    if (adj.perceptionAdjust) lines.push(`感知 ${adj.perceptionAdjust > 0 ? '+' : ''}${adj.perceptionAdjust}`);
    if (adj.skillAdjust) lines.push(`技能 ${adj.skillAdjust > 0 ? '+' : ''}${adj.skillAdjust}`);
    if (adj.speedAdjust) lines.push(`速度 ${adj.speedAdjust > 0 ? '+' : ''}${adj.speedAdjust} 尺`);
    if (adj.abilityAdjust) {
      for (const [k, v] of Object.entries(adj.abilityAdjust)) {
        if (v) lines.push(`${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`);
      }
    }

    if (recipe.addTraits.length) lines.push(`添加特征: ${recipe.addTraits.join(', ')}`);
    if (recipe.removeTraits.length) lines.push(`移除特征: ${recipe.removeTraits.join(', ')}`);
    if (recipe.newRarity) lines.push(`稀有度 → ${recipe.newRarity}`);
    if (recipe.newSize) lines.push(`体型 → ${recipe.newSize}`);

    if (recipe.addItems.length) lines.push(`新增 ${recipe.addItems.length} 个能力/攻击`);
    if (recipe.removeItemNames.length) lines.push(`移除: ${recipe.removeItemNames.join(', ')}`);

    if (recipe.addImmunities?.length) lines.push(`添加免疫 ×${recipe.addImmunities.length}`);
    if (recipe.addResistances?.length) lines.push(`添加抗性 ×${recipe.addResistances.length}`);
    if (recipe.addWeaknesses?.length) lines.push(`添加弱点 ×${recipe.addWeaknesses.length}`);
    if (recipe.removeImmunities?.length) lines.push(`移除免疫: ${recipe.removeImmunities.join(', ')}`);
    if (recipe.removeResistances?.length) lines.push(`移除抗性: ${recipe.removeResistances.join(', ')}`);
    if (recipe.removeWeaknesses?.length) lines.push(`移除弱点: ${recipe.removeWeaknesses.join(', ')}`);

    if (recipe.namePrefix) lines.push(`名称前缀: "${recipe.namePrefix}"`);
    if (recipe.nameSuffix) lines.push(`名称后缀: "${recipe.nameSuffix}"`);

    return lines;
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.template-new-btn').on('click', () => this.createTemplate('ai'));
    html.find('.template-new-recipe-btn').on('click', () => this.createTemplate('recipe'));

    html.find('.template-edit-btn').on('click', (ev) => {
      this.editingId = (ev.currentTarget as HTMLElement).dataset.id || null;
      this.render(false);
    });

    html.find('.template-delete-btn').on('click', async (ev) => {
      const id = (ev.currentTarget as HTMLElement).dataset.id;
      if (!id) return;
      const confirmed = await this.confirmDelete();
      if (!confirmed) return;
      const templates = MonsterModTemplateManagerApp.getTemplates().filter(t => t.id !== id);
      await MonsterModTemplateManagerApp.saveTemplates(templates);
      if (this.editingId === id) this.editingId = null;
      this.render(false);
    });

    html.find('.template-duplicate-btn').on('click', async (ev) => {
      const id = (ev.currentTarget as HTMLElement).dataset.id;
      if (!id) return;
      await this.duplicateTemplate(id);
    });

    html.find('.template-back-btn').on('click', () => {
      this.editingId = null;
      this.render(false);
    });

    html.find('.template-save-btn').on('click', async () => {
      await this.saveCurrentTemplate(html);
    });

    html.find('.template-generate-recipe-btn').on('click', async () => {
      await this.generateRecipeFromPrompt(html);
    });

    html.find('.template-clear-recipe-btn').on('click', async () => {
      await this.clearRecipe();
    });

    html.find('.template-view-recipe-json-btn').on('click', () => {
      this.viewRecipeJson();
    });
  }

  protected async _updateObject(): Promise<void> {}

  private async createTemplate(type: 'ai' | 'recipe'): Promise<void> {
    const templates = MonsterModTemplateManagerApp.getTemplates();
    const newTemplate: MonsterModTemplate = {
      id: foundry.utils.randomID(),
      name: type === 'recipe' ? `规则模板 ${templates.length + 1}` : `AI 模板 ${templates.length + 1}`,
      description: '',
      promptInstructions: '',
      levelAdjustment: 0,
      traitModifications: { add: [], remove: [] },
      templateType: type,
    };
    templates.push(newTemplate);
    await MonsterModTemplateManagerApp.saveTemplates(templates);
    this.editingId = newTemplate.id;
    this.render(false);
  }

  private async duplicateTemplate(id: string): Promise<void> {
    const templates = MonsterModTemplateManagerApp.getTemplates();
    const source = templates.find(t => t.id === id);
    if (!source) return;

    const newTemplate: MonsterModTemplate = {
      ...JSON.parse(JSON.stringify(source)),
      id: foundry.utils.randomID(),
      name: source.name + ' (副本)',
    };
    templates.push(newTemplate);
    await MonsterModTemplateManagerApp.saveTemplates(templates);
    this.editingId = newTemplate.id;
    this.render(false);
  }

  private async saveCurrentTemplate(html: JQuery): Promise<void> {
    if (!this.editingId) return;

    const templates = MonsterModTemplateManagerApp.getTemplates();
    const template = templates.find(t => t.id === this.editingId);
    if (!template) return;

    template.name = (html.find('input[name="templateName"]').val() as string || '').trim() || template.name;
    template.description = (html.find('textarea[name="templateDescription"]').val() as string || '').trim();
    template.promptInstructions = (html.find('textarea[name="promptInstructions"]').val() as string || '').trim();
    template.levelAdjustment = Number(html.find('input[name="levelAdjustment"]').val()) || 0;

    const addTraits = (html.find('input[name="traitsAdd"]').val() as string || '').trim();
    const removeTraits = (html.find('input[name="traitsRemove"]').val() as string || '').trim();
    template.traitModifications = {
      add: addTraits ? addTraits.split(',').map(s => s.trim()).filter(Boolean) : [],
      remove: removeTraits ? removeTraits.split(',').map(s => s.trim()).filter(Boolean) : [],
    };

    await MonsterModTemplateManagerApp.saveTemplates(templates);
    (globalThis as any).ui?.notifications?.info(`模板 "${template.name}" 已保存`);
    this.render(false);
  }

  private async generateRecipeFromPrompt(html: JQuery): Promise<void> {
    if (!this.editingId || this.isGeneratingRecipe) return;

    const templates = MonsterModTemplateManagerApp.getTemplates();
    const template = templates.find(t => t.id === this.editingId);
    if (!template) return;

    const instructions = (html.find('textarea[name="promptInstructions"]').val() as string || '').trim();
    if (!instructions) {
      (globalThis as any).ui?.notifications?.warn('请先填写改造指令描述');
      return;
    }

    this.isGeneratingRecipe = true;
    this.render(false);

    try {
      (globalThis as any).ui?.notifications?.info('正在使用 AI 生成改造配方...');
      const recipe = await MonsterModifierAIService.generateRecipe(instructions);

      template.recipe = recipe;
      template.templateType = 'recipe';

      if (recipe.statAdjustments.level) {
        template.levelAdjustment = recipe.statAdjustments.level;
      }
      if (recipe.addTraits.length || recipe.removeTraits.length) {
        template.traitModifications = {
          add: recipe.addTraits,
          remove: recipe.removeTraits,
        };
      }

      await MonsterModTemplateManagerApp.saveTemplates(templates);
      (globalThis as any).ui?.notifications?.info('改造配方已生成并保存');
    } catch (error: any) {
      console.error('[MonsterModTemplate] Recipe generation failed:', error);
      (globalThis as any).ui?.notifications?.error(`配方生成失败: ${error.message}`);
    } finally {
      this.isGeneratingRecipe = false;
      this.render(false);
    }
  }

  private async clearRecipe(): Promise<void> {
    if (!this.editingId) return;

    const templates = MonsterModTemplateManagerApp.getTemplates();
    const template = templates.find(t => t.id === this.editingId);
    if (!template) return;

    delete template.recipe;
    template.templateType = 'ai';
    await MonsterModTemplateManagerApp.saveTemplates(templates);
    (globalThis as any).ui?.notifications?.info('已清除配方，模板切换为 AI 模式');
    this.render(false);
  }

  private viewRecipeJson(): void {
    const templates = MonsterModTemplateManagerApp.getTemplates();
    const template = templates.find(t => t.id === this.editingId);
    if (!template?.recipe) return;

    const Dialog = (globalThis as any).Dialog;
    new Dialog({
      title: `配方 JSON — ${template.name}`,
      content: `<div style="max-height:500px;overflow:auto;"><pre style="font-size:11px;white-space:pre-wrap;word-break:break-all;">${JSON.stringify(template.recipe, null, 2)}</pre></div>`,
      buttons: { ok: { label: '关闭' } },
      default: 'ok',
    }, { width: 600 }).render(true);
  }

  private confirmDelete(): Promise<boolean> {
    return new Promise((resolve) => {
      const Dialog = (globalThis as any).Dialog;
      new Dialog({
        title: '确认删除',
        content: '<p>确定要删除这个改造模板吗？此操作不可撤销。</p>',
        buttons: {
          yes: { label: '删除', icon: '<i class="fas fa-trash"></i>', callback: () => resolve(true) },
          no: { label: '取消', icon: '<i class="fas fa-times"></i>', callback: () => resolve(false) },
        },
        default: 'no',
        close: () => resolve(false),
      }).render(true);
    });
  }
}
