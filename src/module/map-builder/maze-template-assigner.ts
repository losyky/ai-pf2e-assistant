import type { MapTemplate, MapRotation } from './types';
import {
  MazeGraph,
  MazeGraphNode,
  MazeCellPlacement,
  TemplateProfile,
  EdgeSide,
} from './maze-types';
import { MazePortalAnalyzer } from './maze-portal-analyzer';
import { MapRotationHelper } from './map-rotation-helper';
import { SeededRandom } from './seeded-random';

interface CandidateEntry {
  template: MapTemplate;
  rotation: MapRotation;
  profile: TemplateProfile;
}

/**
 * Assigns a template + rotation to every node in a MazeGraph.
 *
 * Matching strategy (relaxed):
 *   For each connected direction the node has, the chosen template must have
 *   at least one Portal on that side. We do NOT require width/startCell to
 *   match across neighbours — the graph already guarantees connectivity.
 *
 * Fallback:
 *   If no template matches, a fully-open room is generated on the fly.
 */
export class MazeTemplateAssigner {

  static assign(
    graph: MazeGraph,
    templates: MapTemplate[],
    allowRotation: boolean,
    rng: SeededRandom,
    refCols: number,
    refRows: number,
  ): MazeCellPlacement[] {
    const candidates = this._buildCandidates(templates, allowRotation);
    const placements: MazeCellPlacement[] = [];

    for (const node of graph.nodes) {
      const placement = this._assignNode(node, candidates, rng, refCols, refRows);
      placements.push(placement);
    }

    return placements;
  }

  // ------------------------------------------------------------------

  private static _buildCandidates(
    templates: MapTemplate[],
    allowRotation: boolean,
  ): CandidateEntry[] {
    const result: CandidateEntry[] = [];
    for (const t of templates) {
      const rotations = MazePortalAnalyzer.analyzeAllRotations(t, allowRotation);
      for (const { rotation, profile } of rotations) {
        result.push({
          template: rotation !== 0
            ? MapRotationHelper.rotateTemplate(t, rotation)
            : t,
          rotation,
          profile,
        });
      }
    }
    return result;
  }

  private static _assignNode(
    node: MazeGraphNode,
    candidates: CandidateEntry[],
    rng: SeededRandom,
    refCols: number,
    refRows: number,
  ): MazeCellPlacement {
    const needed: Set<EdgeSide> = new Set(node.connections);

    // Filter candidates by room type
    const byType = candidates.filter(c => {
      const rt = c.template.roomType || 'empty';
      return rt === node.roomType || rt === 'empty';
    });

    // Prefer exact type match, fall back to 'empty'
    const exactType = byType.filter(c => (c.template.roomType || 'empty') === node.roomType);
    const pool = exactType.length > 0 ? exactType : byType;

    // Filter by portal coverage: every needed direction must have ≥1 portal
    const matching = pool.filter(c => this._coversDirections(c.profile, needed));

    if (matching.length > 0) {
      // Score candidates: prefer those that don't have portals in unwanted
      // directions (fewer stray openings), and prefer matching grid size
      const scored = matching.map(c => {
        let score = 0;
        const portalSides = new Set(c.profile.portals.map(p => p.side));
        for (const s of portalSides) {
          if (!needed.has(s)) score -= 1;
        }
        if (c.profile.boundingBox.cols === refCols && c.profile.boundingBox.rows === refRows) {
          score += 2;
        }
        return { c, score };
      });
      scored.sort((a, b) => b.score - a.score);

      const bestScore = scored[0].score;
      const best = scored.filter(s => s.score === bestScore);
      const pick = best[rng.int(best.length)].c;

      return {
        templateId: pick.template.id,
        rotation: pick.rotation,
        gridX: node.gridX,
        gridY: node.gridY,
      };
    }

    // Fallback: use the first available candidate of any type that covers
    // the needed directions, regardless of room type
    const anyMatch = candidates.filter(c => this._coversDirections(c.profile, needed));
    if (anyMatch.length > 0) {
      const pick = anyMatch[rng.int(anyMatch.length)];
      return {
        templateId: pick.template.id,
        rotation: pick.rotation,
        gridX: node.gridX,
        gridY: node.gridY,
      };
    }

    // Ultimate fallback: use any candidate (connectivity won't be perfect
    // but at least something is placed)
    if (candidates.length > 0) {
      const pick = candidates[rng.int(candidates.length)];
      return {
        templateId: pick.template.id,
        rotation: pick.rotation,
        gridX: node.gridX,
        gridY: node.gridY,
      };
    }

    // Should not happen if caller provides at least one template
    return {
      templateId: '',
      rotation: 0,
      gridX: node.gridX,
      gridY: node.gridY,
    };
  }

  private static _coversDirections(
    profile: TemplateProfile,
    needed: Set<EdgeSide>,
  ): boolean {
    for (const side of needed) {
      const hasPortal = profile.portals.some(p => p.side === side);
      if (!hasPortal) return false;
    }
    return true;
  }
}
