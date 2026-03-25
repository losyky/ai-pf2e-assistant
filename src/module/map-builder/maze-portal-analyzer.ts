import { MapTemplate, MapWallType } from './types';
import { EdgeSide, Portal, TemplateProfile } from './maze-types';
import { MapRotationHelper } from './map-rotation-helper';
import type { MapRotation } from './types';

const BLOCKING_WALL_TYPES: Set<MapWallType> = new Set(['normal', 'invisible', 'window']);

/**
 * Analyses a MapTemplate to extract portal (passage) information along each
 * edge, as well as black/grey area statistics.
 */
export class MazePortalAnalyzer {

  /**
   * Analyse a single template (at rotation 0).
   * If you need rotated profiles, call `analyzeRotated`.
   */
  static analyze(template: MapTemplate): TemplateProfile {
    const portals: Portal[] = [];
    const sides: EdgeSide[] = ['top', 'bottom', 'left', 'right'];

    for (const side of sides) {
      portals.push(...this._scanEdge(template, side));
    }

    let black = 0;
    let grey = 0;
    for (let r = 0; r < template.gridRows; r++) {
      for (let c = 0; c < template.gridCols; c++) {
        if (template.cells[r][c]) grey++;
        else black++;
      }
    }

    return {
      templateId: template.id,
      portals,
      blackArea: black,
      greyArea: grey,
      boundingBox: { cols: template.gridCols, rows: template.gridRows },
    };
  }

  /**
   * Return a profile for every allowed rotation.
   */
  static analyzeAllRotations(
    template: MapTemplate,
    allowRotation: boolean,
  ): { rotation: MapRotation; profile: TemplateProfile }[] {
    const rotations: MapRotation[] = allowRotation ? [0, 90, 180, 270] : [0];
    return rotations.map(rotation => {
      const rotated = MapRotationHelper.rotateTemplate(template, rotation);
      const profile = this.analyze(rotated);
      return { rotation, profile };
    });
  }

  // ------------------------------------------------------------------
  // Edge scanning
  // ------------------------------------------------------------------

  private static _scanEdge(template: MapTemplate, side: EdgeSide): Portal[] {
    const { gridCols: cols, gridRows: rows } = template;
    const edgeLength = (side === 'top' || side === 'bottom') ? cols : rows;

    const passable: boolean[] = [];
    for (let i = 0; i < edgeLength; i++) {
      const cell = this._getEdgeCell(template, side, i);
      passable.push(cell);
    }

    const wallMap = this._buildEdgeWallMap(template, side, edgeLength);

    const portals: Portal[] = [];
    let runStart = -1;

    for (let i = 0; i < edgeLength; i++) {
      if (passable[i] && !this._isCellBlockedByWall(wallMap, i)) {
        if (runStart < 0) runStart = i;
      } else {
        if (runStart >= 0) {
          portals.push(this._makePortal(side, runStart, i - runStart, wallMap));
          runStart = -1;
        }
      }
    }
    if (runStart >= 0) {
      portals.push(this._makePortal(side, runStart, edgeLength - runStart, wallMap));
    }

    return portals;
  }

  private static _getEdgeCell(t: MapTemplate, side: EdgeSide, idx: number): boolean {
    switch (side) {
      case 'top':    return t.cells[0]?.[idx] ?? false;
      case 'bottom': return t.cells[t.gridRows - 1]?.[idx] ?? false;
      case 'left':   return t.cells[idx]?.[0] ?? false;
      case 'right':  return t.cells[idx]?.[t.gridCols - 1] ?? false;
    }
  }

  /**
   * Build a per-cell list of wall types that cross the boundary edge.
   * The boundary line coordinates:
   *   top:    y=0,       horizontal segments x in [i, i+1]
   *   bottom: y=rows,    horizontal segments x in [i, i+1]
   *   left:   x=0,       vertical   segments y in [i, i+1]
   *   right:  x=cols,    vertical   segments y in [i, i+1]
   */
  private static _buildEdgeWallMap(
    t: MapTemplate,
    side: EdgeSide,
    edgeLength: number,
  ): MapWallType[][] {
    const map: MapWallType[][] = new Array(edgeLength).fill(null).map(() => []);
    const { gridCols: cols, gridRows: rows } = t;

    for (const w of t.walls) {
      const wt = w.wallType || 'normal';

      if (side === 'top' || side === 'bottom') {
        const edgeY = side === 'top' ? 0 : rows;
        if (w.y1 !== edgeY || w.y2 !== edgeY) continue;
        const minX = Math.min(w.x1, w.x2);
        const maxX = Math.max(w.x1, w.x2);
        for (let i = minX; i < maxX && i < edgeLength; i++) {
          if (i >= 0) map[i].push(wt);
        }
      } else {
        const edgeX = side === 'left' ? 0 : cols;
        if (w.x1 !== edgeX || w.x2 !== edgeX) continue;
        const minY = Math.min(w.y1, w.y2);
        const maxY = Math.max(w.y1, w.y2);
        for (let i = minY; i < maxY && i < edgeLength; i++) {
          if (i >= 0) map[i].push(wt);
        }
      }
    }

    return map;
  }

  /**
   * A cell slot is "blocked" if ANY wall segment on it is a blocking type.
   */
  private static _isCellBlockedByWall(wallMap: MapWallType[][], idx: number): boolean {
    const types = wallMap[idx];
    if (!types || types.length === 0) return false;
    return types.some(wt => BLOCKING_WALL_TYPES.has(wt));
  }

  private static _makePortal(
    side: EdgeSide,
    startCell: number,
    width: number,
    wallMap: MapWallType[][],
  ): Portal {
    const wallTypes: MapWallType[] = [];
    for (let i = startCell; i < startCell + width; i++) {
      for (const wt of wallMap[i]) {
        if (!wallTypes.includes(wt)) wallTypes.push(wt);
      }
    }
    return {
      side,
      startCell,
      width,
      centerOffset: startCell + width / 2,
      wallTypes,
    };
  }
}
