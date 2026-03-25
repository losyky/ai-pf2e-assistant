import { RoguelikeDrawService, RoguelikeDrawConfig } from '../services/roguelike-draw-service';
import { DrawPoolItem } from '../services/roguelike-draw-service';

export interface SequentialMacroConfig {
  uuid: string;
  name: string;
  img: string;
}

export interface RoguelikeSequentialConfig {
  title?: string;
  macros: SequentialMacroConfig[];
  banListIds?: string[];
  macroUuid?: string;
}

interface SequentialDrawState {
  macroIndex: number;
  macroConfig: any;
  pool: DrawPoolItem[];
  currentRound: number;
  totalDraws: number;
  itemsPerDraw: number;
  selectablePerDraw: number;
  currentItems: DrawPoolItem[];
  selectedUuids: Set<string>;
  drawnUuids: Set<string>;
}

/**
 * Roguelike 连续抽取应用
 * 串行执行多个抽取宏，每个宏完成后自动进入下一个
 */
export class RoguelikeSequentialDrawApp extends Application {
  private config: RoguelikeSequentialConfig;
  private actor: any;
  private mergedBanList: string[];
  
  private currentMacroIndex: number = 0;
  private allStates: SequentialDrawState[] = [];
  private allSelectedItems: { name: string; img: string; uuid: string; type: string; fromMacro: string }[] = [];
  private isFinished: boolean = false;
  private expandedUuid: string | null = null;
  private itemDescriptions: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'roguelike-sequential-draw',
      template: 'modules/ai-pf2e-assistant/templates/roguelike-sequential-draw.hbs',
      width: 700,
      height: 650,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'roguelike-sequential-draw'],
    });
  }

  get title(): string {
    if (this.isFinished) {
      return `${this.config.title || 'Roguelike 连续抽取'} - 已完成`;
    }
    const currentMacro = this.config.macros[this.currentMacroIndex];
    return `${this.config.title || 'Roguelike 连续抽取'} - ${currentMacro?.name || ''}`;
  }

  constructor(config: RoguelikeSequentialConfig, actor: any) {
    super();
    this.config = config;
    this.actor = actor;
    this.mergedBanList = config.banListIds || [];
  }

  async initialize(): Promise<void> {
    for (let i = 0; i < this.config.macros.length; i++) {
      const macroConfig = await this.loadMacroConfig(this.config.macros[i].uuid);
      if (!macroConfig) {
        throw new Error(`无法加载宏配置: ${this.config.macros[i].name}`);
      }

      // 合并 banlist
      const originalBanList = macroConfig.banListIds || [];
      const mergedBanList = [...new Set([...this.mergedBanList, ...originalBanList])];
      macroConfig.banListIds = mergedBanList;

      await RoguelikeDrawService.initTabs(macroConfig.contentTypes || ['feat']);
      const pool = RoguelikeDrawService.buildItemPool(macroConfig);

      if (pool.length === 0) {
        throw new Error(`宏「${this.config.macros[i].name}」的物品池为空`);
      }

      const state: SequentialDrawState = {
        macroIndex: i,
        macroConfig,
        pool,
        currentRound: 1,
        totalDraws: macroConfig.totalDraws || 1,
        itemsPerDraw: Math.min(macroConfig.itemsPerDraw || 3, pool.length),
        selectablePerDraw: Math.min(macroConfig.selectablePerDraw || 1, macroConfig.itemsPerDraw || 3),
        currentItems: [],
        selectedUuids: new Set(),
        drawnUuids: new Set(),
      };

      this.drawNewRound(state);
      this.allStates.push(state);
    }
  }

  private async loadMacroConfig(macroUuid: string): Promise<any> {
    try {
      const macroDoc = await (globalThis as any).fromUuid(macroUuid);
      if (!macroDoc) return null;

      const command = macroDoc.command || '';
      const configMatch = command.match(/game\.modules\.get\(['"]ai-pf2e-assistant['"]\)\.api\.roguelike\.draw\((\{[\s\S]*?\})\)/);
      
      if (!configMatch) return null;

      // 移除注释并清理配置字符串
      let configStr = configMatch[1]
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      
      // 移除动态引用字段（这些字段会在后面重新设置）
      configStr = configStr
        .replace(/\bmacroUuid\s*:\s*[^,}]+[,]?/g, '') // 移除 macroUuid: xxx
        .replace(/\bactor\s*:\s*[^,}]+[,]?/g, '') // 移除 actor: xxx
        .replace(/,\s*}/g, '}') // 清理末尾多余的逗号
        .replace(/,\s*,/g, ','); // 清理连续的逗号
      
      console.log('[SequentialDraw] 清理后的配置字符串:', configStr);
      
      const config = (new Function(`"use strict"; return (${configStr})`)());
      
      console.log('[SequentialDraw] 解析后的配置:', config);
      
      return {
        ...config,
        actor: this.actor,
        totalDraws: config.totalDraws ?? 1,
        itemsPerDraw: config.itemsPerDraw ?? 3,
        selectablePerDraw: config.selectablePerDraw ?? 1,
        contentTypes: config.contentTypes ?? ['feat'],
        featCategories: config.featCategories ?? [],
        equipmentCategories: config.equipmentCategories ?? [],
        levelRange: config.levelRange ?? { min: 0, max: 20 },
        rarityFilter: config.rarityFilter ?? [],
        requiredTraits: config.requiredTraits ?? [],
        excludedTraits: config.excludedTraits ?? [],
        allowDuplicates: config.allowDuplicates ?? false,
      };
    } catch (error) {
      console.error('[SequentialDraw] 加载宏配置失败:', error);
      return null;
    }
  }

  private drawNewRound(state: SequentialDrawState): void {
    const excludeUuids = state.macroConfig.allowDuplicates ? undefined : state.drawnUuids;
    state.currentItems = RoguelikeDrawService.drawRandomItems(
      state.pool,
      state.itemsPerDraw,
      excludeUuids
    );
    state.selectedUuids = new Set();

    for (const item of state.currentItems) {
      state.drawnUuids.add(item.uuid);
    }
  }

  private getCurrentState(): SequentialDrawState {
    return this.allStates[this.currentMacroIndex];
  }

  override async getData(): Promise<any> {
    if (this.isFinished) {
      // 为完成界面的物品添加 typeLabel
      const itemsWithLabels = this.allSelectedItems.map(item => ({
        ...item,
        typeLabel: this.getTypeLabel(item.type),
      }));

      return {
        isFinished: true,
        allSelectedItems: itemsWithLabels,
        actorName: this.actor?.name || '',
        macroCount: this.config.macros.length,
      };
    }

    const state = this.getCurrentState();
    const items = await Promise.all(state.currentItems.map(async (item) => {
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
        selected: state.selectedUuids.has(item.uuid),
        expanded: this.expandedUuid === item.uuid,
        description,
        typeLabel: this.getTypeLabel(item.sourceTab),
      };
    }));

    return {
      items,
      currentMacroIndex: this.currentMacroIndex + 1,
      totalMacros: this.config.macros.length,
      currentMacroName: this.config.macros[this.currentMacroIndex]?.name || '',
      currentRound: state.currentRound,
      totalDraws: state.totalDraws,
      selectedCount: state.selectedUuids.size,
      selectablePerDraw: state.selectablePerDraw,
      isFinished: false,
      canConfirm: state.selectedUuids.size > 0,
      actorName: this.actor?.name || '',
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
    const state = this.getCurrentState();
    
    if (state.selectedUuids.has(uuid)) {
      state.selectedUuids.delete(uuid);
    } else {
      if (state.selectedUuids.size >= state.selectablePerDraw) {
        (globalThis as any).ui?.notifications?.warn(
          `每轮最多选择 ${state.selectablePerDraw} 个物品`
        );
        return;
      }
      state.selectedUuids.add(uuid);
    }
    this.render(false);
  }

  private async confirmSelection(): Promise<void> {
    const state = this.getCurrentState();
    if (state.selectedUuids.size === 0) return;

    for (const uuid of state.selectedUuids) {
      const itemData = await RoguelikeDrawService.loadFullItemData(uuid);
      if (!itemData) continue;

      await this.storeItem(this.actor, itemData);
      const item = state.currentItems.find(i => i.uuid === uuid);
      if (item) {
        this.allSelectedItems.push({
          name: item.name,
          img: item.img,
          uuid: item.uuid,
          type: item.sourceTab,
          fromMacro: this.config.macros[this.currentMacroIndex].name,
        });
      }
    }

    (globalThis as any).ui?.notifications?.info(
      `已将 ${state.selectedUuids.size} 个物品存入储存箱`
    );

    this.advanceRound();
  }

  private skipRound(): void {
    this.advanceRound();
  }

  private advanceRound(): void {
    const state = this.getCurrentState();
    
    if (state.currentRound >= state.totalDraws) {
      this.advanceToNextMacro();
      return;
    }

    state.currentRound++;
    this.drawNewRound(state);
    this.render(false);
  }

  private advanceToNextMacro(): void {
    this.currentMacroIndex++;
    
    if (this.currentMacroIndex >= this.config.macros.length) {
      this.isFinished = true;
      this.broadcastToChat();
      this.render(false);
      return;
    }

    this.expandedUuid = null;
    this.render(false);
  }

  private async storeItem(actor: any, itemData: any): Promise<void> {
    const type = itemData.type;
    try {
      const { FeatStorageService } = await import('../services/feat-storage-service');
      const { SpellStorageService } = await import('../services/spell-storage-service');
      const { ActionStorageService } = await import('../services/action-storage-service');
      const { EquipmentStorageService } = await import('../services/equipment-storage-service');

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
      console.error(`[SequentialDraw] 存储物品失败:`, error);
      (globalThis as any).ui?.notifications?.error(`存储物品失败: ${itemData.name}`);
    }
  }

  private async broadcastToChat(): Promise<void> {
    if (this.allSelectedItems.length === 0) {
      return;
    }

    const actorName = this.actor?.name || '未知角色';
    const title = this.config.title || 'Roguelike 连续抽取';

    const itemsByMacro = new Map<string, typeof this.allSelectedItems>();
    for (const item of this.allSelectedItems) {
      if (!itemsByMacro.has(item.fromMacro)) {
        itemsByMacro.set(item.fromMacro, []);
      }
      itemsByMacro.get(item.fromMacro)!.push(item);
    }

    let contentHtml = '';
    for (const [macroName, items] of itemsByMacro) {
      const itemListHtml = items.map(item => {
        const typeLabel = this.getTypeLabel(item.type);
        return `<li style="display: flex; align-items: center; margin: 4px 0;">
          <img src="${item.img}" style="width: 32px; height: 32px; border: none; margin-right: 8px;" />
          <span><strong>${item.name}</strong> (${typeLabel})</span>
        </li>`;
      }).join('');

      contentHtml += `
        <div style="margin-bottom: 12px;">
          <h4 style="margin: 8px 0 4px 0; color: #4361ee; border-bottom: 1px solid #dee2e6;">
            ${macroName}
          </h4>
          <ul style="list-style: none; padding: 0; margin: 4px 0;">
            ${itemListHtml}
          </ul>
        </div>
      `;
    }

    const content = `
      <div class="roguelike-sequential-broadcast" style="padding: 8px;">
        <h3 style="margin-top: 0; border-bottom: 2px solid #ccc; padding-bottom: 4px;">
          <i class="fas fa-list-ol"></i> ${title}
        </h3>
        <p><strong>${actorName}</strong> 完成了连续抽取，选择了以下内容：</p>
        ${contentHtml}
      </div>
    `;

    try {
      await (ChatMessage as any).create({
        user: (game as any).user?.id,
        speaker: { alias: actorName },
        content,
        whisper: [],
      });
    } catch (error) {
      console.error('[SequentialDraw] 广播到聊天失败:', error);
    }
  }
}
