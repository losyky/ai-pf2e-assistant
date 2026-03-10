import {
  MAP_CELL_SIZE,
  MAP_COLOR_PASSABLE,
  MAP_COLOR_IMPASSABLE,
  MAP_COLOR_WALL,
  MAP_COLOR_WALL_AI,
  MAP_COLOR_AI_WALL,
  MAP_COLOR_AI_DOOR,
  MAP_COLOR_AI_ETHEREAL,
  MAP_COLOR_AI_INVISIBLE,
  MAP_COLOR_AI_WINDOW,
  MAP_WALL_LINE_WIDTH,
  MAP_GUIDES_DIR,
} from '../constants';
import { MapTemplate, MapWallType, WALL_TYPE_CONFIG } from './types';

declare const FilePicker: any;
declare const foundry: any;

export class MapGuideImageService {
  private static instance: MapGuideImageService;

  private constructor() {}

  static getInstance(): MapGuideImageService {
    if (!MapGuideImageService.instance) {
      MapGuideImageService.instance = new MapGuideImageService();
    }
    return MapGuideImageService.instance;
  }

  /**
   * Render the template to a Canvas element.
   * When useWallTypes=true, each wall type gets its own color and dash style.
   * Otherwise all walls use `wallColor`.
   */
  renderToCanvas(
    template: MapTemplate,
    width?: number,
    height?: number,
    wallColor: string = MAP_COLOR_WALL,
    useWallTypes: boolean = true,
  ): HTMLCanvasElement {
    const cols = template.gridCols;
    const rows = template.gridRows;
    const w = width ?? cols * MAP_CELL_SIZE;
    const h = height ?? rows * MAP_CELL_SIZE;
    const cellW = w / cols;
    const cellH = h / rows;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = template.cells[r]?.[c] ? MAP_COLOR_PASSABLE : MAP_COLOR_IMPASSABLE;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }

    const scaleFactor = Math.min(w / (cols * MAP_CELL_SIZE), h / (rows * MAP_CELL_SIZE));
    const baseLineWidth = MAP_WALL_LINE_WIDTH * Math.max(scaleFactor, 1);
    ctx.lineCap = 'round';

    for (const wall of template.walls) {
      if (useWallTypes) {
        const cfg = WALL_TYPE_CONFIG[wall.wallType || 'normal'];
        ctx.strokeStyle = cfg.editorColor;
        const dashScale = Math.max(scaleFactor, 0.5);
        ctx.setLineDash(cfg.editorDash.map(d => d * dashScale));
      } else {
        ctx.strokeStyle = wallColor;
        ctx.setLineDash([]);
      }
      ctx.lineWidth = baseLineWidth;
      ctx.beginPath();
      ctx.moveTo(wall.x1 * cellW, wall.y1 * cellH);
      ctx.lineTo(wall.x2 * cellW, wall.y2 * cellH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    return canvas;
  }

  toDataURL(template: MapTemplate, width?: number, height?: number): string {
    return this.renderToCanvas(template, width, height).toDataURL('image/png');
  }

  toThumbnail(template: MapTemplate, maxDim: number = 256): string {
    const cols = template.gridCols;
    const rows = template.gridRows;
    const scale = maxDim / Math.max(cols, rows);
    return this.toDataURL(template, Math.round(cols * scale), Math.round(rows * scale));
  }

  /**
   * 根据墙类型返回 AI 结构图使用的颜色（与提示词「替换」一一对应）。
   */
  private getAILineColor(wallType?: MapWallType): string {
    switch (wallType) {
      case 'door':
      case 'secret-door':
        return MAP_COLOR_AI_DOOR;
      case 'ethereal':
        return MAP_COLOR_AI_ETHEREAL;
      case 'invisible':
        return MAP_COLOR_AI_INVISIBLE;
      case 'window':
        return MAP_COLOR_AI_WINDOW;
      case 'normal':
      default:
        return MAP_COLOR_AI_WALL;
    }
  }

  /**
   * Render guide image for AI: each wall type has a distinct color for "替换" prompt.
   * Red=墙壁, Green=门/暗门, Cyan=幽灵墙(传送门), Orange=隐形墙, Blue=窗户.
   */
  renderForAI(template: MapTemplate): HTMLCanvasElement {
    const cols = template.gridCols;
    const rows = template.gridRows;
    const w = cols * MAP_CELL_SIZE;
    const h = rows * MAP_CELL_SIZE;
    const cellW = w / cols;
    const cellH = h / rows;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = template.cells[r]?.[c] ? MAP_COLOR_PASSABLE : MAP_COLOR_IMPASSABLE;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }

    const scaleFactor = Math.min(w / (cols * MAP_CELL_SIZE), h / (rows * MAP_CELL_SIZE));
    const baseLineWidth = MAP_WALL_LINE_WIDTH * Math.max(scaleFactor, 1);
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    for (const wall of template.walls) {
      ctx.strokeStyle = this.getAILineColor(wall.wallType);
      ctx.lineWidth = baseLineWidth;
      ctx.beginPath();
      ctx.moveTo(wall.x1 * cellW, wall.y1 * cellH);
      ctx.lineTo(wall.x2 * cellW, wall.y2 * cellH);
      ctx.stroke();
    }

    return canvas;
  }

  toBase64(template: MapTemplate): string {
    const canvas = this.renderForAI(template);
    return canvas.toDataURL('image/png').split(',')[1];
  }

  async uploadGuideImage(template: MapTemplate): Promise<string> {
    const canvas = this.renderForAI(template);
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });

    await this.ensureDirectory(MAP_GUIDES_DIR);

    const filename = `guide-${template.id}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    // 兼容 Foundry VTT v13+ 的 FilePicker 命名空间
    const FP = (foundry?.applications?.apps?.FilePicker?.implementation) || FilePicker;
    const response = await FP.upload('data', MAP_GUIDES_DIR, file, {});
    return response.path;
  }

  private async ensureDirectory(dir: string): Promise<void> {
    // 兼容 Foundry VTT v13+ 的 FilePicker 命名空间
    const FP = (foundry?.applications?.apps?.FilePicker?.implementation) || FilePicker;
    try {
      await FP.browse('data', dir);
    } catch {
      await FP.createDirectory('data', dir);
    }
  }
}
