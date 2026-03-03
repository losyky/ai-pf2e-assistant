import { MODULE_ID } from '../constants';
import { MapTemplate, MapDropData } from './types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapTemplateEditorApp } from './map-template-editor-app';
import { MapStyleConfigApp } from './map-style-config-app';
import { MapDropHandler } from './map-drop-handler';

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

    // Template card actions
    html.find('.template-action-btn').on('click', (ev: any) => {
      ev.stopPropagation();
      const action = ev.currentTarget.dataset.action;
      const id = ev.currentTarget.dataset.templateId;
      if (!id) return;
      switch (action) {
        case 'place': this._onPlace(id); break;
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

  close(options?: any): Promise<void> {
    MapTemplatePanelApp._instance = null;
    return super.close(options);
  }
}
