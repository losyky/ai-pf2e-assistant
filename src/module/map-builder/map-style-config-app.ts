import { MODULE_ID } from '../constants';
import { MapStyleConfig } from './types';

declare const FormApplication: any;
declare const foundry: any;
declare const game: any;
declare const ui: any;
declare const canvas: any;
declare const FilePicker: any;

export class MapStyleConfigApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'map-style-config',
      title: '地图生成风格配置',
      template: `modules/${MODULE_ID}/templates/map-style-config.hbs`,
      width: 520,
      height: 'auto',
      classes: ['ai-pf2e-assistant', 'config-manager', 'map-style-config-app'],
      closeOnSubmit: true,
      submitOnChange: false,
    });
  }

  getData(): any {
    const config = this._getSceneConfig();
    return {
      stylePrompt: config.stylePrompt,
      negativePrompt: config.negativePrompt,
      imageModel: config.imageModel,
      styleReferenceImage: config.styleReferenceImage || '',
      hasRefImage: !!config.styleReferenceImage,
    };
  }

  toObject(): any {
    return { id: this.id, appId: this.appId };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    // Style reference image picker
    html.find('.browse-ref-image').on('click', () => {
      const input = html.find('input[name="styleReferenceImage"]');
      new FilePicker({
        type: 'image',
        current: input.val() || '',
        callback: (path: string) => {
          input.val(path);
          this._updateRefPreview(html, path);
        },
      }).render(true);
    });

    // Clear reference image
    html.find('.clear-ref-image').on('click', () => {
      html.find('input[name="styleReferenceImage"]').val('');
      this._updateRefPreview(html, '');
    });

    // Live preview when input changes
    html.find('input[name="styleReferenceImage"]').on('change', (ev: any) => {
      this._updateRefPreview(html, ev.target.value);
    });
  }

  async _updateObject(_event: Event, formData: any): Promise<void> {
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.warn('没有活动场景');
      return;
    }

    const config: MapStyleConfig = {
      stylePrompt: formData.stylePrompt || '',
      negativePrompt: formData.negativePrompt || '',
      imageModel: formData.imageModel || '',
      styleReferenceImage: formData.styleReferenceImage || '',
    };

    await scene.setFlag(MODULE_ID, 'mapStyle', config);
    ui.notifications.info('地图风格配置已保存');
  }

  private _updateRefPreview(html: any, path: string): void {
    const preview = html.find('.ref-image-preview');
    const img = preview.find('img');
    const empty = preview.find('.ref-empty');
    if (path) {
      img.attr('src', path).show();
      empty.hide();
    } else {
      img.hide();
      empty.show();
    }
  }

  private _getSceneConfig(): MapStyleConfig {
    try {
      const scene = canvas?.scene;
      if (scene) {
        const config = scene.getFlag(MODULE_ID, 'mapStyle') as MapStyleConfig | undefined;
        if (config) return config;
      }
    } catch { /* ignore */ }
    return { stylePrompt: '', negativePrompt: '', imageModel: '', styleReferenceImage: '' };
  }
}
