import { MonsterModTemplateManagerApp } from './monster-mod-template-manager-app';
import { MonsterModifierAIService, MonsterModificationResult } from '../services/monster-modifier-ai-service';
import { CREATURE_SIZES } from '../services/monster-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';

declare const foundry: any;

interface DroppedMonster {
  uuid: string;
  name: string;
  img: string;
  level: number;
  hp: number;
  ac: number;
  traits: string[];
  size: string;
}

/**
 * 怪物改造工作台
 * 支持两种模式：
 *  - AI 实时改造：每次发送完整 JSON 给 AI
 *  - Recipe 模板：使用存储的配方机械化套用
 */
export class MonsterModifierApp extends Application {
  private monsters: DroppedMonster[] = [];
  private selectedTemplateId: string = '';
  private isProcessing: boolean = false;
  private results: MonsterModificationResult[] = [];
  private currentView: 'input' | 'results' = 'input';
  private expandedResultIndex: number | null = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'monster-modifier-app',
      title: '怪物改造工作台',
      template: `modules/${MODULE_ID}/templates/monster-modifier-app.hbs`,
      width: 750,
      height: 700,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'monster-modifier-app'],
      dragDrop: [{ dragSelector: null, dropSelector: '.monster-drop-zone' }],
    });
  }

  async getData(): Promise<any> {
    const templates = MonsterModTemplateManagerApp.getTemplates();
    const templateOptions = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      selected: t.id === this.selectedTemplateId,
      isRecipe: t.templateType === 'recipe' && !!t.recipe,
      typeLabel: t.templateType === 'recipe' && t.recipe ? '规则' : 'AI',
    }));

    const selectedTemplate = templates.find(t => t.id === this.selectedTemplateId);
    const isRecipeMode = selectedTemplate?.templateType === 'recipe' && !!selectedTemplate.recipe;

    const resultSummaries = this.results.map((r, idx) => {
      const origItems = Array.isArray(r.originalMonster.items) ? r.originalMonster.items.length : 0;
      const modItems = Array.isArray(r.modifiedMonster.items) ? r.modifiedMonster.items.length : 0;

      return {
        index: idx,
        originalName: r.originalMonster.name,
        modifiedName: r.modifiedMonster.name,
        originalLevel: r.originalMonster.system?.details?.level?.value || 0,
        modifiedLevel: r.modifiedMonster.system?.details?.level?.value || 0,
        originalHp: r.originalMonster.system?.attributes?.hp?.max || 0,
        modifiedHp: r.modifiedMonster.system?.attributes?.hp?.max || 0,
        originalAc: r.originalMonster.system?.attributes?.ac?.value || 0,
        modifiedAc: r.modifiedMonster.system?.attributes?.ac?.value || 0,
        originalItemCount: origItems,
        modifiedItemCount: modItems,
        img: r.modifiedMonster.img || r.originalMonster.img,
        expanded: this.expandedResultIndex === idx,
        modifiedJson: JSON.stringify(r.modifiedMonster, null, 2),
      };
    });

    return {
      monsters: this.monsters.map(m => ({
        ...m,
        sizeLabel: CREATURE_SIZES[m.size] || m.size,
      })),
      hasMonsters: this.monsters.length > 0,
      templateOptions,
      hasTemplates: templateOptions.length > 0,
      selectedTemplateId: this.selectedTemplateId,
      isProcessing: this.isProcessing,
      isRecipeMode,
      currentView: this.currentView,
      showInput: this.currentView === 'input',
      showResults: this.currentView === 'results',
      results: resultSummaries,
      hasResults: resultSummaries.length > 0,
      canStartModification: this.monsters.length > 0 && !!this.selectedTemplateId && !this.isProcessing,
    };
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    const dropZone = html.find('.monster-drop-zone')[0];
    if (dropZone) {
      dropZone.addEventListener('dragover', (ev: DragEvent) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', (ev: DragEvent) => {
        ev.preventDefault();
        dropZone.classList.remove('drag-over');
        this.handleDrop(ev);
      });
    }

    html.find('.monster-remove-btn').on('click', (ev) => {
      const uuid = (ev.currentTarget as HTMLElement).dataset.uuid;
      if (uuid) {
        this.monsters = this.monsters.filter(m => m.uuid !== uuid);
        this.render(false);
      }
    });

    html.find('.monster-clear-all-btn').on('click', () => {
      this.monsters = [];
      this.render(false);
    });

    html.find('select[name="templateSelect"]').on('change', (ev) => {
      this.selectedTemplateId = (ev.currentTarget as HTMLSelectElement).value;
      this.render(false);
    });

    html.find('.monster-manage-templates-btn').on('click', () => {
      new MonsterModTemplateManagerApp({}).render(true);
    });

    html.find('.monster-start-modify-btn').on('click', async () => {
      await this.startModification();
    });

    html.find('.monster-back-to-input-btn').on('click', () => {
      this.currentView = 'input';
      this.results = [];
      this.expandedResultIndex = null;
      this.render(false);
    });

    html.find('.monster-result-toggle').on('click', (ev) => {
      const idx = Number((ev.currentTarget as HTMLElement).dataset.index);
      this.expandedResultIndex = this.expandedResultIndex === idx ? null : idx;
      this.render(false);
    });

    html.find('.monster-import-result-btn').on('click', async (ev) => {
      const idx = Number((ev.currentTarget as HTMLElement).dataset.index);
      await this.importResult(idx);
    });

    html.find('.monster-import-all-results-btn').on('click', async () => {
      await this.importAllResults();
    });

    html.find('.monster-result-card[draggable="true"]').on('dragstart', (ev) => {
      const idx = Number((ev.currentTarget as HTMLElement).dataset.index);
      if (isNaN(idx) || !this.results[idx]) return;
      const modData = this.results[idx].modifiedMonster;
      const dragData = JSON.stringify({ type: 'Actor', data: modData });
      ev.originalEvent!.dataTransfer!.setData('text/plain', dragData);
      ev.originalEvent!.dataTransfer!.setData('application/json', dragData);
    });
  }

  private async handleDrop(ev: DragEvent): Promise<void> {
    if (!ev.dataTransfer) return;

    let data: any;
    try {
      data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    } catch {
      try {
        data = JSON.parse(ev.dataTransfer.getData('application/json'));
      } catch {
        return;
      }
    }

    if (!data) return;
    const uuid: string = data.uuid || '';
    if (!uuid) return;

    if (this.monsters.find(m => m.uuid === uuid)) {
      (globalThis as any).ui?.notifications?.warn('该怪物已添加到工作台');
      return;
    }

    try {
      const doc = await (globalThis as any).fromUuid(uuid);
      if (!doc) {
        (globalThis as any).ui?.notifications?.warn('无法解析拖入的文档');
        return;
      }
      if (doc.type !== 'npc') {
        (globalThis as any).ui?.notifications?.warn('只支持 NPC 类型的 Actor');
        return;
      }

      this.monsters.push({
        uuid,
        name: doc.name || 'Unknown',
        img: doc.img || 'systems/pf2e/icons/default-icons/npc.svg',
        level: doc.system?.details?.level?.value || 0,
        hp: doc.system?.attributes?.hp?.max || 0,
        ac: doc.system?.attributes?.ac?.value || 0,
        traits: doc.system?.traits?.value || [],
        size: doc.system?.traits?.size?.value || 'med',
      });

      (globalThis as any).ui?.notifications?.info(`"${doc.name}" 已添加到改造工作台`);
      this.render(false);
    } catch (err) {
      console.error('[MonsterModifier] Drop failed:', err);
      (globalThis as any).ui?.notifications?.error('添加怪物失败');
    }
  }

  private async startModification(): Promise<void> {
    if (this.isProcessing || this.monsters.length === 0 || !this.selectedTemplateId) return;

    const templates = MonsterModTemplateManagerApp.getTemplates();
    const template = templates.find(t => t.id === this.selectedTemplateId);
    if (!template) {
      (globalThis as any).ui?.notifications?.error('未找到选定的改造模板');
      return;
    }

    const isRecipe = template.templateType === 'recipe' && !!template.recipe;

    this.isProcessing = true;
    this.results = [];
    this.render(false);

    try {
      for (const m of this.monsters) {
        const modeLabel = isRecipe ? '套用配方' : 'AI 改造';
        (globalThis as any).ui?.notifications?.info(`正在${modeLabel} "${m.name}"...`);

        const fullData = await (globalThis as any).fromUuid(m.uuid);
        if (!fullData) {
          console.warn('[MonsterModifier] 无法加载怪物:', m.uuid);
          continue;
        }

        const monsterObj = fullData.toObject();

        try {
          let modifiedMonster: any;

          if (isRecipe) {
            modifiedMonster = MonsterModifierAIService.applyRecipe(monsterObj, template.recipe!);
          } else {
            const result = await MonsterModifierAIService.modifyMonster(monsterObj, template);
            modifiedMonster = result.modifiedMonster;
          }

          this.results.push({
            originalMonster: monsterObj,
            modifiedMonster,
            templateUsed: template,
          });
        } catch (error) {
          console.error('[MonsterModifier] 改造失败:', error);
          (globalThis as any).ui?.notifications?.error(
            `改造 "${m.name}" 失败: ${(error as Error).message}`
          );
        }
      }

      if (this.results.length > 0) {
        this.currentView = 'results';
        (globalThis as any).ui?.notifications?.info(`成功改造 ${this.results.length} 个怪物`);
      } else {
        (globalThis as any).ui?.notifications?.error('所有怪物改造均失败');
      }
    } finally {
      this.isProcessing = false;
      this.render(false);
    }
  }

  private async importResult(index: number): Promise<void> {
    const result = this.results[index];
    if (!result) return;

    try {
      const monsterData = JSON.parse(JSON.stringify(result.modifiedMonster));
      delete monsterData._id;
      delete monsterData._stats;

      const created = await (globalThis as any).Actor.create(monsterData);
      (globalThis as any).ui?.notifications?.info(`怪物 "${created.name}" 已导入到世界`);
    } catch (error) {
      console.error('[MonsterModifier] 导入失败:', error);
      (globalThis as any).ui?.notifications?.error('导入怪物失败');
    }
  }

  private async importAllResults(): Promise<void> {
    let imported = 0;
    for (let i = 0; i < this.results.length; i++) {
      try {
        await this.importResult(i);
        imported++;
      } catch { /* handled in importResult */ }
    }
    (globalThis as any).ui?.notifications?.info(`已导入 ${imported} 个改造后的怪物`);
  }
}
