import { Assets, Spritesheet, Texture, Rectangle } from 'pixi.js';

/**
 * TextureManager — централизованный менеджер текстурного атласа.
 * Обеспечивает:
 * - Единую загрузку всех 75 предметов одним файлом
 * - Мгновенную синхронную отдачу текстур без задержек и промисов
 * - Максимальный батчинг отрисовки в WebGL (всего 1-2 Draw Call на всё поле)
 */
export class TextureManager {
  private static textures: Record<string, Texture> = {};
  private static initialized: boolean = false;

  public static async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 1. Стандартная загрузка через Spritesheet парсер PixiJS
      const sheet = await Assets.load<Spritesheet>('/assets/items_atlas.json');
      if (sheet && sheet.textures && Object.keys(sheet.textures).length > 0) {
        this.textures = sheet.textures;
        this.initialized = true;
        console.log(`[TextureManager] Атлас загружен через PixiJS Spritesheet (${Object.keys(this.textures).length} кадров)`);
        return;
      }
    } catch (e) {
      console.warn('[TextureManager] Автопарсинг спрайтшита дал ошибку, используем ручную нарезку:', e);
    }

    try {
      // 2. 100% надежный fallback: нарезка кадров из базовой текстуры атласа
      const baseTexture = await Assets.load<Texture>('/assets/items_atlas.png');
      const response = await fetch('/assets/items_atlas.json');
      const manifest = await response.json();

      for (const [key, frameData] of Object.entries(manifest.frames as Record<string, any>)) {
        const f = frameData.frame;
        this.textures[key] = new Texture({
          source: baseTexture.source,
          frame: new Rectangle(f.x, f.y, f.w, f.h),
        });
      }
      this.initialized = true;
      console.log(`[TextureManager] Атлас нарезан вручную (${Object.keys(this.textures).length} кадров)`);
    } catch (e) {
      console.error('[TextureManager] Ошибка загрузки текстурного атласа:', e);
    }
  }

  public static getTexture(key: string): Texture {
    return this.textures[key] || Texture.EMPTY;
  }

  public static getItemTexture(type: string, level: number, isGenerator?: boolean): Texture {
    let key = '';
    if (isGenerator) {
      key = `${type}_generator`;
    } else if (type === 'coins') {
      key = `coins_${level}`;
    } else {
      key = `${type}_${level}`;
    }
    return this.textures[key] || Texture.EMPTY;
  }
}
