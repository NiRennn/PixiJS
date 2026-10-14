import { Container, Graphics, Sprite, Text, TextStyle, Rectangle } from 'pixi.js';
import gsap from 'gsap';
import { ITEM_NAMES } from '../config';
import type { ItemType } from '../config';
import { soundManager } from './SoundManager';
import { playMergeSparks } from './Effects';
import { TextureManager } from './TextureManager';

const CATEGORY_TABS: { type: ItemType; icon: string; title: string; maxLvl: number }[] = [
  { type: 'tools', icon: '🧰', title: 'Инструменты', maxLvl: 9 },
  { type: 'furniture', icon: '🪚', title: 'Мебель', maxLvl: 9 },
  { type: 'plants', icon: '🪴', title: 'Растения', maxLvl: 9 },
  { type: 'bakery', icon: '🥐', title: 'Выпечка', maxLvl: 9 },
  { type: 'sewing', icon: '🧵', title: 'Шитьё', maxLvl: 9 },
  { type: 'fishing', icon: '🎣', title: 'Рыбалка', maxLvl: 9 },
  { type: 'music', icon: '🎵', title: 'Музыка', maxLvl: 9 },
  { type: 'coins', icon: '🪙', title: 'Монеты', maxLvl: 5 },
];

/**
 * Модальное окно "Альбом открытий / Кодекс" и всплывающий экран нового открытия
 */
export class CodexModal extends Container {
  private overlay: Graphics;
  private modalBox: Container;
  private contentContainer: Container;
  private cardsContainer: Container;
  public discoveredItems: Set<string> = new Set();
  public onClose?: () => void;
  private isCelebrationActive: boolean = false;
  private selectedCategory: ItemType = 'tools';

  constructor() {
    super();
    this.visible = false;

    this.overlay = new Graphics();
    this.overlay.eventMode = 'static';
    this.overlay.cursor = 'pointer';
    this.addChild(this.overlay);

    this.modalBox = new Container();
    this.addChild(this.modalBox);

    this.contentContainer = new Container();
    this.modalBox.addChild(this.contentContainer);

    this.cardsContainer = new Container();
    this.contentContainer.addChild(this.cardsContainer);

    this.overlay.on('pointerdown', () => {
      if (!this.isCelebrationActive) {
        this.close();
      }
    });
  }

  private clearContainer(cont: Container) {
    while (cont.children.length > 0) {
      const child = cont.children[0];
      cont.removeChild(child);
      child.destroy({ children: true });
    }
  }

  public setDiscovered(items: string[]) {
    this.discoveredItems = new Set(items);
  }

  public isDiscovered(type: ItemType, level: number): boolean {
    return this.discoveredItems.has(`${type}_${level}`);
  }

  public markDiscovered(type: ItemType, level: number): boolean {
    const key = `${type}_${level}`;
    if (!this.discoveredItems.has(key)) {
      this.discoveredItems.add(key);
      return true;
    }
    return false;
  }

  /**
   * Открытие модального окна альбома
   */
  public async open(_screenWidth?: number, _screenHeight?: number) {
    this.isCelebrationActive = false;
    this.visible = true;
    soundManager.playTap();

    this.overlay.clear();
    this.overlay.rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: 0.82 });

    this.modalBox.position.set(0, 0);
    this.contentContainer.removeChildren();

    const w = 380;
    const h = 540;

    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 20)
      .fill({ color: 0xfffdfa })
      .stroke({ width: 2.5, color: 0xd9a463, alpha: 0.95 });
    bg.eventMode = 'none';
    this.contentContainer.addChild(bg);

    const title = new Text({
      text: '📖 Книга открытий',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 19,
        fontWeight: 'bold',
        fill: '#452811',
      }),
    });
    title.anchor.set(0.5);
    title.position.set(0, -h / 2 + 25);
    title.eventMode = 'none';
    this.contentContainer.addChild(title);

    const totalCount = 68; // 7 категорий * 9 предметов + 5 монет
    const currentCount = this.discoveredItems.size;
    const percent = Math.round((currentCount / totalCount) * 100);

    const progressText = new Text({
      text: `Собрано: ${currentCount} / ${totalCount} (${percent}%)`,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: '#854d0e',
      }),
    });
    progressText.anchor.set(0.5);
    progressText.position.set(0, -h / 2 + 47);
    progressText.eventMode = 'none';
    this.contentContainer.addChild(progressText);

    // Кнопка закрытия [✕]
    const closeBtn = new Container();
    closeBtn.position.set(w / 2 - 24, -h / 2 + 24);
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    closeBtn.hitArea = new Rectangle(-16, -16, 32, 32);
    this.contentContainer.addChild(closeBtn);

    const closeBg = new Graphics();
    closeBg.circle(0, 0, 15).fill({ color: 0xfdf7eb }).stroke({ width: 1.5, color: 0xd9a463 });
    closeBg.eventMode = 'none';
    closeBtn.addChild(closeBg);

    const closeText = new Text({
      text: '✕',
      style: new TextStyle({ fontSize: 13, fontWeight: 'bold', fill: '#5c3d22' }),
    });
    closeText.anchor.set(0.5);
    closeText.eventMode = 'none';
    closeBtn.addChild(closeText);

    closeBtn.on('pointerdown', (e) => {
      e.stopPropagation();
      this.close();
    });

    // Контейнер для карточек предметов
    this.cardsContainer = new Container();
    this.contentContainer.addChild(this.cardsContainer);

    // Вкладки категорий (2 ряда по 4 кнопки)
    const tabsContainer = new Container();
    this.contentContainer.addChild(tabsContainer);

    const tabW = 86;
    const tabH = 26;
    const gapX = 6;
    const gapY = 5;
    const tabsStartX = -((4 * tabW + 3 * gapX) / 2) + tabW / 2;
    const tabsStartY = -h / 2 + 75;

    const tabButtons: { type: ItemType; bg: Graphics; text: Text }[] = [];

    const updateTabsVisuals = () => {
      for (const tb of tabButtons) {
        const isActive = tb.type === this.selectedCategory;
        tb.bg.clear();
        tb.bg.roundRect(-tabW / 2, -tabH / 2, tabW, tabH, 7)
          .fill({ color: isActive ? 0xd97706 : 0xf4ebdd })
          .stroke({ width: 1.2, color: isActive ? 0xb45309 : 0xdcc7b1 });
        tb.text.style.fill = isActive ? '#ffffff' : '#784d28';
      }
    };

    CATEGORY_TABS.forEach((cat, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = tabsStartX + col * (tabW + gapX);
      const y = tabsStartY + row * (tabH + gapY);

      const tabBtn = new Container();
      tabBtn.position.set(x, y);
      tabBtn.eventMode = 'static';
      tabBtn.cursor = 'pointer';
      tabBtn.hitArea = new Rectangle(-tabW / 2, -tabH / 2, tabW, tabH);
      tabsContainer.addChild(tabBtn);

      const tBg = new Graphics();
      tBg.eventMode = 'none';
      tabBtn.addChild(tBg);

      // Компактные подписи для кнопок вкладок
      const shortLabels: Record<ItemType, string> = {
        tools: '🧰 Инстр.',
        furniture: '🪚 Мебель',
        plants: '🪴 Растения',
        bakery: '🥐 Выпечка',
        sewing: '🧵 Шитьё',
        fishing: '🎣 Рыбалка',
        music: '🎵 Музыка',
        coins: '🪙 Монеты',
      };

      const tText = new Text({
        text: shortLabels[cat.type] || cat.title,
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          fontWeight: 'bold',
          fill: '#784d28',
        }),
      });
      tText.anchor.set(0.5);
      tText.eventMode = 'none';
      tabBtn.addChild(tText);

      tabButtons.push({ type: cat.type, bg: tBg, text: tText });

      tabBtn.on('pointerdown', (e) => {
        e.stopPropagation();
        if (this.selectedCategory === cat.type) return;
        soundManager.playTap();
        this.selectedCategory = cat.type;
        updateTabsVisuals();
        this.renderCategoryGrid(cat.type, cat.maxLvl, -h / 2 + 138, w);
      });
    });

    updateTabsVisuals();
    const currentCatInfo = CATEGORY_TABS.find((c) => c.type === this.selectedCategory) || CATEGORY_TABS[0];
    this.renderCategoryGrid(currentCatInfo.type, currentCatInfo.maxLvl, -h / 2 + 138, w);

    this.modalBox.scale.set(0.85);
    this.modalBox.alpha = 0;
    gsap.to(this.modalBox.scale, { x: 1, y: 1, duration: 0.25, ease: 'back.out(1.5)' });
    gsap.to(this.modalBox, { alpha: 1, duration: 0.2 });
  }

  private renderCategoryGrid(
    type: ItemType,
    maxLvl: number,
    startY: number,
    modalWidth: number
  ) {
    this.clearContainer(this.cardsContainer);

    const catInfo = CATEGORY_TABS.find((c) => c.type === type);
    const catTitleText = catInfo ? `${catInfo.icon} ${catInfo.title}` : type;

    // Считаем сколько открыто в этой категории
    let discoveredInCat = 0;
    for (let l = 1; l <= maxLvl; l++) {
      if (this.isDiscovered(type, l)) discoveredInCat++;
    }

    const title = new Text({
      text: `${catTitleText}  (${discoveredInCat}/${maxLvl})`,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: '#5c3d22',
      }),
    });
    title.position.set(-modalWidth / 2 + 20, startY);
    title.eventMode = 'none';
    this.cardsContainer.addChild(title);

    // Сетка 3 колонки на 3 ряда (для 9 предметов)
    const cols = 3;
    const cardSize = 98;
    const gapX = 14;
    const gapY = 12;
    const gridStartX = -((cols * cardSize + (cols - 1) * gapX) / 2) + cardSize / 2;
    const gridStartY = startY + 28 + cardSize / 2;

    for (let lvl = 1; lvl <= maxLvl; lvl++) {
      let col = (lvl - 1) % cols;
      let row = Math.floor((lvl - 1) / cols);

      // Для монет (5 штук): центрируем 2 монеты во 2-м ряду
      let x = gridStartX + col * (cardSize + gapX);
      if (type === 'coins' && row === 1) {
        x = gridStartX + (col + 0.5) * (cardSize + gapX);
      }
      const y = gridStartY + row * (cardSize + gapY);

      const card = new Container();
      card.position.set(x, y);
      card.eventMode = 'none';
      this.cardsContainer.addChild(card);

      const isDisc = this.isDiscovered(type, lvl);

      const cardBg = new Graphics();
      cardBg.roundRect(-cardSize / 2, -cardSize / 2, cardSize, cardSize, 12)
        .fill({ color: isDisc ? 0xfffdf7 : 0xf2e8dc, alpha: 0.98 })
        .stroke({
          width: 1.5,
          color: isDisc ? (type === 'coins' ? 0xd97706 : 0xd9a463) : 0xdcc7b1,
        });
      cardBg.eventMode = 'none';
      card.addChild(cardBg);

      // Уровень в левом верхнем углу
      const lvlLabel = new Text({
        text: `Ур.${lvl}`,
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          fontWeight: 'bold',
          fill: isDisc ? '#854d0e' : '#a88d75',
        }),
      });
      lvlLabel.position.set(-cardSize / 2 + 8, -cardSize / 2 + 6);
      lvlLabel.eventMode = 'none';
      card.addChild(lvlLabel);

      if (isDisc) {
        const tex = TextureManager.getItemTexture(type, lvl, false);
        if (tex) {
          const spr = new Sprite(tex);
          spr.anchor.set(0.5);
          const sc = 54 / Math.max(tex.width, tex.height);
          spr.scale.set(sc);
          spr.position.set(0, -6);
          spr.eventMode = 'none';
          card.addChild(spr);
        }

        const itemName = ITEM_NAMES[type]?.[lvl - 1] || `Ур. ${lvl}`;
        const nameText = new Text({
          text: itemName,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 9.5,
            fontWeight: 'bold',
            fill: '#452811',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: cardSize - 10,
          }),
        });
        nameText.anchor.set(0.5, 1);
        nameText.position.set(0, cardSize / 2 - 6);
        nameText.eventMode = 'none';
        card.addChild(nameText);
      } else {
        const lockText = new Text({
          text: '🔒',
          style: new TextStyle({ fontSize: 24 }),
        });
        lockText.anchor.set(0.5);
        lockText.position.set(0, -6);
        lockText.eventMode = 'none';
        card.addChild(lockText);

        const mysteryText = new Text({
          text: '???',
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 10,
            fontWeight: 'bold',
            fill: '#a88d75',
          }),
        });
        mysteryText.anchor.set(0.5, 1);
        mysteryText.position.set(0, cardSize / 2 - 8);
        mysteryText.eventMode = 'none';
        card.addChild(mysteryText);
      }
    }
  }

  public close() {
    soundManager.playTap();
    this.isCelebrationActive = false;
    gsap.to(this.modalBox.scale, {
      x: 0.85,
      y: 0.85,
      duration: 0.2,
      ease: 'back.in(1.5)',
    });
    gsap.to(this.modalBox, {
      alpha: 0,
      duration: 0.2,
      onComplete: () => {
        this.visible = false;
        if (this.onClose) this.onClose();
      },
    });
  }

  public async showDiscoveryCelebration(
    type: ItemType,
    level: number,
    bonusCoins: number,
    onClaim: () => void
  ) {
    this.isCelebrationActive = true;
    this.visible = true;
    soundManager.playOrderComplete();

    this.overlay.clear();
    this.overlay.rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: 0.82 });

    this.modalBox.position.set(0, 0);
    this.contentContainer.removeChildren();

    const w = 320;
    const h = 320;

    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 20)
      .fill({ color: 0xfffdfa })
      .stroke({ width: 3, color: 0xd9a463 });
    bg.eventMode = 'none';
    this.contentContainer.addChild(bg);

    const banner = new Text({
      text: '🎉 НОВОЕ ОТКРЫТИЕ! 🎉',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 17,
        fontWeight: 'bold',
        fill: '#b45309',
      }),
    });
    banner.anchor.set(0.5);
    banner.position.set(0, -h / 2 + 32);
    banner.eventMode = 'none';
    this.contentContainer.addChild(banner);

    const tex = TextureManager.getItemTexture(type, level, false);
    if (tex) {
      const spr = new Sprite(tex);
      spr.anchor.set(0.5);
      const sc = 85 / Math.max(tex.width, tex.height);
      spr.scale.set(sc);
      spr.position.set(0, -20);
      spr.eventMode = 'none';
      this.contentContainer.addChild(spr);

      playMergeSparks(this.contentContainer, 0, -20);
    }

    const name = ITEM_NAMES[type]?.[level - 1] || `Предмет ур. ${level}`;
    const nameText = new Text({
      text: `${name} (Ур. ${level})`,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 15,
        fontWeight: 'bold',
        fill: '#452811',
      }),
    });
    nameText.anchor.set(0.5);
    nameText.position.set(0, 48);
    nameText.eventMode = 'none';
    this.contentContainer.addChild(nameText);

    const rewardText = new Text({
      text: `Бонус: +${bonusCoins} 💰`,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#15803d',
      }),
    });
    rewardText.anchor.set(0.5);
    rewardText.position.set(0, 76);
    rewardText.eventMode = 'none';
    this.contentContainer.addChild(rewardText);

    const claimBtn = new Container();
    claimBtn.position.set(0, 120);
    claimBtn.eventMode = 'static';
    claimBtn.cursor = 'pointer';
    claimBtn.hitArea = new Rectangle(-85, -24, 170, 48);
    this.contentContainer.addChild(claimBtn);

    const claimBg = new Graphics();
    claimBg.roundRect(-80, -22, 160, 44, 12).fill({ color: 0x16a34a }).stroke({ width: 1.5, color: 0x4ade80 });
    claimBg.eventMode = 'none';
    claimBtn.addChild(claimBg);

    const btnText = new Text({
      text: 'Забрать!',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 15,
        fontWeight: 'bold',
        fill: '#ffffff',
      }),
    });
    btnText.anchor.set(0.5);
    btnText.eventMode = 'none';
    claimBtn.addChild(btnText);

    const handleClaim = () => {
      this.isCelebrationActive = false;
      soundManager.playTap();
      gsap.to(this.modalBox.scale, {
        x: 0.8,
        y: 0.8,
        duration: 0.2,
        ease: 'back.in(2)',
        onComplete: () => {
          this.visible = false;
          onClaim();
        },
      });
    };

    claimBtn.on('pointerdown', (e) => {
      e.stopPropagation();
      handleClaim();
    });

    this.modalBox.scale.set(0.5);
    this.modalBox.alpha = 0;
    gsap.to(this.modalBox.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
    gsap.to(this.modalBox, { alpha: 1, duration: 0.2 });
  }
}
