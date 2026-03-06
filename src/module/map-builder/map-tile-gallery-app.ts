import { MODULE_ID, MAP_TILES_DIR } from '../constants';
import { MapTemplateService } from './map-template-service';
import { MapDropHandler } from './map-drop-handler';
import { Logger } from '../utils/logger';

declare const Application: any;
declare const foundry: any;
declare const FilePicker: any;
declare const ui: any;
declare const Dialog: any;
declare const canvas: any;

interface TileFileInfo {
  path: string;
  filename: string;
  templateId: string;
  timestamp: number;
  timeLabel: string;
}

interface TileGroup {
  templateId: string;
  templateName: string;
  count: number;
  tiles: TileFileInfo[];
}

export class MapTileGalleryApp extends Application {
  private filterTemplateId: string | null;
  private tileData: { groups: TileGroup[]; hasAnyTiles: boolean } | null = null;

  constructor(filterTemplateId?: string) {
    super();
    this.filterTemplateId = filterTemplateId || null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'map-tile-gallery',
      template: `modules/${MODULE_ID}/templates/map-tile-gallery.hbs`,
      width: 560,
      height: 480,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'map-tile-gallery-app'],
    });
  }

  get title(): string {
    if (this.filterTemplateId) {
      const service = MapTemplateService.getInstance();
      const t = service.getById(this.filterTemplateId);
      return t ? `图块库 — ${t.name}` : '图块库';
    }
    return '已生成图块库';
  }

  async getData(): Promise<any> {
    if (!this.tileData) {
      await this._loadTileData();
    }
    const templateService = MapTemplateService.getInstance();
    const filterName = this.filterTemplateId
      ? (templateService.getById(this.filterTemplateId)?.name || null)
      : null;
    return {
      filterTemplateName: filterName,
      hasAnyTiles: this.tileData!.hasAnyTiles,
      groups: this.tileData!.groups,
    };
  }

  async _render(force?: boolean, options?: any): Promise<void> {
    await this._loadTileData();
    return super._render(force, options);
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    html.find('.tile-btn[data-action="place"]').on('click', (ev: any) => {
      ev.stopPropagation();
      const templateId = ev.currentTarget.dataset.templateId;
      const path = ev.currentTarget.dataset.path;
      if (templateId && path) this._onPlace(templateId, path);
    });

    html.find('.tile-btn[data-action="delete"]').on('click', (ev: any) => {
      ev.stopPropagation();
      const path = ev.currentTarget.dataset.path;
      if (path) this._onDelete(path);
    });

    html.find('.tile-item').on('click', (ev: any) => {
      const templateId = ev.currentTarget.dataset.templateId;
      const path = ev.currentTarget.dataset.path;
      if (templateId && path) this._onPlace(templateId, path);
    });
  }

  private async _onPlace(templateId: string, imagePath: string): Promise<void> {
    if (!canvas?.scene) {
      ui.notifications.warn('请先打开一个场景');
      return;
    }
    this.close();
    await MapDropHandler.placeWithExistingImage(templateId, imagePath);
  }

  private _onDelete(path: string): void {
    const filename = path.split('/').pop() || path;
    Dialog.confirm({
      title: '删除图块',
      content: `<p>确定要删除图块「${filename}」吗？此操作不可撤销。</p>`,
      yes: async () => {
        try {
          const route = foundry.utils.getRoute?.('files') || '/files';
          const resp = await fetch(route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', source: 'data', path }),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          Logger.debug('File deleted:', path);
          ui.notifications.info('图块已删除');
        } catch (err) {
          Logger.warn('File deletion via API failed, path:', path, err);
          ui.notifications.warn('自动删除失败，请手动从服务器文件系统中删除该文件。');
        }
        this.tileData = null;
        this.render(false);
      },
    });
  }

  private async _loadTileData(): Promise<void> {
    const allTiles: TileFileInfo[] = [];

    try {
      const result = await FilePicker.browse('data', MAP_TILES_DIR);

      for (const filePath of (result.files || [])) {
        const info = this._parseTileFile(filePath);
        if (info) allTiles.push(info);
      }

      const dirs: string[] = result.dirs || [];
      for (const dir of dirs) {
        try {
          const subResult = await FilePicker.browse('data', dir);
          for (const filePath of (subResult.files || [])) {
            const info = this._parseTileFile(filePath);
            if (info) allTiles.push(info);
          }
        } catch {
          // subdirectory may not exist or be empty
        }
      }
    } catch {
      Logger.debug('map-tiles directory not found or empty');
    }

    let filtered = allTiles;
    if (this.filterTemplateId) {
      filtered = allTiles.filter(t => t.templateId === this.filterTemplateId);
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const groupMap = new Map<string, TileFileInfo[]>();
    for (const tile of filtered) {
      const list = groupMap.get(tile.templateId) || [];
      list.push(tile);
      groupMap.set(tile.templateId, list);
    }

    const templateService = MapTemplateService.getInstance();
    const groups: TileGroup[] = Array.from(groupMap.entries()).map(([tid, tiles]) => {
      const template = templateService.getById(tid);
      return {
        templateId: tid,
        templateName: template?.name || `未知模板 (${tid.substring(0, 8)})`,
        count: tiles.length,
        tiles,
      };
    });

    groups.sort((a, b) => {
      const aMax = a.tiles[0]?.timestamp || 0;
      const bMax = b.tiles[0]?.timestamp || 0;
      return bMax - aMax;
    });

    this.tileData = {
      hasAnyTiles: filtered.length > 0,
      groups,
    };
  }

  private _parseTileFile(filePath: string): TileFileInfo | null {
    const filename = filePath.split('/').pop() || '';
    if (!filename.endsWith('.png') && !filename.endsWith('.webp')) return null;

    const match = filename.match(/^tile-([a-zA-Z0-9]+)-(\d{10,})\.(?:png|webp)$/);
    if (!match) return null;

    const templateId = match[1];
    const timestamp = parseInt(match[2], 10);

    return {
      path: filePath,
      filename,
      templateId,
      timestamp,
      timeLabel: this._formatTimestamp(timestamp),
    };
  }

  private _formatTimestamp(ts: number): string {
    try {
      const d = new Date(ts);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${month}-${day} ${hour}:${min}`;
    } catch {
      return '';
    }
  }
}
