import { Container, Graphics, Sprite, Text, TextStyle, Rectangle } from 'pixi.js';
import gsap from 'gsap';
import type { ItemType } from '../config';
import type { CharacterOrder } from './Storage';
import { soundManager } from './SoundManager';
import { TextureManager } from './TextureManager';

const CHARACTERS = [
  { name: 'Повар', avatar: '👨‍🍳' },
  { name: 'Дизайнер', avatar: '👩‍🎨' },
  { name: 'Турист', avatar: '🏖️' },
  { name: 'Дворецкий', avatar: '🤵' },
  { name: 'Архитектор', avatar: '📐' },
];

export class OrderCard extends Container {
  public order: CharacterOrder;
  private bg: Graphics;
  private itemSprite: Sprite;
  private deliverBtn: Container;
  private btnBg: Graphics;
  private btnText: Text;
  private rewardText: Text;
  private isAvailable: boolean = false;
  private onDeliverClick: (order: CharacterOrder, card: OrderCard) => void;

  constructor(
    order: CharacterOrder,
    onDeliver: (order: CharacterOrder, card: OrderCard) => void
  ) {
    super();
    this.order = order;
    this.onDeliverClick = onDeliver;

    const w = 185;
    const h = 74;

    // Тень карточки на деревянном столе
    const shadow = new Graphics();
    shadow.roundRect(-w / 2, -h / 2 + 3, w, h, 16)
      .fill({ color: 0x5c3311, alpha: 0.18 });
    shadow.eventMode = 'none';
    this.addChild(shadow);

    // Фон карточки (теплая слоновая кость с карамельной обводкой)
    this.bg = new Graphics();
    this.bg.roundRect(-w / 2, -h / 2, w, h, 16)
      .fill({ color: 0xfffdfa, alpha: 0.98 })
      .stroke({ width: 2, color: 0xd9a463, alpha: 0.85 });
    this.bg.eventMode = 'none';
    this.addChild(this.bg);

    // Подложка-кольцо аватара
    const avatarRing = new Graphics();
    avatarRing.circle(-w / 2 + 25, -8, 17)
      .fill({ color: 0xffedd5 })
      .stroke({ width: 1.5, color: 0xfb923c });
    avatarRing.eventMode = 'none';
    this.addChild(avatarRing);

    // Аватар персонажа
    const avatarText = new Text({
      text: order.charAvatar,
      style: new TextStyle({ fontSize: 22 }),
    });
    avatarText.anchor.set(0.5);
    avatarText.position.set(-w / 2 + 25, -8);
    avatarText.eventMode = 'none';
    this.addChild(avatarText);

    // Имя персонажа
    const nameText = new Text({
      text: order.charName,
      style: new TextStyle({
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 10,
        fill: '#5c3d22',
        fontWeight: 'bold',
      }),
    });
    nameText.anchor.set(0.5);
    nameText.position.set(-w / 2 + 25, 17);
    nameText.eventMode = 'none';
    this.addChild(nameText);

    // Блюдце-подставка под запрашиваемый предмет
    const itemPlate = new Graphics();
    itemPlate.circle(-15, 0, 23)
      .fill({ color: 0xfcf4e8 })
      .stroke({ width: 1, color: 0xe6d4be });
    itemPlate.eventMode = 'none';
    this.addChild(itemPlate);

    // Иконка запрашиваемого предмета
    this.itemSprite = new Sprite();
    this.itemSprite.anchor.set(0.5);
    this.itemSprite.position.set(-15, 0);
    this.itemSprite.eventMode = 'none';
    this.addChild(this.itemSprite);

    // Награда
    this.rewardText = new Text({
      text: `+${order.coinReward} 💰`,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 'bold',
        fill: '#b45309',
      }),
    });
    this.rewardText.anchor.set(0.5);
    this.rewardText.position.set(w / 2 - 38, -14);
    this.rewardText.eventMode = 'none';
    this.addChild(this.rewardText);

    // Кнопка "Сдать" — оборачиваем в единый интерактивный Container
    this.deliverBtn = new Container();
    this.deliverBtn.position.set(w / 2 - 38, 14);
    this.deliverBtn.eventMode = 'static';
    this.deliverBtn.cursor = 'pointer';
    this.deliverBtn.hitArea = new Rectangle(-35, -15, 70, 30);
    this.addChild(this.deliverBtn);

    this.btnBg = new Graphics();
    this.btnBg.roundRect(-32, -12, 64, 24, 8)
      .fill({ color: 0xe2e8f0 })
      .stroke({ width: 1, color: 0xcbd5e1 });
    this.btnBg.eventMode = 'none';
    this.deliverBtn.addChild(this.btnBg);

    this.btnText = new Text({
      text: 'Сдать',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 'bold',
        fill: '#94a3b8',
      }),
    });
    this.btnText.anchor.set(0.5);
    this.btnText.eventMode = 'none';
    this.deliverBtn.addChild(this.btnText);

    this.deliverBtn.on('pointerdown', (e) => {
      e.stopPropagation();
      if (this.isAvailable) {
        soundManager.playTap();
        this.onDeliverClick(this.order, this);
      } else {
        soundManager.playError();
        gsap.to(this.position, {
          x: this.x + 4,
          duration: 0.05,
          yoyo: true,
          repeat: 3,
        });
      }
    });

    this.loadItemTexture();
  }

  private loadItemTexture() {
    const tex = TextureManager.getItemTexture(this.order.targetType, this.order.targetLevel, false);
    if (tex) {
      this.itemSprite.texture = tex;
      const targetSize = 46;
      const maxDim = Math.max(tex.width, tex.height);
      if (maxDim > 0) {
        this.itemSprite.scale.set(targetSize / maxDim);
      }
    }
  }

  public setAvailable(available: boolean) {
    if (this.isAvailable === available) return;
    this.isAvailable = available;

    this.btnBg.clear();
    if (available) {
      this.btnBg.roundRect(-32, -12, 64, 24, 8)
        .fill({ color: 0x16a34a })
        .stroke({ width: 1.5, color: 0x4ade80 });
      this.btnText.style.fill = '#ffffff';
      this.deliverBtn.cursor = 'pointer';

      gsap.to(this.deliverBtn.scale, {
        x: 1.08,
        y: 1.08,
        duration: 0.5,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    } else {
      gsap.killTweensOf(this.deliverBtn.scale);
      this.deliverBtn.scale.set(1);
      this.btnBg.roundRect(-32, -12, 64, 24, 8)
        .fill({ color: 0xe2e8f0 })
        .stroke({ width: 1, color: 0xcbd5e1 });
      this.btnText.style.fill = '#94a3b8';
      this.deliverBtn.cursor = 'pointer';
    }
  }

  public setDropHighlight(active: boolean, isMatch: boolean = false) {
    const w = 185;
    const h = 74;
    this.bg.clear();
    if (active) {
      if (isMatch) {
        this.bg.roundRect(-w / 2, -h / 2, w, h, 16)
          .fill({ color: 0xecfdf5, alpha: 1 })
          .stroke({ width: 3, color: 0x16a34a, alpha: 1 });
        gsap.to(this.scale, { x: 1.06, y: 1.06, duration: 0.15 });
      } else {
        this.bg.roundRect(-w / 2, -h / 2, w, h, 16)
          .fill({ color: 0xfef2f2, alpha: 1 })
          .stroke({ width: 2.5, color: 0xef4444, alpha: 0.9 });
        gsap.to(this.scale, { x: 1.02, y: 1.02, duration: 0.15 });
      }
    } else {
      this.bg.roundRect(-w / 2, -h / 2, w, h, 16)
        .fill({ color: 0xfffdfa, alpha: 0.98 })
        .stroke({ width: 2, color: 0xd9a463, alpha: 0.85 });
      gsap.to(this.scale, { x: 1, y: 1, duration: 0.15 });
    }
  }

  public shake() {
    gsap.killTweensOf(this.position);
    const startX = this.x;
    gsap.fromTo(
      this.position,
      { x: startX - 5 },
      {
        x: startX + 5,
        duration: 0.05,
        repeat: 5,
        yoyo: true,
        onComplete: () => {
          this.position.x = startX;
        },
      }
    );
  }
}

export interface OrderHitResult {
  order: CharacterOrder;
  card: OrderCard;
  cardGlobalPos: { x: number; y: number };
}

/**
 * Панель заказов персонажей (OrdersView)
 */
export class OrdersView extends Container {
  public cards: OrderCard[] = [];
  public currentOrders: CharacterOrder[] = [];
  public onDeliverOrder?: (order: CharacterOrder, cardPos: { x: number; y: number }) => void;

  constructor() {
    super();
  }

  public setupOrders(savedOrders?: CharacterOrder[]) {
    this.cards.forEach((c) => {
      this.removeChild(c);
      c.destroy();
    });
    this.cards = [];

    if (savedOrders && savedOrders.length > 0) {
      this.currentOrders = savedOrders;
    } else {
      this.currentOrders = [this.generateRandomOrder(), this.generateRandomOrder()];
    }

    this.renderCards();
  }

  private generateRandomOrder(): CharacterOrder {
    const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    const types: ItemType[] = ['tools', 'furniture', 'plants', 'bakery', 'sewing', 'fishing', 'music'];
    const targetType = types[Math.floor(Math.random() * types.length)];
    const targetLevel = 2 + Math.floor(Math.random() * 3);
    const coinReward = targetLevel * 35 + Math.floor(Math.random() * 20);

    return {
      id: `${Date.now()}_${Math.random()}`,
      charName: char.name,
      charAvatar: char.avatar,
      targetType,
      targetLevel,
      coinReward,
    };
  }

  private renderCards() {
    const spacing = 195;
    const startX = -spacing / 2;

    this.currentOrders.forEach((order, index) => {
      const card = new OrderCard(order, (ord, cardInstance) => {
        if (this.onDeliverOrder) {
          const globalPos = cardInstance.toGlobal({ x: 0, y: 0 });
          this.onDeliverOrder(ord, globalPos);
        }
      });

      card.position.set(startX + index * spacing, 0);
      this.cards.push(card);
      this.addChild(card);

      card.scale.set(0);
      gsap.to(card.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(1.5)', delay: index * 0.1 });
    });
  }

  private hasItemPredicate: ((type: ItemType, level: number) => boolean) | null = null;

  public replaceOrder(orderId: string, onReplaced?: () => void) {
    const index = this.currentOrders.findIndex((o) => o.id === orderId);
    if (index === -1) return;

    const oldCard = this.cards[index];
    const newOrder = this.generateRandomOrder();
    this.currentOrders[index] = newOrder;

    gsap.to(oldCard.scale, {
      x: 0,
      y: 0,
      duration: 0.25,
      ease: 'back.in(2)',
      onComplete: () => {
        this.removeChild(oldCard);
        oldCard.destroy();

        const spacing = 195;
        const startX = -spacing / 2;

        const newCard = new OrderCard(newOrder, (ord, cardInstance) => {
          if (this.onDeliverOrder) {
            const globalPos = cardInstance.toGlobal({ x: 0, y: 0 });
            this.onDeliverOrder(ord, globalPos);
          }
        });

        newCard.position.set(startX + index * spacing, 0);
        newCard.scale.set(0);
        this.cards[index] = newCard;
        this.addChild(newCard);

        // ВАЖНО: Сразу же проверяем, есть ли уже запрашиваемый предмет на доске!
        if (this.hasItemPredicate) {
          const isReady = this.hasItemPredicate(newOrder.targetType, newOrder.targetLevel);
          newCard.setAvailable(isReady);
        }

        if (onReplaced) {
          onReplaced();
        }

        gsap.to(newCard.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
      },
    });
  }

  public updateAvailability(hasItemPredicate: (type: ItemType, level: number) => boolean) {
    this.hasItemPredicate = hasItemPredicate;
    this.cards.forEach((card) => {
      const available = hasItemPredicate(card.order.targetType, card.order.targetLevel);
      card.setAvailable(available);
    });
  }

  public getOrderAtGlobalPos(gx: number, gy: number): OrderHitResult | null {
    for (const card of this.cards) {
      if (card.destroyed) continue;
      const local = card.toLocal({ x: gx, y: gy });
      if (Math.abs(local.x) <= 100 && Math.abs(local.y) <= 45) {
        return {
          order: card.order,
          card,
          cardGlobalPos: card.toGlobal({ x: 0, y: 0 }),
        };
      }
    }
    return null;
  }

  public findMatchingOrder(type: ItemType, level: number): OrderHitResult | null {
    for (const card of this.cards) {
      if (card.destroyed) continue;
      if (card.order.targetType === type && card.order.targetLevel === level) {
        return {
          order: card.order,
          card,
          cardGlobalPos: card.toGlobal({ x: 0, y: 0 }),
        };
      }
    }
    return null;
  }

  public clearAllHighlights() {
    this.cards.forEach((card) => {
      if (!card.destroyed) {
        card.setDropHighlight(false);
      }
    });
  }
}
