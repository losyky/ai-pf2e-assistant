import { MAP_CELL_SIZE } from '../constants';
import type { AIService } from '../services/ai-service';
import type { Message } from '../../types/api';
import type { MapTemplate, MapWallSegment, MapWallType, RoomType, MapRotation } from './types';
import { parseFunctionCallResponse } from '../utils/pf2e-data-utils';
import { MapTemplateService } from './map-template-service';
import { MapRotationHelper } from './map-rotation-helper';
import type {
  MazeAIConfig,
  MazeAIGenerationResult,
  MazeBlueprint,
  MazeBlueprintPlacement,
  PortRequirement,
  MazeConnectivityGraph,
} from './maze-blueprint-types';

declare const foundry: any;

// ============================================================
// Function Calling Schema
// ============================================================

const MAZE_GENERATION_SCHEMA = {
  name: 'generateMaze',
  description: '根据描述生成迷宫的模板定义和布局方案。每个模板是一个 N×N 的网格，cells 表示可通行性，walls 表示墙线段。layout 将模板放置到迷宫网格中。相邻模板的边界开口必须对齐。',
  parameters: {
    type: 'object',
    properties: {
      templates: {
        type: 'array',
        description: '需要创建的模板列表。相同结构的模板只需定义一次，布局中可多次引用。',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '模板名称，如"十字走廊"、"Boss大厅"' },
            roomType: {
              type: 'string',
              enum: ['corridor', 'entrance', 'boss', 'treasure', 'trap', 'puzzle', 'rest', 'shop', 'shrine', 'empty'],
              description: '房间类型',
            },
            cells: {
              type: 'array',
              description: `二维布尔数组 (N×N)，true=可通行/地板，false=不可通行/实墙。行优先：cells[row][col]`,
              items: { type: 'array', items: { type: 'boolean' } },
            },
            walls: {
              type: 'array',
              description: '墙线段列表。坐标为网格线坐标（0 到 N），不是格子坐标。水平墙：startY==endY，垂直墙：startX==endX。省略此项则自动根据 cells 生成。',
              items: {
                type: 'object',
                properties: {
                  startX: { type: 'number' },
                  startY: { type: 'number' },
                  endX: { type: 'number' },
                  endY: { type: 'number' },
                  wallType: {
                    type: 'string',
                    enum: ['normal', 'door', 'secret-door', 'window'],
                    description: '墙类型，默认 normal',
                  },
                },
                required: ['startX', 'startY', 'endX', 'endY'],
              },
            },
          },
          required: ['name', 'roomType', 'cells'],
        },
      },
      layout: {
        type: 'object',
        description: '迷宫布局：将模板分配到迷宫网格的每个位置',
        properties: {
          placements: {
            type: 'array',
            description: '每个放置项指定网格位置、使用的模板名和旋转角度',
            items: {
              type: 'object',
              properties: {
                gridX: { type: 'number', description: '列位置 (0-based)' },
                gridY: { type: 'number', description: '行位置 (0-based)' },
                templateName: { type: 'string', description: '引用 templates 数组中的 name' },
                rotation: { type: 'number', enum: [0, 90, 180, 270], description: '顺时针旋转角度' },
              },
              required: ['gridX', 'gridY', 'templateName', 'rotation'],
            },
          },
        },
        required: ['placements'],
      },
      reasoning: { type: 'string', description: '设计思路简要说明' },
    },
    required: ['templates', 'layout'],
  },
};

// ============================================================
// Connectivity graph generator (guarantees all-reachable)
// ============================================================

/**
 * Generate a connected maze graph using randomized DFS (recursive backtracker).
 * The resulting spanning tree guarantees every position is reachable from every
 * other position. Extra edges can be added for loops.
 */
function generateConnectivityGraph(
  w: number, h: number, loopRatio: number = 0.15,
): MazeConnectivityGraph {
  const visited = new Set<string>();
  const edges = new Set<string>(); // "x1,y1-x2,y2"

  const dirs = [
    { dx: 0, dy: -1 }, // N
    { dx: 1, dy: 0 },  // E
    { dx: 0, dy: 1 },  // S
    { dx: -1, dy: 0 }, // W
  ];

  // Iterative DFS with explicit stack to avoid call-stack overflow
  const stack: { x: number; y: number }[] = [];
  const startX = Math.floor(Math.random() * w);
  const startY = Math.floor(Math.random() * h);
  visited.add(`${startX},${startY}`);
  stack.push({ x: startX, y: startY });

  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const unvisited: { x: number; y: number }[] = [];
    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && !visited.has(`${nx},${ny}`)) {
        unvisited.push({ x: nx, y: ny });
      }
    }
    if (unvisited.length === 0) {
      stack.pop();
      continue;
    }
    const next = unvisited[Math.floor(Math.random() * unvisited.length)];
    visited.add(`${next.x},${next.y}`);
    edges.add(`${cur.x},${cur.y}-${next.x},${next.y}`);
    stack.push(next);
  }

  // Add random extra edges for loops
  if (loopRatio > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (const d of dirs) {
          const nx = x + d.dx;
          const ny = y + d.dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const key1 = `${x},${y}-${nx},${ny}`;
          const key2 = `${nx},${ny}-${x},${y}`;
          if (edges.has(key1) || edges.has(key2)) continue;
          if (Math.random() < loopRatio) {
            edges.add(key1);
          }
        }
      }
    }
  }

  // Convert edges to port requirements
  const ports = new Map<string, PortRequirement>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ports.set(`${x},${y}`, { N: false, E: false, S: false, W: false });
    }
  }
  for (const edgeKey of edges) {
    const [from, to] = edgeKey.split('-');
    const [x1, y1] = from.split(',').map(Number);
    const [x2, y2] = to.split(',').map(Number);
    const p1 = ports.get(from)!;
    const p2 = ports.get(to)!;
    if (x2 === x1 + 1) { p1.E = true; p2.W = true; }
    if (x2 === x1 - 1) { p1.W = true; p2.E = true; }
    if (y2 === y1 + 1) { p1.S = true; p2.N = true; }
    if (y2 === y1 - 1) { p1.N = true; p2.S = true; }
  }

  return { width: w, height: h, ports };
}

function portSignature(p: PortRequirement): string {
  return `${p.N ? '1' : '0'}${p.E ? '1' : '0'}${p.S ? '1' : '0'}${p.W ? '1' : '0'}`;
}

// ============================================================
// System prompt
// ============================================================

function buildSystemPrompt(config: MazeAIConfig): string {
  const N = config.templateCellSize;
  const mid = Math.floor(N / 2);
  const pxSize = N * 128;
  const passageWidth = N >= 8 ? 3 : (N >= 5 ? 2 : 1);
  const passageRange = N >= 8
    ? `${mid - 1} 到 ${mid + 1}（共 ${passageWidth} 格宽）`
    : `${mid}（中间格）`;

  return `你是一个桌面角色扮演游戏 (Pathfinder 2e) 的迷宫模板设计师。
你的任务是**为系统已确定的端口签名设计模板的内部布局**。连通性已由系统保证，你不需要关心。

## 模板格式

每个模板是 ${N}×${N} 的 cells 网格（${pxSize}×${pxSize} 像素，每格 128px）。
cells: 二维布尔数组 [row][col]，true = 可通行，false = 墙/岩石。

## 端口 (Port) 定义

模板有 4 个端口 (N/E/S/W)，由边界中间格子决定：
- N 端口 = cells[0][${mid}]
- S 端口 = cells[${N - 1}][${mid}]
- W 端口 = cells[${mid}][0]
- E 端口 = cells[${mid}][${N - 1}]

**端口签名** 用 N-E-S-W 顺序的 1/0 表示，如 "1010" 表示南北贯通。

## 你的职责

系统会告诉你需要哪些端口签名的模板。你需要：
1. 为每种端口签名设计模板 cells（端口为 1 的位置 cells 必须为 true）
2. 确保开放端口之间有内部通路相连（通道宽度 ${passageWidth} 格，行/列 ${passageRange}）
3. 为每个迷宫位置分配模板和旋转角度（旋转可复用同一模板）
4. 给每个位置分配合适的 roomType

### 旋转规则

模板旋转后端口随之改变（顺时针）：
- 0°：N-E-S-W 不变
- 90°：原 N→E, E→S, S→W, W→N
- 180°：N↔S, E↔W
- 270°：原 N→W, W→S, S→E, E→N

**可通过旋转复用模板**：端口签名 "1100" 旋转 90° 变成 "0110"。

## 模板内部设计指南

${N >= 8 ? `- 走廊模板：通道宽度 2-3 格，周围为不可通行的墙壁
- 房间模板（Boss/宝藏/休息等）：中央大面积可通行（≥${Math.max(4, N - 4)}×${Math.max(4, N - 4)}），出口处收窄
- 可用 false 格子设计墙柱、障碍物增加趣味性
- 死胡同可包含小型密室或宝箱区域` :
`- 走廊模板：中间行或列为 true，两侧为 false
- 房间模板：大部分格子为 true，四角可留 false 作为墙柱`}

## ⚠️ 通路连通（最重要）

系统自动在相邻模板边界创建通路（走廊之间完全开放、房间之间添加门），但**模板内部必须有可行走路径连接所有开放端口**：
- 从每个开放端口的中间格（行/列 ${passageRange}）向模板中心方向延伸 ${passageWidth} 格宽的通道
- 所有开放端口之间必须有连续的 true 格子路径（不能被 false 格子隔断）
- 走廊模板：主通道沿中间行（row ${mid}）和/或中间列（col ${mid}）延伸，形成 I/L/T/十字形
- 房间模板：中央留出大面积 true 区域，从中央向各端口方向延伸通道
- 特别注意：端口行/列上从边界到最近的内部可通行区域之间**不能有 false 格子阻断**

## walls 格式（省略即可，系统自动生成墙体和门）`;
}

function buildUserPrompt(
  description: string,
  config: MazeAIConfig,
  graph: MazeConnectivityGraph,
): string {
  const W = config.mazeWidth;
  const H = config.mazeHeight;

  // Group positions by port signature to show required template types
  const sigGroups = new Map<string, { positions: string[]; ports: PortRequirement }>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = graph.ports.get(`${x},${y}`)!;
      const sig = portSignature(p);
      if (!sigGroups.has(sig)) {
        sigGroups.set(sig, { positions: [], ports: p });
      }
      sigGroups.get(sig)!.positions.push(`(${x},${y})`);
    }
  }

  const sigList = Array.from(sigGroups.entries())
    .map(([sig, g]) => `- "${sig}" (N=${g.ports.N ? 1 : 0} E=${g.ports.E ? 1 : 0} S=${g.ports.S ? 1 : 0} W=${g.ports.W ? 1 : 0}): ${g.positions.length} 个位置`)
    .join('\n');

  // Build per-position assignment table
  const posTable: string[] = [];
  for (let y = 0; y < H; y++) {
    const row: string[] = [];
    for (let x = 0; x < W; x++) {
      const p = graph.ports.get(`${x},${y}`)!;
      row.push(portSignature(p));
    }
    posTable.push(row.join(' '));
  }

  return `请为以下迷宫设计模板内部布局。

**描述**: ${description}
**迷宫网格**: ${W} 列 × ${H} 行
**模板尺寸**: ${config.templateCellSize} × ${config.templateCellSize}
**主题**: ${config.theme || '标准地下城'}

## 系统已确定的连通骨架

端口签名俯视图（每个位置的 NESW）：
\`\`\`
${posTable.join('\n')}
\`\`\`

需要的模板类型：
${sigList}

## 请完成以下工作

1. 为每种端口签名设计一个模板（cells 数组），确保：
   - 端口为 1 的方向，中间边界格子 cells 为 true
   - 端口为 0 的方向，中间边界格子 cells 为 false
   - 所有开放端口之间有内部通路
2. 在 layout 中为每个位置分配模板名和旋转角度
   - 旋转后的端口签名必须匹配该位置的需求
3. 为不同位置分配合适的 roomType（入口、Boss、走廊等）
4. 在 reasoning 中简述设计思路

调用 generateMaze 返回结果。`;
}

function buildModifyPrompt(
  description: string,
  currentState: MazeAIGenerationResult,
  config: MazeAIConfig,
  graph: MazeConnectivityGraph | null,
): string {
  const stateCompact = {
    templates: currentState.templates.map(t => ({
      name: t.name,
      roomType: t.roomType,
      cells: t.cells.map(row => row.map(c => c ? '1' : '0').join('')).join('\n'),
    })),
    layout: currentState.layout.placements.map(p =>
      `(${p.gridX},${p.gridY}) ${p.templateName} r${p.rotation}`
    ),
  };

  let graphInfo = '';
  if (graph) {
    const W = config.mazeWidth;
    const H = config.mazeHeight;
    const posTable: string[] = [];
    for (let y = 0; y < H; y++) {
      const row: string[] = [];
      for (let x = 0; x < W; x++) {
        const p = graph.ports.get(`${x},${y}`);
        row.push(p ? portSignature(p) : '????');
      }
      posTable.push(row.join(' '));
    }
    graphInfo = `\n\n## 连通骨架（不可更改）\n\`\`\`\n${posTable.join('\n')}\n\`\`\`\n每个位置的端口签名必须保持不变。\n`;
  }

  return `当前迷宫状态:
\`\`\`json
${JSON.stringify(stateCompact, null, 1)}
\`\`\`

配置: ${config.mazeWidth}×${config.mazeHeight} 网格, 每模板 ${config.templateCellSize}×${config.templateCellSize}
${graphInfo}
用户修改要求: ${description}

请根据修改要求调整模板内部设计和 roomType，但端口签名不可更改。调用 generateMaze 返回完整的新方案。`;
}

// ============================================================
// Service
// ============================================================

export class MazeAIService {
  private aiService: AIService;
  private _lastGraph: MazeConnectivityGraph | null = null;
  /** In-memory templates built during materialize(), not yet persisted. */
  private _pendingTemplates: Map<string, MapTemplate> = new Map();

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  get lastGraph(): MazeConnectivityGraph | null {
    return this._lastGraph;
  }

  /** Get an in-memory pending template by ID (for preview rendering). */
  getPendingTemplate(id: string): MapTemplate | undefined {
    return this._pendingTemplates.get(id);
  }

  /** Persist all pending templates to MapTemplateService. Call on save/place. */
  async commitPendingTemplates(): Promise<number> {
    const templateService = MapTemplateService.getInstance();
    let count = 0;
    for (const [, t] of this._pendingTemplates) {
      await templateService.save(t);
      count++;
    }
    this._pendingTemplates.clear();
    return count;
  }

  // ------------------------------------------------------------------
  // Generation
  // ------------------------------------------------------------------

  async generate(
    description: string,
    config: MazeAIConfig,
    model?: string,
  ): Promise<MazeAIGenerationResult> {
    this._lastGraph = generateConnectivityGraph(
      config.mazeWidth, config.mazeHeight, 0.15,
    );

    const messages: Message[] = [
      { role: 'system', content: buildSystemPrompt(config) },
      { role: 'user', content: buildUserPrompt(description, config, this._lastGraph) },
    ];

    const tokenBudget = config.templateCellSize >= 16 ? 32768 : (config.templateCellSize >= 8 ? 16384 : 8192);
    const response = await this.aiService.callService(messages, {
      model,
      temperature: 0.9,
      max_tokens: tokenBudget,
      tools: [{ type: 'function', function: MAZE_GENERATION_SCHEMA }],
      tool_choice: { type: 'function', function: { name: 'generateMaze' } },
    });

    return this._parseResponse(response, config);
  }

  async modify(
    modifyDescription: string,
    currentState: MazeAIGenerationResult,
    config: MazeAIConfig,
    model?: string,
  ): Promise<MazeAIGenerationResult> {
    const messages: Message[] = [
      { role: 'system', content: buildSystemPrompt(config) },
      { role: 'user', content: buildModifyPrompt(modifyDescription, currentState, config, this._lastGraph) },
    ];

    const tokenBudget = config.templateCellSize >= 16 ? 32768 : (config.templateCellSize >= 8 ? 16384 : 8192);
    const response = await this.aiService.callService(messages, {
      model,
      temperature: 0.9,
      max_tokens: tokenBudget,
      tools: [{ type: 'function', function: MAZE_GENERATION_SCHEMA }],
      tool_choice: { type: 'function', function: { name: 'generateMaze' } },
    });

    return this._parseResponse(response, config);
  }

  // ------------------------------------------------------------------
  // Response parsing
  // ------------------------------------------------------------------

  private _parseResponse(response: any, config: MazeAIConfig): MazeAIGenerationResult {
    console.log('[MazeAIService] Raw response:', JSON.stringify(response).slice(0, 2000));

    const finishReason = response?.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('[MazeAIService] Response truncated (finish_reason=length), max_tokens may be too low');
    }

    const data = parseFunctionCallResponse(response, 'generateMaze');
    if (!data) {
      console.error('[MazeAIService] parseFunctionCallResponse returned null. Response keys:', Object.keys(response || {}));
      throw new Error('AI 未返回有效的 generateMaze 调用结果');
    }

    console.log('[MazeAIService] Parsed data keys:', Object.keys(data), 'templates count:', data.templates?.length, 'placements count:', data.layout?.placements?.length);

    if (!Array.isArray(data.templates) || data.templates.length === 0) {
      console.error('[MazeAIService] Empty templates. Full parsed data:', JSON.stringify(data).slice(0, 1000));
      throw new Error('AI 返回的模板列表为空');
    }
    if (!data.layout?.placements || !Array.isArray(data.layout.placements)) {
      throw new Error('AI 返回的布局数据无效');
    }

    const N = config.templateCellSize;
    for (const t of data.templates) {
      if (!t.name || !t.cells) {
        throw new Error(`模板缺少 name 或 cells`);
      }
      if (!Array.isArray(t.cells) || t.cells.length !== N) {
        throw new Error(`模板 "${t.name}" 的 cells 行数应为 ${N}，实际为 ${t.cells?.length}`);
      }
      for (let r = 0; r < t.cells.length; r++) {
        if (!Array.isArray(t.cells[r]) || t.cells[r].length !== N) {
          throw new Error(`模板 "${t.name}" 第 ${r} 行列数应为 ${N}，实际为 ${t.cells[r]?.length}`);
        }
      }
    }

    return {
      templates: data.templates,
      layout: { placements: data.layout.placements },
      reasoning: data.reasoning,
    };
  }

  // ------------------------------------------------------------------
  // Convert AI result to MapTemplates + Blueprint
  // ------------------------------------------------------------------

  async materialize(
    result: MazeAIGenerationResult,
    config: MazeAIConfig,
    blueprintName: string,
    blueprintDescription: string,
    model?: string,
  ): Promise<MazeBlueprint> {
    const templateService = MapTemplateService.getInstance();
    const N = config.templateCellSize;

    // 1. Create ONE shared base template per unique AI template definition
    const templateNameToId = new Map<string, string>();
    const allTemplateIds = new Set<string>();
    this._pendingTemplates.clear();

    // 1a. Derive the required native (unrotated) port signature for each template
    //     by reverse-rotating the connectivity graph's per-position requirements.
    //     If the same template name is used at positions whose reverse-rotated ports
    //     conflict, the first one wins and _repairConnectivity fixes the rest.
    const nativePortsForTemplate = new Map<string, PortRequirement>();
    if (this._lastGraph) {
      for (const p of result.layout.placements) {
        const graphPorts = this._lastGraph.ports.get(`${p.gridX},${p.gridY}`);
        if (!graphPorts) continue;
        const native = this._reverseRotatePorts(graphPorts, (p.rotation || 0) as MapRotation);
        if (!nativePortsForTemplate.has(p.templateName)) {
          nativePortsForTemplate.set(p.templateName, native);
        } else {
          const existing = nativePortsForTemplate.get(p.templateName)!;
          if (portSignature(existing) !== portSignature(native)) {
            console.warn(`[MazeAIService] Template "${p.templateName}" has conflicting native ports: ` +
              `${portSignature(existing)} vs ${portSignature(native)} at (${p.gridX},${p.gridY}) — ` +
              `_repairConnectivity will fix this`);
          }
        }
      }
    }

    for (const tDef of result.templates) {
      const id = foundry.utils.randomID();
      const cells = tDef.cells.map((row: any[]) => row.map((c: any) => !!c));

      // Enforce ports from the connectivity graph (not from AI output)
      const requiredPorts = nativePortsForTemplate.get(tDef.name);
      if (requiredPorts) {
        this._enforcePortCells(cells, N, requiredPorts);
        this._ensureInternalConnectivity(cells, N, requiredPorts);
        console.log(`[MazeAIService] Enforced ports for "${tDef.name}": N=${requiredPorts.N} E=${requiredPorts.E} S=${requiredPorts.S} W=${requiredPorts.W}`);
      }

      let walls: MapWallSegment[];
      if (tDef.walls && tDef.walls.length > 0) {
        walls = tDef.walls.map((w: any) => ({
          x1: w.startX, y1: w.startY, x2: w.endX, y2: w.endY,
          wallType: (w.wallType || 'normal') as MapWallType,
        }));
      } else {
        const tmp: MapTemplate = {
          id, name: '', description: '',
          gridCols: N, gridRows: N, cellSize: MAP_CELL_SIZE,
          cells, walls: [],
        };
        walls = templateService.autoGenerateWalls(tmp);
      }

      const template: MapTemplate = {
        id,
        name: `[${blueprintName}] ${tDef.name}`,
        description: `迷宫「${blueprintName}」- ${tDef.roomType || 'empty'}`,
        gridCols: N, gridRows: N, cellSize: MAP_CELL_SIZE,
        cells,
        walls,
        roomType: (tDef.roomType || 'empty') as RoomType,
      };

      this._pendingTemplates.set(id, template);
      templateNameToId.set(tDef.name, id);
      allTemplateIds.add(id);
    }

    console.log(`[MazeAIService] Created ${allTemplateIds.size} shared base templates (was ${result.layout.placements.length} per-position)`);

    // 2. Build placements referencing shared templates, preserving rotation
    const placements: MazeBlueprintPlacement[] = result.layout.placements.map(p => ({
      gridX: p.gridX,
      gridY: p.gridY,
      templateId: templateNameToId.get(p.templateName) || '',
      rotation: (p.rotation || 0) as MapRotation,
    }));

    const blueprint: MazeBlueprint = {
      id: foundry.utils.randomID(),
      name: blueprintName,
      description: blueprintDescription,
      createdAt: Date.now(),
      gridWidth: config.mazeWidth,
      gridHeight: config.mazeHeight,
      cellSize: N,
      templateIds: [...allTemplateIds],
      placements,
      metadata: {
        theme: config.theme,
        aiModel: model,
        reasoning: result.reasoning,
        config,
      },
    };

    // 3. Global BFS connectivity check + auto-repair (safety net)
    if (this._lastGraph) {
      const globalOk = this._globalConnectivityCheck(blueprint, templateService);
      if (!globalOk) {
        console.warn('[MazeAIService] Global connectivity check failed — running per-position repair');
        this._repairConnectivity(blueprint, N);
        const repairOk = this._globalConnectivityCheck(blueprint, templateService);
        console.log(`[MazeAIService] After repair: ${repairOk ? 'CONNECTED' : 'STILL DISCONNECTED'}`);
      }
    }

    return blueprint;
  }

  /**
   * Reverse-rotate a port requirement: given the ROTATED ports (from the graph)
   * and the rotation applied, return what the BASE (unrotated) template must have.
   *
   * Example: graph says position needs E+W after 90° rotation.
   * Rotation 90° maps base N→E, E→S, S→W, W→N.
   * So rotated E came from base N, rotated W came from base S.
   * Reverse: base.N = rotated.E, base.E = rotated.S, base.S = rotated.W, base.W = rotated.N.
   */
  private _reverseRotatePorts(rotatedPorts: PortRequirement, rotation: MapRotation): PortRequirement {
    switch (rotation) {
      case 0:   return { ...rotatedPorts };
      case 90:  return { N: rotatedPorts.E, E: rotatedPorts.S, S: rotatedPorts.W, W: rotatedPorts.N };
      case 180: return { N: rotatedPorts.S, E: rotatedPorts.W, S: rotatedPorts.N, W: rotatedPorts.E };
      case 270: return { N: rotatedPorts.W, E: rotatedPorts.N, S: rotatedPorts.E, W: rotatedPorts.S };
      default:  return { ...rotatedPorts };
    }
  }

  // ------------------------------------------------------------------
  // Port enforcement — guarantee connectivity at cell level
  // ------------------------------------------------------------------

  /**
   * Force port cells to match the connectivity graph requirements.
   * Open ports get their mid-cells set to true; closed ports get mid-cells set to false.
   */
  private _enforcePortCells(
    cells: boolean[][], N: number, ports: PortRequirement,
  ): void {
    const mid = Math.floor(N / 2);
    const range = N >= 8 ? [mid - 1, mid, mid + 1] : (N >= 5 ? [mid - 1, mid] : [mid]);

    // North edge: row 0
    for (const col of range) {
      if (col >= 0 && col < N) cells[0][col] = ports.N;
    }
    // South edge: row N-1
    for (const col of range) {
      if (col >= 0 && col < N) cells[N - 1][col] = ports.S;
    }
    // West edge: col 0
    for (const row of range) {
      if (row >= 0 && row < N) cells[row][0] = ports.W;
    }
    // East edge: col N-1
    for (const row of range) {
      if (row >= 0 && row < N) cells[row][N - 1] = ports.E;
    }
  }

  /**
   * Ensure all open ports within a template are internally connected.
   * Uses BFS flood-fill; if disconnected ports exist, carves a path between them.
   */
  private _ensureInternalConnectivity(
    cells: boolean[][], N: number, ports: PortRequirement,
  ): void {
    const mid = Math.floor(N / 2);

    // Collect port anchor cells (one representative cell per open port)
    const portCells: { r: number; c: number }[] = [];
    if (ports.N) portCells.push({ r: 0, c: mid });
    if (ports.S) portCells.push({ r: N - 1, c: mid });
    if (ports.W) portCells.push({ r: mid, c: 0 });
    if (ports.E) portCells.push({ r: mid, c: N - 1 });

    if (portCells.length <= 1) return;

    // BFS flood-fill from first port cell to find connected component
    const key = (r: number, c: number) => r * N + c;
    const visited = new Set<number>();
    const queue: { r: number; c: number }[] = [portCells[0]];
    visited.add(key(portCells[0].r, portCells[0].c));

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nr = cur.r + dr;
        const nc = cur.c + dc;
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        if (visited.has(key(nr, nc))) continue;
        if (!cells[nr][nc]) continue;
        visited.add(key(nr, nc));
        queue.push({ r: nr, c: nc });
      }
    }

    // Check which port cells are not reached
    for (let i = 1; i < portCells.length; i++) {
      const target = portCells[i];
      if (visited.has(key(target.r, target.c))) continue;

      // BFS from target on ALL cells (ignoring passability) to find nearest visited cell
      const bfsVisited = new Map<number, number>(); // cell key → parent key
      const bfsQueue: { r: number; c: number }[] = [target];
      bfsVisited.set(key(target.r, target.c), -1);
      let found: { r: number; c: number } | null = null;

      while (bfsQueue.length > 0 && !found) {
        const cur = bfsQueue.shift()!;
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const nk = key(nr, nc);
          if (bfsVisited.has(nk)) continue;
          bfsVisited.set(nk, key(cur.r, cur.c));
          if (visited.has(nk)) {
            found = { r: nr, c: nc };
            break;
          }
          bfsQueue.push({ r: nr, c: nc });
        }
      }

      if (found) {
        // Trace path back and carve
        let ck = key(found.r, found.c);
        while (ck !== -1) {
          const cr = Math.floor(ck / N);
          const cc = ck % N;
          cells[cr][cc] = true;
          visited.add(ck);
          ck = bfsVisited.get(ck) ?? -1;
        }
        // Also add the target's original path to visited
        let tk = key(target.r, target.c);
        while (tk !== -1) {
          const tr = Math.floor(tk / N);
          const tc = tk % N;
          cells[tr][tc] = true;
          visited.add(tk);
          tk = bfsVisited.get(tk) ?? -1;
        }
      }
    }
  }

  /**
   * Per-position repair: for each placement, check if the rotated template's
   * ports match the connectivity graph.  When they don't, create a
   * position-specific template copy and enforce the correct ports.
   */
  private _repairConnectivity(blueprint: MazeBlueprint, N: number): void {
    if (!this._lastGraph) return;
    const templateService = MapTemplateService.getInstance();
    const mid = Math.floor(N / 2);

    for (const p of blueprint.placements) {
      const graphPorts = this._lastGraph.ports.get(`${p.gridX},${p.gridY}`);
      if (!graphPorts) continue;

      const base = this._pendingTemplates.get(p.templateId) || templateService.getById(p.templateId);
      if (!base) continue;

      const rotated = p.rotation ? MapRotationHelper.rotateTemplate(base, p.rotation) : base;

      const actualPorts: PortRequirement = {
        N: rotated.cells[0]?.[mid] ?? false,
        E: rotated.cells[mid]?.[N - 1] ?? false,
        S: rotated.cells[N - 1]?.[mid] ?? false,
        W: rotated.cells[mid]?.[0] ?? false,
      };

      const mismatch =
        actualPorts.N !== graphPorts.N || actualPorts.E !== graphPorts.E ||
        actualPorts.S !== graphPorts.S || actualPorts.W !== graphPorts.W;

      if (!mismatch) continue;

      console.log(`[MazeAIService] Port mismatch at (${p.gridX},${p.gridY}): ` +
        `need ${portSignature(graphPorts)}, got ${portSignature(actualPorts)} — creating patched copy`);

      // Create a position-specific template copy with rotation=0
      const newId = foundry.utils.randomID();
      const patchedCells = rotated.cells.map(row => [...row]);

      this._enforcePortCells(patchedCells, N, graphPorts);
      this._ensureInternalConnectivity(patchedCells, N, graphPorts);

      const tmp: MapTemplate = {
        id: newId, name: '', description: '',
        gridCols: N, gridRows: N, cellSize: MAP_CELL_SIZE,
        cells: patchedCells, walls: [],
      };
      const walls = templateService.autoGenerateWalls(tmp);

      const patchedTemplate: MapTemplate = {
        id: newId,
        name: `[${blueprint.name}] fix_${p.gridX}_${p.gridY}`,
        description: `迷宫「${blueprint.name}」修复位置 (${p.gridX},${p.gridY})`,
        gridCols: N, gridRows: N, cellSize: MAP_CELL_SIZE,
        cells: patchedCells,
        walls,
        roomType: base.roomType,
      };

      this._pendingTemplates.set(newId, patchedTemplate);

      if (!blueprint.templateIds.includes(newId)) {
        blueprint.templateIds.push(newId);
      }

      // Point this placement at the patched copy (rotation=0 since we already rotated)
      p.templateId = newId;
      (p as any).rotation = 0;
    }
  }

  /**
   * Global BFS across all maze positions to verify every placement is reachable.
   * Returns true if all connected, false otherwise.
   */
  private _globalConnectivityCheck(
    blueprint: MazeBlueprint,
    templateService: MapTemplateService,
  ): boolean {
    if (blueprint.placements.length <= 1) return true;

    const N = blueprint.cellSize;
    const mid = Math.floor(N / 2);

    // Build adjacency: positions connected if they share an open port
    const posMap = new Map<string, MazeBlueprintPlacement>();
    for (const p of blueprint.placements) {
      posMap.set(`${p.gridX},${p.gridY}`, p);
    }

    // Cache rotated templates to avoid repeated rotations
    const rotatedCache = new Map<string, MapTemplate>();
    const getRotated = (p: MazeBlueprintPlacement): MapTemplate | null => {
      const cacheKey = `${p.templateId}_${p.rotation}`;
      if (rotatedCache.has(cacheKey)) return rotatedCache.get(cacheKey)!;
      const base = this._pendingTemplates.get(p.templateId) || templateService.getById(p.templateId);
      if (!base) return null;
      const rotated = p.rotation ? MapRotationHelper.rotateTemplate(base, p.rotation) : base;
      rotatedCache.set(cacheKey, rotated);
      return rotated;
    };

    const getPortOpen = (p: MazeBlueprintPlacement, side: 'N' | 'E' | 'S' | 'W'): boolean => {
      const t = getRotated(p);
      if (!t) return false;
      switch (side) {
        case 'N': return t.cells[0]?.[mid] ?? false;
        case 'S': return t.cells[N - 1]?.[mid] ?? false;
        case 'W': return t.cells[mid]?.[0] ?? false;
        case 'E': return t.cells[mid]?.[N - 1] ?? false;
      }
    };

    const adjacency = new Map<string, string[]>();
    for (const p of blueprint.placements) {
      const key = `${p.gridX},${p.gridY}`;
      if (!adjacency.has(key)) adjacency.set(key, []);

      const neighbors: { dx: number; dy: number; mySide: 'N' | 'E' | 'S' | 'W'; theirSide: 'N' | 'E' | 'S' | 'W' }[] = [
        { dx: 1, dy: 0, mySide: 'E', theirSide: 'W' },
        { dx: -1, dy: 0, mySide: 'W', theirSide: 'E' },
        { dx: 0, dy: 1, mySide: 'S', theirSide: 'N' },
        { dx: 0, dy: -1, mySide: 'N', theirSide: 'S' },
      ];

      for (const nb of neighbors) {
        const nKey = `${p.gridX + nb.dx},${p.gridY + nb.dy}`;
        const nPlacement = posMap.get(nKey);
        if (!nPlacement) continue;
        if (getPortOpen(p, nb.mySide) && getPortOpen(nPlacement, nb.theirSide)) {
          adjacency.get(key)!.push(nKey);
        }
      }
    }

    // BFS from first placement
    const start = `${blueprint.placements[0].gridX},${blueprint.placements[0].gridY}`;
    const visited = new Set<string>();
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of (adjacency.get(cur) || [])) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }

    const allReachable = visited.size === blueprint.placements.length;
    console.log(`[MazeAIService] Global connectivity: ${visited.size}/${blueprint.placements.length} positions reachable`);
    return allReachable;
  }

  // ------------------------------------------------------------------
  // Boundary wall fixing
  // ------------------------------------------------------------------

  /**
   * For a template at grid position (gx, gy), rebuild boundary walls so that
   * edges shared with neighbors use doors/openings instead of normal walls.
   */
  private _fixBoundaryWalls(
    walls: MapWallSegment[],
    cells: boolean[][],
    N: number,
    gx: number,
    gy: number,
    grid: Map<string, { cells: boolean[][]; roomType: string }>,
  ): MapWallSegment[] {
    const edges: {
      dx: number; dy: number;
      fixedAxis: 'x' | 'y'; fixedVal: number;
      myCell: (i: number) => boolean;
      nbrCell: (i: number, nc: boolean[][]) => boolean;
    }[] = [
      { dx: 1, dy: 0, fixedAxis: 'x', fixedVal: N,
        myCell: (i) => cells[i]?.[N - 1] ?? false,
        nbrCell: (i, nc) => nc[i]?.[0] ?? false },
      { dx: -1, dy: 0, fixedAxis: 'x', fixedVal: 0,
        myCell: (i) => cells[i]?.[0] ?? false,
        nbrCell: (i, nc) => nc[i]?.[N - 1] ?? false },
      { dx: 0, dy: 1, fixedAxis: 'y', fixedVal: N,
        myCell: (i) => cells[N - 1]?.[i] ?? false,
        nbrCell: (i, nc) => nc[0]?.[i] ?? false },
      { dx: 0, dy: -1, fixedAxis: 'y', fixedVal: 0,
        myCell: (i) => cells[0]?.[i] ?? false,
        nbrCell: (i, nc) => nc[N - 1]?.[i] ?? false },
    ];

    // Collect edges that need fixing
    const edgesToFix: typeof edges[0][] = [];
    for (const edge of edges) {
      if (grid.has(`${gx + edge.dx},${gy + edge.dy}`)) {
        edgesToFix.push(edge);
      }
    }
    if (edgesToFix.length === 0) return walls;

    // Remove all existing walls on edges that have neighbors
    const isOnFixedEdge = (w: MapWallSegment): boolean => {
      for (const edge of edgesToFix) {
        if (edge.fixedAxis === 'x') {
          if (w.x1 === edge.fixedVal && w.x2 === edge.fixedVal) return true;
        } else {
          if (w.y1 === edge.fixedVal && w.y2 === edge.fixedVal) return true;
        }
      }
      return false;
    };
    const result = walls.filter(w => !isOnFixedEdge(w));

    // Re-add per-cell wall segments with correct types
    const myRoomType = grid.get(`${gx},${gy}`)?.roomType || 'empty';

    for (const edge of edgesToFix) {
      const neighbor = grid.get(`${gx + edge.dx},${gy + edge.dy}`)!;

      for (let i = 0; i < N; i++) {
        const myOpen = edge.myCell(i);
        const nbrOpen = edge.nbrCell(i, neighbor.cells);

        let wallType: MapWallType | null;
        if (myOpen && nbrOpen) {
          wallType = this._getPassageWallType(myRoomType, neighbor.roomType);
        } else if (myOpen && !nbrOpen) {
          wallType = 'normal';
        } else {
          wallType = null; // both impassable → no wall needed (solid area)
        }

        if (wallType) {
          if (edge.fixedAxis === 'x') {
            result.push({ x1: edge.fixedVal, y1: i, x2: edge.fixedVal, y2: i + 1, wallType });
          } else {
            result.push({ x1: i, y1: edge.fixedVal, x2: i + 1, y2: edge.fixedVal, wallType });
          }
        }
      }
    }

    return result;
  }

  /**
   * Determine what wall type to use for a passage between two room types.
   */
  private _getPassageWallType(roomTypeA: string, roomTypeB: string): MapWallType | null {
    const openTypes = ['corridor', 'empty'];
    if (openTypes.includes(roomTypeA) && openTypes.includes(roomTypeB)) return null;
    if (roomTypeA === 'entrance' || roomTypeB === 'entrance') return 'door';
    if (roomTypeA === 'trap' || roomTypeB === 'trap') return 'secret-door';
    if (roomTypeA === 'treasure' || roomTypeB === 'treasure') return 'secret-door';
    return 'door';
  }

  // ------------------------------------------------------------------
  // Connectivity validation
  // ------------------------------------------------------------------

  /**
   * Validate that adjacent placements have aligned portals.
   * Returns a list of mismatches for display / auto-fix.
   */
  validateConnectivity(
    blueprint: MazeBlueprint,
  ): ConnectivityIssue[] {
    const templateService = MapTemplateService.getInstance();
    const issues: ConnectivityIssue[] = [];

    const getTemplate = (id: string): MapTemplate | null => {
      return this._pendingTemplates.get(id) || templateService.getById(id) || null;
    };

    const placementMap = new Map<string, MazeBlueprintPlacement>();
    for (const p of blueprint.placements) {
      placementMap.set(`${p.gridX},${p.gridY}`, p);
    }

    for (const p of blueprint.placements) {
      const baseTemplate = getTemplate(p.templateId);
      if (!baseTemplate) continue;
      const template = p.rotation
        ? MapRotationHelper.rotateTemplate(baseTemplate, p.rotation)
        : baseTemplate;

      const N = blueprint.cellSize;

      const neighbors: { dx: number; dy: number; mySide: 'right' | 'bottom'; theirSide: 'left' | 'top' }[] = [
        { dx: 1, dy: 0, mySide: 'right', theirSide: 'left' },
        { dx: 0, dy: 1, mySide: 'bottom', theirSide: 'top' },
      ];

      for (const nb of neighbors) {
        const nx = p.gridX + nb.dx;
        const ny = p.gridY + nb.dy;
        const neighbor = placementMap.get(`${nx},${ny}`);
        if (!neighbor) continue;

        const nBase = getTemplate(neighbor.templateId);
        if (!nBase) continue;
        const nTemplate = neighbor.rotation
          ? MapRotationHelper.rotateTemplate(nBase, neighbor.rotation)
          : nBase;

        const myEdge = this._getEdgePassability(template, nb.mySide, N);
        const theirEdge = this._getEdgePassability(nTemplate, nb.theirSide, N);

        for (let i = 0; i < N; i++) {
          if (myEdge[i] !== theirEdge[i]) {
            issues.push({
              gridX1: p.gridX,
              gridY1: p.gridY,
              gridX2: nx,
              gridY2: ny,
              side: nb.mySide,
              cellIndex: i,
              myPassable: myEdge[i],
              theirPassable: theirEdge[i],
            });
          }
        }
      }
    }

    return issues;
  }

  private _getEdgePassability(template: MapTemplate, side: string, N: number): boolean[] {
    const result: boolean[] = [];
    for (let i = 0; i < N; i++) {
      switch (side) {
        case 'top':    result.push(template.cells[0]?.[i] ?? false); break;
        case 'bottom': result.push(template.cells[N - 1]?.[i] ?? false); break;
        case 'left':   result.push(template.cells[i]?.[0] ?? false); break;
        case 'right':  result.push(template.cells[i]?.[N - 1] ?? false); break;
        default:       result.push(false);
      }
    }
    return result;
  }
}

export interface ConnectivityIssue {
  gridX1: number;
  gridY1: number;
  gridX2: number;
  gridY2: number;
  side: string;
  cellIndex: number;
  myPassable: boolean;
  theirPassable: boolean;
}
