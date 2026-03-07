/**
 * 遗名之穹规则修正配置管理器
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';
import { DAMAGE_TYPE_LABELS } from '../../vault-rules/anomaly-tracker';

declare const game: Game;
declare const CONFIG: any;
declare const ui: any;
declare function fromUuid(uuid: string): Promise<any>;

interface DamageTypeOption {
  value: string;
  label: string;
}

export class VaultRulesConfigManager extends BaseConfigManager {
  private enabledDamageTypes: string[] = [];
  private availableDamageTypes: DamageTypeOption[] = [];
  private damageTypeLabelMap: Map<string, string> = new Map();
  private macroUuids: Record<string, string> = {};
  private typeMultipliers: Record<string, number> = {};
  private _dataLoaded = false;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-vault-rules-config',
      title: '遗名之穹规则修正配置',
      template: `modules/${MODULE_ID}/templates/config-managers/vault-rules-config-manager.html`,
      width: 650,
      height: 'auto',
      dragDrop: [{ dropSelector: '.macro-drop-zone' }]
    });
  }

  private loadAvailableDamageTypes(): void {
    const merged = new Map<string, string>();

    const pf2eDamageTypes: Record<string, string> = CONFIG?.PF2E?.damageTypes || {};
    for (const [slug, i18nKey] of Object.entries(pf2eDamageTypes)) {
      const label = typeof i18nKey === 'string' ? (game.i18n?.localize(i18nKey) || i18nKey) : slug;
      merged.set(slug, label);
    }

    for (const [slug, label] of Object.entries(DAMAGE_TYPE_LABELS)) {
      if (!merged.has(slug)) {
        merged.set(slug, label);
      }
    }

    this.availableDamageTypes = Array.from(merged.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    this.damageTypeLabelMap = merged;
  }

  private getDamageTypeLabel(slug: string): string {
    return this.damageTypeLabelMap.get(slug)
      || DAMAGE_TYPE_LABELS[slug]
      || slug;
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);

    this.loadAvailableDamageTypes();

    if (!this._dataLoaded) {
      this.enabledDamageTypes = this.getSetting('vaultAnomalyTypes') || [];
      const storedMacros: Record<string, string> = this.getSetting('vaultAnomalyMacros') || {};
      const storedMultipliers: Record<string, number> = this.getSetting('vaultAnomalyMultipliers') || {};
      for (const key of this.enabledDamageTypes) {
        if (storedMacros[key]) {
          this.macroUuids[key] = storedMacros[key];
        }
        this.typeMultipliers[key] = storedMultipliers[key] ?? 4;
      }
      this._dataLoaded = true;
    }

    const enabledTypeLabels = this.enabledDamageTypes.map(slug => ({
      value: slug,
      label: this.getDamageTypeLabel(slug)
    }));

    const macroConfigs = await Promise.all(this.enabledDamageTypes.map(async (key) => {
      let macroUuid = this.macroUuids[key] || '';
      let macroName = '';
      if (macroUuid) {
        try {
          const macro = await fromUuid(macroUuid);
          if (macro) {
            macroName = macro.name || '';
          } else {
            const byName = game.macros?.find((m: any) => m.name === macroUuid);
            if (byName) {
              macroUuid = byName.uuid;
              this.macroUuids[key] = macroUuid;
              macroName = byName.name;
            }
          }
        } catch {
          const byName = game.macros?.find((m: any) => m.name === macroUuid);
          if (byName) {
            macroUuid = byName.uuid;
            this.macroUuids[key] = macroUuid;
            macroName = byName.name;
          }
        }
      }
      return { key, label: this.getDamageTypeLabel(key), macroUuid, macroName, multiplier: this.typeMultipliers[key] ?? 4 };
    }));

    return foundry.utils.mergeObject(data, {
      anomaly: {
        enabled: this.getSetting('vaultAnomalyEnabled') ?? false,
        enabledTypeLabels,
        macroConfigs
      },
      availableDamageTypes: this.availableDamageTypes,
      betterAttributes: {
        enabled: this.getSetting('vaultBetterAttributesEnabled') ?? false,
        dexEnabled: this.getSetting('vaultBetterDexEnabled') ?? true,
        intEnabled: this.getSetting('vaultBetterIntEnabled') ?? true,
        chaEnabled: this.getSetting('vaultBetterChaEnabled') ?? true
      }
    });
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    try {
      // 从表单中读取每个类型的倍率
      for (const key of this.enabledDamageTypes) {
        const fieldName = `anomalyMultiplier_${key}`;
        if (formData[fieldName] !== undefined) {
          this.typeMultipliers[key] = Number(formData[fieldName]) || 4;
        }
      }

      await this.saveSettings({
        'vaultAnomalyEnabled': formData.anomalyEnabled ?? false,
        'vaultAnomalyMultipliers': { ...this.typeMultipliers },
        'vaultAnomalyTypes': [...this.enabledDamageTypes],
        'vaultAnomalyMacros': { ...this.macroUuids },
        'vaultBetterAttributesEnabled': false,
        'vaultBetterDexEnabled': formData.betterDexEnabled ?? true,
        'vaultBetterIntEnabled': formData.betterIntEnabled ?? true,
        'vaultBetterChaEnabled': formData.betterChaEnabled ?? true
      });

      this._dataLoaded = false;
      this.showSuccess('遗名之穹规则修正配置已保存');
    } catch (error) {
      console.error('Failed to save vault rules config:', error);
      this.showError('保存配置失败，请查看控制台了解详情');
    }
  }

  async close(options?: any): Promise<void> {
    this._dataLoaded = false;
    return super.close(options);
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    const appEl = (this as any).element?.[0] as HTMLElement | undefined;
    const htmlEl = html[0] as HTMLElement;
    const formViaFilter = html.filter('form')[0] as HTMLElement | undefined;
    const formViaApp = appEl?.querySelector('form') as HTMLElement | undefined;

    const root = formViaApp || formViaFilter || appEl || htmlEl;
    if (!root) return;

    if (root instanceof HTMLFormElement) {
      root.addEventListener('submit', (e: Event) => {
        if (document.activeElement?.classList.contains('vault-damage-tag-input')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return false;
        }
      }, true);
    }

    root.querySelectorAll('.vault-damage-tag-input').forEach(input => {
      input.addEventListener('keydown', (event: Event) => {
        if ((event as KeyboardEvent).key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        this.addDamageTypeFromInput(input as HTMLInputElement);
      });
    });

    root.querySelectorAll('.vault-remove-damage-tag').forEach(btn => {
      (btn as HTMLElement).addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const tag = (btn as HTMLElement).dataset.tag;
        if (!tag) return;
        this.enabledDamageTypes = this.enabledDamageTypes.filter(t => t !== tag);
        delete this.macroUuids[tag];
        delete this.typeMultipliers[tag];
        this.render(false);
      });
    });

    root.querySelectorAll('.clear-macro-btn').forEach(btn => {
      (btn as HTMLElement).addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = (btn as HTMLElement).dataset.key;
        if (key) {
          delete this.macroUuids[key];
          this.render(false);
        }
      });
    });

    root.querySelectorAll('button[name="close"]').forEach(btn => {
      (btn as HTMLElement).addEventListener('click', (event: Event) => {
        event.preventDefault();
        this.close();
      });
    });
  }

  _canDragDrop(_selector: string): boolean {
    return game.user?.isGM ?? false;
  }

  async _onDrop(event: DragEvent): Promise<void> {
    let data: any;
    try {
      data = JSON.parse(event.dataTransfer?.getData('text/plain') || '{}');
    } catch {
      return;
    }

    if (data.type !== 'Macro' || !data.uuid) {
      ui?.notifications?.warn('请拖入一个宏');
      return;
    }

    const target = (event.target as HTMLElement)?.closest('.macro-drop-zone') as HTMLElement;
    if (!target) return;

    const damageType = target.dataset.damageType;
    if (!damageType) return;

    try {
      const macro = await fromUuid(data.uuid);
      if (!macro) {
        ui?.notifications?.warn(`无法找到宏: ${data.uuid}`);
        return;
      }
      ui?.notifications?.info(`已关联宏: ${macro.name}`);
    } catch {
      ui?.notifications?.warn('无效的宏UUID');
      return;
    }

    this.macroUuids[damageType] = data.uuid;
    this.render(false);
  }

  private addDamageTypeFromInput(input: HTMLInputElement): void {
    const rawValue = input.value.trim();
    if (!rawValue) return;

    const slug = this.resolveDamageTypeSlug(rawValue);

    if (!this.enabledDamageTypes.includes(slug)) {
      this.enabledDamageTypes.push(slug);
      if (this.typeMultipliers[slug] === undefined) {
        this.typeMultipliers[slug] = 4;
      }
    }
    input.value = '';
    this.render(false);
  }

  private resolveDamageTypeSlug(input: string): string {
    const lower = input.toLowerCase();
    for (const t of this.availableDamageTypes) {
      if (t.value === lower) return t.value;
    }
    for (const t of this.availableDamageTypes) {
      if (t.label.toLowerCase() === lower) return t.value;
    }
    for (const t of this.availableDamageTypes) {
      if (t.label.toLowerCase().includes(lower) || lower.includes(t.label.toLowerCase())) {
        return t.value;
      }
    }
    return lower;
  }
}
