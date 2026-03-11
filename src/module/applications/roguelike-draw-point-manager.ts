import { RoguelikeDrawPointService, RoguelikeMacroPointConfig } from '../services/roguelike-draw-point-service';

const MODULE_ID = 'ai-pf2e-assistant';

export class RoguelikeDrawPointManager extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  private activeTab: 'general' | 'macro' = 'general';
  private selectedMacroUuid: string | null = null;

  static DEFAULT_OPTIONS = {
    id: 'roguelike-draw-point-manager',
    tag: 'div',
    window: {
      title: (game as any).i18n?.localize('AIPF2E.RoguelikeDrawPoint.title') || 'Roguelike Draw Point Manager',
      icon: 'fas fa-dice-d20',
      resizable: true
    },
    position: {
      width: 650,
      height: 'auto'
    },
    classes: ['roguelike-draw-point-manager-app']
  };

  static PARTS = {
    main: {
      template: 'modules/ai-pf2e-assistant/templates/roguelike-draw-point-manager.hbs'
    }
  };

  async _prepareContext(_options: any): Promise<any> {
    const isGM = RoguelikeDrawPointService.isGM();
    const trackedMacros = RoguelikeDrawPointService.getTrackedMacros();
    const actors = RoguelikeDrawPointService.getAllActorsWithPoints();
    const selectedActor = this.getSelectedActor();

    const selectedMacro = this.selectedMacroUuid
      ? trackedMacros.find(m => m.uuid === this.selectedMacroUuid) || null
      : null;

    const actorsWithMacroPoints = this.selectedMacroUuid
      ? actors.map(a => ({
          ...a,
          selectedMacroPoints: a.macroPoints[this.selectedMacroUuid!] || 0
        }))
      : actors;

    return {
      isGM,
      activeTab: this.activeTab,
      trackedMacros,
      actors: actorsWithMacroPoints,
      selectedActor: selectedActor ? {
        id: selectedActor.id,
        name: selectedActor.name,
        img: selectedActor.img
      } : null,
      currentGeneralPoints: selectedActor ? RoguelikeDrawPointService.getGeneralPoints(selectedActor) : 0,
      selectedMacro,
      selectedMacroUuid: this.selectedMacroUuid
    };
  }

  private getSelectedActor(): any {
    try {
      const controlled = (globalThis as any).canvas?.tokens?.controlled;
      if (controlled && controlled.length > 0) return controlled[0].actor;
      if (game.user?.character) return game.user.character;
      const owned = game.actors?.filter((a: any) => a.type === 'character' && a.isOwner);
      return owned && owned.length > 0 ? owned[0] : null;
    } catch {
      return null;
    }
  }

  _onRender(_context: any, _options: any): void {
    const html = $(this.element);

    // Tab 切换
    html.find('.rdpm-tab').on('click', (ev) => {
      this.activeTab = (ev.currentTarget as HTMLElement).dataset.tab as 'general' | 'macro';
      this.render({ force: false });
    });

    // 关闭
    html.find('.close-btn').on('click', () => this.close());

    if (!RoguelikeDrawPointService.isGM()) return;

    // ===== 通用点数操作 =====
    html.find('.rdpm-set-general-btn').on('click', (ev) => this.handleSetGeneralPoints(ev));
    html.find('.rdpm-add-general-btn').on('click', (ev) => this.handleAddGeneralPoints(ev));
    html.find('.rdpm-distribute-general-btn').on('click', (ev) => this.handleDistributeGeneralPoints(ev));
    html.find('.rdpm-reset-general-btn').on('click', () => this.handleResetGeneralPoints());

    // ===== 宏点数操作 =====
    html.find('.rdpm-set-macro-btn').on('click', (ev) => this.handleSetMacroPoints(ev));
    html.find('.rdpm-add-macro-btn').on('click', (ev) => this.handleAddMacroPoints(ev));
    html.find('.rdpm-distribute-macro-btn').on('click', (ev) => this.handleDistributeMacroPoints(ev));
    html.find('.rdpm-reset-macro-btn').on('click', () => this.handleResetMacroPoints());

    // ===== 追踪宏管理 =====
    html.find('.rdpm-remove-tracked-macro').on('click', (ev) => {
      const uuid = (ev.currentTarget as HTMLElement).dataset.uuid;
      if (uuid) this.removeTrackedMacro(uuid);
    });

    html.find('.rdpm-select-tracked-macro').on('click', (ev) => {
      const uuid = (ev.currentTarget as HTMLElement).closest('.rdpm-tracked-macro-row')?.getAttribute('data-uuid');
      if (uuid) {
        this.selectedMacroUuid = this.selectedMacroUuid === uuid ? null : uuid;
        this.render({ force: false });
      }
    });

    // 拖拽区域
    const dropZone = html.find('.rdpm-macro-drop-zone')[0];
    if (dropZone) {
      dropZone.addEventListener('dragover', (ev: DragEvent) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', (ev: DragEvent) => {
        const related = ev.relatedTarget as HTMLElement | null;
        if (!related || !dropZone.contains(related)) {
          dropZone.classList.remove('drag-over');
        }
      });
      dropZone.addEventListener('drop', (ev: DragEvent) => {
        ev.preventDefault();
        dropZone.classList.remove('drag-over');
        this.handleMacroDrop(ev);
      });
    }
  }

  // ===== 通用点数处理 =====

  private async handleSetGeneralPoints(ev: JQuery.ClickEvent): Promise<void> {
    ev.preventDefault();
    const html = $(ev.currentTarget).closest('.rdpm-general-controls');
    const actorId = html.find('.rdpm-target-actor').val() as string;
    const points = parseInt(html.find('.rdpm-point-input').val() as string) || 0;
    if (!actorId) { ui.notifications?.warn('请选择角色'); return; }
    const actor = game.actors?.get(actorId);
    if (!actor) { ui.notifications?.error('角色不存在'); return; }
    try {
      await RoguelikeDrawPointService.setGeneralPoints(actor, points);
      ui.notifications?.info(`已设置 ${actor.name} 的通用抽取点数为 ${points}`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`设置失败: ${err}`);
    }
  }

  private async handleAddGeneralPoints(ev: JQuery.ClickEvent): Promise<void> {
    ev.preventDefault();
    const html = $(ev.currentTarget).closest('.rdpm-general-controls');
    const actorId = html.find('.rdpm-target-actor').val() as string;
    const points = parseInt(html.find('.rdpm-point-input').val() as string) || 0;
    if (!actorId) { ui.notifications?.warn('请选择角色'); return; }
    if (points <= 0) { ui.notifications?.warn('点数必须大于0'); return; }
    const actor = game.actors?.get(actorId);
    if (!actor) { ui.notifications?.error('角色不存在'); return; }
    try {
      const newTotal = await RoguelikeDrawPointService.addGeneralPoints(actor, points);
      ui.notifications?.info(`已为 ${actor.name} 增加 ${points} 通用抽取点数，当前: ${newTotal}`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`增加失败: ${err}`);
    }
  }

  private async handleDistributeGeneralPoints(ev: JQuery.ClickEvent): Promise<void> {
    ev.preventDefault();
    const html = $(ev.currentTarget).closest('.rdpm-batch-general');
    const points = parseInt(html.find('.rdpm-batch-input').val() as string) || 0;
    if (points <= 0) { ui.notifications?.warn('点数必须大于0'); return; }

    const confirmed = await Dialog.confirm({
      title: '批量发放通用点数',
      content: `<p>确定要给所有玩家角色发放 ${points} 通用抽取点数吗？</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    try {
      const result = await RoguelikeDrawPointService.distributeGeneralPoints(points);
      if (result.success.length > 0) ui.notifications?.info(`已给 ${result.success.length} 个角色发放 ${points} 通用抽取点数`);
      if (result.failed.length > 0) ui.notifications?.warn(`${result.failed.length} 个角色发放失败`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`批量发放失败: ${err}`);
    }
  }

  private async handleResetGeneralPoints(): Promise<void> {
    const confirmed = await Dialog.confirm({
      title: '重置所有通用点数',
      content: '<p>确定要重置所有角色的通用抽取点数为 0 吗？此操作不可撤销。</p>',
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    try {
      const result = await RoguelikeDrawPointService.resetAllGeneralPoints();
      if (result.success.length > 0) ui.notifications?.info(`已重置 ${result.success.length} 个角色的通用抽取点数`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`重置失败: ${err}`);
    }
  }

  // ===== 宏点数处理 =====

  private async handleSetMacroPoints(ev: JQuery.ClickEvent): Promise<void> {
    ev.preventDefault();
    if (!this.selectedMacroUuid) { ui.notifications?.warn('请先选择一个追踪宏'); return; }
    const html = $(ev.currentTarget).closest('.rdpm-macro-controls');
    const actorId = html.find('.rdpm-target-actor').val() as string;
    const points = parseInt(html.find('.rdpm-point-input').val() as string) || 0;
    if (!actorId) { ui.notifications?.warn('请选择角色'); return; }
    const actor = game.actors?.get(actorId);
    if (!actor) { ui.notifications?.error('角色不存在'); return; }
    try {
      await RoguelikeDrawPointService.setMacroPoints(actor, this.selectedMacroUuid, points);
      const macroName = RoguelikeDrawPointService.getTrackedMacros().find(m => m.uuid === this.selectedMacroUuid)?.name || '宏';
      ui.notifications?.info(`已设置 ${actor.name} 的「${macroName}」点数为 ${points}`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`设置失败: ${err}`);
    }
  }

  private async handleAddMacroPoints(ev: JQuery.ClickEvent): Promise<void> {
    ev.preventDefault();
    if (!this.selectedMacroUuid) { ui.notifications?.warn('请先选择一个追踪宏'); return; }
    const html = $(ev.currentTarget).closest('.rdpm-macro-controls');
    const actorId = html.find('.rdpm-target-actor').val() as string;
    const points = parseInt(html.find('.rdpm-point-input').val() as string) || 0;
    if (!actorId) { ui.notifications?.warn('请选择角色'); return; }
    if (points <= 0) { ui.notifications?.warn('点数必须大于0'); return; }
    const actor = game.actors?.get(actorId);
    if (!actor) { ui.notifications?.error('角色不存在'); return; }
    try {
      const newTotal = await RoguelikeDrawPointService.addMacroPoints(actor, this.selectedMacroUuid, points);
      const macroName = RoguelikeDrawPointService.getTrackedMacros().find(m => m.uuid === this.selectedMacroUuid)?.name || '宏';
      ui.notifications?.info(`已为 ${actor.name} 增加 ${points}「${macroName}」点数，当前: ${newTotal}`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`增加失败: ${err}`);
    }
  }

  private async handleDistributeMacroPoints(ev: JQuery.ClickEvent): Promise<void> {
    ev.preventDefault();
    if (!this.selectedMacroUuid) { ui.notifications?.warn('请先选择一个追踪宏'); return; }
    const html = $(ev.currentTarget).closest('.rdpm-batch-macro');
    const points = parseInt(html.find('.rdpm-batch-input').val() as string) || 0;
    if (points <= 0) { ui.notifications?.warn('点数必须大于0'); return; }

    const macroName = RoguelikeDrawPointService.getTrackedMacros().find(m => m.uuid === this.selectedMacroUuid)?.name || '宏';
    const confirmed = await Dialog.confirm({
      title: '批量发放宏点数',
      content: `<p>确定要给所有玩家角色发放 ${points}「${macroName}」点数吗？</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    try {
      const result = await RoguelikeDrawPointService.distributeMacroPoints(this.selectedMacroUuid, points);
      if (result.success.length > 0) ui.notifications?.info(`已给 ${result.success.length} 个角色发放 ${points}「${macroName}」点数`);
      if (result.failed.length > 0) ui.notifications?.warn(`${result.failed.length} 个角色发放失败`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`批量发放失败: ${err}`);
    }
  }

  private async handleResetMacroPoints(): Promise<void> {
    if (!this.selectedMacroUuid) { ui.notifications?.warn('请先选择一个追踪宏'); return; }
    const macroName = RoguelikeDrawPointService.getTrackedMacros().find(m => m.uuid === this.selectedMacroUuid)?.name || '宏';

    const confirmed = await Dialog.confirm({
      title: '重置宏点数',
      content: `<p>确定要重置所有角色的「${macroName}」点数为 0 吗？</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    try {
      const result = await RoguelikeDrawPointService.resetAllMacroPoints(this.selectedMacroUuid);
      if (result.success.length > 0) ui.notifications?.info(`已重置 ${result.success.length} 个角色的「${macroName}」点数`);
      this.render({ force: false });
    } catch (err) {
      ui.notifications?.error(`重置失败: ${err}`);
    }
  }

  // ===== 追踪宏管理 =====

  private async handleMacroDrop(ev: DragEvent): Promise<void> {
    if (!ev.dataTransfer) return;

    let data: any;
    try {
      data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }

    const uuid: string = data.uuid || '';
    if (!uuid) return;

    try {
      const doc = await (globalThis as any).fromUuid(uuid);
      if (!doc || doc.documentName !== 'Macro') {
        ui.notifications?.warn('请拖入宏（Macro）文档');
        return;
      }

      const tracked = RoguelikeDrawPointService.getTrackedMacros();
      if (tracked.some(m => m.uuid === uuid)) {
        ui.notifications?.warn(`宏「${doc.name}」已在追踪列表中`);
        return;
      }

      const config: RoguelikeMacroPointConfig = {
        uuid,
        name: doc.name || 'Unknown Macro',
        img: doc.img || 'icons/svg/dice-target.svg'
      };

      tracked.push(config);
      await RoguelikeDrawPointService.setTrackedMacros(tracked);
      ui.notifications?.info(`已添加追踪宏「${config.name}」`);
      this.render({ force: false });
    } catch (err) {
      console.error('[RoguelikeDrawPointManager] Drop failed', err);
      ui.notifications?.error('添加追踪宏失败');
    }
  }

  private async removeTrackedMacro(uuid: string): Promise<void> {
    const tracked = RoguelikeDrawPointService.getTrackedMacros();
    const macro = tracked.find(m => m.uuid === uuid);
    if (!macro) return;

    const confirmed = await Dialog.confirm({
      title: '移除追踪宏',
      content: `<p>确定要移除追踪宏「${macro.name}」吗？已发放的该宏点数不会被删除。</p>`,
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return;

    const newTracked = tracked.filter(m => m.uuid !== uuid);
    await RoguelikeDrawPointService.setTrackedMacros(newTracked);
    if (this.selectedMacroUuid === uuid) this.selectedMacroUuid = null;
    this.render({ force: false });
  }

  static show(): RoguelikeDrawPointManager {
    const manager = new RoguelikeDrawPointManager();
    manager.render({ force: true });
    return manager;
  }
}
