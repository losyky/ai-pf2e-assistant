/**
 * 遗名之穹规则修正配置管理器
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';
import { DAMAGE_TYPE_LABELS } from '../../vault-rules/anomaly-tracker';

declare const game: Game;
declare const CONFIG: any;

interface DamageTypeOption {
  value: string;
  label: string;
}

export class VaultRulesConfigManager extends BaseConfigManager {
  private enabledDamageTypes: string[] = [];
  private availableDamageTypes: DamageTypeOption[] = [];
  private damageTypeLabelMap: Map<string, string> = new Map();

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-vault-rules-config',
      title: '遗名之穹规则修正配置',
      template: `modules/${MODULE_ID}/templates/config-managers/vault-rules-config-manager.html`,
      width: 650,
      height: 'auto'
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

    this.enabledDamageTypes = this.getSetting('vaultAnomalyTypes') || [];
    const macros: Record<string, string> = this.getSetting('vaultAnomalyMacros') || {};

    const enabledTypeLabels = this.enabledDamageTypes.map(slug => ({
      value: slug,
      label: this.getDamageTypeLabel(slug)
    }));

    const macroConfigs = this.enabledDamageTypes.map(key => ({
      key,
      label: this.getDamageTypeLabel(key),
      macroName: macros[key] || ''
    }));

    return foundry.utils.mergeObject(data, {
      anomaly: {
        enabled: this.getSetting('vaultAnomalyEnabled') ?? false,
        multiplier: this.getSetting('vaultAnomalyMultiplier') ?? 4,
        maxOverride: this.getSetting('vaultAnomalyMaxOverride') ?? 0,
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
      const macros: Record<string, string> = {};
      for (const slug of this.enabledDamageTypes) {
        const val = formData[`anomalyMacro_${slug}`];
        if (val) macros[slug] = val;
      }

      await this.saveSettings({
        'vaultAnomalyEnabled': formData.anomalyEnabled ?? false,
        'vaultAnomalyMultiplier': Number(formData.anomalyMultiplier) || 4,
        'vaultAnomalyMaxOverride': Number(formData.anomalyMaxOverride) || 0,
        'vaultAnomalyTypes': [...this.enabledDamageTypes],
        'vaultAnomalyMacros': macros,
        'vaultBetterAttributesEnabled': formData.betterAttributesEnabled ?? false,
        'vaultBetterDexEnabled': formData.betterDexEnabled ?? true,
        'vaultBetterIntEnabled': formData.betterIntEnabled ?? true,
        'vaultBetterChaEnabled': formData.betterChaEnabled ?? true
      });

      this.showSuccess('遗名之穹规则修正配置已保存');
    } catch (error) {
      console.error('Failed to save vault rules config:', error);
      this.showError('保存配置失败，请查看控制台了解详情');
    }
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.vault-damage-tag-input').on('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.addDamageTypeFromInput(event.currentTarget as HTMLInputElement);
    });

    html.find('.vault-remove-damage-tag').on('click', (event) => {
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      const tag = el.dataset.tag;
      if (!tag) return;
      this.enabledDamageTypes = this.enabledDamageTypes.filter(t => t !== tag);
      this.render(false);
    });

    html.find('button[name="close"]').on('click', () => this.close());
  }

  private addDamageTypeFromInput(input: HTMLInputElement): void {
    const rawValue = input.value.trim();
    if (!rawValue) return;

    const slug = this.resolveDamageTypeSlug(rawValue);

    if (!this.enabledDamageTypes.includes(slug)) {
      this.enabledDamageTypes.push(slug);
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
