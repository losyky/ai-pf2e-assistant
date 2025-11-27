import { ShrineItemService } from '../services/shrine-item-service.js';

/**
 * 环形合成组件 - 三环动态槽位设计
 * 内环：神性，中环：贡品，外环：碎片
 */
export class CircularSynthesisComponent {
  private container: HTMLElement;
  private svg: SVGElement;
  private materials: { [key: string]: any[] } = {
    divinities: [],
    offerings: [],
    fragments: []
  };
  private selectedShrine: any = null;
  private shrineRequirements: any = null;
  private onMaterialAdd?: (material: any) => void;
  private onMaterialRemove?: (material: any) => void;
  private onShrineAdd?: (shrine: any) => void;
  private iconPaths: any = {};

  // 三环配置
  private ringConfig = {
    divinities: { radius: 120, color: '#FFD700', name: '神性' }, // 内环，金色
    offerings: { radius: 160, color: '#FF6B35', name: '贡品' },   // 中环，橙色
    fragments: { radius: 200, color: '#4ECDC4', name: '碎片' }    // 外环，青色
  };

  private center = { x: 250, y: 250 };

  constructor(container: HTMLElement, iconPaths: any) {
    this.container = container;
    this.iconPaths = iconPaths;
    this.createSVGCircle();
    // 拖拽现在由主应用处理
  }

  /**
   * 创建SVG环形界面
   */
  private createSVGCircle() {
    // 清空容器
    this.container.innerHTML = '';

    // 创建SVG容器
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '500');
    this.svg.setAttribute('height', '500');
    this.svg.setAttribute('viewBox', '0 0 500 500');
    this.svg.classList.add('synthesis-circle-svg');

    // 添加渐变和滤镜定义
    this.addDefinitions();

    // 创建祭坛背景
    this.createAltarBackground();

    // 创建背景环
    this.createBackgroundRings();

    // 创建中央神龛区域
    this.createCenterShrine();

    // 创建连接线容器
    this.createConnectionLines();

    // 添加到容器
    this.container.appendChild(this.svg);

    // 初始渲染槽位
    this.updateSlots();
  }

  /**
   * 添加SVG定义（渐变、滤镜等）
   */
  private addDefinitions() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // 发光滤镜
    const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    glowFilter.setAttribute('id', 'glow');
    const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    feGaussianBlur.setAttribute('stdDeviation', '3');
    feGaussianBlur.setAttribute('result', 'coloredBlur');
    const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode1.setAttribute('in', 'coloredBlur');
    const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode2.setAttribute('in', 'SourceGraphic');
    
    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    glowFilter.appendChild(feGaussianBlur);
    glowFilter.appendChild(feMerge);
    defs.appendChild(glowFilter);

    // 各种环的渐变
    Object.keys(this.ringConfig).forEach(ringType => {
      const config = this.ringConfig[ringType];
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      gradient.setAttribute('id', `${ringType}Gradient`);
      
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', config.color);
      stop1.setAttribute('stop-opacity', '0.3');
      
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', config.color);
      stop2.setAttribute('stop-opacity', '0.1');
      
      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs.appendChild(gradient);
    });

    this.svg.appendChild(defs);
  }

  /**
   * 创建祭坛背景
   */
  private createAltarBackground() {
    // 主祭坛圆形背景
    const altarBase = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    altarBase.setAttribute('cx', this.center.x.toString());
    altarBase.setAttribute('cy', this.center.y.toString());
    altarBase.setAttribute('r', '240');
    altarBase.setAttribute('fill', 'url(#altarGradient)');
    altarBase.setAttribute('stroke', '#D4AF37');
    altarBase.setAttribute('stroke-width', '4');
    altarBase.setAttribute('filter', 'url(#glow)');
    altarBase.classList.add('altar-base');
    this.svg.appendChild(altarBase);

    // 外装饰环
    const outerDecoration = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outerDecoration.setAttribute('cx', this.center.x.toString());
    outerDecoration.setAttribute('cy', this.center.y.toString());
    outerDecoration.setAttribute('r', '250');
    outerDecoration.setAttribute('fill', 'none');
    outerDecoration.setAttribute('stroke', '#D4AF37');
    outerDecoration.setAttribute('stroke-width', '2');
    outerDecoration.setAttribute('stroke-dasharray', '10,5');
    outerDecoration.setAttribute('stroke-opacity', '0.6');
    outerDecoration.classList.add('outer-decoration');
    this.svg.appendChild(outerDecoration);

    // 内装饰环
    const innerDecoration = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    innerDecoration.setAttribute('cx', this.center.x.toString());
    innerDecoration.setAttribute('cy', this.center.y.toString());
    innerDecoration.setAttribute('r', '230');
    innerDecoration.setAttribute('fill', 'none');
    innerDecoration.setAttribute('stroke', '#B8860B');
    innerDecoration.setAttribute('stroke-width', '1');
    innerDecoration.setAttribute('stroke-dasharray', '5,3');
    innerDecoration.setAttribute('stroke-opacity', '0.4');
    innerDecoration.classList.add('inner-decoration');
    this.svg.appendChild(innerDecoration);

    // 添加祭坛渐变到定义中
    const defs = this.svg.querySelector('defs');
    const altarGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    altarGradient.setAttribute('id', 'altarGradient');
    altarGradient.setAttribute('cx', '50%');
    altarGradient.setAttribute('cy', '50%');
    altarGradient.setAttribute('r', '50%');

    const stops = [
      { offset: '0%', color: '#D4AF37', opacity: '0.3' },
      { offset: '20%', color: '#B8860B', opacity: '0.4' },
      { offset: '40%', color: '#8B4513', opacity: '0.5' },
      { offset: '60%', color: '#654321', opacity: '0.6' },
      { offset: '80%', color: '#1A0F0A', opacity: '0.8' },
      { offset: '100%', color: '#000000', opacity: '0.9' }
    ];

    stops.forEach(stop => {
      const stopElement = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stopElement.setAttribute('offset', stop.offset);
      stopElement.setAttribute('stop-color', stop.color);
      stopElement.setAttribute('stop-opacity', stop.opacity);
      altarGradient.appendChild(stopElement);
    });

    defs?.appendChild(altarGradient);
  }

  /**
   * 创建背景环
   */
  private createBackgroundRings() {
    Object.keys(this.ringConfig).forEach(ringType => {
      const config = this.ringConfig[ringType];
      
      // 主环
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', this.center.x.toString());
      ring.setAttribute('cy', this.center.y.toString());
      ring.setAttribute('r', config.radius.toString());
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', config.color);
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('stroke-opacity', '0.3');
      ring.classList.add(`${ringType}-ring`);
      
      this.svg.appendChild(ring);

      // 环标签
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', (this.center.x + config.radius + 15).toString());
      label.setAttribute('y', this.center.y.toString());
      label.setAttribute('text-anchor', 'start');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', config.color);
      label.setAttribute('font-size', '12');
      label.setAttribute('font-weight', 'bold');
      label.textContent = config.name;
      label.classList.add(`${ringType}-label`);
      
      this.svg.appendChild(label);
    });
  }

  /**
   * 创建中央神龛区域
   */
  private createCenterShrine() {
    // 中央圆形区域
    const shrineArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    shrineArea.setAttribute('cx', this.center.x.toString());
    shrineArea.setAttribute('cy', this.center.y.toString());
    shrineArea.setAttribute('r', '60');
    shrineArea.setAttribute('fill', 'url(#shrineGradient)');
    shrineArea.setAttribute('stroke', '#D4AF37');
    shrineArea.setAttribute('stroke-width', '3');
    shrineArea.classList.add('shrine-area');
    shrineArea.id = 'shrine-drop-area';
    
    this.svg.appendChild(shrineArea);

    // 添加神龛渐变
    const defs = this.svg.querySelector('defs') || this.svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
    const shrineGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    shrineGradient.setAttribute('id', 'shrineGradient');
    
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#D4AF37');
    stop1.setAttribute('stop-opacity', '0.2');
    
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#B8860B');
    stop2.setAttribute('stop-opacity', '0.4');
    
    shrineGradient.appendChild(stop1);
    shrineGradient.appendChild(stop2);
    defs.appendChild(shrineGradient);

    // 中央文字提示
    const shrineText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    shrineText.setAttribute('x', this.center.x.toString());
    shrineText.setAttribute('y', this.center.y.toString());
    shrineText.setAttribute('text-anchor', 'middle');
    shrineText.setAttribute('dominant-baseline', 'middle');
    shrineText.setAttribute('fill', '#0a0802');
    shrineText.setAttribute('font-size', '14');
    shrineText.setAttribute('font-weight', 'bold');
    shrineText.textContent = '拖拽神龛到此';
    shrineText.classList.add('shrine-placeholder-text');
    shrineText.id = 'shrine-placeholder-text';
    
    this.svg.appendChild(shrineText);
  }

  /**
   * 创建连接线容器
   */
  private createConnectionLines() {
    const connectionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    connectionGroup.setAttribute('id', 'connection-lines');
    this.svg.appendChild(connectionGroup);
  }

  /**
   * 更新动态槽位
   */
  private updateSlots() {
    // 清除现有槽位
    const existingSlots = this.svg.querySelectorAll('.material-slot');
    existingSlots.forEach(slot => slot.remove());

    // 为每种材料类型创建槽位
    Object.keys(this.ringConfig).forEach(materialType => {
      this.createSlotsForMaterialType(materialType);
    });

    // 更新连接线
    this.updateConnectionLines();
  }

  /**
   * 为指定材料类型创建槽位
   */
  private createSlotsForMaterialType(materialType: string) {
    const materials = this.materials[materialType] || [];
    const config = this.ringConfig[materialType];
    const requirements = this.getRequirementsForType(materialType);
    
    // 计算当前需要的槽位数量
    const minSlots = requirements?.min || 0;
    const maxSlots = requirements?.max || 8;
    const currentSlots = Math.max(minSlots, materials.length);
    const slotsToShow = Math.min(currentSlots, maxSlots);

    // 如果没有槽位需要显示，跳过
    if (slotsToShow === 0) return;

    // 计算角度间隔
    const angleStep = (2 * Math.PI) / slotsToShow;
    // 为每个环设置不同的起始角度，避免重叠
    const startAngle = this.getRingStartAngle(materialType) - (Math.PI / 2);

    for (let i = 0; i < slotsToShow; i++) {
      const angle = startAngle + (i * angleStep);
      const x = this.center.x + config.radius * Math.cos(angle);
      const y = this.center.y + config.radius * Math.sin(angle);

      this.createMaterialSlot(x, y, materialType, i, materials[i]);
    }
  }

  /**
   * 创建单个材料槽位
   */
  private createMaterialSlot(x: number, y: number, materialType: string, index: number, material?: any) {
    const config = this.ringConfig[materialType];
    const slotGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    slotGroup.classList.add('material-slot', `${materialType}-slot`);
    slotGroup.setAttribute('data-material-type', materialType);
    slotGroup.setAttribute('data-slot-index', index.toString());

    // 槽位圆形
    const slotCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    slotCircle.setAttribute('cx', x.toString());
    slotCircle.setAttribute('cy', y.toString());
    slotCircle.setAttribute('r', '25');
    slotCircle.setAttribute('fill', material ? 'url(#' + materialType + 'Gradient)' : 'rgba(255,255,255,0.1)');
    slotCircle.setAttribute('stroke', config.color);
    slotCircle.setAttribute('stroke-width', material ? '3' : '2');
    slotCircle.setAttribute('stroke-dasharray', material ? '0' : '5,5');
    slotCircle.classList.add('slot-circle');

    // 如果有材料，显示材料图标
    if (material) {
      const materialIcon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      materialIcon.setAttribute('x', (x - 15).toString());
      materialIcon.setAttribute('y', (y - 15).toString());
      materialIcon.setAttribute('width', '30');
      materialIcon.setAttribute('height', '30');
      materialIcon.setAttribute('href', this.getIconForMaterial(material));
      materialIcon.classList.add('material-icon');
      slotGroup.appendChild(materialIcon);

      // 材料名称文字
      const materialText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      materialText.setAttribute('x', x.toString());
      materialText.setAttribute('y', (y + 35).toString());
      materialText.setAttribute('text-anchor', 'middle');
      materialText.setAttribute('fill', config.color);
      materialText.setAttribute('font-size', '10');
      materialText.textContent = material.name;
      materialText.classList.add('material-text');
      slotGroup.appendChild(materialText);
    }

    slotGroup.appendChild(slotCircle);
    this.svg.appendChild(slotGroup);

    // 设置拖拽事件
    this.setupSlotDragEvents(slotGroup, materialType, index);
  }

  /**
   * 获取材料类型的需求配置
   */
  private getRequirementsForType(materialType: string) {
    if (!this.shrineRequirements) return null;
    
    switch (materialType) {
      case 'divinities': return this.shrineRequirements.divinities;
      case 'offerings': return this.shrineRequirements.offerings;
      case 'fragments': return this.shrineRequirements.fragments;
      default: return null;
    }
  }

  /**
   * 获取环的起始角度，确保环之间错开
   */
  private getRingStartAngle(materialType: string): number {
    switch (materialType) {
      case 'divinities': return 0; // 0度起始
      case 'offerings': return Math.PI / 3; // 60度起始  
      case 'fragments': return -Math.PI / 6; // -30度起始
      default: return 0;
    }
  }

  /**
   * 获取材料对应的图标
   */
  private getIconForMaterial(material: any): string {
    // 首先尝试使用物品自身的图标
    if (material.img) {
      return material.img;
    }
    
    // 如果是ShrineSynthesisMaterial对象，尝试从原始物品获取图标
    if (material.originalItem?.img) {
      return material.originalItem.img;
    }
    
    // 根据识别的材料类型返回默认图标
    const itemType = this.getItemType(material);
    switch (itemType) {
      case 'divinity': return this.iconPaths.sunStone || 'icons/magic/symbols/runes-star-pentagon-blue.webp';
      case 'offering': return this.iconPaths.sacredOffering || 'icons/magic/symbols/elements-air-water-fire-earth.webp';
      case 'fragment': return this.iconPaths.divineFragment || 'icons/commodities/gems/gem-shattered-white.webp';
      case 'shrine': return this.iconPaths.shrineAltar || 'icons/environment/settlement/altar-stone-simple.webp';
      default: return 'icons/sundries/gaming/dice-runed-brown.webp';
    }
  }

  /**
   * 更新连接线
   */
  private updateConnectionLines() {
    const connectionGroup = this.svg.querySelector('#connection-lines');
    if (!connectionGroup) return;

    // 清除现有连接线
    connectionGroup.innerHTML = '';

    // 只有当神龛存在时才绘制连接线
    if (!this.selectedShrine) return;

    // 收集所有有材料的槽位 - 使用与创建槽位相同的逻辑
    const filledSlots: { x: number, y: number, type: string }[] = [];
    
    Object.keys(this.materials).forEach(materialType => {
      const materials = this.materials[materialType] || [];
      const config = this.ringConfig[materialType];
      const requirements = this.getRequirementsForType(materialType);
      
      if (materials.length > 0) {
        // 计算槽位数量和角度 - 与 createSlotsForMaterialType 保持一致
        const minSlots = requirements?.min || 0;
        const maxSlots = requirements?.max || 8;
        const currentSlots = Math.max(minSlots, materials.length);
        const slotsToShow = Math.min(currentSlots, maxSlots);
        
        const angleStep = (2 * Math.PI) / slotsToShow;
        const startAngle = this.getRingStartAngle(materialType) - (Math.PI / 2);
        
        materials.forEach((material, index) => {
          if (material) {
            const angle = startAngle + (index * angleStep);
            const x = this.center.x + config.radius * Math.cos(angle);
            const y = this.center.y + config.radius * Math.sin(angle);
            
            filledSlots.push({ x, y, type: materialType });
          }
        });
      }
    });

    // 绘制连接线
    this.drawConnectionLines(filledSlots, connectionGroup);
  }

  /**
   * 绘制连接线 - 每环一条非闭合线串联，垂直+环形走向
   */
  private drawConnectionLines(slots: { x: number, y: number, type: string }[], container: Element) {
    if (slots.length === 0) return;

    // 按类型分组材料
    const typeGroups: { [key: string]: Array<{ x: number, y: number, type: string }> } = {};
    slots.forEach(slot => {
      if (!typeGroups[slot.type]) typeGroups[slot.type] = [];
      typeGroups[slot.type].push(slot);
    });
    

    Object.entries(typeGroups).forEach(([materialType, materials], groupIndex) => {
      const config = this.ringConfig[materialType];
      if (!config || materials.length === 0) return;


      if (materials.length >= 2) {
        // 多个材料：创建非闭合串联线（不包含中心连接）
        this.createRingSeriesConnection(materials, config, container, groupIndex);
      }
      // 单个材料不显示任何连接线
    });
  }

  /**
   * 创建动画连接线
   */
  private createAnimatedLine(
    x1: number, y1: number, x2: number, y2: number,
    color: string, width: number, opacity: number,
    className: string, animationDelay: number = 0
  ): SVGLineElement {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toString());
    line.setAttribute('y1', y1.toString());
    line.setAttribute('x2', x2.toString());
    line.setAttribute('y2', y2.toString());
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width.toString());
    line.setAttribute('stroke-opacity', opacity.toString());
    line.setAttribute('filter', 'url(#glow)');
    line.classList.add('connection-line', className);
    
    if (animationDelay > 0) {
      line.style.animationDelay = `${animationDelay}ms`;
    }
    
    return line;
  }

  /**
   * 创建环形串联连接 - 垂直+环形走向
   */
  private createRingSeriesConnection(
    materials: Array<{ x: number, y: number, type: string }>,
    config: any,
    container: Element,
    groupIndex: number
  ) {
    if (materials.length < 2) return;

    // 按角度排序材料，确保连接顺序合理
    const sortedMaterials = materials.sort((a, b) => {
      const angleA = Math.atan2(a.y - this.center.y, a.x - this.center.x);
      const angleB = Math.atan2(b.y - this.center.y, b.x - this.center.x);
      return angleA - angleB;
    });


    // 在环上依次连接材料（非闭合，不连接中心）
    for (let i = 0; i < sortedMaterials.length - 1; i++) {
      const current = sortedMaterials[i];
      const next = sortedMaterials[i + 1];
      
      // 计算连接路径：垂直到环 + 沿环到下一个点 + 垂直到材料
      const ringPath = this.createRingPath(current, next, config, groupIndex, i);
      container.appendChild(ringPath);
    }
  }

  /**
   * 创建环形路径 - 垂直+弧形+垂直
   */
  private createRingPath(
    start: { x: number, y: number, type: string },
    end: { x: number, y: number, type: string },
    config: any,
    groupIndex: number,
    segmentIndex: number
  ): SVGPathElement {
    const radius = config.radius;
    
    // 计算起点和终点在环上的投影点
    const startAngle = Math.atan2(start.y - this.center.y, start.x - this.center.x);
    const endAngle = Math.atan2(end.y - this.center.y, end.x - this.center.x);
    
    const startRingX = this.center.x + radius * Math.cos(startAngle);
    const startRingY = this.center.y + radius * Math.sin(startAngle);
    const endRingX = this.center.x + radius * Math.cos(endAngle);
    const endRingY = this.center.y + radius * Math.sin(endAngle);

    // 计算弧形路径参数
    let angleDiff = endAngle - startAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;
    const sweepFlag = angleDiff > 0 ? 1 : 0;

    // 创建路径：起点 -> 环 -> 沿环弧形 -> 终点
    const pathData = [
      `M ${start.x} ${start.y}`,  // 移动到起点材料
      `L ${startRingX} ${startRingY}`,  // 直线到环上
      `A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endRingX} ${endRingY}`,  // 沿环弧形
      `L ${end.x} ${end.y}`  // 直线到终点材料
    ].join(' ');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('stroke', config.color);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-opacity', '0.6');
    path.setAttribute('fill', 'none');
    path.setAttribute('filter', 'url(#glow)');
    path.setAttribute('stroke-dasharray', '4,2');
    path.classList.add('connection-line', `ring-series-${groupIndex}-${segmentIndex}`);
    
    // 延迟动画
    path.style.animationDelay = `${(segmentIndex + 1) * 300}ms`;

    
    return path;
  }

  /**
   * 旧的星座图案连接方法（已弃用）
   */
  private createConstellationPattern(
    materials: Array<{ x: number, y: number, type: string }>,
    config: any,
    container: Element,
    groupIndex: number
  ) {
    const count = materials.length;
    
    if (count === 2) {
      // 两个材料：简单连接
      const line = this.createAnimatedLine(
        materials[0].x, materials[0].y,
        materials[1].x, materials[1].y,
        config.color, 1.5, 0.6,
        `constellation-simple-${groupIndex}`,
        400
      );
      line.setAttribute('stroke-dasharray', '4,2');
      container.appendChild(line);
      
    } else if (count === 3) {
      // 三个材料：三角形连接
      for (let i = 0; i < 3; i++) {
        const current = materials[i];
        const next = materials[(i + 1) % 3];
        
        const line = this.createAnimatedLine(
          current.x, current.y,
          next.x, next.y,
          config.color, 1.5, 0.5,
          `constellation-triangle-${groupIndex}-${i}`,
          600 + i * 150
        );
        line.setAttribute('stroke-dasharray', '3,3');
        container.appendChild(line);
      }
      
    } else if (count === 4) {
      // 四个材料：创建四边形 + 对角线
      // 外围连接
      for (let i = 0; i < 4; i++) {
        const current = materials[i];
        const next = materials[(i + 1) % 4];
        
        const line = this.createAnimatedLine(
          current.x, current.y,
          next.x, next.y,
          config.color, 1.5, 0.5,
          `constellation-quad-${groupIndex}-${i}`,
          800 + i * 100
        );
        line.setAttribute('stroke-dasharray', '4,2');
        container.appendChild(line);
      }
      
      // 对角线连接
      const diagonal1 = this.createAnimatedLine(
        materials[0].x, materials[0].y,
        materials[2].x, materials[2].y,
        config.color, 1, 0.3,
        `constellation-diag1-${groupIndex}`,
        1200
      );
      diagonal1.setAttribute('stroke-dasharray', '2,4');
      container.appendChild(diagonal1);
      
      const diagonal2 = this.createAnimatedLine(
        materials[1].x, materials[1].y,
        materials[3].x, materials[3].y,
        config.color, 1, 0.3,
        `constellation-diag2-${groupIndex}`,
        1350
      );
      diagonal2.setAttribute('stroke-dasharray', '2,4');
      container.appendChild(diagonal2);
      
    } else {
      // 更多材料：创建复杂星座图案
      // 按角度排序
      const sortedMaterials = materials.sort((a, b) => {
        const angleA = Math.atan2(a.y - this.center.y, a.x - this.center.x);
        const angleB = Math.atan2(b.y - this.center.y, b.x - this.center.x);
        return angleA - angleB;
      });
      
      // 环形连接
      for (let i = 0; i < sortedMaterials.length; i++) {
        const current = sortedMaterials[i];
        const next = sortedMaterials[(i + 1) % sortedMaterials.length];
        
        const line = this.createAnimatedLine(
          current.x, current.y,
          next.x, next.y,
          config.color, 1.5, 0.4,
          `constellation-ring-${groupIndex}-${i}`,
          1000 + i * 80
        );
        line.setAttribute('stroke-dasharray', '3,2');
        container.appendChild(line);
      }
      
      // 星形连接（每隔一个连接）
      for (let i = 0; i < sortedMaterials.length; i++) {
        const current = sortedMaterials[i];
        const target = sortedMaterials[(i + 2) % sortedMaterials.length];
        
        const line = this.createAnimatedLine(
          current.x, current.y,
          target.x, target.y,
          config.color, 1, 0.25,
          `constellation-star-${groupIndex}-${i}`,
          1500 + i * 100
        );
        line.setAttribute('stroke-dasharray', '2,3');
        container.appendChild(line);
      }
    }
  }

  /**
   * 设置槽位拖拽事件
   */
  private setupSlotDragEvents(slotElement: Element, materialType: string, slotIndex: number) {
    slotElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      slotElement.classList.add('drag-over');
    });

    slotElement.addEventListener('dragleave', () => {
      slotElement.classList.remove('drag-over');
    });

    slotElement.addEventListener('drop', (e) => {
      e.preventDefault();
      slotElement.classList.remove('drag-over');
      
      try {
        const data = e.dataTransfer?.getData('text/plain');
        if (data) {
          const item = JSON.parse(data);
          this.handleMaterialDrop(item, materialType, slotIndex);
        }
      } catch (error) {
        console.error('处理材料拖拽失败:', error);
      }
    });

    // 点击移除材料
    slotElement.addEventListener('click', () => {
      const material = this.materials[materialType]?.[slotIndex];
      if (material && this.onMaterialRemove) {
        this.onMaterialRemove(material);
      }
    });
  }

  /**
   * 处理材料拖拽到槽位
   */
  private handleMaterialDrop(item: any, targetType: string, slotIndex: number) {
    // 验证材料类型
    const itemType = this.getItemType(item);
    const expectedType = this.getMaterialTypeForItemType(itemType);
    
    if (expectedType !== targetType) {
      console.warn(`材料类型不匹配: 期望 ${targetType}, 实际 ${itemType}`);
      return;
    }

    // 检查是否已达到最大值
    const requirements = this.getRequirementsForType(targetType);
    const currentCount = this.materials[targetType]?.length || 0;
    
    if (requirements?.max && currentCount >= requirements.max) {
      ui.notifications?.warn(`${this.ringConfig[targetType].name}已达到最大数量限制 (${requirements.max})`);
      return;
    }

    // 添加材料
    if (this.onMaterialAdd) {
      this.onMaterialAdd(item);
    }
  }

  /**
   * 获取物品类型
   */
  private getItemType(item: any): string {
    // 如果是ShrineSynthesisMaterial对象，直接使用type字段
    if (item.type && ['fragment', 'divinity', 'offering', 'shrine'].includes(item.type)) {
      return item.type;
    }
    // 否则使用服务识别
    return ShrineItemService.getItemType(item);
  }

  /**
   * 将物品类型映射到材料环类型
   */
  private getMaterialTypeForItemType(itemType: string): string {
    switch (itemType) {
      case 'divinity': return 'divinities';
      case 'offering': return 'offerings';
      case 'fragment': return 'fragments';
      default: return 'unknown';
    }
  }

  /**
   * 设置拖拽和落下区域
   */
  private setupDragAndDrop() {
    // 为整个SVG容器设置拖拽事件
    this.svg.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    this.svg.addEventListener('drop', (e) => {
      e.preventDefault();
      this.handleGlobalDrop(e);
    });

    // 神龛拖拽区域
    const shrineArea = this.svg.querySelector('#shrine-drop-area');
    if (shrineArea) {
      this.setupShrineDropEvents(shrineArea);
    }
  }

  /**
   * 处理全局拖拽事件
   */
  private handleGlobalDrop(e: DragEvent) {
    try {
      const data = e.dataTransfer?.getData('text/plain');
      if (!data) return;

      const item = JSON.parse(data);
      const itemType = this.getItemType(item);


      // 如果是神龛，检查是否拖到中央区域
      if (itemType === 'shrine') {
        const rect = this.svg.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const dropX = e.clientX - rect.left;
        const dropY = e.clientY - rect.top;
        
        const distance = Math.sqrt((dropX - centerX) ** 2 + (dropY - centerY) ** 2);
        
        if (distance <= 60) { // 神龛区域半径
          if (this.onShrineAdd) {
            this.onShrineAdd(item);
          }
        } else {
          ui.notifications?.warn('请将神龛拖拽到中央区域');
        }
        return;
      }

      // 其他材料类型
      const materialType = this.getMaterialTypeForItemType(itemType);
      if (materialType !== 'unknown') {
        if (this.onMaterialAdd) {
          this.onMaterialAdd(item);
        }
      } else {
        ui.notifications?.warn('无法识别的物品类型');
      }
    } catch (error) {
      console.error('处理拖拽失败:', error);
    }
  }

  /**
   * 设置神龛拖拽事件
   */
  private setupShrineDropEvents(shrineArea: Element) {
    shrineArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      shrineArea.classList.add('shrine-drag-hover');
    });

    shrineArea.addEventListener('dragleave', () => {
      shrineArea.classList.remove('shrine-drag-hover');
    });

    shrineArea.addEventListener('drop', (e) => {
      e.preventDefault();
      shrineArea.classList.remove('shrine-drag-hover');
      
      try {
        const data = e.dataTransfer?.getData('text/plain');
        if (data) {
          const item = JSON.parse(data);
          if (this.getItemType(item) === 'shrine' && this.onShrineAdd) {
            this.onShrineAdd(item);
          }
        }
      } catch (error) {
        console.error('处理神龛拖拽失败:', error);
      }
    });
  }

  /**
   * 更新材料
   */
  updateMaterials(materials: any[]) {
    // 按类型分组材料
    this.materials = {
      divinities: [],
      offerings: [],
      fragments: []
    };

    materials.forEach(material => {
      const itemType = this.getItemType(material);
      const materialType = this.getMaterialTypeForItemType(itemType);
      
      if (materialType !== 'unknown') {
        this.materials[materialType].push(material);
      }
    });

    this.updateSlots();
  }

  /**
   * 更新神龛
   */
  updateShrine(shrine: any) {
    this.selectedShrine = shrine;

    // 提取神龛需求
    if (shrine) {
      // 这里应该调用 ShrineItemService.extractSynthesisRequirements
      // 暂时使用简化版本
      this.shrineRequirements = this.extractShrineRequirements(shrine);
      
      // 更新中央显示
      const shrineText = this.svg.querySelector('#shrine-placeholder-text');
      if (shrineText) {
        shrineText.textContent = shrine.name;
      }
    } else {
      this.shrineRequirements = null;
      const shrineText = this.svg.querySelector('#shrine-placeholder-text');
      if (shrineText) {
        shrineText.textContent = '拖拽神龛到此';
      }
    }

    this.updateSlots();
  }

  /**
   * 提取神龛需求
   */
  private extractShrineRequirements(shrine: any) {
    // 如果是ShrineSynthesisMaterial对象，使用originalItem
    const shrineItem = shrine?.originalItem || shrine;
    const requirements = ShrineItemService.extractSynthesisRequirements(shrineItem);
    
    if (requirements) {
      return requirements;
    }
    
    // 默认需求
    return {
      fragments: { min: 2, max: 4 },
      divinities: { min: 1, max: 2 },
      offerings: { min: 0, max: 1 }
    };
  }

  /**
   * 设置事件处理器
   */
  setEventHandlers(
    onMaterialAdd: (material: any) => void,
    onMaterialRemove: (material: any) => void,
    onShrineAdd: (shrine: any) => void
  ) {
    this.onMaterialAdd = onMaterialAdd;
    this.onMaterialRemove = onMaterialRemove;
    this.onShrineAdd = onShrineAdd;
  }

  /**
   * 更新环的颜色（主题切换）
   */
  updateRingColors(colors: {divinities: string, offerings: string, fragments: string}) {
    try {
      // 更新内部配置
      this.ringConfig.divinities.color = colors.divinities;
      this.ringConfig.offerings.color = colors.offerings;
      this.ringConfig.fragments.color = colors.fragments;
      
      // 更新SVG元素的颜色
      if (this.svg) {
        const divinitiesRing = this.svg.querySelector('.divinities-ring') as SVGCircleElement;
        const offeringsRing = this.svg.querySelector('.offerings-ring') as SVGCircleElement;
        const fragmentsRing = this.svg.querySelector('.fragments-ring') as SVGCircleElement;
        
        if (divinitiesRing) {
          divinitiesRing.style.stroke = colors.divinities;
        }
        if (offeringsRing) {
          offeringsRing.style.stroke = colors.offerings;
        }
        if (fragmentsRing) {
          fragmentsRing.style.stroke = colors.fragments;
        }
        
        // 注意：不修改标签颜色，保持原始颜色
        console.log('CircularSynthesisComponent | 环颜色已更新（标签颜色保持不变）:', colors);
      }
    } catch (error) {
      console.error('CircularSynthesisComponent | 更新环颜色失败:', error);
    }
  }
  
  /**
   * 更新环的标签文字（主题切换）
   */
  updateRingLabels(labels: {divinities: string, offerings: string, fragments: string}) {
    try {
      // 更新内部配置
      this.ringConfig.divinities.name = labels.divinities;
      this.ringConfig.offerings.name = labels.offerings;
      this.ringConfig.fragments.name = labels.fragments;
      
      // 更新SVG标签文字
      if (this.svg) {
        const divinitiesLabel = this.svg.querySelector('.divinities-label') as SVGTextElement;
        const offeringsLabel = this.svg.querySelector('.offerings-label') as SVGTextElement;
        const fragmentsLabel = this.svg.querySelector('.fragments-label') as SVGTextElement;
        
        if (divinitiesLabel) {
          divinitiesLabel.textContent = labels.divinities;
        }
        if (offeringsLabel) {
          offeringsLabel.textContent = labels.offerings;
        }
        if (fragmentsLabel) {
          fragmentsLabel.textContent = labels.fragments;
        }
        
        console.log('CircularSynthesisComponent | 环标签文字已更新:', labels);
      }
    } catch (error) {
      console.error('CircularSynthesisComponent | 更新环标签文字失败:', error);
    }
  }
  
  /**
   * 更新占位符文字（主题切换）
   */
  updatePlaceholderText(text: string) {
    try {
      if (this.svg) {
        const placeholderText = this.svg.querySelector('.shrine-placeholder-text') as SVGTextElement;
        if (placeholderText) {
          placeholderText.textContent = text;
          console.log('CircularSynthesisComponent | 占位符文字已更新:', text);
        }
      }
    } catch (error) {
      console.error('CircularSynthesisComponent | 更新占位符文字失败:', error);
    }
  }
  
  /**
   * 更新圆形背景（主题切换）
   */
  updateCircleBackground(theme: any) {
    try {
      if (this.svg) {
        const altarBase = this.svg.querySelector('.altar-base') as SVGCircleElement;
        if (altarBase) {
          if (theme.id === 'pokemon') {
            // 爱达梦主题：淡蓝色圆形背景
            altarBase.setAttribute('fill', 'url(#blueAltarGradient)');
            altarBase.setAttribute('stroke', theme.colors.primary);
            
            // 如果渐变不存在，创建它
            this.createBlueGradient();
          } else {
            // 神龛主题：原始背景
            altarBase.setAttribute('fill', 'url(#altarGradient)');
            altarBase.setAttribute('stroke', '#D4AF37');
          }
          console.log('CircularSynthesisComponent | 圆形背景已更新:', theme.id);
        }
      }
    } catch (error) {
      console.error('CircularSynthesisComponent | 更新圆形背景失败:', error);
    }
  }
  
  /**
   * 创建蓝色渐变（爱达梦主题）
   */
  private createBlueGradient() {
    const defs = this.svg.querySelector('defs');
    if (defs && !defs.querySelector('#blueAltarGradient')) {
      const blueGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      blueGradient.setAttribute('id', 'blueAltarGradient');
      blueGradient.setAttribute('cx', '50%');
      blueGradient.setAttribute('cy', '50%');
      blueGradient.setAttribute('r', '50%');
      
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', 'rgba(227, 242, 253, 0.9)');
      
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '50%');
      stop2.setAttribute('stop-color', 'rgba(100, 181, 246, 0.7)');
      
      const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop3.setAttribute('offset', '100%');
      stop3.setAttribute('stop-color', 'rgba(66, 165, 245, 0.5)');
      
      blueGradient.appendChild(stop1);
      blueGradient.appendChild(stop2);
      blueGradient.appendChild(stop3);
      defs.appendChild(blueGradient);
    }
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}