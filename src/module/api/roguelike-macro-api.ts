import { RoguelikeDrawService, RoguelikeDrawConfig } from '../services/roguelike-draw-service';
import { RoguelikeDrawApp } from '../ui/roguelike-draw-app';

/**
 * Roguelike 抽取宏 API
 * 通过宏调用触发 Roguelike 随机抽取流程
 */
export class RoguelikeMacroAPI {

  /**
   * 解析 actor：按优先级尝试多种策略，最后弹出选择对话框
   */
  private static async resolveActor(configActor?: any): Promise<any> {
    // 1. 直接传入的 actor 对象
    if (configActor) {
      if (typeof configActor === 'string') {
        const resolved = await (globalThis as any).fromUuid(configActor);
        if (resolved) return resolved;
      } else {
        return configActor;
      }
    }

    const g = game as any;

    // 2. 当前选中的 Token 的 actor
    const controlled = (globalThis as any).canvas?.tokens?.controlled;
    if (controlled && controlled.length === 1 && controlled[0]?.actor) {
      return controlled[0].actor;
    }

    // 3. 当前用户的默认角色
    if (g.user?.character) {
      return g.user.character;
    }

    // 4. 获取当前用户拥有的所有角色，弹出选择对话框
    const ownedActors = g.actors?.filter((a: any) => a.hasPlayerOwner && a.testUserPermission(g.user, 'OWNER'));
    if (!ownedActors || ownedActors.length === 0) {
      return null;
    }

    if (ownedActors.length === 1) {
      return ownedActors[0];
    }

    return this.showActorSelectionDialog(ownedActors);
  }

  /**
   * 弹出角色选择对话框
   */
  private static showActorSelectionDialog(actors: any[]): Promise<any> {
    return new Promise((resolve) => {
      const optionsHtml = actors.map((a: any) =>
        `<option value="${a.id}">${a.name}</option>`
      ).join('');

      const content = `
        <form>
          <div class="form-group">
            <label>选择角色</label>
            <select name="actorId" style="width:100%;">
              ${optionsHtml}
            </select>
          </div>
        </form>
      `;

      const Dialog = (globalThis as any).Dialog;
      new Dialog({
        title: 'Roguelike 抽取 - 选择角色',
        content,
        buttons: {
          ok: {
            icon: '<i class="fas fa-check"></i>',
            label: '确认',
            callback: (html: any) => {
              const actorId = html.find('[name="actorId"]').val();
              const actor = (game as any).actors?.get(actorId);
              resolve(actor || null);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: '取消',
            callback: () => resolve(null),
          }
        },
        default: 'ok',
        close: () => resolve(null),
      }).render(true);
    });
  }

  /**
   * 触发 Roguelike 抽取流程
   *
   * @example
   * game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
   *   actor: game.user.character,
   *   totalDraws: 3,
   *   itemsPerDraw: 3,
   *   selectablePerDraw: 1,
   *   contentTypes: ['feat'],
   *   levelRange: { min: 1, max: 5 },
   *   requiredTraits: ['general'],
   *   excludedTraits: ['downtime']
   * });
   */
  static async draw(config: RoguelikeDrawConfig = {}): Promise<RoguelikeDrawApp | null> {
    const actor = await this.resolveActor(config.actor);

    if (!actor) {
      (globalThis as any).ui?.notifications?.warn('未选择角色，抽取已取消');
      return null;
    }

    const resolvedConfig: RoguelikeDrawConfig = {
      ...config,
      actor,
      totalDraws: config.totalDraws ?? 1,
      itemsPerDraw: config.itemsPerDraw ?? 3,
      selectablePerDraw: config.selectablePerDraw ?? 1,
      contentTypes: config.contentTypes ?? ['feat'],
      featCategories: config.featCategories ?? [],
      levelRange: config.levelRange ?? { min: 0, max: 20 },
      rarityFilter: config.rarityFilter ?? [],
      requiredTraits: config.requiredTraits ?? [],
      excludedTraits: config.excludedTraits ?? [],
      banListIds: config.banListIds ?? [],
      allowDuplicates: config.allowDuplicates ?? false,
      title: config.title,
    };

    if (resolvedConfig.selectablePerDraw! > resolvedConfig.itemsPerDraw!) {
      resolvedConfig.selectablePerDraw = resolvedConfig.itemsPerDraw;
    }

    await RoguelikeDrawService.initTabs(resolvedConfig.contentTypes!);

    const pool = RoguelikeDrawService.buildItemPool(resolvedConfig);
    if (pool.length === 0) {
      (globalThis as any).ui?.notifications?.warn('当前筛选条件下没有可用物品，请调整筛选条件');
      throw new Error('物品池为空');
    }

    if (pool.length < resolvedConfig.itemsPerDraw!) {
      console.warn(
        `[RoguelikeMacroAPI] 物品池(${pool.length})小于每轮抽取数(${resolvedConfig.itemsPerDraw})，将自动调整`
      );
      resolvedConfig.itemsPerDraw = pool.length;
      if (resolvedConfig.selectablePerDraw! > resolvedConfig.itemsPerDraw) {
        resolvedConfig.selectablePerDraw = resolvedConfig.itemsPerDraw;
      }
    }

    const app = new RoguelikeDrawApp(resolvedConfig, pool);
    app.render(true);
    return app;
  }

  /**
   * 打开 Roguelike 宏生成器（仅 GM）
   */
  static async openGenerator(): Promise<void> {
    if (!(game as any).user?.isGM) {
      (globalThis as any).ui?.notifications?.error('只有 GM 可以使用宏生成器');
      return;
    }

    const { RoguelikeMacroGeneratorApp } = await import('../ui/roguelike-macro-generator-app');
    const app = new RoguelikeMacroGeneratorApp();
    app.render(true);
  }
}

export const ROGUELIKE_MACRO_EXAMPLES = {
  basic: `// 基础抽取：3轮，每轮3个专长，选1个（自动弹出角色选择）
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  totalDraws: 3,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['feat'],
  levelRange: { min: 1, max: 5 }
});`,

  spellDraw: `// 法术抽取：1轮5个法术，选2个
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  totalDraws: 1,
  itemsPerDraw: 5,
  selectablePerDraw: 2,
  contentTypes: ['spell'],
  levelRange: { min: 1, max: 3 },
  rarityFilter: ['common', 'uncommon']
});`,

  tokenDraw: `// 使用当前选中 Token 的角色
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 2,
  itemsPerDraw: 4,
  selectablePerDraw: 1,
  contentTypes: ['spell', 'equipment'],
  levelRange: { min: 1, max: 10 },
  excludedTraits: ['rare', 'unique']
});`,

  traitFiltered: `// 按特征筛选：只抽取战斗相关通用专长
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  totalDraws: 1,
  itemsPerDraw: 5,
  selectablePerDraw: 2,
  contentTypes: ['feat'],
  levelRange: { min: 1, max: 8 },
  requiredTraits: ['general'],
  excludedTraits: ['downtime', 'skill']
});`,

  openGenerator: `// 打开宏生成器（仅GM）
game.modules.get('ai-pf2e-assistant').api.roguelike.openGenerator();`,
};
