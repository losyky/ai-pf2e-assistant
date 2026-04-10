import type { RoomType } from './types';
import {
  MazeConfig,
  MazeGraph,
  MazeGraphNode,
  MazeGraphEdge,
  EdgeSide,
} from './maze-types';
import { SeededRandom } from './seeded-random';

const OPPOSITE: Record<EdgeSide, EdgeSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const DIR: { side: EdgeSide; dx: number; dy: number }[] = [
  { side: 'top',    dx:  0, dy: -1 },
  { side: 'right',  dx:  1, dy:  0 },
  { side: 'bottom', dx:  0, dy:  1 },
  { side: 'left',   dx: -1, dy:  0 },
];

/**
 * Generates a connected room graph on a W x H grid using the Growing Tree
 * algorithm, then applies loop addition, dead-end pruning, depth calculation,
 * and room-type assignment.
 *
 * All four config knobs are used:
 *   branchingFactor  – cell selection strategy (DFS vs Prim)
 *   corridorDensity  – target fill ratio
 *   loopChance       – extra edges after tree generation
 *   deadEndRatio     – fraction of dead-ends to keep
 */
export class MazeGraphGenerator {

  static generate(config: MazeConfig, rng: SeededRandom): MazeGraph | null {
    const W = config.mazeWidth;
    const H = config.mazeHeight;
    if (W < 2 || H < 2) return null;

    const nodeGrid: (MazeGraphNode | null)[][] = [];
    for (let y = 0; y < H; y++) {
      nodeGrid.push(new Array(W).fill(null));
    }

    const edgeSet = new Set<string>();
    const edges: MazeGraphEdge[] = [];
    let nextId = 0;

    const allNodes: MazeGraphNode[] = [];
    const entranceIds: number[] = [];

    const makeNode = (x: number, y: number, roomType: RoomType): MazeGraphNode => {
      const node: MazeGraphNode = {
        id: nextId++,
        gridX: x,
        gridY: y,
        roomType,
        depth: -1,
        connections: [],
      };
      nodeGrid[y][x] = node;
      allNodes.push(node);
      return node;
    };

    const addEdge = (a: MazeGraphNode, b: MazeGraphNode, side: EdgeSide) => {
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push({ fromId: a.id, toId: b.id, side });
      edges.push({ fromId: b.id, toId: a.id, side: OPPOSITE[side] });
      if (!a.connections.includes(side)) a.connections.push(side);
      const opp = OPPOSITE[side];
      if (!b.connections.includes(opp)) b.connections.push(opp);
    };

    // ---- Step 1: Pick entrance positions on the grid border ----
    const borderCells: { x: number; y: number }[] = [];
    for (let x = 0; x < W; x++) {
      borderCells.push({ x, y: 0 });
      if (H > 1) borderCells.push({ x, y: H - 1 });
    }
    for (let y = 1; y < H - 1; y++) {
      borderCells.push({ x: 0, y });
      if (W > 1) borderCells.push({ x: W - 1, y });
    }
    rng.shuffle(borderCells);

    const entranceCount = Math.min(config.entranceCount, borderCells.length);
    const frontier: MazeGraphNode[] = [];

    for (let i = 0; i < entranceCount; i++) {
      const pos = borderCells[i];
      const node = makeNode(pos.x, pos.y, 'entrance');
      entranceIds.push(node.id);
      frontier.push(node);
    }

    // ---- Step 2: Growing Tree expansion ----
    const targetCount = Math.max(
      entranceCount + 1,
      Math.ceil(W * H * Math.max(0.1, Math.min(1, config.corridorDensity))),
    );

    while (frontier.length > 0 && allNodes.length < targetCount) {
      // Cell selection strategy controlled by branchingFactor
      // 0 = always newest (DFS → long corridors)
      // 1 = always random  (Prim → bushy branches)
      let chosenIdx: number;
      if (rng.next() < config.branchingFactor) {
        chosenIdx = rng.int(frontier.length);
      } else {
        chosenIdx = frontier.length - 1;
      }
      const chosen = frontier[chosenIdx];

      const neighbors = this._unvisitedNeighbors(chosen, nodeGrid, W, H);
      if (neighbors.length === 0) {
        frontier.splice(chosenIdx, 1);
        continue;
      }

      rng.shuffle(neighbors);
      const pick = neighbors[0];
      const newNode = makeNode(pick.x, pick.y, 'empty');
      addEdge(chosen, newNode, pick.side);
      frontier.push(newNode);
    }

    if (allNodes.length < 2) return null;

    // ---- Step 3: Add loops ----
    if (config.loopChance > 0) {
      for (const node of allNodes) {
        for (const d of DIR) {
          const nx = node.gridX + d.dx;
          const ny = node.gridY + d.dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const neighbor = nodeGrid[ny][nx];
          if (!neighbor) continue;
          const key = node.id < neighbor.id
            ? `${node.id}-${neighbor.id}`
            : `${neighbor.id}-${node.id}`;
          if (edgeSet.has(key)) continue;
          if (rng.next() < config.loopChance) {
            addEdge(node, neighbor, d.side);
          }
        }
      }
    }

    // ---- Step 4: Prune dead ends ----
    if (config.deadEndRatio < 1) {
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = allNodes.length - 1; i >= 0; i--) {
          const node = allNodes[i];
          if (node.connections.length !== 1) continue;
          if (entranceIds.includes(node.id)) continue;
          if (rng.next() < config.deadEndRatio) continue;

          this._removeNode(node, allNodes, edges, edgeSet, nodeGrid);
          i = Math.min(i, allNodes.length);
          changed = true;
        }
      }
    }

    if (allNodes.length < 2) return null;

    // ---- Step 5: BFS depth from entrances ----
    this._computeDepths(allNodes, entranceIds, edges);

    // ---- Step 6: Assign room types ----
    this._assignRoomTypes(config, allNodes, entranceIds, rng);

    return { nodes: allNodes, edges, entranceIds };
  }

  // ------------------------------------------------------------------

  private static _unvisitedNeighbors(
    node: MazeGraphNode,
    grid: (MazeGraphNode | null)[][],
    W: number,
    H: number,
  ): { x: number; y: number; side: EdgeSide }[] {
    const result: { x: number; y: number; side: EdgeSide }[] = [];
    for (const d of DIR) {
      const nx = node.gridX + d.dx;
      const ny = node.gridY + d.dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (grid[ny][nx] !== null) continue;
      result.push({ x: nx, y: ny, side: d.side });
    }
    return result;
  }

  private static _removeNode(
    node: MazeGraphNode,
    allNodes: MazeGraphNode[],
    edges: MazeGraphEdge[],
    edgeSet: Set<string>,
    nodeGrid: (MazeGraphNode | null)[][],
  ): void {
    // Remove all edges involving this node
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if (e.fromId === node.id || e.toId === node.id) {
        const otherId = e.fromId === node.id ? e.toId : e.fromId;
        const otherNode = allNodes.find(n => n.id === otherId);
        if (otherNode) {
          const oppSide = OPPOSITE[e.side];
          if (e.fromId === node.id) {
            otherNode.connections = otherNode.connections.filter(s => s !== oppSide);
          } else {
            otherNode.connections = otherNode.connections.filter(s => s !== e.side);
          }
        }

        const key1 = `${e.fromId}-${e.toId}`;
        const key2 = `${e.toId}-${e.fromId}`;
        edgeSet.delete(key1);
        edgeSet.delete(key2);
        edges.splice(i, 1);
      }
    }

    nodeGrid[node.gridY][node.gridX] = null;
    const idx = allNodes.indexOf(node);
    if (idx >= 0) allNodes.splice(idx, 1);
  }

  private static _computeDepths(
    nodes: MazeGraphNode[],
    entranceIds: number[],
    edges: MazeGraphEdge[],
  ): void {
    const adjacency = new Map<number, number[]>();
    for (const n of nodes) {
      adjacency.set(n.id, []);
    }
    for (const e of edges) {
      adjacency.get(e.fromId)?.push(e.toId);
    }

    const queue: number[] = [];
    const visited = new Set<number>();

    for (const id of entranceIds) {
      const node = nodes.find(n => n.id === id);
      if (node) {
        node.depth = 0;
        queue.push(id);
        visited.add(id);
      }
    }

    while (queue.length > 0) {
      const curId = queue.shift()!;
      const curNode = nodes.find(n => n.id === curId)!;
      const neighbors = adjacency.get(curId) || [];
      for (const nid of neighbors) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        const nNode = nodes.find(n => n.id === nid);
        if (nNode) {
          nNode.depth = curNode.depth + 1;
          queue.push(nid);
        }
      }
    }
  }

  private static _assignRoomTypes(
    config: MazeConfig,
    nodes: MazeGraphNode[],
    entranceIds: number[],
    rng: SeededRandom,
  ): void {
    // Entrances are already typed.

    // Place endpoint rooms on qualifying dead-end nodes
    const entranceSet = new Set(entranceIds);
    for (const ep of config.endpoints) {
      let placed = 0;
      const candidates = nodes.filter(n => {
        if (entranceSet.has(n.id)) return false;
        if (n.roomType !== 'empty') return false;
        if (n.depth < ep.minDepth) return false;
        if (ep.maxDepth !== undefined && n.depth > ep.maxDepth) return false;
        return n.connections.length <= 1;
      });
      // Prefer deepest nodes first
      candidates.sort((a, b) => b.depth - a.depth);

      for (const c of candidates) {
        if (placed >= ep.count) break;
        c.roomType = ep.roomType;
        placed++;
      }

      // If not enough dead-ends, allow non-dead-end nodes too
      if (placed < ep.count) {
        const fallback = nodes.filter(n => {
          if (entranceSet.has(n.id)) return false;
          if (n.roomType !== 'empty') return false;
          if (n.depth < ep.minDepth) return false;
          if (ep.maxDepth !== undefined && n.depth > ep.maxDepth) return false;
          return true;
        });
        fallback.sort((a, b) => b.depth - a.depth);
        for (const c of fallback) {
          if (placed >= ep.count) break;
          c.roomType = ep.roomType;
          placed++;
        }
      }
    }

    // Assign remaining nodes from the room pool using weighted random
    const pool = config.roomPool.filter(rp => rp.weight > 0);
    if (pool.length === 0) return;

    const counts = new Map<RoomType, number>();

    for (const node of nodes) {
      if (node.roomType !== 'empty') continue;

      const eligible = pool.filter(rp => {
        if (rp.maxCount !== undefined && (counts.get(rp.roomType) || 0) >= rp.maxCount) {
          return false;
        }
        return true;
      });

      if (eligible.length === 0) continue;

      const eligibleWeight = eligible.reduce((s, rp) => s + rp.weight, 0);
      let roll = rng.next() * eligibleWeight;
      let chosen: RoomType = eligible[0].roomType;
      for (const rp of eligible) {
        roll -= rp.weight;
        if (roll <= 0) {
          chosen = rp.roomType;
          break;
        }
      }

      node.roomType = chosen;
      counts.set(chosen, (counts.get(chosen) || 0) + 1);
    }
  }
}
