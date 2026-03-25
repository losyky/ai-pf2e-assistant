import { RoguelikeMacroAPI } from '../api/roguelike-macro-api';

export interface CollectionMacroConfig {
  uuid: string;
  name: string;
  img: string;
}

export interface RoguelikeCollectionConfig {
  title?: string;
  macros: CollectionMacroConfig[];
  banListIds?: string[];
  macroUuid?: string;
}

/**
 * Roguelike 集合宏选择器
 * 允许玩家从多个配置的抽取宏中选择一个执行
 */
export class RoguelikeCollectionSelectorApp extends Application {
  private config: RoguelikeCollectionConfig;
  private actor: any;
  private mergedBanList: string[];

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'roguelike-collection-selector',
      template: 'modules/ai-pf2e-assistant/templates/roguelike-collection-selector.hbs',
      width: 500,
      height: 'auto',
      resizable: false,
      classes: ['ai-pf2e-assistant-container', 'roguelike-collection-selector'],
    });
  }

  get title(): string {
    return this.config.title || 'Roguelike 集合抽取';
  }

  constructor(config: RoguelikeCollectionConfig, actor: any) {
    super();
    this.config = config;
    this.actor = actor;
    this.mergedBanList = config.banListIds || [];
  }

  override async getData(): Promise<any> {
    const macros = await Promise.all(this.config.macros.map(async (macro) => {
      let macroDoc: any = null;
      try {
        macroDoc = await (globalThis as any).fromUuid(macro.uuid);
      } catch { /* ignore */ }

      return {
        uuid: macro.uuid,
        name: macro.name || macroDoc?.name || '未知宏',
        img: macro.img || macroDoc?.img || 'icons/svg/dice-target.svg',
        exists: !!macroDoc,
      };
    }));

    return {
      macros,
      actorName: this.actor?.name || '未知角色',
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.collection-macro-card').on('click', async (event) => {
      const uuid = (event.currentTarget as HTMLElement).dataset.uuid;
      if (!uuid) return;

      await this.executeMacro(uuid);
      this.close();
    });

    html.find('.collection-cancel-btn').on('click', () => {
      this.close();
    });
  }

  private async executeMacro(macroUuid: string): Promise<void> {
    try {
      const macroDoc = await (globalThis as any).fromUuid(macroUuid);
      if (!macroDoc) {
        (globalThis as any).ui?.notifications?.error('宏不存在');
        return;
      }

      // 发送聊天消息：玩家选择了某个抽取宏
      await this.broadcastMacroSelection(macroDoc);

      // 解析宏命令中的配置
      const command = macroDoc.command || '';
      const configMatch = command.match(/game\.modules\.get\(['"]ai-pf2e-assistant['"]\)\.api\.roguelike\.draw\((\{[\s\S]*?\})\)/);
      
      if (!configMatch) {
        (globalThis as any).ui?.notifications?.warn('该宏不是有效的抽取宏');
        return;
      }

      // 提取配置并合并 banlist
      let drawConfig: any = {};
      try {
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
        
        console.log('[CollectionSelector] 清理后的配置字符串:', configStr);
        
        drawConfig = (new Function(`"use strict"; return (${configStr})`)());
        
        console.log('[CollectionSelector] 解析后的配置:', drawConfig);
      } catch (error) {
        console.error('[CollectionSelector] 解析宏配置失败:', error);
        console.error('[CollectionSelector] 原始配置字符串:', configMatch[1]);
        (globalThis as any).ui?.notifications?.error('解析宏配置失败，请检查宏的配置格式');
        return;
      }

      // 合并 banlist：集合宏的 banlist + 原宏的 banlist
      const originalBanList = drawConfig.banListIds || [];
      const mergedBanList = [...new Set([...this.mergedBanList, ...originalBanList])];

      // 构建最终配置（不传递 macroUuid，点数已在集合宏层面消耗）
      const finalConfig = {
        ...drawConfig,
        actor: this.actor,
        banListIds: mergedBanList,
      };

      // 直接调用内部抽取流程（跳过点数检查）
      const { RoguelikeDrawService } = await import('../services/roguelike-draw-service');
      const { RoguelikeDrawApp } = await import('./roguelike-draw-app');

      const resolvedConfig = {
        ...finalConfig,
        totalDraws: finalConfig.totalDraws ?? 1,
        itemsPerDraw: finalConfig.itemsPerDraw ?? 3,
        selectablePerDraw: finalConfig.selectablePerDraw ?? 1,
        contentTypes: finalConfig.contentTypes ?? ['feat'],
        featCategories: finalConfig.featCategories ?? [],
        equipmentCategories: finalConfig.equipmentCategories ?? [],
        levelRange: finalConfig.levelRange ?? { min: 0, max: 20 },
        rarityFilter: finalConfig.rarityFilter ?? [],
        requiredTraits: finalConfig.requiredTraits ?? [],
        excludedTraits: finalConfig.excludedTraits ?? [],
        banListIds: mergedBanList,
        allowDuplicates: finalConfig.allowDuplicates ?? false,
      };

      if (resolvedConfig.selectablePerDraw! > resolvedConfig.itemsPerDraw!) {
        resolvedConfig.selectablePerDraw = resolvedConfig.itemsPerDraw;
      }

      await RoguelikeDrawService.initTabs(resolvedConfig.contentTypes!);

      const pool = RoguelikeDrawService.buildItemPool(resolvedConfig);
      if (pool.length === 0) {
        (globalThis as any).ui?.notifications?.warn('当前筛选条件下没有可用物品');
        return;
      }

      if (pool.length < resolvedConfig.itemsPerDraw!) {
        console.warn(`[CollectionSelector] 物品池(${pool.length})小于每轮抽取数(${resolvedConfig.itemsPerDraw})`);
        resolvedConfig.itemsPerDraw = pool.length;
        if (resolvedConfig.selectablePerDraw! > resolvedConfig.itemsPerDraw) {
          resolvedConfig.selectablePerDraw = resolvedConfig.itemsPerDraw;
        }
      }

      const app = new RoguelikeDrawApp(resolvedConfig, pool);
      app.render(true);

    } catch (error) {
      console.error('[CollectionSelector] 执行宏失败:', error);
      (globalThis as any).ui?.notifications?.error('执行宏失败');
    }
  }

  private async broadcastMacroSelection(macro: any): Promise<void> {
    const actorName = this.actor?.name || '未知角色';
    const collectionTitle = this.config.title || 'Roguelike 集合抽取';
    const macroName = macro?.name || '未知宏';

    const content = `
      <div class="roguelike-macro-selection" style="padding: 8px;">
        <p><strong>${actorName}</strong> 在「${collectionTitle}」中选择了抽取宏：</p>
        <div style="display: flex; align-items: center; margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 6px;">
          <img src="${macro?.img || 'icons/svg/dice-target.svg'}" style="width: 32px; height: 32px; border: none; margin-right: 8px;" />
          <strong>${macroName}</strong>
        </div>
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
      console.error('[CollectionSelector] 广播选择失败:', error);
    }
  }
}
