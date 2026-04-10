import type { MapTemplate } from './types';
import {
  MazeConfig,
  MazeLayout,
  MazeCellPlacement,
  MazeGraph,
} from './maze-types';
import { MazeGraphGenerator } from './maze-graph-generator';
import { MazeTemplateAssigner } from './maze-template-assigner';
import { SeededRandom } from './seeded-random';

export { SeededRandom };

/**
 * Two-phase maze solver:
 *   1. Generate a connected room graph using the Growing Tree algorithm
 *   2. Assign templates to each graph node based on room type + portal direction
 *
 * The public API (`solve`) is unchanged so callers (MazeBuilderService,
 * MazeConfigApp) require no modifications.
 */
export class MazeLayoutSolver {

  private config: MazeConfig;
  private rng: SeededRandom;

  constructor(config: MazeConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.randomSeed ?? Date.now());
  }

  /**
   * Main entry point.
   * @param templates All available templates (already filtered by the caller)
   * @returns MazeLayout or null if no solution found
   */
  solve(templates: MapTemplate[]): MazeLayout | null {
    if (templates.length === 0) return null;

    // Phase 1: generate a connected graph on the maze grid
    const graph = MazeGraphGenerator.generate(this.config, this.rng);
    if (!graph || graph.nodes.length === 0) return null;

    // Determine the reference tile size (use the most common size among templates)
    const refCols = this._mostCommonValue(templates.map(t => t.gridCols));
    const refRows = this._mostCommonValue(templates.map(t => t.gridRows));

    // Phase 2: assign a template + rotation to every node
    const placements = MazeTemplateAssigner.assign(
      graph,
      templates,
      this.config.allowRotation,
      this.rng,
      refCols,
      refRows,
    );

    return this._buildResult(graph, placements);
  }

  /**
   * Expose the graph generation separately so renderPreview can access it.
   */
  solveGraph(): MazeGraph | null {
    return MazeGraphGenerator.generate(this.config, this.rng);
  }

  // ------------------------------------------------------------------

  private _buildResult(
    graph: MazeGraph,
    placements: MazeCellPlacement[],
  ): MazeLayout {
    const depths: number[] = [];
    const entranceIndices: number[] = [];

    for (let i = 0; i < graph.nodes.length; i++) {
      depths.push(graph.nodes[i].depth);
      if (graph.entranceIds.includes(graph.nodes[i].id)) {
        entranceIndices.push(i);
      }
    }

    return {
      config: this.config,
      placements,
      depths,
      entranceIndices,
      graph,
    };
  }

  private _mostCommonValue(values: number[]): number {
    const counts = new Map<number, number>();
    for (const v of values) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best = values[0];
    let bestCount = 0;
    for (const [v, c] of counts) {
      if (c > bestCount) {
        best = v;
        bestCount = c;
      }
    }
    return best;
  }
}
