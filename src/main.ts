import './style.scss';
import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent, Rectangle, Circle, Assets, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { Board } from './game/Board';
import { OrdersView } from './game/OrdersView';
import { CodexModal } from './game/CodexModal';
import { BackpackModal } from './game/BackpackModal';
import { playFlyingCoins } from './game/Effects';
import { soundManager } from './game/SoundManager';
import { StorageManager } from './game/Storage';
import type { GameSaveState, BackpackItemData, CharacterOrder } from './game/Storage';
import { TextureManager } from './game/TextureManager';
import { BACKPACK_CONFIG, GENERATOR_CONFIG } from './config';
import type { ItemType } from './config';
import { ItemView } from './game/ItemView';

async function bootstrap() {
  // 0. Интеграция с Telegram WebApp API
  const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } })?.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const container = document.querySelector<HTMLDivElement>('#app');
  if (!container) throw new Error('#app not found');

  const app = new Application();
  await app.init({
    resizeTo: container,
    backgroundColor: 0x489b1c, // Естественный цвет травы до загрузки
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: true,
  });

  container.appendChild(app.canvas);

  // Инициализируем текстурный атлас (загружается 1 раз и дает мгновенный доступ ко всем 75 предметам)
  await TextureManager.init();

  // 1. Природный фон травы в верхней зоне экрана
  const bgTexture = await Assets.load('/assets/bg_grass.jpg');
  const bgSprite = new Sprite(bgTexture);
  bgSprite.eventMode = 'none';
  app.stage.addChild(bgSprite);

  // 2. Теплый деревянный стол в игровой зоне (в точности как в референсе)
  const tableSurface = new Graphics();
  tableSurface.eventMode = 'none';
  app.stage.addChild(tableSurface);

  const root = new Container();
  app.stage.addChild(root);

  const overlayFxLayer = new Container();
  app.stage.addChild(overlayFxLayer);

  // 1. Загрузка сохранения
  const savedState = StorageManager.load();
  let coins = savedState ? savedState.coins : 0;
  let energy = savedState ? savedState.energy : 100;
  let backpackSlots = Math.min(
    BACKPACK_CONFIG.TOTAL_SLOTS,
    Math.max(BACKPACK_CONFIG.INITIAL_SLOTS, savedState?.backpackSlots || BACKPACK_CONFIG.INITIAL_SLOTS)
  );
  let backpackItems: (BackpackItemData | null)[] =
    savedState?.backpackItems
      ? savedState.backpackItems.slice(0, BACKPACK_CONFIG.TOTAL_SLOTS)
      : Array(BACKPACK_CONFIG.TOTAL_SLOTS).fill(null);
  while (backpackItems.length < BACKPACK_CONFIG.TOTAL_SLOTS) {
    backpackItems.push(null);
  }

  if (savedState && savedState.lastTimestamp) {
    const elapsedSeconds = Math.floor((Date.now() - savedState.lastTimestamp) / 1000);
    const energyGained = Math.floor(elapsedSeconds / 45);
    if (energyGained > 0) {
      energy = Math.min(100, energy + energyGained);
    }
  }

  // 2. Верхняя панель ресурсов
  const topUi = new Container();
  root.addChild(topUi);

  // 3. Панель заказов
  const ordersView = new OrdersView();
  root.addChild(ordersView);

  // 4. Модальное окно "Кодекс"
  const codexModal = new CodexModal();
  app.stage.addChild(codexModal);

  // 4.1 Модальное окно "Рюкзак"
  const backpackModal = new BackpackModal();
  app.stage.addChild(backpackModal);

  if (savedState && savedState.discoveredItems) {
    codexModal.setDiscovered(savedState.discoveredItems);
  } else {
    codexModal.setDiscovered(['tools_1', 'tools_2', 'furniture_1', 'furniture_2', 'coins_1']);
  }

  // Тень под верхней панелью
  const topShadow = new Graphics();
  topShadow.roundRect(-205, -22, 410, 48, 16)
    .fill({ color: 0x0f2b0d, alpha: 0.28 });
  topShadow.eventMode = 'none';
  topUi.addChild(topShadow);

  // Фон панели (теплая светлая слоновая кость с карамельной обводкой)
  const topBarBg = new Graphics();
  topBarBg.roundRect(-205, -24, 410, 48, 16)
    .fill({ color: 0xfffdfa, alpha: 0.98 })
    .stroke({ width: 2, color: 0xd9a463, alpha: 0.85 });
  topBarBg.eventMode = 'none';
  topUi.addChild(topBarBg);

  const uiTextStyle = new TextStyle({
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#452811',
  });

  const scoreText = new Text({
    text: `💰 ${coins}`,
    style: uiTextStyle,
  });
  scoreText.anchor.set(0, 0.5);
  scoreText.position.set(-192, 0);
  scoreText.eventMode = 'none';
  topUi.addChild(scoreText);

  const energyText = new Text({
    text: `⚡ ${energy}/100`,
    style: uiTextStyle,
  });
  energyText.anchor.set(0, 0.5);
  energyText.position.set(-100, 0);
  energyText.eventMode = 'none';
  topUi.addChild(energyText);

  // Кнопка "📖 Кодекс"
  const codexBtn = new Container();
  codexBtn.position.set(65, 0);
  codexBtn.eventMode = 'static';
  codexBtn.cursor = 'pointer';
  codexBtn.hitArea = new Rectangle(-58, -15, 116, 30);
  topUi.addChild(codexBtn);

  const codexBg = new Graphics();
  codexBg.roundRect(-58, -15, 116, 30, 9)
    .fill({ color: 0x2563eb })
    .stroke({ width: 1.5, color: 0x60a5fa });
  codexBg.eventMode = 'none';
  codexBtn.addChild(codexBg);

  const codexBtnText = new Text({
    text: `📖 Кодекс (${codexModal.discoveredItems.size}/68)`,
    style: new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 11,
      fontWeight: 'bold',
      fill: '#ffffff',
    }),
  });
  codexBtnText.anchor.set(0.5);
  codexBtnText.eventMode = 'none';
  codexBtn.addChild(codexBtnText);

  codexBtn.on('pointerdown', (e) => {
    e.stopPropagation();
    codexModal.open(app.screen.width, app.screen.height);
  });

  // Кнопка сброса (🔄)
  const resetBtn = new Container();
  resetBtn.position.set(162, 0);
  resetBtn.eventMode = 'static';
  resetBtn.cursor = 'pointer';
  resetBtn.hitArea = new Rectangle(-18, -18, 36, 36);
  topUi.addChild(resetBtn);

  const resetBg = new Graphics();
  resetBg.roundRect(-16, -16, 32, 32, 9)
    .fill({ color: 0xfdf7eb })
    .stroke({ width: 1.5, color: 0xd9a463 });
  resetBg.eventMode = 'none';
  resetBtn.addChild(resetBg);

  const resetIcon = new Text({
    text: '🔄',
    style: new TextStyle({ fontSize: 14 }),
  });
  resetIcon.anchor.set(0.5);
  resetIcon.eventMode = 'none';
  resetBtn.addChild(resetIcon);

  // 6. Окно подтверждения сброса
  const confirmModal = new Container();
  confirmModal.visible = false;
  app.stage.addChild(confirmModal);

  const confirmOverlay = new Graphics();
  confirmOverlay.rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: 0.8 });
  confirmOverlay.eventMode = 'static';
  confirmModal.addChild(confirmOverlay);

  const confirmBox = new Container();
  confirmModal.addChild(confirmBox);

  const confirmBg = new Graphics();
  confirmBg.roundRect(-150, -90, 300, 180, 20)
    .fill({ color: 0xfffdfa })
    .stroke({ width: 2.5, color: 0xd9a463 });
  confirmBg.eventMode = 'none';
  confirmBox.addChild(confirmBg);

  const confirmTitle = new Text({
    text: '⚠️ Сбросить прогресс?',
    style: new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 16,
      fontWeight: 'bold',
      fill: '#452811',
    }),
  });
  confirmTitle.anchor.set(0.5);
  confirmTitle.position.set(0, -50);
  confirmTitle.eventMode = 'none';
  confirmBox.addChild(confirmTitle);

  const confirmDesc = new Text({
    text: 'Все предметы, монеты и открытая\nпаутина будут сброшены к началу.',
    style: new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 11,
      fill: '#6b4f3b',
      align: 'center',
      lineHeight: 16,
    }),
  });
  confirmDesc.anchor.set(0.5);
  confirmDesc.position.set(0, -14);
  confirmDesc.eventMode = 'none';
  confirmBox.addChild(confirmDesc);

  const cancelBtn = new Container();
  cancelBtn.position.set(-65, 45);
  cancelBtn.eventMode = 'static';
  cancelBtn.cursor = 'pointer';
  cancelBtn.hitArea = new Rectangle(-55, -18, 110, 36);
  confirmBox.addChild(cancelBtn);

  const cancelBg = new Graphics();
  cancelBg.roundRect(-55, -18, 110, 36, 10)
    .fill({ color: 0xe2e8f0 })
    .stroke({ width: 1, color: 0xcbd5e1 });
  cancelBg.eventMode = 'none';
  cancelBtn.addChild(cancelBg);

  const cancelText = new Text({
    text: 'Отмена',
    style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: '#475569', fontWeight: 'bold' }),
  });
  cancelText.anchor.set(0.5);
  cancelText.eventMode = 'none';
  cancelBtn.addChild(cancelText);

  cancelBtn.on('pointerdown', (e) => {
    e.stopPropagation();
    soundManager.playTap();
    confirmModal.visible = false;
  });

  const doResetBtn = new Container();
  doResetBtn.position.set(65, 45);
  doResetBtn.eventMode = 'static';
  doResetBtn.cursor = 'pointer';
  doResetBtn.hitArea = new Rectangle(-55, -18, 110, 36);
  confirmBox.addChild(doResetBtn);

  const doResetBg = new Graphics();
  doResetBg.roundRect(-55, -18, 110, 36, 10).fill({ color: 0xdc2626 });
  doResetBg.eventMode = 'none';
  doResetBtn.addChild(doResetBg);

  const doResetText = new Text({
    text: 'Сбросить',
    style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: '#ffffff', fontWeight: 'bold' }),
  });
  doResetText.anchor.set(0.5);
  doResetText.eventMode = 'none';
  doResetBtn.addChild(doResetText);

  doResetBtn.on('pointerdown', (e) => {
    e.stopPropagation();
    soundManager.playTap();
    StorageManager.clear();
    window.location.reload();
  });

  resetBtn.on('pointerdown', (e) => {
    e.stopPropagation();
    soundManager.playTap();
    confirmModal.visible = true;
    confirmBox.scale.set(0.85);
    confirmBox.alpha = 0;
    gsap.to(confirmBox.scale, { x: 1, y: 1, duration: 0.2, ease: 'back.out(2)' });
    gsap.to(confirmBox, { alpha: 1, duration: 0.15 });
  });

  // Создание доски
  const board = new Board();

  // 7. Подключение механики расхода энергии генераторами на поле
  board.onRequestEnergy = () => {
    if (energy <= 0) return false;
    energy -= 1;
    energyText.text = `⚡ ${energy}/100`;
    saveGame();
    return true;
  };

  // 8. Подключение сбора монет при двойном клике
  board.onCoinCollect = (amount: number, itemGlobalPos: { x: number; y: number }) => {
    const topCoinGlobal = scoreText.toGlobal({ x: 15, y: 0 });
    playFlyingCoins(
      overlayFxLayer,
      itemGlobalPos.x,
      itemGlobalPos.y,
      topCoinGlobal.x,
      topCoinGlobal.y,
      () => {
        coins += amount;
        scoreText.text = `💰 ${coins}`;
        gsap.fromTo(
          scoreText.scale,
          { x: 1.35, y: 1.35 },
          { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' }
        );
        saveGame();
      }
    );
  };

  // 9. Нижняя панель управления: Слева круглый Рюкзак 🎒, Справа круглая Зона продажи 💰
  const bottomUi = new Container();
  root.addChild(bottomUi);

  // Игровое поле добавляется в root ПОСЛЕ bottomUi:
  // благодаря этому перетаскиваемые предметы на доске гарантированно отображаются ВЫШЕ зоны продажи и рюкзака!
  root.addChild(board);

  const BTN_RADIUS = 28;

  // --- ЛЕВАЯ КНОПКА: КРУГЛЫЙ РЮКЗАК (BACKPACK) ---
  const backpackBtn = new Container();
  backpackBtn.position.set(-110, 0);
  backpackBtn.eventMode = 'static';
  backpackBtn.cursor = 'pointer';
  backpackBtn.hitArea = new Circle(0, 0, BTN_RADIUS + 6);
  bottomUi.addChild(backpackBtn);

  const backpackShadow = new Graphics();
  backpackShadow.circle(0, 3, BTN_RADIUS).fill({ color: 0x4a2a11, alpha: 0.22 });
  backpackShadow.eventMode = 'none';
  backpackBtn.addChild(backpackShadow);

  const backpackBg = new Graphics();
  backpackBg.circle(0, 0, BTN_RADIUS)
    .fill({ color: 0xfffdfa })
    .stroke({ width: 2.5, color: 0xd9a463 });
  backpackBg.eventMode = 'none';
  backpackBtn.addChild(backpackBg);

  const backpackIcon = new Text({
    text: '🎒',
    style: new TextStyle({ fontSize: 26 }),
  });
  backpackIcon.anchor.set(0.5);
  backpackIcon.position.set(0, -1);
  backpackIcon.eventMode = 'none';
  backpackBtn.addChild(backpackIcon);

  // Бейдж количества предметов в углу кнопки
  const backpackBadge = new Container();
  backpackBadge.position.set(BTN_RADIUS - 8, -BTN_RADIUS + 6);
  backpackBadge.eventMode = 'none';
  backpackBtn.addChild(backpackBadge);

  const backpackBadgeBg = new Graphics();
  backpackBadgeBg.roundRect(-14, -8, 28, 16, 8)
    .fill({ color: 0x5c3311 })
    .stroke({ width: 1.5, color: 0xfcd34d });
  backpackBadgeBg.eventMode = 'none';
  backpackBadge.addChild(backpackBadgeBg);

  const backpackBadgeText = new Text({
    text: `0/${backpackSlots}`,
    style: new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 9,
      fontWeight: 'bold',
      fill: '#ffffff',
    }),
  });
  backpackBadgeText.anchor.set(0.5);
  backpackBadgeText.eventMode = 'none';
  backpackBadge.addChild(backpackBadgeText);

  // Подпись под кнопкой
  const backpackLabel = new Text({
    text: 'Рюкзак',
    style: new TextStyle({
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11,
      fontWeight: 'bold',
      fill: '#5c3311',
    }),
  });
  backpackLabel.anchor.set(0.5, 0);
  backpackLabel.position.set(0, BTN_RADIUS + 5);
  backpackLabel.eventMode = 'none';
  backpackBtn.addChild(backpackLabel);

  backpackBtn.on('pointerdown', (e) => {
    e.stopPropagation();
    soundManager.playTap();
    backpackModal.setBackpackState(backpackSlots, backpackItems);
    backpackModal.open(app.screen.width, app.screen.height);
  });

  // --- ПРАВАЯ ОБЛАСТЬ: КРУГЛАЯ ЗОНА ПРОДАЖИ (SELL ZONE) ---
  const sellZone = new Container();
  sellZone.position.set(110, 0);
  sellZone.eventMode = 'static';
  sellZone.cursor = 'pointer';
  sellZone.hitArea = new Circle(0, 0, BTN_RADIUS + 6);
  bottomUi.addChild(sellZone);

  const sellShadow = new Graphics();
  sellShadow.circle(0, 3, BTN_RADIUS).fill({ color: 0x4a2a11, alpha: 0.22 });
  sellShadow.eventMode = 'none';
  sellZone.addChild(sellShadow);

  const sellBg = new Graphics();
  sellBg.circle(0, 0, BTN_RADIUS)
    .fill({ color: 0xfef9ee })
    .stroke({ width: 2.5, color: 0xeab308 });
  sellBg.eventMode = 'none';
  sellZone.addChild(sellBg);

  const sellIcon = new Text({
    text: '💰',
    style: new TextStyle({ fontSize: 26 }),
  });
  sellIcon.anchor.set(0.5);
  sellIcon.position.set(0, -1);
  sellIcon.eventMode = 'none';
  sellZone.addChild(sellIcon);

  // Подпись под кнопкой
  const sellLabel = new Text({
    text: 'Продать',
    style: new TextStyle({
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11,
      fontWeight: 'bold',
      fill: '#713f12',
    }),
  });
  sellLabel.anchor.set(0.5, 0);
  sellLabel.position.set(0, BTN_RADIUS + 5);
  sellLabel.eventMode = 'none';
  sellZone.addChild(sellLabel);

  // Функция обновления состояния рюкзака
  const updateBackpackUI = () => {
    const occupiedCount = backpackItems.filter((it, idx) => idx < backpackSlots && it !== null).length;
    backpackBadgeText.text = `${occupiedCount}/${backpackSlots}`;
    backpackModal.setBackpackState(backpackSlots, backpackItems);
  };

  // Функция сохранения
  const saveGame = () => {
    const state: GameSaveState = {
      coins,
      energy,
      lastTimestamp: Date.now(),
      grid: board.getSerializedGrid(),
      orders: ordersView.currentOrders,
      discoveredItems: Array.from(codexModal.discoveredItems),
      backpackSlots,
      backpackItems,
    };
    StorageManager.save(state);
  };

  const refreshOrdersStatus = () => {
    ordersView.updateAvailability((type, level) => board.hasItem(type, level));
    board.updateOrderMatches(ordersView.currentOrders);
    saveGame();
  };

  board.onBoardChanged = () => {
    refreshOrdersStatus();
  };

  // Слияние предметов: начисление очков + кодекс + 20% шанс на монету
  board.onMergeSuccess = (type: ItemType, level: number) => {
    const gained = level * 5;
    coins += gained;
    scoreText.text = `💰 ${coins}`;

    const isNew = codexModal.markDiscovered(type, level);
    codexBtnText.text = `📖 Кодекс (${codexModal.discoveredItems.size}/68)`;

    if (isNew) {
      const bonus = level * 20;
      codexModal.showDiscoveryCelebration(type, level, bonus, () => {
        coins += bonus;
        scoreText.text = `💰 ${coins}`;
        gsap.fromTo(
          scoreText.scale,
          { x: 1.4, y: 1.4 },
          { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' }
        );
        saveGame();
      });
    }

    refreshOrdersStatus();
  };

  // Сдача заказа (по кнопке "Сдать", даблтапом или перетаскиванием в квест)
  function deliverOrder(order: CharacterOrder, cardGlobalPos: { x: number; y: number }, specificItem?: ItemView): boolean {
    const consumed = specificItem
      ? board.consumeSpecificItem(specificItem, cardGlobalPos)
      : board.consumeItem(order.targetType, order.targetLevel, cardGlobalPos);

    if (!consumed) return false;

    soundManager.playOrderComplete();

    const topCoinGlobal = scoreText.toGlobal({ x: 15, y: 0 });
    playFlyingCoins(
      overlayFxLayer,
      cardGlobalPos.x,
      cardGlobalPos.y,
      topCoinGlobal.x,
      topCoinGlobal.y,
      () => {
        coins += order.coinReward;
        scoreText.text = `💰 ${coins}`;
        gsap.fromTo(
          scoreText.scale,
          { x: 1.35, y: 1.35 },
          { x: 1, y: 1, duration: 0.3, ease: 'back.out(2.5)' }
        );
        saveGame();
      }
    );

    ordersView.replaceOrder(order.id, () => {
      refreshOrdersStatus();
    });
    return true;
  }

  ordersView.onDeliverOrder = (order, cardGlobalPos) => {
    deliverOrder(order, cardGlobalPos);
  };

  // 10. Инициализация доски
  if (savedState && savedState.grid && savedState.grid.length > 0) {
    board.loadSerializedGrid(savedState.grid);
    ordersView.setupOrders(savedState.orders);
    // Добавляем недостающие генераторы из полного набора (если сохранение было со старой версии)
    board.ensureAllGeneratorsExist(backpackItems);
  } else {
    board.setupInitialBoard();
    ordersView.setupOrders();
  }
  refreshOrdersStatus();
  updateBackpackUI();

  // Логика взаимодействия с рюкзаком
  backpackModal.onRequestTakeItem = (index: number) => {
    const itemData = backpackItems[index];
    if (!itemData) return false;

    const emptyCell = board.findRandomEmptyCell();
    if (!emptyCell) {
      return false; // Поле заполнено
    }

    const newItem = board.createAndPlaceItem(
      emptyCell.col,
      emptyCell.row,
      itemData.type,
      itemData.level,
      !!itemData.isGenerator,
      false,
      itemData.generatorTapsLeft !== undefined ? itemData.generatorTapsLeft : GENERATOR_CONFIG.MAX_TAPS,
      itemData.cooldownUntil || 0,
      itemData.lastRechargeTime
    );
    newItem.playSpawnAnimation();

    backpackItems[index] = null;
    updateBackpackUI();
    refreshOrdersStatus();
    return true;
  };

  backpackModal.onRequestBuySlot = (_index: number, price: number) => {
    if (coins < price) {
      return false;
    }

    coins -= price;
    scoreText.text = `💰 ${coins}`;
    backpackSlots++;

    updateBackpackUI();
    saveGame();
    return true;
  };

  // Проверка попадания курсора в круглую область кнопки с учетом масштабирования
  function isPointInsideCircle(gx: number, gy: number, cont: Container, radius: number): boolean {
    const local = cont.toLocal({ x: gx, y: gy });
    return (local.x * local.x + local.y * local.y) <= (radius * radius);
  }

  board.isOverBackpack = (gx, gy) => isPointInsideCircle(gx, gy, backpackBtn, 36);
  board.isOverSellZone = (gx, gy) => isPointInsideCircle(gx, gy, sellZone, 36);

  board.onDragMove = (item, gx, gy) => {
    if (board.isOverSellZone && board.isOverSellZone(gx, gy)) {
      if (!item.isGenerator) {
        sellZone.scale.set(1.15);
        sellBg.clear().circle(0, 0, BTN_RADIUS)
          .fill({ color: 0xdcfce7 })
          .stroke({ width: 3, color: 0x16a34a });
        sellLabel.text = 'Продать!';
        sellLabel.style.fill = '#16a34a';
      } else {
        sellZone.scale.set(1.05);
        sellBg.clear().circle(0, 0, BTN_RADIUS)
          .fill({ color: 0xfee2e2 })
          .stroke({ width: 2.5, color: 0xdc2626 });
        sellLabel.text = 'Нельзя!';
        sellLabel.style.fill = '#dc2626';
      }
    } else {
      sellZone.scale.set(1);
      sellBg.clear().circle(0, 0, BTN_RADIUS)
        .fill({ color: 0xfef9ee })
        .stroke({ width: 2.5, color: 0xeab308 });
      sellLabel.text = 'Продать';
      sellLabel.style.fill = '#713f12';
    }

    if (board.isOverBackpack && board.isOverBackpack(gx, gy)) {
      backpackBtn.scale.set(1.15);
      backpackBg.clear().circle(0, 0, BTN_RADIUS)
        .fill({ color: 0xdbeafe })
        .stroke({ width: 3, color: 0x2563eb });
      backpackLabel.text = 'В рюкзак!';
      backpackLabel.style.fill = '#2563eb';
    } else {
      backpackBtn.scale.set(1);
      backpackBg.clear().circle(0, 0, BTN_RADIUS)
        .fill({ color: 0xfffdfa })
        .stroke({ width: 2.5, color: 0xd9a463 });
      backpackLabel.text = 'Рюкзак';
      backpackLabel.style.fill = '#5c3311';
    }

    // Подсветка карточек квестов при наведении перетаскиваемого предмета
    const orderHit = ordersView.getOrderAtGlobalPos(gx, gy);
    ordersView.cards.forEach((card) => {
      if (orderHit && orderHit.card === card) {
        const isMatch = !item.isCobwebbed && !item.isGenerator && !item.isCoin &&
          item.itemData.type === card.order.targetType &&
          item.itemData.level === card.order.targetLevel;
        card.setDropHighlight(true, isMatch);
      } else {
        card.setDropHighlight(false);
      }
    });
  };

  board.onDragEnd = () => {
    sellZone.scale.set(1);
    sellBg.clear().circle(0, 0, BTN_RADIUS)
      .fill({ color: 0xfef9ee })
      .stroke({ width: 2.5, color: 0xeab308 });
    sellLabel.text = 'Продать';
    sellLabel.style.fill = '#713f12';

    backpackBtn.scale.set(1);
    backpackBg.clear().circle(0, 0, BTN_RADIUS)
      .fill({ color: 0xfffdfa })
      .stroke({ width: 2.5, color: 0xd9a463 });
    backpackLabel.text = 'Рюкзак';
    backpackLabel.style.fill = '#5c3311';

    ordersView.clearAllHighlights();
  };

  // Сдача заказа даблтапом по подходящему предмету на доске
  board.onDoubleTapItem = (item) => {
    if (item.isCobwebbed || item.isGenerator || item.isCoin) return false;

    const hit = ordersView.findMatchingOrder(item.itemData.type, item.itemData.level);
    if (!hit) {
      return false;
    }

    deliverOrder(hit.order, hit.cardGlobalPos, item);
    return true;
  };

  // Сдача заказа перетаскиванием предмета прямо на карточку квеста
  board.onDropOrder = (item, gx, gy) => {
    const orderHit = ordersView.getOrderAtGlobalPos(gx, gy);
    if (!orderHit) return false;

    ordersView.clearAllHighlights();

    if (item.isCobwebbed || item.isGenerator || item.isCoin) {
      soundManager.playError();
      orderHit.card.shake();
      board.returnItemToOrigin(item);
      return true;
    }

    const isMatch = item.itemData.type === orderHit.order.targetType &&
                    item.itemData.level === orderHit.order.targetLevel;

    if (!isMatch) {
      soundManager.playError();
      orderHit.card.shake();
      board.returnItemToOrigin(item);
      return true;
    }

    // Совпадение! Сдаем заказ этим предметом
    deliverOrder(orderHit.order, orderHit.cardGlobalPos, item);
    return true;
  };

  board.onDropSell = (item) => {
    gsap.fromTo(sellZone.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
    board.sellItem(item);
    refreshOrdersStatus();
  };

  board.onDropBackpack = (item) => {
    const freeIndex = backpackItems.findIndex((it, idx) => idx < backpackSlots && it === null);
    if (freeIndex === -1) {
      soundManager.playError();
      gsap.to(backpackBtn.position, {
        x: backpackBtn.x + 5,
        duration: 0.05,
        yoyo: true,
        repeat: 3,
      });
      return false;
    }

    const data: BackpackItemData = {
      type: item.itemData.type,
      level: item.itemData.level,
      isGenerator: item.isGenerator,
      generatorTapsLeft: item.generatorTapsLeft,
      cooldownUntil: item.cooldownUntil,
      lastRechargeTime: item.lastRechargeTime,
    };

    board.removeItem(item);

    const targetGlobal = backpackBtn.toGlobal({ x: 0, y: 0 });
    const localTarget = board.toLocal(targetGlobal);

    gsap.killTweensOf(item);
    gsap.to(item.position, { x: localTarget.x, y: localTarget.y, duration: 0.25, ease: 'power2.in' });
    gsap.to(item.scale, {
      x: 0.2,
      y: 0.2,
      duration: 0.25,
      onComplete: () => {
        if (item.parent) item.parent.removeChild(item);
        if (!item.destroyed) item.destroy({ children: true });
      },
    });

    backpackItems[freeIndex] = data;
    soundManager.playTap();

    gsap.fromTo(backpackBtn.scale, { x: 1.15, y: 1.15 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });

    updateBackpackUI();
    refreshOrdersStatus();
    return true;
  };

  // Восстановление энергии (+1 каждые 45 секунд)
  setInterval(() => {
    if (energy < 100) {
      energy += 1;
      energyText.text = `⚡ ${energy}/100`;
      saveGame();
    }
  }, 45000);

  // Игровой цикл обновления (кулдауны генераторов, тикающие часики)
  app.ticker.add(() => {
    board.update();
  });

  // Глобальные обработчики перетаскивания
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    board.handlePointerMove(e.global);
  });

  app.stage.on('pointerup', (e: FederatedPointerEvent) => {
    board.handlePointerUp(e.global);
  });

  app.stage.on('pointerupoutside', (e: FederatedPointerEvent) => {
    board.handlePointerUp(e.global);
  });

  // Адаптивное центрирование под любые экраны (Telegram WebApp, Mobile, Desktop, Tablet)
  const resizeLayout = () => {
    const width = app.screen.width;
    const height = app.screen.height;

    // Защита от нулевых/микроскопических размеров экрана при переключении DevTools
    if (!width || !height || width < 100 || height < 100) {
      return;
    }

    // 1. Растягиваем природный фон травы на весь экран
    bgSprite.position.set(0, 0);
    bgSprite.width = width;
    bgSprite.height = height;

    // 2. Базовые размеры элементов (в несмасштабированных координатах):
    // topUi: height 48px (от центра -24 до +24), width 410px
    // ordersView: height 74px (от центра -37 до +37), width 380px
    // board: height 522px (от центра -261 до +261 с деревянной рамой), width 410px
    // bottomUi: height 85px (кнопки радиус 33, подписи снизу +52), width 286px
    const DESIGN_WIDTH = 416; // 410px + боковые безопасные поля
    const MIN_HEIGHT = 800;   // Минимальная высота для комфортных отступов

    // Вычисляем масштаб с защитой от отрицательных/нулевых значений
    const scaleX = (width - 12) / DESIGN_WIDTH;
    const scaleY = (height - 16) / MIN_HEIGHT;
    const scale = Math.max(0.35, Math.min(1.15, scaleX, scaleY));

    root.scale.set(scale);

    // Доступная высота внутри root в локальных единицах:
    const localHeight = height / scale;
    const contentFixedHeights = 48 + 74 + 522 + 85; // 729px
    const extraSpace = Math.max(0, localHeight - contentFixedHeights);

    // Умное динамическое распределение свободного пространства:
    // - padTop: базовый отступ сверху + 18% свободного места (для челки/шторки Telegram)
    // - gapTopToOrders: 10px базовых + 10% свободного места
    // - gapOrdersToBoard: 10px базовых + 12% свободного места
    // - gapBoardToBottom: 18px базовых + 38% свободного места (кнопки рюкзака и продажи под пальцы)
    const padTop = Math.max(16, extraSpace * 0.18);
    const gapTopToOrders = Math.max(10, extraSpace * 0.10);
    const gapOrdersToBoard = Math.max(10, extraSpace * 0.12);
    const gapBoardToBottom = Math.max(18, extraSpace * 0.38);

    // Центрируем root по горизонтали, Y начинается с 0:
    root.position.set(width / 2, 0);

    const topUiY = padTop + 24;
    topUi.position.set(0, topUiY);

    const ordersY = topUiY + 24 + gapTopToOrders + 37;
    ordersView.position.set(0, ordersY);

    const boardY = ordersY + 37 + gapOrdersToBoard + 261;
    board.position.set(0, boardY);

    const bottomUiY = boardY + 261 + gapBoardToBottom + 33;
    bottomUi.position.set(0, bottomUiY);

    // Модальные окна (в центре видимого экрана)
    codexModal.position.set(width / 2, height / 2);
    backpackModal.position.set(width / 2, height / 2);
    confirmModal.position.set(width / 2, height / 2);

    const modalScale = Math.min(1.0, (width - 16) / 380, (height - 24) / 540);
    codexModal.scale.set(Math.max(0.4, modalScale));

    const backpackScale = Math.min(1.0, (width - 20) / 340, (height - 30) / 340);
    backpackModal.scale.set(Math.max(0.4, backpackScale));

    const confirmScale = Math.min(1.0, (width - 20) / 300, (height - 30) / 180);
    confirmModal.scale.set(Math.max(0.4, confirmScale));

    // 3. Отрисовка теплого деревянного стола в игровой зоне
    // Стол начинается ровно посередине между верхней панелью на траве и карточками заказов
    const unscaledTableTop = ordersY - 37 - Math.max(6, gapTopToOrders / 2);
    const screenTableTop = unscaledTableTop * scale;

    tableSurface.clear();

    // Мягкая тень от стола на траву
    tableSurface.rect(0, screenTableTop - 10, width, 12).fill({ color: 0x0f2b0d, alpha: 0.35 });

    // Кромка стола (деревянная планка)
    tableSurface.rect(0, screenTableTop, width, 5).fill({ color: 0x8a5223 });
    tableSurface.rect(0, screenTableTop + 2, width, 2).fill({ color: 0xdfb482 });

    // Основное полотно стола (теплое светлое дерево) до самого низа экрана
    const tableHeight = Math.max(0, height - screenTableTop - 5);
    tableSurface.rect(0, screenTableTop + 5, width, tableHeight).fill({ color: 0xdeb07d });

    // Тонкие вертикальные волокна и стыки досок стола (гармонируют с шириной клеток 56px)
    // ГАРАНТИРУЕМ, что шаг цикла >= 20px, чтобы исключить любое зацикливание!
    const plankWidth = Math.max(20, Math.round(56 * scale));
    if (plankWidth > 0 && width > plankWidth) {
      for (let px = plankWidth; px < width; px += plankWidth) {
        tableSurface.rect(px, screenTableTop + 5, 1.5, tableHeight)
          .fill({ color: 0xb5824c, alpha: 0.16 });
      }
    }
  };

  resizeLayout();
  window.addEventListener('resize', resizeLayout);
  window.addEventListener('orientationchange', () => setTimeout(resizeLayout, 100));
  app.renderer.on('resize', resizeLayout);
}

bootstrap().catch((err) => {
  console.error('Ошибка инициализации игры:', err);
});
