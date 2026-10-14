import { Container, Sprite, Text, TextStyle, Graphics, Rectangle } from 'pixi.js';
import gsap from 'gsap';
import { GRID_CONFIG, GENERATOR_CONFIG } from '../config';
import type { ItemData } from '../config';
import { TextureManager } from './TextureManager';

/**
 * ItemView — визуальный объект предмета на игровом поле.
 * Поддерживает:
 * - Обычные предметы слияния (уровни 1..9)
 * - Генераторы на поле (с кулдауном на 15 тапов, таймером и тикающими часиками)
 * - Монетки (уровни 1..5) с поддержкой безопасного двойного клика
 * - Заблокированные паутиной предметы
 */
export class ItemView extends Container {
  public itemData: ItemData;
  private sprite: Sprite;
  private badgeText: Text;
  private badgeBg: Graphics;
  private cobwebGraphic: Graphics | null = null;

  // Оверлей кулдауна генератора с тикающими часиками (только если тапов 0)
  public generatorTapsLeft: number = GENERATOR_CONFIG.MAX_TAPS;
  public cooldownUntil: number = 0;
  public lastRechargeTime: number = Date.now();
  public totalCooldownMs: number = GENERATOR_CONFIG.COOLDOWN_MS;
  private cooldownOverlay: Container | null = null;
  private clockIconText: Text | null = null;
  private clockCountdownText: Text | null = null;
  private clockProgressGraphic: Graphics | null = null;
  private clockTween: gsap.core.Tween | null = null;
  private lastDisplayedSec: number = -1;

  // Подсветка совпадения с заказом покупателя (как зеленая пицца в референсе)
  public isOrderMatch: boolean = false;
  private orderMatchGraphic: Graphics | null = null;
  private orderMatchCheckText: Text | null = null;
  private orderMatchTween: gsap.core.Tween | null = null;

  // Подсветка выбранного предмета
  public isSelected: boolean = false;
  private selectionGraphic: Graphics | null = null;

  public originCol: number = 0;
  public originRow: number = 0;

  // Отслеживание двойного клика для монеток
  public lastTapTime: number = 0;

  // Базовая координата ячейки для защиты от смещения при тряске
  public baseCellX: number = 0;

  constructor(itemData: ItemData) {
    super();
    this.itemData = itemData;

    this.eventMode = 'static';
    this.cursor = itemData.isCobwebbed ? 'not-allowed' : 'grab';
    this.hitArea = new Rectangle(
      -GRID_CONFIG.CELL_SIZE / 2,
      -GRID_CONFIG.CELL_SIZE / 2,
      GRID_CONFIG.CELL_SIZE,
      GRID_CONFIG.CELL_SIZE
    );

    // 1. Спрайт картинки
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.sprite.eventMode = 'none';
    this.addChild(this.sprite);

    // 2. Бейдж с уровнем / иконкой генератора
    this.badgeBg = new Graphics();
    this.badgeBg.eventMode = 'none';
    this.addChild(this.badgeBg);

    this.badgeText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 9,
        fontWeight: 'bold',
        fill: '#f8fafc',
        align: 'center',
      }),
    });
    this.badgeText.anchor.set(0.5);
    const badgeOffset = Math.round(GRID_CONFIG.CELL_SIZE / 2 - 8);
    this.badgeText.position.set(badgeOffset, badgeOffset);
    this.badgeText.eventMode = 'none';
    this.addChild(this.badgeText);

    // Инициализация параметров генератора
    if (this.isGenerator) {
      const storedCd = itemData.cooldownUntil || 0;
      const storedTaps = itemData.generatorTapsLeft !== undefined ? itemData.generatorTapsLeft : GENERATOR_CONFIG.MAX_TAPS;
      const storedRecharge = itemData.lastRechargeTime || Date.now();
      const now = Date.now();

      if (storedCd > 0) {
        if (storedCd <= now) {
          // Кулдаун 30 секунд уже прошел -> восстанавливаем 1 тап (плюс любые дополнительные тапы за время оффлайна)
          this.cooldownUntil = 0;
          const extraMs = now - storedCd;
          const extraTaps = Math.floor(extraMs / GENERATOR_CONFIG.RECHARGE_TAP_MS);
          this.generatorTapsLeft = Math.min(GENERATOR_CONFIG.MAX_TAPS, 1 + extraTaps);
          this.lastRechargeTime = this.generatorTapsLeft >= GENERATOR_CONFIG.MAX_TAPS ? 0 : now - (extraMs % GENERATOR_CONFIG.RECHARGE_TAP_MS);
        } else {
          // Кулдаун еще идет (тапов 0) -> показываем часики
          this.cooldownUntil = storedCd;
          this.generatorTapsLeft = 0;
          this.lastRechargeTime = storedCd;
          this.renderCooldownOverlay();
        }
      } else {
        this.cooldownUntil = 0;
        // Постепенное восстановление тапов за время отсутствия (+1 тап каждые 30 секунд)
        if (storedTaps < GENERATOR_CONFIG.MAX_TAPS) {
          const elapsed = storedRecharge > 0 ? now - storedRecharge : 0;
          const recovered = Math.floor(elapsed / GENERATOR_CONFIG.RECHARGE_TAP_MS);
          this.generatorTapsLeft = Math.min(GENERATOR_CONFIG.MAX_TAPS, storedTaps + recovered);
          this.lastRechargeTime = this.generatorTapsLeft >= GENERATOR_CONFIG.MAX_TAPS ? 0 : now - (elapsed % GENERATOR_CONFIG.RECHARGE_TAP_MS);
        } else {
          this.generatorTapsLeft = GENERATOR_CONFIG.MAX_TAPS;
          this.lastRechargeTime = 0;
        }
      }
      this.itemData.cooldownUntil = this.cooldownUntil;
      this.itemData.generatorTapsLeft = this.generatorTapsLeft;
      this.itemData.lastRechargeTime = this.lastRechargeTime;
    }

    this.renderBadge();

    // 3. Паутина
    if (this.itemData.isCobwebbed) {
      this.renderCobweb();
    }

    this.updateTexture();
  }

  public get isGenerator(): boolean {
    return !!this.itemData.isGenerator;
  }

  public get isCoin(): boolean {
    return this.itemData.type === 'coins';
  }

  public get isCobwebbed(): boolean {
    return !!this.itemData.isCobwebbed;
  }

  public isGeneratorOnCooldown(): boolean {
    return this.isGenerator && this.cooldownUntil > 0 && this.cooldownUntil > Date.now();
  }

  public renderBadge() {
    this.badgeBg.clear();
    const badgeOffset = Math.round(GRID_CONFIG.CELL_SIZE / 2 - 8);
    this.badgeText.position.set(badgeOffset, badgeOffset);

    if (this.isGenerator) {
      // Для генератора — теплый янтарный бейдж со счетчиком оставшихся тапов (15..1 или ⏳)
      this.badgeBg.circle(badgeOffset, badgeOffset, 9)
        .fill({ color: 0xb45309 })
        .stroke({ width: 1.5, color: 0xfef08a });

      if (this.isGeneratorOnCooldown()) {
        this.badgeText.text = '⏳';
        this.badgeText.style.fontSize = 8;
      } else {
        this.badgeText.text = `${this.generatorTapsLeft}`;
        this.badgeText.style.fontSize = 9;
        this.badgeText.style.fill = '#ffffff';
      }
      this.badgeBg.visible = true;
      this.badgeText.visible = true;
    } else {
      // Убираем уровни на всех остальных предметах и монетах для чистого визуала
      this.badgeBg.visible = false;
      this.badgeText.visible = false;
      this.badgeText.text = '';
    }
  }

  public updateTapsBadge() {
    this.renderBadge();
  }

  /**
   * Отрисовка оверлея кулдауна с анимацией тикающих часиков
   */
  private renderCooldownOverlay() {
    if (this.cooldownOverlay) return;

    this.cooldownOverlay = new Container();
    this.cooldownOverlay.eventMode = 'none';

    const cdRadius = Math.round(GRID_CONFIG.CELL_SIZE * 0.42);

    // Темная подложка
    const bg = new Graphics();
    bg.circle(0, 0, cdRadius)
      .fill({ color: 0x090d16, alpha: 0.88 })
      .stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.8 });
    this.cooldownOverlay.addChild(bg);

    // Круговой индикатор оставшегося времени
    this.clockProgressGraphic = new Graphics();
    this.cooldownOverlay.addChild(this.clockProgressGraphic);

    // Иконка часиков
    this.clockIconText = new Text({
      text: '⏱️',
      style: new TextStyle({ fontSize: 15 }),
    });
    this.clockIconText.anchor.set(0.5);
    this.clockIconText.position.set(0, -5);
    this.cooldownOverlay.addChild(this.clockIconText);

    // Живая анимация тиканья (легкое покачивание как маятник)
    this.clockTween = gsap.to(this.clockIconText, {
      rotation: 0.22,
      duration: 0.45,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    const remainingSec = Math.max(1, Math.ceil((this.cooldownUntil - Date.now()) / 1000));
    this.lastDisplayedSec = remainingSec;

    // Текст оставшихся секунд
    this.clockCountdownText = new Text({
      text: `${remainingSec}с`,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 10,
        fontWeight: 'bold',
        fill: '#fde047',
      }),
    });
    this.clockCountdownText.anchor.set(0.5);
    this.clockCountdownText.position.set(0, 11);
    this.cooldownOverlay.addChild(this.clockCountdownText);

    this.addChild(this.cooldownOverlay);
  }

  public removeCooldownOverlay() {
    if (this.clockTween) {
      this.clockTween.kill();
      this.clockTween = null;
    }
    if (this.cooldownOverlay) {
      this.removeChild(this.cooldownOverlay);
      this.cooldownOverlay.destroy({ children: true });
      this.cooldownOverlay = null;
      this.clockIconText = null;
      this.clockCountdownText = null;
      this.clockProgressGraphic = null;
    }
    this.lastDisplayedSec = -1;
  }

  /**
   * Запуск 30-секундного отката генератора (вызывается ТОЛЬКО когда тапов 0)
   */
  public startCooldown(durationMs: number = GENERATOR_CONFIG.COOLDOWN_MS) {
    this.totalCooldownMs = durationMs;
    this.cooldownUntil = Date.now() + durationMs;
    this.itemData.cooldownUntil = this.cooldownUntil;
    this.generatorTapsLeft = 0;
    this.itemData.generatorTapsLeft = 0;
    this.lastRechargeTime = this.cooldownUntil;
    this.itemData.lastRechargeTime = this.lastRechargeTime;
    this.renderBadge();
    this.renderCooldownOverlay();
  }

  /**
   * Завершение кулдауна генератора — восстановление тапа
   */
  public endCooldown(playAnimation: boolean = true) {
    this.cooldownUntil = 0;
    this.itemData.cooldownUntil = 0;
    this.generatorTapsLeft = 1;
    this.itemData.generatorTapsLeft = 1;
    this.lastRechargeTime = Date.now();
    this.itemData.lastRechargeTime = this.lastRechargeTime;
    this.removeCooldownOverlay();
    this.renderBadge();

    if (playAnimation) {
      this.playMergeAnimation();
    }
  }

  public setCooldownUntil(cooldownUntilMs: number, totalDurationMs: number = GENERATOR_CONFIG.COOLDOWN_MS) {
    this.totalCooldownMs = totalDurationMs;
    if (cooldownUntilMs > Date.now()) {
      this.cooldownUntil = cooldownUntilMs;
      this.itemData.cooldownUntil = cooldownUntilMs;
      this.generatorTapsLeft = 0;
      this.itemData.generatorTapsLeft = 0;
      this.lastRechargeTime = cooldownUntilMs;
      this.itemData.lastRechargeTime = this.lastRechargeTime;
      this.renderBadge();
      this.renderCooldownOverlay();
    } else {
      this.endCooldown(false);
    }
  }

  /**
   * Главный метод обновления генератора:
   * 1. Если тапов 0 и активен кулдаун -> тикают часики 30с, по окончании восстанавливается 1 тап и часики исчезают.
   * 2. Если тапов > 0 и < 15 -> часиков НЕТ, идет постепенное восстановление (+1 тап каждые 30 сек).
   * Возвращает true, если состояние изменилось (восстановился тап или завершился кулдаун).
   */
  public updateGenerator(now: number = Date.now()): boolean {
    if (!this.isGenerator) return false;

    // ВАРИАНТ 1: Тапов 0 и идет 30-секундный кулдаун (штука с часиками)
    if (this.cooldownUntil > 0) {
      const remainingMs = this.cooldownUntil - now;
      if (remainingMs <= 0) {
        // 30 секунд истекли -> восстанавливаем 1 тап (плюс тапы за дополнительное время) и убираем часики!
        this.cooldownUntil = 0;
        this.itemData.cooldownUntil = 0;
        const extraMs = -remainingMs;
        const extraTaps = Math.floor(extraMs / GENERATOR_CONFIG.RECHARGE_TAP_MS);
        this.generatorTapsLeft = Math.min(GENERATOR_CONFIG.MAX_TAPS, 1 + extraTaps);
        this.itemData.generatorTapsLeft = this.generatorTapsLeft;
        this.lastRechargeTime = this.generatorTapsLeft >= GENERATOR_CONFIG.MAX_TAPS
          ? 0
          : now - (extraMs % GENERATOR_CONFIG.RECHARGE_TAP_MS);
        this.itemData.lastRechargeTime = this.lastRechargeTime;
        this.removeCooldownOverlay();
        this.renderBadge();
        this.playMergeAnimation();
        return true;
      }

      // Часики отображаются ТОЛЬКО когда 0
      if (!this.cooldownOverlay) {
        this.renderCooldownOverlay();
      }

      const remainingSec = Math.ceil(remainingMs / 1000);
      if (remainingSec !== this.lastDisplayedSec) {
        this.lastDisplayedSec = remainingSec;
        if (this.clockCountdownText) {
          this.clockCountdownText.text = `${remainingSec}с`;
        }
      }

      if (this.clockProgressGraphic) {
        this.clockProgressGraphic.clear();
        const progress = Math.max(0, Math.min(1, remainingMs / this.totalCooldownMs));
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (1 - progress) * (Math.PI * 2);
        const arcRadius = Math.round(GRID_CONFIG.CELL_SIZE * 0.42) - 3;
        if (progress < 0.999) {
          this.clockProgressGraphic
            .arc(0, 0, arcRadius, startAngle, endAngle)
            .stroke({ width: 2.2, color: 0x38bdf8 });
        }
      }

      return false;
    }

    // Если часики случайно остались, а кулдауна нет — убираем их
    if (this.cooldownOverlay) {
      this.removeCooldownOverlay();
    }

    // ВАРИАНТ 2: Тапов 0, но таймер не был запущен -> запускаем 30-секундный кулдаун с часиками
    if (this.generatorTapsLeft <= 0) {
      this.startCooldown(GENERATOR_CONFIG.COOLDOWN_MS);
      return true;
    }

    // ВАРИАНТ 3: Тапов от 1 до 14 -> часиков НЕТ, идет постепенное восстановление (+1 тап каждые 30 сек)
    if (this.generatorTapsLeft < GENERATOR_CONFIG.MAX_TAPS) {
      const elapsed = this.lastRechargeTime > 0 ? now - this.lastRechargeTime : 0;
      if (elapsed >= GENERATOR_CONFIG.RECHARGE_TAP_MS) {
        const added = Math.floor(elapsed / GENERATOR_CONFIG.RECHARGE_TAP_MS);
        this.generatorTapsLeft = Math.min(GENERATOR_CONFIG.MAX_TAPS, this.generatorTapsLeft + added);
        this.lastRechargeTime = this.generatorTapsLeft >= GENERATOR_CONFIG.MAX_TAPS
          ? 0
          : this.lastRechargeTime + added * GENERATOR_CONFIG.RECHARGE_TAP_MS;
        this.itemData.generatorTapsLeft = this.generatorTapsLeft;
        this.itemData.lastRechargeTime = this.lastRechargeTime;
        this.updateTapsBadge();
        return true;
      }
    } else {
      this.lastRechargeTime = 0;
      this.itemData.lastRechargeTime = 0;
    }

    return false;
  }

  private renderCobweb() {
    if (this.cobwebGraphic) return;

    this.cobwebGraphic = new Graphics();
    this.cobwebGraphic.eventMode = 'none';
    const g = this.cobwebGraphic;
    const r = GRID_CONFIG.CELL_SIZE * 0.45;

    g.circle(0, 0, r).fill({ color: 0x334155, alpha: 0.2 });

    const strokeStyle = { width: 1.4, color: 0xf1f5f9, alpha: 0.7 };
    g.moveTo(-r * 0.85, -r * 0.85).lineTo(r * 0.85, r * 0.85).stroke(strokeStyle);
    g.moveTo(-r * 0.85, r * 0.85).lineTo(r * 0.85, -r * 0.85).stroke(strokeStyle);
    g.moveTo(0, -r * 0.9).lineTo(0, r * 0.9).stroke(strokeStyle);
    g.moveTo(-r * 0.9, 0).lineTo(r * 0.9, 0).stroke(strokeStyle);

    g.poly([0, -r * 0.45, r * 0.45, 0, 0, r * 0.45, -r * 0.45, 0, 0, -r * 0.45]).stroke({ width: 1.1, color: 0xe2e8f0, alpha: 0.6 });
    g.poly([0, -r * 0.78, r * 0.78, 0, 0, r * 0.78, -r * 0.78, 0, 0, -r * 0.78]).stroke({ width: 1.1, color: 0xe2e8f0, alpha: 0.6 });

    this.addChild(this.cobwebGraphic);
    this.sprite.alpha = 0.82;
  }

  public breakCobweb(onComplete?: () => void) {
    this.itemData.isCobwebbed = false;
    this.cursor = 'grab';

    if (this.cobwebGraphic) {
      const target = this.cobwebGraphic;
      this.cobwebGraphic = null;

      gsap.to(target.scale, { x: 1.5, y: 1.5, duration: 0.25, ease: 'power2.out' });
      gsap.to(target, {
        alpha: 0,
        duration: 0.25,
        onComplete: () => {
          this.removeChild(target);
          target.destroy();
          if (onComplete) onComplete();
        },
      });
    }

    gsap.to(this.sprite, { alpha: 1, duration: 0.2 });
  }

  public shakeLocked(cellX?: number) {
    if (cellX !== undefined) {
      this.baseCellX = cellX;
    } else if (!this.baseCellX) {
      this.baseCellX = this.x;
    }
    const baseX = this.baseCellX;
    gsap.killTweensOf(this.position);
    this.position.x = baseX; // мгновенно возвращаем к точному центру ячейки
    gsap.to(this.position, {
      x: baseX + 4,
      duration: 0.04,
      yoyo: true,
      repeat: 3,
      ease: 'sine.inOut',
      onComplete: () => {
        if (!this.destroyed) {
          this.position.x = baseX;
        }
      },
    });
  }

  public updateTexture() {
    const texture = TextureManager.getItemTexture(this.itemData.type, this.itemData.level, this.isGenerator);
    if (texture) {
      this.sprite.texture = texture;

      const targetSize = GRID_CONFIG.CELL_SIZE * (this.isGenerator ? 0.86 : 0.82);
      const maxDim = Math.max(texture.width, texture.height);
      if (maxDim > 0) {
        const scale = targetSize / maxDim;
        this.sprite.scale.set(scale);
      }
    }
  }

  public async loadTexture() {
    this.updateTexture();
  }

  public updateLevel(newLevel: number) {
    this.itemData.level = newLevel;
    this.renderBadge();
    this.updateTexture();
  }

  /**
   * Анимация отдачи генератора при нажатии (squash & stretch)
   */
  public playGeneratorTapAnimation() {
    gsap.killTweensOf(this.scale);
    gsap.fromTo(
      this.scale,
      { x: 1.25, y: 0.8 },
      { x: 1, y: 1, duration: 0.35, ease: 'elastic.out(1.4, 0.4)' }
    );
  }

  public playSpawnAnimation() {
    this.scale.set(0);
    this.alpha = 0;
    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.35,
      ease: 'back.out(2)',
    });
    gsap.to(this, {
      alpha: 1,
      duration: 0.2,
    });
  }

  public playMergeAnimation() {
    gsap.killTweensOf(this.scale);
    gsap.fromTo(
      this.scale,
      { x: 1.4, y: 1.4 },
      {
        x: 1,
        y: 1,
        duration: 0.4,
        ease: 'elastic.out(1.2, 0.4)',
      }
    );
  }

  public playDragStart() {
    this.cursor = 'grabbing';
    gsap.to(this.scale, {
      x: 1.15,
      y: 1.15,
      duration: 0.15,
      ease: 'power2.out',
    });
  }

  public playDragEnd() {
    this.cursor = this.isCobwebbed ? 'not-allowed' : 'grab';
    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.15,
      ease: 'power2.out',
    });
  }

  public playReturnAnimation(targetX: number, targetY: number, onComplete?: () => void) {
    if (this.destroyed) return;
    this.baseCellX = targetX;
    gsap.killTweensOf(this.position);
    gsap.to(this.position, {
      x: targetX,
      y: targetY,
      duration: 0.25,
      ease: 'back.out(1.5)',
      onComplete: () => {
        if (this.destroyed) return;
        this.position.x = targetX;
        this.position.y = targetY;
        if (onComplete) onComplete();
      },
    });
    this.playDragEnd();
  }

  public playWiggle() {
    gsap.killTweensOf(this.position);
    const startX = this.x;
    gsap.fromTo(
      this.position,
      { x: startX - 4 },
      {
        x: startX + 4,
        duration: 0.05,
        repeat: 5,
        yoyo: true,
        onComplete: () => {
          this.position.x = startX;
        },
      }
    );
  }

  /**
   * Подсветка совпадения с заказом персонажа (зеленая рамка + галочка ✔ как на пицце в референсе)
   */
  public setOrderMatch(matches: boolean) {
    if (this.isOrderMatch === matches) return;
    this.isOrderMatch = matches;

    if (matches) {
      if (!this.orderMatchGraphic) {
        this.orderMatchGraphic = new Graphics();
        this.orderMatchGraphic.eventMode = 'none';

        const s = GRID_CONFIG.CELL_SIZE;
        // Зеленая обводка клетки и мягкая заливка в точности как в референсе
        this.orderMatchGraphic.roundRect(-s / 2 + 1, -s / 2 + 1, s - 2, s - 2, 7)
          .fill({ color: 0x22c55e, alpha: 0.16 })
          .stroke({ width: 2.5, color: 0x16a34a });

        // Зеленый значок галочки ✔ в правом верхнем углу клетки
        const checkX = Math.round(s / 2 - 9);
        const checkY = Math.round(-s / 2 + 9);
        this.orderMatchGraphic.circle(checkX, checkY, 7.5)
          .fill({ color: 0x16a34a })
          .stroke({ width: 1.5, color: 0xffffff });

        this.orderMatchCheckText = new Text({
          text: '✔',
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 8.5,
            fontWeight: 'bold',
            fill: '#ffffff',
          }),
        });
        this.orderMatchCheckText.anchor.set(0.5);
        this.orderMatchCheckText.position.set(checkX, checkY);
        this.orderMatchCheckText.eventMode = 'none';

        this.addChildAt(this.orderMatchGraphic, 0); // под спрайтом предмета
        this.addChild(this.orderMatchCheckText);
      }
    } else {
      if (this.orderMatchGraphic) {
        this.removeChild(this.orderMatchGraphic);
        this.orderMatchGraphic.destroy();
        this.orderMatchGraphic = null;
      }
      if (this.orderMatchCheckText) {
        this.removeChild(this.orderMatchCheckText);
        this.orderMatchCheckText.destroy();
        this.orderMatchCheckText = null;
      }
    }
  }

  /**
   * Подсветка выбранного предмета (отключена, так как верхняя инфо-плашка удалена)
   */
  public setSelected(selected: boolean) {
    this.isSelected = selected;
  }

  public destroy(options?: any) {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.position);
    gsap.killTweensOf(this.scale);
    if (this.clockTween) {
      this.clockTween.kill();
      this.clockTween = null;
    }
    if (this.orderMatchTween) {
      this.orderMatchTween.kill();
      this.orderMatchTween = null;
    }
    if (this.orderMatchGraphic) {
      this.orderMatchGraphic.destroy();
      this.orderMatchGraphic = null;
    }
    if (this.orderMatchCheckText) {
      this.orderMatchCheckText.destroy();
      this.orderMatchCheckText = null;
    }
    if (this.selectionGraphic) {
      this.selectionGraphic.destroy();
      this.selectionGraphic = null;
    }
    super.destroy(options);
  }
}
