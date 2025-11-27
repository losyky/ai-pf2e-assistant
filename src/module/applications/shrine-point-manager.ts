import { ShrinePointService } from '../services/shrine-point-service';

/**
 * 神龛点数管理器应用 - 使用ApplicationV2 + HandlebarsApplicationMixin
 */
export class ShrinePointManager extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'shrine-point-manager',
    tag: 'div',
    window: {
      title: (game as any).i18n?.localize('AIPF2E.ShrinePointManager.title') || 'Shrine Point Manager',
      icon: 'fas fa-coins',
      resizable: true
    },
    position: {
      width: 600,
      height: 'auto'
    },
    classes: ['shrine-point-manager-app']
  };

  static PARTS = {
    main: {
      template: 'modules/ai-pf2e-assistant/templates/shrine-point-manager.hbs'
    }
  };

  /**
   * 准备渲染上下文数据
   */
  async _prepareContext(options: any): Promise<any> {
    const isGM = ShrinePointService.isGM();
    const selectedActor = this.getSelectedActor();

    // 获取所有角色及其点数
    const actors = this.getAllActorsWithPoints();

    return {
      isGM,
      selectedActor: selectedActor ? {
        id: selectedActor.id,
        name: selectedActor.name,
        img: selectedActor.img
      } : null,
      currentPoints: selectedActor ? ShrinePointService.getActorPoints(selectedActor) : 0,
      actors
    };
  }

  /**
   * 获取当前选中的角色
   */
  private getSelectedActor(): any {
    try {
      // 优先使用当前选中的token对应的角色
      const controlled = canvas?.tokens?.controlled;
      if (controlled && controlled.length > 0) {
        return controlled[0].actor;
      }

      // 其次使用当前用户的角色
      const user = game.user;
      if (user?.character) {
        return user.character;
      }

      // 最后使用第一个拥有的角色
      const ownedActors = game.actors?.filter((actor: any) => 
        actor.type === 'character' && actor.isOwner
      );
      
      return ownedActors && ownedActors.length > 0 ? ownedActors[0] : null;
    } catch (error) {
      console.warn('获取选中角色失败:', error);
      return null;
    }
  }

  /**
   * 获取所有角色及其点数
   */
  private getAllActorsWithPoints(): any[] {
    try {
      const actors = game.actors?.filter((actor: any) => actor.type === 'character') || [];
      
      return actors.map((actor: any) => ({
        id: actor.id,
        name: actor.name,
        img: actor.img || 'icons/svg/mystery-man.svg',
        points: ShrinePointService.getActorPoints(actor),
        isOwned: actor.isOwner
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('获取角色列表失败:', error);
      return [];
    }
  }

  /**
   * 激活监听器
   */
  _onRender(context: any, options: any): void {
    const html = $(this.element);

    // 关闭按钮
    html.find('.close-btn').on('click', () => {
      this.close();
    });

    // GM功能按钮
    if (ShrinePointService.isGM()) {
      html.find('.set-points-btn').on('click', (event) => {
        this.handleSetPoints(event);
      });

      html.find('.add-points-btn').on('click', (event) => {
        this.handleAddPoints(event);
      });

      html.find('.distribute-points-btn').on('click', (event) => {
        this.handleDistributePoints(event);
      });

      html.find('.reset-points-btn').on('click', (event) => {
        this.handleResetPoints(event);
      });
    }
  }

  /**
   * 处理设置点数
   */
  private async handleSetPoints(event: JQuery.ClickEvent): Promise<void> {
    event.preventDefault();
    
    try {
      const html = $(event.currentTarget).closest('.shrine-point-manager');
      const actorId = html.find('.target-actor-select').val() as string;
      const points = parseInt(html.find('#point-amount').val() as string) || 0;

      if (!actorId) {
        ui.notifications?.warn((game as any).i18n.localize('AIPF2E.ShrinePointManager.selectActor'));
        return;
      }

      const actor = game.actors?.get(actorId);
      if (!actor) {
        ui.notifications?.error((game as any).i18n.localize('AIPF2E.ShrinePointManager.actorNotFound'));
        return;
      }

      await ShrinePointService.setActorPoints(actor, points);
      ui.notifications?.info((game as any).i18n.format('AIPF2E.ShrinePointManager.setPointsSuccess', { name: actor.name, points }));
      
      // 刷新界面
      this.render({ force: false });
    } catch (error) {
      console.error('设置点数失败:', error);
      ui.notifications?.error(`${(game as any).i18n.localize('AIPF2E.ShrinePointManager.setPointsFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理增加点数
   */
  private async handleAddPoints(event: JQuery.ClickEvent): Promise<void> {
    event.preventDefault();
    
    try {
      const html = $(event.currentTarget).closest('.shrine-point-manager');
      const actorId = html.find('.target-actor-select').val() as string;
      const points = parseInt(html.find('#point-amount').val() as string) || 0;

      if (!actorId) {
        ui.notifications?.warn((game as any).i18n.localize('AIPF2E.ShrinePointManager.selectActor'));
        return;
      }

      if (points <= 0) {
        ui.notifications?.warn((game as any).i18n.localize('AIPF2E.ShrinePointManager.pointsMustBePositive'));
        return;
      }

      const actor = game.actors?.get(actorId);
      if (!actor) {
        ui.notifications?.error((game as any).i18n.localize('AIPF2E.ShrinePointManager.actorNotFound'));
        return;
      }

      const newPoints = await ShrinePointService.addActorPoints(actor, points);
      ui.notifications?.info((game as any).i18n.format('AIPF2E.ShrinePointManager.addPointsSuccess', { name: actor.name, points, total: newPoints }));
      
      // 刷新界面
      this.render({ force: false });
    } catch (error) {
      console.error('增加点数失败:', error);
      ui.notifications?.error(`${(game as any).i18n.localize('AIPF2E.ShrinePointManager.addPointsFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理批量发放点数
   */
  private async handleDistributePoints(event: JQuery.ClickEvent): Promise<void> {
    event.preventDefault();
    
    try {
      const html = $(event.currentTarget).closest('.shrine-point-manager');
      const points = parseInt(html.find('#batch-points').val() as string) || 0;

      if (points <= 0) {
        ui.notifications?.warn((game as any).i18n.localize('AIPF2E.ShrinePointManager.distributePointsMustBePositive'));
        return;
      }

      // 确认对话框
      const confirmed = await Dialog.confirm({
        title: (game as any).i18n.localize('AIPF2E.ShrinePointManager.confirmDistribute'),
        content: `<p>${(game as any).i18n.format('AIPF2E.ShrinePointManager.confirmDistributeMessage', { points })}</p>`,
        yes: () => true,
        no: () => false
      });

      if (!confirmed) {
        return;
      }

      const result = await ShrinePointService.distributePointsToParty(points);
      
      if (result.success.length > 0) {
        ui.notifications?.info((game as any).i18n.format('AIPF2E.ShrinePointManager.distributeSuccess', { count: result.success.length, points }));
      }
      
      if (result.failed.length > 0) {
        ui.notifications?.warn((game as any).i18n.format('AIPF2E.ShrinePointManager.distributeFailed', { count: result.failed.length, names: result.failed.join(', ') }));
      }
      
      // 刷新界面
      this.render({ force: false });
    } catch (error) {
      console.error('批量发放点数失败:', error);
      ui.notifications?.error(`${(game as any).i18n.localize('AIPF2E.ShrinePointManager.distributeBatchFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理重置所有点数
   */
  private async handleResetPoints(event: JQuery.ClickEvent): Promise<void> {
    event.preventDefault();
    
    try {
      // 确认对话框
      const confirmed = await Dialog.confirm({
        title: (game as any).i18n.localize('AIPF2E.ShrinePointManager.confirmReset'),
        content: (game as any).i18n.localize('AIPF2E.ShrinePointManager.confirmResetMessage'),
        yes: () => true,
        no: () => false
      });

      if (!confirmed) {
        return;
      }

      const result = await ShrinePointService.resetAllPoints();
      
      if (result.success.length > 0) {
        ui.notifications?.info((game as any).i18n.format('AIPF2E.ShrinePointManager.resetSuccess', { count: result.success.length }));
      }
      
      if (result.failed.length > 0) {
        ui.notifications?.warn((game as any).i18n.format('AIPF2E.ShrinePointManager.resetFailed', { count: result.failed.length, names: result.failed.join(', ') }));
      }
      
      // 刷新界面
      this.render({ force: false });
    } catch (error) {
      console.error('重置点数失败:', error);
      ui.notifications?.error(`${(game as any).i18n.localize('AIPF2E.ShrinePointManager.resetBatchFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 静态方法：显示点数管理器
   */
  static show(): ShrinePointManager {
    const manager = new ShrinePointManager();
    manager.render({ force: true });
    return manager;
  }
}
