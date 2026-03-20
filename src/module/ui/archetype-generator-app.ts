import {
  ArchetypeGeneratorService,
  ArchetypeGenerationConfig,
  ArchetypeBlueprint,
  ArchetypeGenerationResult,
  MechanismDepth
} from '../services/archetype-generator-service';

export class ArchetypeGeneratorApp extends Application {
  private archetypeService: ArchetypeGeneratorService | null = null;
  private currentBlueprint: ArchetypeBlueprint | null = null;
  private currentConfig: ArchetypeGenerationConfig | null = null;
  private currentResult: ArchetypeGenerationResult | null = null;

  static get defaultOptions() {
    return (foundry as any).utils.mergeObject(super.defaultOptions, {
      id: 'archetype-generator-app',
      title: '变体生成器',
      template: 'modules/ai-pf2e-assistant/templates/archetype-generator-app.hbs',
      width: 580,
      height: 720,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'archetype-generator-app']
    });
  }

  constructor(options = {}) {
    super(options);
  }

  setAIService(aiService: any): void {
    this.archetypeService = new ArchetypeGeneratorService(aiService);
  }

  getData() {
    return {
      showBlueprint: !!this.currentBlueprint && !this.currentResult,
      showResult: !!this.currentResult
    };
  }

  activateListeners(html: JQuery) {
    super.activateListeners(html);

    this._injectStyles();
    const h = html as any;

    h.find('#archetype-feat-count').on('input', (e: any) => {
      h.find('#feat-count-display').text(e.target.value);
    });

    h.find('#btn-design').on('click', (e: Event) => this._onDesign(e));
    h.find('#btn-confirm-blueprint').on('click', (e: Event) => this._onConfirmBlueprint(e));
    h.find('#btn-redesign').on('click', (e: Event) => this._onRedesign(e));
    h.find('#btn-back-to-input').on('click', (e: Event) => this._onBackToInput(e));
    h.find('#btn-new-archetype').on('click', (e: Event) => this._onNewArchetype(e));

    if (this.currentResult) {
      this._showResultSection(h);
    } else if (this.currentBlueprint) {
      this._showBlueprintSection(h);
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  private async _onDesign(event: Event) {
    event.preventDefault();
    const html = (this.element as any);

    if (!this.archetypeService) {
      (ui as any).notifications.error('AI服务未初始化');
      return;
    }

    const config = this._readFormConfig(html);
    if (!config) return;

    this.currentConfig = config;

    this._showBlueprintSection(html);
    html.find('#blueprint-content').html('<p class="placeholder"><i class="fas fa-spinner fa-spin"></i> 正在设计变体蓝图...</p>');
    html.find('#btn-confirm-blueprint').prop('disabled', true);
    html.find('#btn-redesign').prop('disabled', true);

    try {
      this.currentBlueprint = await this.archetypeService.designOnly(config);
      this._renderBlueprint(html, this.currentBlueprint);
      html.find('#btn-confirm-blueprint').prop('disabled', false);
      html.find('#btn-redesign').prop('disabled', false);
    } catch (error: any) {
      console.error('[ArchetypeGenerator] 设计失败:', error);
      html.find('#blueprint-content').html(`<p style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> 设计失败: ${error.message || error}</p>`);
      html.find('#btn-redesign').prop('disabled', false);
    }
  }

  private async _onConfirmBlueprint(event: Event) {
    event.preventDefault();
    const html = (this.element as any);

    if (!this.archetypeService || !this.currentBlueprint || !this.currentConfig) {
      (ui as any).notifications.error('缺少必要数据');
      return;
    }

    this._showProgressSection(html);
    this._updateProgress(html, 10, '正在设计阶段完成，开始生成专长...');

    try {
      this._updateProgress(html, 30, `正在一次性生成 ${this.currentBlueprint.feats.length} 个专长...`);

      this.currentResult = await this.archetypeService.generateFromBlueprint(
        this.currentBlueprint,
        this.currentConfig
      );

      this._updateProgress(html, 100, '生成完成！');

      await new Promise(r => setTimeout(r, 500));
      this._showResultSection(html);
    } catch (error: any) {
      console.error('[ArchetypeGenerator] 生成失败:', error);
      this._updateProgress(html, 0, `生成失败: ${error.message || error}`);
      (ui as any).notifications.error(`变体生成失败: ${error.message || error}`);

      setTimeout(() => {
        this._showBlueprintSection(html);
        if (this.currentBlueprint) {
          this._renderBlueprint(html, this.currentBlueprint);
        }
      }, 2000);
    }
  }

  private async _onRedesign(event: Event) {
    event.preventDefault();
    this.currentBlueprint = null;
    await this._onDesign(event);
  }

  private _onBackToInput(event: Event) {
    event.preventDefault();
    this.currentBlueprint = null;
    const html = (this.element as any);
    this._showInputSection(html);
  }

  private _onNewArchetype(event: Event) {
    event.preventDefault();
    this.currentBlueprint = null;
    this.currentConfig = null;
    this.currentResult = null;
    const html = (this.element as any);
    this._showInputSection(html);
  }

  // ============================================================
  // Section visibility
  // ============================================================

  private _showInputSection(html: any) {
    html.find('.archetype-input-section').show();
    html.find('.archetype-blueprint-section').hide();
    html.find('.archetype-progress-section').hide();
    html.find('.archetype-result-section').hide();
  }

  private _showBlueprintSection(html: any) {
    html.find('.archetype-input-section').hide();
    html.find('.archetype-blueprint-section').show();
    html.find('.archetype-progress-section').hide();
    html.find('.archetype-result-section').hide();
  }

  private _showProgressSection(html: any) {
    html.find('.archetype-input-section').hide();
    html.find('.archetype-blueprint-section').hide();
    html.find('.archetype-progress-section').show();
    html.find('.archetype-result-section').hide();
  }

  private _showResultSection(html: any) {
    html.find('.archetype-input-section').hide();
    html.find('.archetype-blueprint-section').hide();
    html.find('.archetype-progress-section').hide();
    html.find('.archetype-result-section').show();

    if (this.currentResult) {
      this._renderResult(html, this.currentResult);
    }
  }

  // ============================================================
  // Form reading
  // ============================================================

  private _readFormConfig(html: any): ArchetypeGenerationConfig | null {
    const prompt = (html.find('#archetype-prompt').val() || '').trim();
    if (!prompt) {
      (ui as any).notifications.warn('请输入核心主题');
      return null;
    }

    const style = (html.find('#archetype-style').val() || '').trim() || undefined;
    const mechanism = (html.find('#archetype-mechanism').val() || '').trim() || undefined;
    const mechanismDepth = (html.find('#archetype-mechanism-depth').val() || 'moderate') as MechanismDepth;
    const featCount = parseInt(html.find('#archetype-feat-count').val()) || 5;
    const levelStart = parseInt(html.find('#archetype-level-start').val()) || 2;
    const levelEnd = parseInt(html.find('#archetype-level-end').val()) || 12;
    const className = (html.find('#archetype-class-name').val() || '').trim() || undefined;

    if (levelEnd <= levelStart) {
      (ui as any).notifications.warn('最高等级必须大于起始等级');
      return null;
    }

    return {
      prompt,
      style,
      mechanism,
      mechanismDepth,
      featCount,
      levelRange: { start: levelStart, end: levelEnd },
      className
    };
  }

  // ============================================================
  // Rendering
  // ============================================================

  private _renderBlueprint(html: any, blueprint: ArchetypeBlueprint) {
    let content = `<div class="blueprint-name">${this._escapeHtml(blueprint.name)}</div>`;
    content += `<div class="blueprint-style">${this._escapeHtml(blueprint.coreStyle)}</div>`;

    if (blueprint.mechanism) {
      content += `<div class="blueprint-mechanism">`;
      content += `<div class="blueprint-mechanism-title">${this._escapeHtml(blueprint.mechanism.name)}</div>`;
      content += `<div>${this._escapeHtml(blueprint.mechanism.description)}</div>`;
      content += `</div>`;
    }

    content += `<ul class="blueprint-feat-list">`;
    for (const feat of blueprint.feats) {
      content += `<li class="blueprint-feat-item">`;
      content += `<div class="feat-header">`;
      content += `<span class="feat-level">${feat.level}级</span>`;
      if (feat.isDedication) {
        content += `<span class="feat-dedication">入门</span>`;
      }
      content += `${this._escapeHtml(feat.name)}`;
      content += `</div>`;
      content += `<div class="feat-concept">${this._escapeHtml(feat.concept)}</div>`;
      if (feat.mechanismRole) {
        content += `<div class="feat-concept">机制角色：${this._escapeHtml(feat.mechanismRole)}</div>`;
      }
      content += `</li>`;
    }
    content += `</ul>`;

    html.find('#blueprint-content').html(content);
  }

  private _renderResult(html: any, result: ArchetypeGenerationResult) {
    let summary = `<h4>${this._escapeHtml(result.blueprint.name)}</h4>`;
    summary += `<p>${this._escapeHtml(result.blueprint.coreStyle)}</p>`;
    summary += `<p>已生成 ${result.feats.length} 个专长，存储在文件夹 "${this._escapeHtml(result.folderName)}"</p>`;
    html.find('#result-summary').html(summary);

    let cards = '';
    for (const feat of result.feats) {
      const level = feat.system?.level?.value || '?';
      const traits = feat.system?.traits?.value || [];
      const description = feat.system?.description?.value || '';
      const actionType = feat.system?.actionType?.value || 'passive';

      let actionIcon = '';
      if (actionType === 'action') {
        const actions = feat.system?.actions?.value || 1;
        actionIcon = `<span class="action-glyph">${actions}</span>`;
      } else if (actionType === 'reaction') {
        actionIcon = '<span class="action-glyph">r</span>';
      } else if (actionType === 'free') {
        actionIcon = '<span class="action-glyph">f</span>';
      }

      cards += `<div class="feat-card" data-expanded="false">`;
      cards += `<div class="feat-card-header">`;
      cards += `<span class="feat-card-level">${level}级</span>`;
      cards += `<span class="feat-card-name">${this._escapeHtml(feat.name || '未命名')}</span>`;
      cards += actionIcon;
      cards += `</div>`;

      if (traits.length > 0) {
        cards += `<div class="feat-card-traits">`;
        for (const trait of traits) {
          const traitClass = trait === 'archetype' ? 'archetype' : trait === 'dedication' ? 'dedication' : '';
          cards += `<span class="trait-tag ${traitClass}">${this._escapeHtml(trait)}</span>`;
        }
        cards += `</div>`;
      }

      cards += `<div class="feat-card-description">${description}</div>`;
      cards += `</div>`;
    }
    html.find('#feat-cards').html(cards);

    html.find('.feat-card').on('click', function (this: HTMLElement) {
      const el = this as any;
      if (el.classList.contains('expanded')) {
        el.classList.remove('expanded');
      } else {
        el.classList.add('expanded');
      }
    });
  }

  private _updateProgress(html: any, percent: number, text: string) {
    const fill = html.find('#progress-fill');
    if (fill.length && fill[0]) {
      fill[0].style.width = `${percent}%`;
    }
    html.find('#progress-text').text(text);
  }

  // ============================================================
  // Utilities
  // ============================================================

  private _escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private _injectStyles() {
    const styleId = 'archetype-generator-styles';
    if (document.getElementById(styleId)) return;

    try {
      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = 'modules/ai-pf2e-assistant/styles/archetype-generator.css';
      document.head.appendChild(link);
    } catch (e) {
      console.warn('[ArchetypeGenerator] Failed to inject styles:', e);
    }
  }
}
