import { RoguelikeDrawService, RoguelikeDrawConfig, DrawPoolItem } from '../services/roguelike-draw-service';
import { FeatStorageService } from '../services/feat-storage-service';
import { SpellStorageService } from '../services/spell-storage-service';
import { EquipmentStorageService } from '../services/equipment-storage-service';
import { ActionStorageService } from '../services/action-storage-service';

interface DrawRoundState {
  roundNumber: number;
  items: DrawPoolItem[];
  selectedUuids: Set<string>;
}

/**
 * Roguelike 抽取选择界面
 * 展示随机抽到的物品供玩家选择，将选中物品存入储存箱
 */
export class RoguelikeDrawApp extends Application {
  private config: RoguelikeDrawConfig;
  private pool: DrawPoolItem[];
  private currentRound: number = 1;
  private drawnUuids: Set<string> = new Set();
  private currentItems: DrawPoolItem[] = [];
  private selectedUuids: Set<string> = new Set();
  private allSelectedItems: { name: string; img: string; uuid: string; type: string }[] = [];
  private isFinished: boolean = false;
  private expandedUuid: string | null = null;
  private itemDescriptions: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'roguelike-draw-app',
      template: 'modules/ai-pf2e-assistant/templates/roguelike-draw-app.hbs',
      width: 700,
      height: 650,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'roguelike-draw-app'],
    });
  }

  get title(): string {
    return this.config.title || 'Roguelike 抽取';
  }

  constructor(config: RoguelikeDrawConfig, pool: DrawPoolItem[]) {
    super();
    this.config = config;
    this.pool = pool;
    this.drawNewRound();
  }

  private drawNewRound(): void {
    const excludeUuids = this.config.allowDuplicates ? undefined : this.drawnUuids;
    this.currentItems = RoguelikeDrawService.drawRandomItems(
      this.pool,
      this.config.itemsPerDraw!,
      excludeUuids
    );
    this.selectedUuids = new Set();
    this.expandedUuid = null;

    for (const item of this.currentItems) {
      this.drawnUuids.add(item.uuid);
    }
  }

  override async getData(): Promise<any> {
    const items = await Promise.all(this.currentItems.map(async (item) => {
      let description = this.itemDescriptions.get(item.uuid) || '';

      if (this.expandedUuid === item.uuid && !description) {
        try {
          const fullItem = await (globalThis as any).fromUuid(item.uuid);
          description = fullItem?.system?.description?.value || '';
          this.itemDescriptions.set(item.uuid, description);
        } catch { /* ignore */ }
      }

      return {
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        level: item.level,
        rarity: item.rarity,
        traits: item.traits,
        sourceTab: item.sourceTab,
        selected: this.selectedUuids.has(item.uuid),
        expanded: this.expandedUuid === item.uuid,
        description,
        typeLabel: this.getTypeLabel(item.sourceTab),
      };
    }));

    return {
      items,
      currentRound: this.currentRound,
      totalDraws: this.config.totalDraws,
      selectedCount: this.selectedUuids.size,
      selectablePerDraw: this.config.selectablePerDraw,
      isFinished: this.isFinished,
      allSelectedItems: this.allSelectedItems,
      canConfirm: this.selectedUuids.size > 0,
      actorName: this.config.actor?.name || '',
    };
  }

  private getTypeLabel(sourceTab: string): string {
    const labels: Record<string, string> = {
      feat: '专长',
      spell: '法术',
      equipment: '装备',
      action: '动作',
    };
    return labels[sourceTab] || sourceTab;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.roguelike-item-card').on('click', (event) => {
      const uuid = (event.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid || this.isFinished) return;
      this.toggleSelection(uuid);
    });

    html.find('.roguelike-expand-btn').on('click', (event) => {
      event.stopPropagation();
      const uuid = (event.currentTarget as HTMLElement).closest('.roguelike-item-card')?.dataset.uuid;
      if (!uuid) return;
      this.expandedUuid = this.expandedUuid === uuid ? null : uuid;
      this.render(false);
    });

    html.find('.roguelike-confirm-btn').on('click', () => {
      this.confirmSelection();
    });

    html.find('.roguelike-skip-btn').on('click', () => {
      this.skipRound();
    });

    html.find('.roguelike-finish-btn').on('click', () => {
      this.close();
    });
  }

  private toggleSelection(uuid: string): void {
    if (this.selectedUuids.has(uuid)) {
      this.selectedUuids.delete(uuid);
    } else {
      if (this.selectedUuids.size >= this.config.selectablePerDraw!) {
        (globalThis as any).ui?.notifications?.warn(
          `每轮最多选择 ${this.config.selectablePerDraw} 个物品`
        );
        return;
      }
      this.selectedUuids.add(uuid);
    }
    this.render(false);
  }

  private async confirmSelection(): Promise<void> {
    if (this.selectedUuids.size === 0) return;

    const actor = this.config.actor;
    for (const uuid of this.selectedUuids) {
      const itemData = await RoguelikeDrawService.loadFullItemData(uuid);
      if (!itemData) continue;

      await this.storeItem(actor, itemData);
      const item = this.currentItems.find(i => i.uuid === uuid);
      if (item) {
        this.allSelectedItems.push({
          name: item.name,
          img: item.img,
          uuid: item.uuid,
          type: item.sourceTab,
        });
      }
    }

    (globalThis as any).ui?.notifications?.info(
      `已将 ${this.selectedUuids.size} 个物品存入储存箱`
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

  private async storeItem(actor: any, itemData: any): Promise<void> {
    const type = itemData.type;
    try {
      if (type === 'feat') {
        await FeatStorageService.addFeat(actor, itemData, true);
      } else if (type === 'spell') {
        await SpellStorageService.addSpell(actor, itemData, true);
      } else if (type === 'action') {
        await ActionStorageService.addAction(actor, itemData, true);
      } else {
        await EquipmentStorageService.addEquipment(actor, itemData, true);
      }
    } catch (error) {
      console.error(`[RoguelikeDrawApp] 存储物品失败:`, error);
      (globalThis as any).ui?.notifications?.error(`存储物品失败: ${itemData.name}`);
    }
  }
}
