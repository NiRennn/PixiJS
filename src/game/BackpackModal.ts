import { Container, Graphics, Text, TextStyle, Rectangle, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { BACKPACK_CONFIG } from '../config';
import type { BackpackItemData } from './Storage';
import { soundManager } from './SoundManager';
import { TextureManager } from './TextureManager';

/**
 * BackpackModal — модальное окно рюкзака (хранилища) предметов:
 * - Сетка 4 на 5 (всего 20 ячеек)
 * - По умолчанию открыто 3 ячейки
 * - Остальные закрыты замочком 🔒 и могут докупаться за монеты
 * - Нажатие на предмет в открытой ячейке возвращает его на игровое поле
 */
export class BackpackModal extends Container {
  private overlay: Graphics;
  private modalBox: Container;
  private modalBg: Graphics;
  private titleText: Text;
  private subtitleText: Text;
  private slotsContainer: Container;
  private closeBtn: Container;

  private slotsCount: number = BACKPACK_CONFIG.INITIAL_SLOTS;
  private items: (BackpackItemData | null)[] = Array(BACKPACK_CONFIG.TOTAL_SLOTS).fill(null);

  public onRequestTakeItem?: (index: number) => boolean; // Возвращает true, если предмет успешно помещен на поле
  public onRequestBuySlot?: (index: number, price: number) => boolean; // Возвращает true, если слот успешно куплен
  public onClose?: () => void;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';

    // 1. Темный оверлей
    this.overlay = new Graphics();
    this.overlay.rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: 0.65 });
    this.overlay.eventMode = 'static';
    this.overlay.on('pointerdown', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.addChild(this.overlay);

    // 2. Окно модалки
    this.modalBox = new Container();
    this.addChild(this.modalBox);

    const boxW = 340;
    const boxH = 340;

    // Тень модалки
    const shadow = new Graphics();
    shadow.roundRect(-boxW / 2, -boxH / 2 + 6, boxW, boxH, 20)
      .fill({ color: 0x000000, alpha: 0.35 });
    shadow.eventMode = 'none';
    this.modalBox.addChild(shadow);

    // Фон модалки (теплая светлая слоновая кость с карамельной рамкой)
    this.modalBg = new Graphics();
    this.modalBg.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 20)
      .fill({ color: 0xfffdfa })
      .stroke({ width: 2.5, color: 0xd9a463 });
    this.modalBg.eventMode = 'static';
    this.modalBg.on('pointerdown', (e) => e.stopPropagation());
    this.modalBox.addChild(this.modalBg);

    // Заголовок
    this.titleText = new Text({
      text: '🎒 Рюкзак (0/3)',
      style: new TextStyle({
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 16,
        fontWeight: 'bold',
        fill: '#452811',
      }),
    });
    this.titleText.anchor.set(0.5);
    this.titleText.position.set(0, -boxH / 2 + 24);
    this.titleText.eventMode = 'none';
    this.modalBox.addChild(this.titleText);

    // Подзаголовок
    this.subtitleText = new Text({
      text: 'Нажмите на предмет, чтобы вернуть его на поле',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 10,
        fill: '#784c25',
      }),
    });
    this.subtitleText.anchor.set(0.5);
    this.subtitleText.position.set(0, -boxH / 2 + 42);
    this.subtitleText.eventMode = 'none';
    this.modalBox.addChild(this.subtitleText);

    // Кнопка закрытия (❌)
    this.closeBtn = new Container();
    this.closeBtn.position.set(boxW / 2 - 24, -boxH / 2 + 24);
    this.closeBtn.eventMode = 'static';
    this.closeBtn.cursor = 'pointer';
    this.closeBtn.hitArea = new Rectangle(-16, -16, 32, 32);
    this.modalBox.addChild(this.closeBtn);

    const closeBg = new Graphics();
    closeBg.circle(0, 0, 14)
      .fill({ color: 0xf3e8d7 })
      .stroke({ width: 1.5, color: 0xd9a463 });
    closeBg.eventMode = 'none';
    this.closeBtn.addChild(closeBg);

    const closeText = new Text({
      text: '✕',
      style: new TextStyle({ fontSize: 13, fill: '#6b4321', fontWeight: 'bold' }),
    });
    closeText.anchor.set(0.5);
    closeText.eventMode = 'none';
    this.closeBtn.addChild(closeText);

    this.closeBtn.on('pointerdown', (e) => {
      e.stopPropagation();
      soundManager.playTap();
      this.close();
    });

    // Контейнер для сетки ячеек 4 на 3 (всего 12 ячеек)
    this.slotsContainer = new Container();
    this.slotsContainer.position.set(0, 24);
    this.modalBox.addChild(this.slotsContainer);
  }

  public setBackpackState(
    unlockedSlots: number,
    items: (BackpackItemData | null)[]
  ) {
    this.slotsCount = Math.max(BACKPACK_CONFIG.INITIAL_SLOTS, Math.min(BACKPACK_CONFIG.TOTAL_SLOTS, unlockedSlots));
    this.items = items;

    const occupiedCount = items.filter((it, idx) => idx < this.slotsCount && it !== null).length;
    this.titleText.text = `🎒 Рюкзак (${occupiedCount}/${this.slotsCount})`;

    this.renderSlots();
  }

  public renderSlots() {
    while (this.slotsContainer.children.length > 0) {
      const child = this.slotsContainer.children[0];
      this.slotsContainer.removeChild(child);
      child.destroy({ children: true });
    }

    const cols = 4;
    const rows = 3;
    const slotSize = 64;
    const gap = 8;

    const totalW = cols * slotSize + (cols - 1) * gap;
    const totalH = rows * slotSize + (rows - 1) * gap;
    const startX = -totalW / 2 + slotSize / 2;
    const startY = -totalH / 2 + slotSize / 2;

    for (let i = 0; i < BACKPACK_CONFIG.TOTAL_SLOTS; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = startX + c * (slotSize + gap);
      const y = startY + r * (slotSize + gap);

      const slot = new Container();
      slot.position.set(x, y);
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.hitArea = new Rectangle(-slotSize / 2, -slotSize / 2, slotSize, slotSize);
      this.slotsContainer.addChild(slot);

      const isUnlocked = i < this.slotsCount;
      const itemData = this.items[i];

      const slotBg = new Graphics();
      slotBg.eventMode = 'none';
      slot.addChild(slotBg);

      if (isUnlocked) {
        // 1. РАЗБЛОКИРОВАННАЯ ЯЧЕЙКА
        if (itemData) {
          // Занятая предметом ячейка
          slotBg.roundRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 10)
            .fill({ color: 0xfffdfa })
            .stroke({ width: 2, color: 0xd9a463 });

          // Спрайт предмета
          const itemSprite = new Sprite();
          itemSprite.anchor.set(0.5);
          itemSprite.eventMode = 'none';
          slot.addChild(itemSprite);
          this.loadSlotTexture(itemSprite, itemData, slotSize * 0.76);

          // Бейдж отображается только для генераторов (⚡), уровни на предметах убраны
          if (itemData.isGenerator) {
            const badgeBg = new Graphics();
            badgeBg.circle(slotSize / 2 - 10, slotSize / 2 - 10, 8.5)
              .fill({ color: 0xb45309 })
              .stroke({ width: 1.2, color: 0xfcd34d });
            badgeBg.eventMode = 'none';
            slot.addChild(badgeBg);

            const badgeText = new Text({
              text: '⚡',
              style: new TextStyle({
                fontFamily: 'system-ui, sans-serif',
                fontSize: 9,
                fontWeight: 'bold',
                fill: '#ffffff',
              }),
            });
            badgeText.anchor.set(0.5);
            badgeText.position.set(slotSize / 2 - 10, slotSize / 2 - 10);
            badgeText.eventMode = 'none';
            slot.addChild(badgeText);
          }

          // Клик по предмету -> вернуть на игровое поле
          slot.on('pointerdown', (e) => {
            e.stopPropagation();
            if (this.onRequestTakeItem) {
              const success = this.onRequestTakeItem(i);
              if (success) {
                soundManager.playTap();
                gsap.to(slot.scale, {
                  x: 0.8,
                  y: 0.8,
                  duration: 0.12,
                  yoyo: true,
                  repeat: 1,
                  onComplete: () => {
                    this.renderSlots();
                  },
                });
              } else {
                soundManager.playError();
                this.shakeContainer(slot);
              }
            }
          });
        } else {
          // Пустая разблокированная ячейка
          slotBg.roundRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 10)
            .fill({ color: 0xfcf6ea })
            .stroke({ width: 1.5, color: 0xe8d2b2 });

          const emptyIcon = new Text({
            text: '＋',
            style: new TextStyle({ fontSize: 16, fill: '#d4aa7c' }),
          });
          emptyIcon.anchor.set(0.5);
          emptyIcon.eventMode = 'none';
          slot.addChild(emptyIcon);
        }
      } else {
        // 2. ЗАБЛОКИРОВАННАЯ ЯЧЕЙКА ПОД ЗАМОЧКОМ 🔒
        const price = BACKPACK_CONFIG.SLOT_PRICES[i] || 500;
        const isNextSlotToUnlock = i === this.slotsCount;

        slotBg.roundRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 10)
          .fill({ color: 0xecdac4 })
          .stroke({ width: 1.5, color: isNextSlotToUnlock ? 0xd97706 : 0xd1bca4 });

        // Замочек
        const lockIcon = new Text({
          text: '🔒',
          style: new TextStyle({ fontSize: 16 }),
        });
        lockIcon.anchor.set(0.5);
        lockIcon.position.set(0, -9);
        lockIcon.eventMode = 'none';
        slot.addChild(lockIcon);

        // Плашка цены внизу слота
        const priceBg = new Graphics();
        priceBg.roundRect(-24, 8, 48, 16, 5)
          .fill({ color: isNextSlotToUnlock ? 0xfef08a : 0xe8d5be })
          .stroke({ width: 1, color: isNextSlotToUnlock ? 0xca8a04 : 0xc7b095 });
        priceBg.eventMode = 'none';
        slot.addChild(priceBg);

        const priceText = new Text({
          text: `${price} 🪙`,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 8.5,
            fontWeight: 'bold',
            fill: isNextSlotToUnlock ? '#78350f' : '#8c6d4f',
          }),
        });
        priceText.anchor.set(0.5);
        priceText.position.set(0, 16);
        priceText.eventMode = 'none';
        slot.addChild(priceText);

        // Клик по заблокированной ячейке
        slot.on('pointerdown', (e) => {
          e.stopPropagation();
          if (isNextSlotToUnlock) {
            // Покупка следующей ячейки
            if (this.onRequestBuySlot) {
              const bought = this.onRequestBuySlot(i, price);
              if (bought) {
                soundManager.playOrderComplete();
                // slotsCount и re-render уже вызываются в onRequestBuySlot через setBackpackState()!
              } else {
                soundManager.playError();
                this.shakeContainer(slot);
              }
            }
          } else {
            // Клик по более дальней ячейке — сначала нужно открыть предыдущую
            soundManager.playError();
            this.shakeContainer(slot);
          }
        });
      }
    }
  }

  private shakeContainer(target: Container & { _baseX?: number }) {
    if (target._baseX === undefined) {
      target._baseX = target.x;
    }
    const baseX = target._baseX;
    gsap.killTweensOf(target.position);
    target.position.x = baseX;
    gsap.to(target.position, {
      x: baseX + 4,
      duration: 0.05,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        target.position.x = baseX;
      },
    });
  }

  private loadSlotTexture(sprite: Sprite, data: BackpackItemData, targetSize: number) {
    const tex = TextureManager.getItemTexture(data.type, data.level, data.isGenerator);
    if (tex && !this.destroyed) {
      sprite.texture = tex;
      const maxDim = Math.max(tex.width, tex.height);
      if (maxDim > 0) {
        sprite.scale.set(targetSize / maxDim);
      }
    }
  }

  public open(_screenWidth?: number, _screenHeight?: number) {
    this.visible = true;
    this.renderSlots();

    this.modalBox.scale.set(0.85);
    this.modalBox.alpha = 0;
    gsap.to(this.modalBox.scale, { x: 1, y: 1, duration: 0.25, ease: 'back.out(1.8)' });
    gsap.to(this.modalBox, { alpha: 1, duration: 0.15 });
  }

  public close() {
    gsap.to(this.modalBox.scale, { x: 0.85, y: 0.85, duration: 0.15, ease: 'power2.in' });
    gsap.to(this.modalBox, {
      alpha: 0,
      duration: 0.15,
      onComplete: () => {
        this.visible = false;
        if (this.onClose) this.onClose();
      },
    });
  }
}
