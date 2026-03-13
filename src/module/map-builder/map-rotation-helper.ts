import { MapTemplate, MapWallSegment, MapRotation } from './types';

/**
 * 地图旋转辅助工具类
 * 处理地图模板的旋转变换，包括坐标、墙体和单元格的旋转
 */
export class MapRotationHelper {
  /**
   * 根据旋转角度旋转模板数据（不修改原模板）
   * @param template 原始模板
   * @param rotation 旋转角度（0/90/180/270）
   * @returns 旋转后的新模板数据
   */
  static rotateTemplate(template: MapTemplate, rotation: MapRotation): MapTemplate {
    if (rotation === 0) {
      return { ...template, rotation: 0 };
    }

    const rotated: MapTemplate = {
      ...template,
      rotation,
      gridCols: rotation === 90 || rotation === 270 ? template.gridRows : template.gridCols,
      gridRows: rotation === 90 || rotation === 270 ? template.gridCols : template.gridRows,
      cells: this.rotateCells(template.cells, rotation),
      walls: this.rotateWalls(template.walls, template.gridCols, template.gridRows, rotation),
    };

    return rotated;
  }

  /**
   * 旋转单元格数组
   */
  private static rotateCells(cells: boolean[][], rotation: MapRotation): boolean[][] {
    const rows = cells.length;
    const cols = cells[0]?.length || 0;

    switch (rotation) {
      case 90: {
        // 顺时针90度：新[r][c] = 原[rows-1-c][r]
        const newCells: boolean[][] = [];
        for (let r = 0; r < cols; r++) {
          newCells[r] = [];
          for (let c = 0; c < rows; c++) {
            newCells[r][c] = cells[rows - 1 - c]?.[r] ?? false;
          }
        }
        return newCells;
      }
      case 180: {
        // 180度：新[r][c] = 原[rows-1-r][cols-1-c]
        const newCells: boolean[][] = [];
        for (let r = 0; r < rows; r++) {
          newCells[r] = [];
          for (let c = 0; c < cols; c++) {
            newCells[r][c] = cells[rows - 1 - r]?.[cols - 1 - c] ?? false;
          }
        }
        return newCells;
      }
      case 270: {
        // 顺时针270度（逆时针90度）：新[r][c] = 原[c][cols-1-r]
        const newCells: boolean[][] = [];
        for (let r = 0; r < cols; r++) {
          newCells[r] = [];
          for (let c = 0; c < rows; c++) {
            newCells[r][c] = cells[c]?.[cols - 1 - r] ?? false;
          }
        }
        return newCells;
      }
      default:
        return cells;
    }
  }

  /**
   * 旋转墙体坐标
   */
  private static rotateWalls(
    walls: MapWallSegment[],
    originalCols: number,
    originalRows: number,
    rotation: MapRotation
  ): MapWallSegment[] {
    return walls.map(wall => ({
      ...wall,
      ...this.rotateWallCoords(wall, originalCols, originalRows, rotation),
    }));
  }

  /**
   * 旋转单个墙体的坐标
   */
  private static rotateWallCoords(
    wall: MapWallSegment,
    cols: number,
    rows: number,
    rotation: MapRotation
  ): { x1: number; y1: number; x2: number; y2: number } {
    const p1 = this.rotatePoint(wall.x1, wall.y1, cols, rows, rotation);
    const p2 = this.rotatePoint(wall.x2, wall.y2, cols, rows, rotation);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  /**
   * 旋转单个点的坐标
   * @param x 原始 x 坐标（列）
   * @param y 原始 y 坐标（行）
   * @param cols 原始列数
   * @param rows 原始行数
   * @param rotation 旋转角度
   */
  private static rotatePoint(
    x: number,
    y: number,
    cols: number,
    rows: number,
    rotation: MapRotation
  ): { x: number; y: number } {
    switch (rotation) {
      case 90:
        // 顺时针90度：新x = y, 新y = cols - x
        return { x: y, y: cols - x };
      case 180:
        // 180度：新x = cols - x, 新y = rows - y
        return { x: cols - x, y: rows - y };
      case 270:
        // 顺时针270度：新x = rows - y, 新y = x
        return { x: rows - y, y: x };
      default:
        return { x, y };
    }
  }

  /**
   * 根据鼠标相对于中心点的方向确定朝向
   * @param centerX 中心点 X 坐标
   * @param centerY 中心点 Y 坐标
   * @param mouseX 鼠标 X 坐标
   * @param mouseY 鼠标 Y 坐标
   * @returns 旋转角度（0=上/北，90=右/东，180=下/南，270=左/西）
   */
  static getRotationFromMouseDirection(
    centerX: number,
    centerY: number,
    mouseX: number,
    mouseY: number
  ): MapRotation {
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;

    // 计算角度（以上方为0度，顺时针）
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // 将角度转换为0-360范围
    const normalizedAngle = (angle + 90 + 360) % 360;

    // 根据角度范围确定四方向
    if (normalizedAngle >= 315 || normalizedAngle < 45) {
      return 0; // 上/北
    } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
      return 90; // 右/东
    } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
      return 180; // 下/南
    } else {
      return 270; // 左/西
    }
  }

  /**
   * 获取旋转后的尺寸
   */
  static getRotatedDimensions(
    cols: number,
    rows: number,
    rotation: MapRotation
  ): { cols: number; rows: number } {
    if (rotation === 90 || rotation === 270) {
      return { cols: rows, rows: cols };
    }
    return { cols, rows };
  }

  /**
   * 获取旋转角度的显示名称
   */
  static getRotationLabel(rotation: MapRotation): string {
    switch (rotation) {
      case 0:
        return '↑ 北';
      case 90:
        return '→ 东';
      case 180:
        return '↓ 南';
      case 270:
        return '← 西';
      default:
        return '↑ 北';
    }
  }
}
