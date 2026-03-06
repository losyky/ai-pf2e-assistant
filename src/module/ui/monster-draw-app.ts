import { MonsterDrawService, MonsterDrawConfig, DrawPoolMonster, CREATURE_SIZES } from '../services/monster-draw-service';

const MODULE_ID = 'ai-pf2e-assistant';

/**
 * 怪物抽取选择界面
 * 展示随机抽到的怪物供选择，支持导入世界或拖入场景
 */
export class MonsterDrawApp extends Application {
  private config: MonsterDrawConfig;
  private pool: DrawPoolMonster[];
  private currentRound: number = 1;
  private drawnUuids: Set<string> = new Set();
  private currentMonsters: DrawPoolMonster[] = [];
  private selectedUuids: Set<string> = new Set();
  private allSelectedMonsters: { name: string; img: string; uuid: string; level: number }[] = [];
  private isFinished: boolean = false;
  private expandedUuid: string | null = null;
  private monsterDescriptions: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'monster-draw-app',
      template: `modules/${MODULE_ID}/templates/monster-draw-app.hbs`,
      width: 720,
      height: 680,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'monster-draw-app'],
    });
  }

  get title(): string {
    return this.config.title || '怪物抽取';
  }

  constructor(config: MonsterDrawConfig, pool: DrawPoolMonster[]) {
    super();
    this.config = config;
    this.pool = pool;
    this.drawNewRound();
  }

  private drawNewRound(): void {
    const excludeUuids = this.config.allowDuplicates ? undefined : this.drawnUuids;
    this.currentMonsters = MonsterDrawService.drawRandomMonsters(
      this.pool,
      this.config.monstersPerDraw!,
      excludeUuids
    );
    this.selectedUuids = new Set();
    this.expandedUuid = null;

    for (const m of this.currentMonsters) {
      this.drawnUuids.add(m.uuid);
    }
  }

  override async getData(): Promise<any> {
    const monsters = await Promise.all(this.currentMonsters.map(async (m) => {
      let description = this.monsterDescriptions.get(m.uuid) || '';

      if (this.expandedUuid === m.uuid && !description) {
        try {
          const fullData = await (globalThis as any).fromUuid(m.uuid);
          description = fullData?.system?.details?.publicNotes || '';
          this.monsterDescriptions.set(m.uuid, description);
        } catch { /* ignore */ }
      }

      return {
        uuid: m.uuid,
        name: m.name,
        img: m.img,
        level: m.level,
        rarity: m.rarity,
        traits: m.traits,
        size: m.size,
        sizeLabel: CREATURE_SIZES[m.size] || m.size,
        selected: this.selectedUuids.has(m.uuid),
        expanded: this.expandedUuid === m.uuid,
        description,
      };
    }));

    return {
      monsters,
      currentRound: this.currentRound,
      totalDraws: this.config.totalDraws,
      selectedCount: this.selectedUuids.size,
      selectablePerDraw: this.config.selectablePerDraw,
      isFinished: this.isFinished,
      allSelectedMonsters: this.allSelectedMonsters,
      canConfirm: this.selectedUuids.size > 0,
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.monster-card').on('click', (event) => {
      const uuid = (event.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid || this.isFinished) return;
      this.toggleSelection(uuid);
    });

    html.find('.monster-expand-btn').on('click', (event) => {
      event.stopPropagation();
      const uuid = (event.currentTarget as HTMLElement).closest('.monster-card')?.dataset.uuid;
      if (!uuid) return;
      this.expandedUuid = this.expandedUuid === uuid ? null : uuid;
      this.render(false);
    });

    html.find('.monster-confirm-btn').on('click', () => {
      this.confirmSelection();
    });

    html.find('.monster-skip-btn').on('click', () => {
      this.skipRound();
    });

    html.find('.monster-finish-btn').on('click', () => {
      this.close();
    });

    html.find('.monster-import-btn').on('click', async (event) => {
      event.stopPropagation();
      const uuid = (event.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid) return;
      await this.importSingleMonster(uuid);
    });

    // Drag support for each monster card
    html.find('.monster-card[draggable="true"]').on('dragstart', (event) => {
      const uuid = (event.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid) return;
      const dragData = JSON.stringify({ type: 'Actor', uuid });
      event.originalEvent!.dataTransfer!.setData('text/plain', dragData);
      event.originalEvent!.dataTransfer!.setData('application/json', dragData);
    });

    // Summary drag support
    html.find('.monster-summary-item[draggable="true"]').on('dragstart', (event) => {
      const uuid = (event.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid) return;
      const dragData = JSON.stringify({ type: 'Actor', uuid });
      event.originalEvent!.dataTransfer!.setData('text/plain', dragData);
      event.originalEvent!.dataTransfer!.setData('application/json', dragData);
    });

    html.find('.monster-import-all-btn').on('click', async () => {
      await this.importAllSelected();
    });
  }

  private toggleSelection(uuid: string): void {
    if (this.selectedUuids.has(uuid)) {
      this.selectedUuids.delete(uuid);
    } else {
      if (this.selectedUuids.size >= this.config.selectablePerDraw!) {
        (globalThis as any).ui?.notifications?.warn(
          `每轮最多选择 ${this.config.selectablePerDraw} 个怪物`
        );
        return;
      }
      this.selectedUuids.add(uuid);
    }
    this.render(false);
  }

  private async confirmSelection(): Promise<void> {
    if (this.selectedUuids.size === 0) return;

    for (const uuid of this.selectedUuids) {
      const m = this.currentMonsters.find(i => i.uuid === uuid);
      if (m) {
        this.allSelectedMonsters.push({
          name: m.name,
          img: m.img,
          uuid: m.uuid,
          level: m.level,
        });
      }
    }

    (globalThis as any).ui?.notifications?.info(
      `已选择 ${this.selectedUuids.size} 个怪物（可从汇总页导入或拖入场景）`
    );

    this.advanceRound();
  }

  private skipRound(): void {
    this.advanceRound();
  }

  private advanceRound(): void {
    if (this.currentRound >= this.config.totalDraws!) {
      this.isFinished = true;
      this.render(false);
      return;
    }

    this.currentRound++;
    this.drawNewRound();
    this.render(false);
  }

  private async importSingleMonster(uuid: string): Promise<void> {
    try {
      const monsterData = await MonsterDrawService.loadFullMonsterData(uuid);
      if (!monsterData) {
        (globalThis as any).ui?.notifications?.error('加载怪物数据失败');
        return;
      }

      const created = await MonsterDrawService.importMonsterToWorld(monsterData);
      (globalThis as any).ui?.notifications?.info(`怪物 "${created.name}" 已导入到世界`);
    } catch (error) {
      console.error('[MonsterDrawApp] 导入怪物失败:', error);
      (globalThis as any).ui?.notifications?.error('导入怪物失败');
    }
  }

  private async importAllSelected(): Promise<void> {
    let imported = 0;
    for (const m of this.allSelectedMonsters) {
      try {
        const monsterData = await MonsterDrawService.loadFullMonsterData(m.uuid);
        if (!monsterData) continue;
        await MonsterDrawService.importMonsterToWorld(monsterData);
        imported++;
      } catch (error) {
        console.error('[MonsterDrawApp] 批量导入怪物失败:', error);
      }
    }
    (globalThis as any).ui?.notifications?.info(`已导入 ${imported} 个怪物到世界`);
  }
}
