import type { MapTemplate, MapRotation, RoomType } from './types';
import {
  MazeConfig,
  MazeLayout,
  MazeCellPlacement,
  TemplateProfile,
  Portal,
  EdgeSide,
  OccupancyState,
} from './maze-types';
import { MazePortalAnalyzer } from './maze-portal-analyzer';
import { MapRotationHelper } from './map-rotation-helper';

// ============================================================
// Internal types
// ============================================================

interface CandidateEntry {
  template: MapTemplate;
  rotation: MapRotation;
  profile: TemplateProfile;
}

interface GridSlot {
  /** Maze-grid coordinate */
  x: number;
  y: number;
  /** null = empty, otherwise placed */
  placement: CandidateEntry | null;
  /** BFS depth from entrance (-1 = unreachable) */
  depth: number;
}

interface NeighbourConstraint {
  side: EdgeSide;
  portals: Portal[];
}

// ============================================================
// Seeded PRNG (xoshiro128** for reproducibility)
// ============================================================

class SeededRandom {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    this.s[0] = seed >>> 0;
    this.s[1] = (seed * 1812433253 + 1) >>> 0;
    this.s[2] = (this.s[1] * 1812433253 + 1) >>> 0;
    this.s[3] = (this.s[2] * 1812433253 + 1) >>> 0;
    for (let i = 0; i < 20; i++) this.next();
  }

  next(): number {
    const s = this.s;
    const result = (((s[1] * 5) << 7 | (s[1] * 5) >>> 25) * 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11 | s[3] >>> 21) >>> 0;
    return result / 4294967296;
  }

  /** Random integer in [0, max) */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Shuffle in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ============================================================
// Solver
// ============================================================

export class MazeLayoutSolver {

  private config: MazeConfig;
  private candidates: CandidateEntry[];
  private grid: GridSlot[][];
  private rng: SeededRandom;
  private startTime = 0;

  /** Occupancy at cell-level across the whole maze (pixel-grid not maze-grid) */
  private occupancy: OccupancyState[][] = [];
  private occupancyCols = 0;
  private occupancyRows = 0;

  /** Track how many of each room type have been placed */
  private roomTypeCounts: Map<RoomType, number> = new Map();

  constructor(config: MazeConfig) {
    this.config = config;
    this.candidates = [];
    this.grid = [];
    this.rng = new SeededRandom(config.randomSeed ?? Date.now());
  }

  /**
   * Main entry point.
   * @param templates All available templates (already filtered by the caller)
   * @returns MazeLayout or null if no solution found within time budget
   */
  solve(templates: MapTemplate[]): MazeLayout | null {
    this.startTime = Date.now();
    this._buildCandidates(templates);

    if (this.candidates.length === 0) return null;

    this._initGrid();
    this._initOccupancy();

    if (!this._placeEntrances()) return null;

    if (!this._fillGrid()) return null;

    if (!this._placeEndpoints()) return null;

    return this._buildResult();
  }

  // ------------------------------------------------------------------
  // Candidate preparation
  // ------------------------------------------------------------------

  private _buildCandidates(templates: MapTemplate[]): void {
    this.candidates = [];
    for (const t of templates) {
      const rotations = MazePortalAnalyzer.analyzeAllRotations(t, this.config.allowRotation);
      for (const { rotation, profile } of rotations) {
        this.candidates.push({
          template: this.config.allowRotation && rotation !== 0
            ? MapRotationHelper.rotateTemplate(t, rotation)
            : t,
          rotation,
          profile,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Grid initialisation
  // ------------------------------------------------------------------

  private _initGrid(): void {
    const { mazeWidth: w, mazeHeight: h } = this.config;
    this.grid = [];
    for (let y = 0; y < h; y++) {
      const row: GridSlot[] = [];
      for (let x = 0; x < w; x++) {
        row.push({ x, y, placement: null, depth: -1 });
      }
      this.grid.push(row);
    }
  }

  private _initOccupancy(): void {
    const refCols = this.candidates[0]?.profile.boundingBox.cols ?? 16;
    const refRows = this.candidates[0]?.profile.boundingBox.rows ?? 16;
    this.occupancyCols = this.config.mazeWidth * refCols;
    this.occupancyRows = this.config.mazeHeight * refRows;
    this.occupancy = [];
    for (let r = 0; r < this.occupancyRows; r++) {
      this.occupancy.push(new Array(this.occupancyCols).fill('free'));
    }
  }

  // ------------------------------------------------------------------
  // Entrance placement
  // ------------------------------------------------------------------

  private _placeEntrances(): boolean {
    const entranceCandidates = this.candidates.filter(
      c => c.template.roomType === 'entrance',
    );

    const edgeSlots = this._getEdgeSlots();
    this.rng.shuffle(edgeSlots);

    let placed = 0;
    for (const slot of edgeSlots) {
      if (placed >= this.config.entranceCount) break;
      if (this._isTimedOut()) return false;

      const pool = entranceCandidates.length > 0 ? entranceCandidates : this.candidates;
      for (const cand of this.rng.shuffle([...pool])) {
        if (this._tryPlace(slot, cand)) {
          slot.depth = 0;
          placed++;
          break;
        }
      }
    }
    return placed >= this.config.entranceCount;
  }

  private _getEdgeSlots(): GridSlot[] {
    const { mazeWidth: w, mazeHeight: h } = this.config;
    const slots: GridSlot[] = [];
    for (let x = 0; x < w; x++) {
      slots.push(this.grid[0][x]);
      if (h > 1) slots.push(this.grid[h - 1][x]);
    }
    for (let y = 1; y < h - 1; y++) {
      slots.push(this.grid[y][0]);
      if (w > 1) slots.push(this.grid[y][w - 1]);
    }
    return slots;
  }

  // ------------------------------------------------------------------
  // Grid filling (constraint propagation + backtracking)
  // ------------------------------------------------------------------

  private _fillGrid(): boolean {
    while (true) {
      if (this._isTimedOut()) return false;

      const slot = this._pickNextSlot();
      if (!slot) break; // all filled

      const viable = this._getViableCandidates(slot);
      this.rng.shuffle(viable);

      let success = false;
      for (const cand of viable) {
        if (this._tryPlace(slot, cand)) {
          this._propagateDepth(slot);
          success = true;
          break;
        }
      }

      if (!success) {
        // Dead-end in the solver — depending on branchingFactor we may skip
        // this slot and leave it empty (maze is not required to be fully filled)
        break;
      }
    }
    return true;
  }

  /**
   * Minimum-remaining-values heuristic: pick the empty slot with the
   * fewest viable candidates (most constrained).
   */
  private _pickNextSlot(): GridSlot | null {
    let best: GridSlot | null = null;
    let bestCount = Infinity;

    for (const row of this.grid) {
      for (const slot of row) {
        if (slot.placement) continue;

        // Only consider slots adjacent to an already-placed cell
        if (!this._hasPlacedNeighbour(slot)) continue;

        const count = this._getViableCandidates(slot).length;
        if (count > 0 && count < bestCount) {
          bestCount = count;
          best = slot;
        }
      }
    }
    return best;
  }

  private _hasPlacedNeighbour(slot: GridSlot): boolean {
    const neighbours = this._getNeighbourSlots(slot);
    return neighbours.some(n => n.placement !== null);
  }

  private _getNeighbourSlots(slot: GridSlot): GridSlot[] {
    const { x, y } = slot;
    const n: GridSlot[] = [];
    if (y > 0) n.push(this.grid[y - 1][x]);
    if (y < this.config.mazeHeight - 1) n.push(this.grid[y + 1][x]);
    if (x > 0) n.push(this.grid[y][x - 1]);
    if (x < this.config.mazeWidth - 1) n.push(this.grid[y][x + 1]);
    return n;
  }

  // ------------------------------------------------------------------
  // Candidate filtering
  // ------------------------------------------------------------------

  private _getViableCandidates(slot: GridSlot): CandidateEntry[] {
    const constraints = this._getNeighbourConstraints(slot);
    const { roomPool } = this.config;

    return this.candidates.filter(cand => {
      const rt = cand.template.roomType || 'empty';

      // Room pool max-count check
      const poolEntry = roomPool.find(e => e.roomType === rt);
      if (poolEntry?.maxCount !== undefined) {
        if ((this.roomTypeCounts.get(rt) || 0) >= poolEntry.maxCount) return false;
      }

      // Endpoint types are placed separately
      if (this.config.endpoints.some(ep => ep.roomType === rt)) return false;

      // Portal compatibility with every placed neighbour
      if (!this._matchesConstraints(cand, constraints)) return false;

      // Occupancy check
      if (!this._checkOccupancy(slot, cand)) return false;

      return true;
    });
  }

  private _getNeighbourConstraints(slot: GridSlot): NeighbourConstraint[] {
    const result: NeighbourConstraint[] = [];
    const { x, y } = slot;

    const check = (nx: number, ny: number, mySide: EdgeSide, theirSide: EdgeSide) => {
      if (ny < 0 || ny >= this.config.mazeHeight) return;
      if (nx < 0 || nx >= this.config.mazeWidth) return;
      const neighbour = this.grid[ny][nx];
      if (!neighbour.placement) return;
      const theirPortals = neighbour.placement.profile.portals.filter(p => p.side === theirSide);
      result.push({ side: mySide, portals: theirPortals });
    };

    check(x, y - 1, 'top', 'bottom');
    check(x, y + 1, 'bottom', 'top');
    check(x - 1, y, 'left', 'right');
    check(x + 1, y, 'right', 'left');

    return result;
  }

  /**
   * A candidate matches constraints if, for every constrained side,
   * the portals align: same width at the same position.
   */
  private _matchesConstraints(cand: CandidateEntry, constraints: NeighbourConstraint[]): boolean {
    for (const c of constraints) {
      const myPortals = cand.profile.portals.filter(p => p.side === c.side);

      // Every neighbour portal must have a matching portal on our side
      for (const theirPortal of c.portals) {
        const match = myPortals.find(
          mp => mp.width === theirPortal.width && mp.startCell === theirPortal.startCell,
        );
        if (!match) return false;
      }

      // Every portal on our side facing a placed neighbour must have a match on their side
      for (const myPortal of myPortals) {
        const match = c.portals.find(
          tp => tp.width === myPortal.width && tp.startCell === myPortal.startCell,
        );
        if (!match) return false;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Occupancy
  // ------------------------------------------------------------------

  private _checkOccupancy(slot: GridSlot, cand: CandidateEntry): boolean {
    const { cols, rows } = cand.profile.boundingBox;
    const offX = slot.x * cols;
    const offY = slot.y * rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gr = offY + r;
        const gc = offX + c;
        if (gr >= this.occupancyRows || gc >= this.occupancyCols) return false;

        const isPassable = cand.template.cells[r]?.[c] ?? false;
        const newState: OccupancyState = isPassable ? 'grey' : 'black';
        const existing = this.occupancy[gr][gc];

        if (newState === 'grey' && existing !== 'free') return false;
        if (newState === 'black' && existing === 'grey') return false;
      }
    }
    return true;
  }

  private _applyOccupancy(slot: GridSlot, cand: CandidateEntry): void {
    const { cols, rows } = cand.profile.boundingBox;
    const offX = slot.x * cols;
    const offY = slot.y * rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gr = offY + r;
        const gc = offX + c;
        const isPassable = cand.template.cells[r]?.[c] ?? false;
        if (isPassable) {
          this.occupancy[gr][gc] = 'grey';
        } else if (this.occupancy[gr][gc] === 'free') {
          this.occupancy[gr][gc] = 'black';
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Placement
  // ------------------------------------------------------------------

  private _tryPlace(slot: GridSlot, cand: CandidateEntry): boolean {
    if (!this._checkOccupancy(slot, cand)) return false;

    slot.placement = cand;
    this._applyOccupancy(slot, cand);

    const rt = cand.template.roomType || 'empty';
    this.roomTypeCounts.set(rt, (this.roomTypeCounts.get(rt) || 0) + 1);

    return true;
  }

  // ------------------------------------------------------------------
  // Depth propagation (BFS)
  // ------------------------------------------------------------------

  private _propagateDepth(_from: GridSlot): void {
    const queue: GridSlot[] = [];

    // Seed from all slots that already have a depth
    for (const row of this.grid) {
      for (const slot of row) {
        if (slot.depth >= 0 && slot.placement) {
          queue.push(slot);
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbours = this._getNeighbourSlots(current);
      for (const n of neighbours) {
        if (!n.placement) continue;
        if (n.depth >= 0) continue;
        // Check connectivity via portals
        if (this._areSlotsConnected(current, n)) {
          n.depth = current.depth + 1;
          queue.push(n);
        }
      }
    }
  }

  private _areSlotsConnected(a: GridSlot, b: GridSlot): boolean {
    if (!a.placement || !b.placement) return false;

    let aSide: EdgeSide;
    let bSide: EdgeSide;

    if (b.x === a.x && b.y === a.y - 1) { aSide = 'top'; bSide = 'bottom'; }
    else if (b.x === a.x && b.y === a.y + 1) { aSide = 'bottom'; bSide = 'top'; }
    else if (b.x === a.x - 1 && b.y === a.y) { aSide = 'left'; bSide = 'right'; }
    else if (b.x === a.x + 1 && b.y === a.y) { aSide = 'right'; bSide = 'left'; }
    else return false;

    const aPortals = a.placement.profile.portals.filter(p => p.side === aSide);
    const bPortals = b.placement.profile.portals.filter(p => p.side === bSide);

    return aPortals.some(ap =>
      bPortals.some(bp => ap.width === bp.width && ap.startCell === bp.startCell),
    );
  }

  // ------------------------------------------------------------------
  // Endpoint placement (post-fill)
  // ------------------------------------------------------------------

  private _placeEndpoints(): boolean {
    for (const ep of this.config.endpoints) {
      let placed = 0;
      const epCandidates = this.candidates.filter(
        c => (c.template.roomType || 'empty') === ep.roomType,
      );
      if (epCandidates.length === 0) continue;

      // Find dead-end slots at appropriate depth
      const deadEnds = this._findDeadEndSlots(ep.minDepth, ep.maxDepth);
      this.rng.shuffle(deadEnds);

      for (const slot of deadEnds) {
        if (placed >= ep.count) break;
        if (this._isTimedOut()) return false;

        // Remove current placement and try an endpoint candidate
        const prev = slot.placement;
        slot.placement = null;
        if (prev) {
          const rt = prev.template.roomType || 'empty';
          this.roomTypeCounts.set(rt, (this.roomTypeCounts.get(rt) || 0) - 1);
        }

        let success = false;
        for (const cand of this.rng.shuffle([...epCandidates])) {
          const constraints = this._getNeighbourConstraints(slot);
          if (!this._matchesConstraints(cand, constraints)) continue;
          slot.placement = cand;
          const rt = cand.template.roomType || 'empty';
          this.roomTypeCounts.set(rt, (this.roomTypeCounts.get(rt) || 0) + 1);
          placed++;
          success = true;
          break;
        }

        if (!success && prev) {
          // Restore previous placement
          slot.placement = prev;
          const rt = prev.template.roomType || 'empty';
          this.roomTypeCounts.set(rt, (this.roomTypeCounts.get(rt) || 0) + 1);
        }
      }
    }
    return true;
  }

  private _findDeadEndSlots(minDepth: number, maxDepth?: number): GridSlot[] {
    const result: GridSlot[] = [];
    for (const row of this.grid) {
      for (const slot of row) {
        if (!slot.placement) continue;
        if (slot.depth < minDepth) continue;
        if (maxDepth !== undefined && slot.depth > maxDepth) continue;

        // A dead-end has only one connected neighbour
        const neighbours = this._getNeighbourSlots(slot);
        const connectedCount = neighbours.filter(n => this._areSlotsConnected(slot, n)).length;
        if (connectedCount <= 1) {
          result.push(slot);
        }
      }
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Build result
  // ------------------------------------------------------------------

  private _buildResult(): MazeLayout {
    const placements: MazeCellPlacement[] = [];
    const depths: number[] = [];
    const entranceIndices: number[] = [];

    for (const row of this.grid) {
      for (const slot of row) {
        if (!slot.placement) continue;
        const idx = placements.length;
        placements.push({
          templateId: slot.placement.template.id,
          rotation: slot.placement.rotation,
          gridX: slot.x,
          gridY: slot.y,
        });
        depths.push(slot.depth);
        if (slot.depth === 0) {
          entranceIndices.push(idx);
        }
      }
    }

    return {
      config: this.config,
      placements,
      depths,
      entranceIndices,
    };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private _isTimedOut(): boolean {
    return Date.now() - this.startTime > this.config.maxSolveTimeMs;
  }
}
