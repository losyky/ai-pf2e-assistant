import { MapWallSegment, MapWallType } from './types';
import { WALL_MERGE_PRIORITY } from './maze-types';

interface PlacedWall {
  segment: MapWallSegment;
  /** Absolute pixel coordinates (already offset) */
  ax1: number;
  ay1: number;
  ax2: number;
  ay2: number;
}

const EPSILON = 0.5;

/**
 * Handles merging of overlapping wall segments when multiple tiles are
 * placed adjacent to each other in a maze layout.
 */
export class MazeWallMerger {

  /**
   * Given a flat list of wall documents (with absolute pixel coords in `c`),
   * detect overlapping segments and keep only the highest-priority one.
   *
   * @param wallDocs Array of FVTT-style wall objects with `c: [x1,y1,x2,y2]`
   *                 and a `wallType` hint stored in `_wallType` (our internal field).
   * @returns Deduplicated wall doc array
   */
  static mergeWalls(
    wallDocs: Array<{ c: number[]; wallType?: MapWallType; [k: string]: any }>,
  ): Array<{ c: number[]; wallType?: MapWallType; [k: string]: any }> {
    const placed: PlacedWall[] = wallDocs.map(doc => ({
      segment: {
        x1: doc.c[0], y1: doc.c[1], x2: doc.c[2], y2: doc.c[3],
        wallType: doc.wallType || 'normal',
      },
      ax1: Math.min(doc.c[0], doc.c[2]),
      ay1: Math.min(doc.c[1], doc.c[3]),
      ax2: Math.max(doc.c[0], doc.c[2]),
      ay2: Math.max(doc.c[1], doc.c[3]),
    }));

    const removed = new Set<number>();

    for (let i = 0; i < placed.length; i++) {
      if (removed.has(i)) continue;
      for (let j = i + 1; j < placed.length; j++) {
        if (removed.has(j)) continue;
        if (this._overlaps(placed[i], placed[j])) {
          const loser = this._pickLoser(placed[i], placed[j]);
          removed.add(loser === placed[i] ? i : j);
        }
      }
    }

    return wallDocs.filter((_, idx) => !removed.has(idx));
  }

  /**
   * Simpler API: merge raw MapWallSegment arrays from multiple tiles,
   * given each tile's pixel offset.
   */
  static mergeSegments(
    tiles: Array<{
      walls: MapWallSegment[];
      offsetX: number;
      offsetY: number;
      cellSize: number;
    }>,
  ): MapWallSegment[] {
    const all: Array<{ seg: MapWallSegment; abs: PlacedWall }> = [];

    for (const tile of tiles) {
      for (const w of tile.walls) {
        const ax1 = tile.offsetX + Math.min(w.x1, w.x2) * tile.cellSize;
        const ay1 = tile.offsetY + Math.min(w.y1, w.y2) * tile.cellSize;
        const ax2 = tile.offsetX + Math.max(w.x1, w.x2) * tile.cellSize;
        const ay2 = tile.offsetY + Math.max(w.y1, w.y2) * tile.cellSize;
        all.push({
          seg: w,
          abs: { segment: w, ax1, ay1, ax2, ay2 },
        });
      }
    }

    const removed = new Set<number>();
    for (let i = 0; i < all.length; i++) {
      if (removed.has(i)) continue;
      for (let j = i + 1; j < all.length; j++) {
        if (removed.has(j)) continue;
        if (this._overlaps(all[i].abs, all[j].abs)) {
          const loser = this._pickLoser(all[i].abs, all[j].abs);
          removed.add(loser === all[i].abs ? i : j);
        }
      }
    }

    return all.filter((_, idx) => !removed.has(idx)).map(e => e.seg);
  }

  // ------------------------------------------------------------------
  // Overlap detection
  // ------------------------------------------------------------------

  /**
   * Two wall segments overlap if they are collinear and share a non-trivial
   * length along the same axis.
   */
  private static _overlaps(a: PlacedWall, b: PlacedWall): boolean {
    const aHoriz = Math.abs(a.ay1 - a.ay2) < EPSILON;
    const bHoriz = Math.abs(b.ay1 - b.ay2) < EPSILON;
    const aVert = Math.abs(a.ax1 - a.ax2) < EPSILON;
    const bVert = Math.abs(b.ax1 - b.ax2) < EPSILON;

    if (aHoriz && bHoriz) {
      if (Math.abs(a.ay1 - b.ay1) > EPSILON) return false;
      return this._rangesOverlap(a.ax1, a.ax2, b.ax1, b.ax2);
    }

    if (aVert && bVert) {
      if (Math.abs(a.ax1 - b.ax1) > EPSILON) return false;
      return this._rangesOverlap(a.ay1, a.ay2, b.ay1, b.ay2);
    }

    return false;
  }

  private static _rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
    const minA = Math.min(a1, a2);
    const maxA = Math.max(a1, a2);
    const minB = Math.min(b1, b2);
    const maxB = Math.max(b1, b2);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    return overlap > EPSILON;
  }

  // ------------------------------------------------------------------
  // Priority resolution
  // ------------------------------------------------------------------

  private static _pickLoser(a: PlacedWall, b: PlacedWall): PlacedWall {
    const pa = WALL_MERGE_PRIORITY[a.segment.wallType || 'normal'] ?? 0;
    const pb = WALL_MERGE_PRIORITY[b.segment.wallType || 'normal'] ?? 0;
    return pa >= pb ? b : a;
  }
}
