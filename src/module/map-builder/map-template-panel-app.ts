import { MODULE_ID } from '../constants';
import { MapTemplate, MapDropData, MapRotation, MapStyleConfig } from './types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapTemplateEditorApp } from './map-template-editor-app';
import { MapStyleConfigApp } from './map-style-config-app';
import { MapDropHandler } from './map-drop-handler';
import { MapTileGalleryApp } from './map-tile-gallery-app';
import { MapImageGenerationService } from './map-image-generation-service';
import { MapRotationHelper } from './map-rotation-helper';

declare const Application: any;
declare const foundry: any;
declare const ui: any;
declare const Dialog: any;
declare const canvas: any;

export class MapTemplatePanelApp extends Application {
  private static _instance: MapTemplatePanelApp | null = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'map-template-panel',
      template: `modules/${MODULE_ID}/templates/map-template-panel.hbs`,
      width: 380,
      height: 520,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'map-template-panel-app'],
    });
  }

  get title(): string {
    return '地图模板面板';
  }

  static open(): MapTemplatePanelApp {
    if (!MapTemplatePanelApp._instance) {
      MapTemplatePanelApp._instance = new MapTemplatePanelApp();
    }
    MapTemplatePanelApp._instance.render(true);
    return MapTemplatePanelApp._instance;
  }

  getData(): any {
    const service = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();
    const templates = service.getAll();
    return {
      hasTemplates: templates.length > 0,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        thumbnail: guideService.toThumbnail(t, 128),
      })),
    };
  }

  // 覆盖 toObject，防止 Foundry 序列化实例属性
  toObject(): any {
    return {
      id: this.id,
      appId: this.appId,
    };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    // Panel header buttons
    html.find('.panel-btn[data-action="new"]').on('click', () => this._onNew());
    html.find('.panel-btn[data-action="presets"]').on('click', () => this._onLoadPresets());
    html.find('.panel-btn[data-action="style"]').on('click', () => this._onOpenStyle());
    html.find('.panel-btn[data-action="gallery"]').on('click', () => this._onOpenGallery());

    // Search & batch actions
    const searchInput = html.find('input[name="templateSearch"]');
    const batchActions = html.find('.batch-actions');
    const batchCount = html.find('.batch-count');
    const cards = html.find('.template-card');
    const checkboxes = html.find('.template-select-cb');

    const updateBatchUI = () => {
      const checked = html.find('.template-select-cb:checked');
      const count = checked.length;
      if (count > 0) {
        batchActions.show();
      } else {
        batchActions.hide();
      }
      batchCount.text(count.toString());
    };

    searchInput.on('input', (ev: any) => {
      const query = (ev.target.value || '').toLowerCase().trim();
      cards.each((_: number, card: HTMLElement) => {
        const name = card.querySelector('.template-name')?.textContent?.toLowerCase() || '';
        const desc = card.querySelector('.template-desc')?.textContent?.toLowerCase() || '';
        const visible = !query || name.includes(query) || desc.includes(query);
        card.style.display = visible ? '' : 'none';
      });
    });

    checkboxes.on('change', () => updateBatchUI());

    // Prevent checkbox click from triggering card drag
    html.find('.template-checkbox-wrap').on('click', (ev: any) => ev.stopPropagation());

    html.find('.batch-select-all-btn').on('click', () => {
      cards.each((_: number, card: HTMLElement) => {
        if (card.style.display !== 'none') {
          const cb = card.querySelector('.template-select-cb') as HTMLInputElement;
          if (cb) cb.checked = true;
        }
      });
      updateBatchUI();
    });

    html.find('.batch-deselect-btn').on('click', () => {
      checkboxes.prop('checked', false);
      updateBatchUI();
    });

    html.find('.batch-delete-btn').on('click', () => {
      const selected: string[] = [];
      html.find('.template-select-cb:checked').each((_: number, cb: HTMLInputElement) => {
        if (cb.dataset.templateId) selected.push(cb.dataset.templateId);
      });
      if (selected.length === 0) return;
      this._onBatchDelete(selected);
    });

    // Template card actions
    html.find('.template-action-btn').on('click', (ev: any) => {
      ev.stopPropagation();
      const action = ev.currentTarget.dataset.action;
      const id = ev.currentTarget.dataset.templateId;
      if (!id) return;
      switch (action) {
        case 'place': this._onPlace(id); break;
        case 'generate': this._onGenerate(id); break;
        case 'template-gallery': this._onTemplateGallery(id); break;
        case 'edit': this._onEdit(id); break;
        case 'duplicate': this._onDuplicate(id); break;
        case 'delete': this._onDelete(id); break;
      }
    });

    // Drag start on template cards
    html.find('.template-card').on('dragstart', (ev: any) => {
      const templateId = (ev.currentTarget as HTMLElement).dataset.templateId;
      if (!templateId) return;
      const dragData: MapDropData = { type: 'MapTemplate', templateId };
      const dataStr = JSON.stringify(dragData);
      const dt = ev.originalEvent?.dataTransfer;
      if (dt) {
        dt.setData('text/plain', dataStr);
        dt.setData('application/json', dataStr);
        dt.effectAllowed = 'copy';
      }
    });
  }

  private _onPlace(id: string): void {
    if (!canvas?.scene) {
      ui.notifications.warn('请先打开一个场景');
      return;
    }
    MapDropHandler.placeAtCenter(id);
  }

  private _onGenerate(id: string): void {
    const service = MapTemplateService.getInstance();
    const template = service.getById(id);
    if (!template) return;

    const content = `
      <div style="padding:8px;">
        <p style="margin-bottom:8px;">选择生成方向（可同时选择多个）：</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <label style="cursor:pointer;"><input type="checkbox" name="rot" value="0" checked /> ↑ 北 (0°)</label>
          <label style="cursor:pointer;"><input type="checkbox" name="rot" value="90" /> → 东 (90°)</label>
          <label style="cursor:pointer;"><input type="checkbox" name="rot" value="180" /> ↓ 南 (180°)</label>
          <label style="cursor:pointer;"><input type="checkbox" name="rot" value="270" /> ← 西 (270°)</label>
        </div>
      </div>`;

    Dialog.confirm({
      title: `生成图块 — ${template.name}`,
      content,
      yes: async (html: any) => {
        const checked = html.find('input[name="rot"]:checked');
        const rotations: MapRotation[] = [];
        checked.each((_: number, el: HTMLInputElement) => {
          rotations.push(parseInt(el.value, 10) as MapRotation);
        });
        if (rotations.length === 0) {
          ui.notifications.warn('请至少选择一个方向');
          return;
        }
        for (const rot of rotations) {
          await this._generateTileImage(template, rot);
        }
      },
    });
  }

  private async _generateTileImage(template: MapTemplate, rotation: MapRotation): Promise<void> {
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.warn('请先打开一个场景（需要场景的风格配置）');
      return;
    }
    const styleConfig = (scene.getFlag(MODULE_ID, 'mapStyle') as MapStyleConfig) || {} as MapStyleConfig;
    if (!styleConfig.stylePrompt) {
      ui.notifications.warn('请先在「风格配置」中设置提示词');
      return;
    }

    const rotLabel = ['↑北', '→东', '↓南', '←西'][rotation / 90] || `${rotation}°`;
    ui.notifications.info(`开始生成「${template.name}」(${rotLabel}) 的图块...`);

    try {
      const rotated = MapRotationHelper.rotateTemplate(template, rotation);
      const genService = MapImageGenerationService.getInstance();
      await genService.generateMapImage(rotated, styleConfig, rotation);
      ui.notifications.info(`「${template.name}」(${rotLabel}) 图块生成完成！`);
    } catch (err: any) {
      ui.notifications.error(`图块生成失败: ${err.message}`);
    }
  }

  private _onNew(): void {
    new MapTemplateEditorApp(undefined, () => this.render(false)).render(true);
  }

  private async _onLoadPresets(): Promise<void> {
    const service = MapTemplateService.getInstance();
    const presets = service.getPresets();
    for (const p of presets) {
      const existing = service.getById(p.id);
      if (!existing) {
        await service.save(p);
      }
    }
    ui.notifications.info(`已加载 ${presets.length} 个预设模板`);
    this.render(false);
  }

  private _onOpenStyle(): void {
    new MapStyleConfigApp().render(true);
  }

  private _onOpenGallery(): void {
    new MapTileGalleryApp().render(true);
  }

  private _onTemplateGallery(id: string): void {
    new MapTileGalleryApp(id).render(true);
  }

  private _onEdit(id: string): void {
    const service = MapTemplateService.getInstance();
    const template = service.getById(id);
    if (!template) return;
    new MapTemplateEditorApp(template, () => this.render(false)).render(true);
  }

  private async _onDuplicate(id: string): Promise<void> {
    const service = MapTemplateService.getInstance();
    const template = service.getById(id);
    if (!template) return;
    const copy: MapTemplate = JSON.parse(JSON.stringify(template));
    copy.id = foundry.utils.randomID();
    copy.name = `${template.name} (副本)`;
    await service.save(copy);
    this.render(false);
  }

  private _onDelete(id: string): void {
    const service = MapTemplateService.getInstance();
    const template = service.getById(id);
    if (!template) return;
    Dialog.confirm({
      title: '删除模板',
      content: `<p>确定要删除模板「${template.name}」吗？此操作不可撤销。</p>`,
      yes: async () => {
        await service.remove(id);
        this.render(false);
        ui.notifications.info('模板已删除');
      },
    });
  }

  private _onBatchDelete(ids: string[]): void {
    const service = MapTemplateService.getInstance();
    const names = ids
      .map(id => service.getById(id)?.name || id)
      .slice(0, 5)
      .join('、');
    const suffix = ids.length > 5 ? `…等共 ${ids.length} 个` : `共 ${ids.length} 个`;
    Dialog.confirm({
      title: '批量删除模板',
      content: `<p>确定要删除以下模板吗？此操作不可撤销。</p><p style="color:#cc6600;font-size:0.9em;">${names}（${suffix}）</p>`,
      yes: async () => {
        await service.removeMany(ids);
        this.render(false);
        ui.notifications.info(`已删除 ${ids.length} 个模板`);
      },
    });
  }

  close(options?: any): Promise<void> {
    MapTemplatePanelApp._instance = null;
    return super.close(options);
  }
}
