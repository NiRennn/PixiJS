import { Container, Graphics, FederatedPointerEvent } from 'pixi.js';
import gsap from 'gsap';
import { GRID_CONFIG, GENERATOR_CONFIG, COIN_DROP_CHANCE, COIN_VALUES } from '../config';
import type { ItemType, ItemData } from '../config';
import { ItemView } from './ItemView';
import { playMergeSparks } from './Effects';
import { soundManager } from './SoundManager';
import type { SavedCell, BackpackItemData } from './Storage';

export class Board extends Container {
  private cellsLayer: Container;
  private itemsLayer: Container;
  private dragLayer: Container;
  private fxLayer: Container;

  private itemsGrid: (ItemView | null)[][];
  private draggedItem: ItemView | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragStartTime: number = 0;

  // Колбэки событий
  public onMergeSuccess?: (type: ItemType, level: number) => void;
  public onBoardChanged?: () => void;
  public onRequestEnergy?: () => boolean; // Возвращает true, если энергия успешно списана
  public onCoinCollect?: (amount: number, itemPos: { x: number; y: number }) => void;
  public onItemSelected?: (item: ItemView | null) => void;

  // Колбэки зон сброса (Рюкзак, Продажа и Квесты)
  public isOverBackpack?: (globalX: number, globalY: number) => boolean;
  public onDropBackpack?: (item: ItemView) => boolean;

  public isOverSellZone?: (globalX: number, globalY: number) => boolean;
  public onDropSell?: (item: ItemView) => void;

  public onDropOrder?: (item: ItemView, globalX: number, globalY: number) => boolean;
  public onDoubleTapItem?: (item: ItemView) => boolean;

  public onDragMove?: (item: ItemView, globalX: number, globalY: number) => void;
  public onDragEnd?: () => void;

  public selectedItem: ItemView | null = null;

  constructor() {
    super();

    this.cellsLayer = new Container();
    this.itemsLayer = new Container();
    this.dragLayer = new Container();
    this.fxLayer = new Container();

    this.addChild(this.cellsLayer);
    this.addChild(this.itemsLayer);
    this.addChild(this.dragLayer);
    this.addChild(this.fxLayer);

    this.itemsGrid = Array.from({ length: GRID_CONFIG.ROWS }, () =>
      Array.from({ length: GRID_CONFIG.COLS }, () => null)
    );

    this.renderBoardBackground();
    this.renderCells();
  }

  public get boardWidth(): number {
    return (
      GRID_CONFIG.COLS * GRID_CONFIG.CELL_SIZE +
      (GRID_CONFIG.COLS - 1) * GRID_CONFIG.CELL_GAP
    );
  }

  public get boardHeight(): number {
    return (
      GRID_CONFIG.ROWS * GRID_CONFIG.CELL_SIZE +
      (GRID_CONFIG.ROWS - 1) * GRID_CONFIG.CELL_GAP
    );
  }

  public getCellCoords(col: number, row: number): { x: number; y: number } {
    const startX = -this.boardWidth / 2 + GRID_CONFIG.CELL_SIZE / 2;
    const startY = -this.boardHeight / 2 + GRID_CONFIG.CELL_SIZE / 2;

    const x = startX + col * (GRID_CONFIG.CELL_SIZE + GRID_CONFIG.CELL_GAP);
    const y = startY + row * (GRID_CONFIG.CELL_SIZE + GRID_CONFIG.CELL_GAP);

    return { x, y };
  }

  private renderBoardBackground() {
    // 1. Мягкая теплая тень под доской на деревянном столе
    const shadow = new Graphics();
    shadow.roundRect(
      -this.boardWidth / 2 - 10,
      -this.boardHeight / 2 - 8,
      this.boardWidth + 20,
      this.boardHeight + 20,
      14
    ).fill({ color: 0x5c3311, alpha: 0.2 });
    this.cellsLayer.addChild(shadow);

    // 2. Внешняя карамельно-деревянная рама доски (как в референсе, мягкие углы)
    const framePad = 9;
    const frame = new Graphics();
    frame.roundRect(
      -this.boardWidth / 2 - framePad,
      -this.boardHeight / 2 - framePad,
      this.boardWidth + framePad * 2,
      this.boardHeight + framePad * 2,
      12
    )
      .fill({ color: 0xd29f6d })
      .stroke({ width: 2, color: 0xbb8855 });
    this.cellsLayer.addChild(frame);

    // 3. Тонкий золотистый кант внутри рамы вокруг клеток
    const innerRim = new Graphics();
    innerRim.roundRect(
      -this.boardWidth / 2 - 1,
      -this.boardHeight / 2 - 1,
      this.boardWidth + 2,
      this.boardHeight + 2,
      4
    )
      .stroke({ width: 1.5, color: 0xeac89f });
    this.cellsLayer.addChild(innerRim);
  }

  private renderCells() {
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const { x, y } = this.getCellCoords(c, r);
        const isLight = (r + c) % 2 === 0;

        const cell = new Graphics();
        // Мягкие пастельные квадратные клетки без зазоров (точно как в референсе)
        cell.rect(
          -GRID_CONFIG.CELL_SIZE / 2,
          -GRID_CONFIG.CELL_SIZE / 2,
          GRID_CONFIG.CELL_SIZE,
          GRID_CONFIG.CELL_SIZE
        )
          .fill({ color: isLight ? 0xfcf7ec : 0xeddcc5 });

        cell.position.set(x, y);
        this.cellsLayer.addChild(cell);
      }
    }
  }

  public findRandomEmptyCell(): { col: number; row: number } | null {
    const emptyCells: { col: number; row: number }[] = [];

    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        if (!this.itemsGrid[r][c]) {
          emptyCells.push({ col: c, row: r });
        }
      }
    }

    if (emptyCells.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randomIndex];
  }

  /**
   * Поиск свободной ячейки рядом с конкретной (для вылета из генератора)
   */
  public findEmptyCellNear(col: number, row: number): { col: number; row: number } | null {
    const deltas = [
      { dc: 0, dr: -1 },
      { dc: 1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: -1 },
      { dc: -1, dr: -1 },
      { dc: 1, dr: 1 },
      { dc: -1, dr: 1 },
    ];
    // Перемешиваем соседей для естественности
    deltas.sort(() => Math.random() - 0.5);

    for (const { dc, dr } of deltas) {
      const nc = col + dc;
      const nr = row + dr;
      if (
        nc >= 0 &&
        nc < GRID_CONFIG.COLS &&
        nr >= 0 &&
        nr < GRID_CONFIG.ROWS &&
        !this.itemsGrid[nr][nc]
      ) {
        return { col: nc, row: nr };
      }
    }

    return this.findRandomEmptyCell();
  }

  public createAndPlaceItem(
    col: number,
    row: number,
    type: ItemType,
    level: number,
    isGenerator: boolean = false,
    isCobwebbed: boolean = false,
    generatorTapsLeft: number = GENERATOR_CONFIG.MAX_TAPS,
    cooldownUntil: number = 0,
    lastRechargeTime?: number
  ): ItemView {
    const itemData: ItemData = {
      id: `${Date.now()}_${Math.random()}`,
      type,
      level,
      isGenerator,
      isCobwebbed,
      generatorTapsLeft,
      cooldownUntil,
      lastRechargeTime: lastRechargeTime || Date.now(),
    };

    const itemView = new ItemView(itemData);
    itemView.originCol = col;
    itemView.originRow = row;

    const { x, y } = this.getCellCoords(col, row);
    itemView.position.set(x, y);
    itemView.baseCellX = x;

    this.itemsGrid[row][col] = itemView;
    this.itemsLayer.addChild(itemView);

    this.setupItemDrag(itemView);
    return itemView;
  }

  private setupItemDrag(item: ItemView) {
    item.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();

      this.selectItem(item);

      if (item.isCobwebbed) {
        soundManager.playError();
        const { x } = this.getCellCoords(item.originCol, item.originRow);
        item.shakeLocked(x);
        return;
      }

      this.draggedItem = item;
      this.dragLayer.addChild(item);

      const localPos = this.toLocal(e.global);
      this.dragOffset.x = item.x - localPos.x;
      this.dragOffset.y = item.y - localPos.y;

      this.dragStartTime = Date.now();

      item.playDragStart();
    });
  }

  public handlePointerMove(globalPos: { x: number; y: number }) {
    if (!this.draggedItem) return;

    const localPos = this.toLocal(globalPos);
    this.draggedItem.x = localPos.x + this.dragOffset.x;
    this.draggedItem.y = localPos.y + this.dragOffset.y;

    if (this.onDragMove) {
      this.onDragMove(this.draggedItem, globalPos.x, globalPos.y);
    }
  }

  public handlePointerUp(globalPos?: { x: number; y: number }) {
    if (!this.draggedItem) return;

    const item = this.draggedItem;
    this.draggedItem = null;

    if (this.onDragEnd) {
      this.onDragEnd();
    }

    const checkPos = globalPos || item.toGlobal({ x: 0, y: 0 });

    // Проверяем: был ли это клик/тап на месте без перетаскивания?
    const distSq =
      Math.pow(item.x - this.getCellCoords(item.originCol, item.originRow).x, 2) +
      Math.pow(item.y - this.getCellCoords(item.originCol, item.originRow).y, 2);
    const duration = Date.now() - this.dragStartTime;
    const isTap = distSq < 100 && duration < 350;

    // 1. ОБРАБОТКА ТАПА ПО ГЕНЕРАТОРУ
    if (isTap && item.isGenerator) {
      this.returnItemToOrigin(item);
      this.triggerGenerator(item);
      this.selectItem(item);
      return;
    }

    // 2. ОБРАБОТКА ДВОЙНОГО ТАПА ПО МОНЕТКЕ
    if (isTap && item.isCoin) {
      const now = Date.now();
      if (now - item.lastTapTime < 350) {
        // Двойной клик на монетку! Не возвращаем на место — сразу собираем
        item.lastTapTime = 0;
        this.collectCoin(item);
        return;
      } else {
        // Одиночный клик — запоминаем время и возвращаем в ячейку
        item.lastTapTime = now;
        this.returnItemToOrigin(item);
        this.selectItem(item);
        soundManager.playTap();
        return;
      }
    }

    // 3. ОБРАБОТКА ДВОЙНОГО ТАПА ПО ОБЫЧНОМУ ПРЕДМЕТУ ДЛЯ СДАЧИ В КВЕСТ
    if (isTap && !item.isGenerator && !item.isCobwebbed) {
      const now = Date.now();
      if (now - item.lastTapTime < 350) {
        item.lastTapTime = 0;
        if (this.onDoubleTapItem && this.onDoubleTapItem(item)) {
          return; // Успешно сдан в квест!
        }
        // Предмет не требуется в квестах -> покачиваем и звук ошибки
        soundManager.playError();
        item.playWiggle();
        this.returnItemToOrigin(item);
        this.selectItem(item);
        return;
      }
      item.lastTapTime = now;
      this.returnItemToOrigin(item);
      this.selectItem(item);
      soundManager.playTap();
      return;
    }

    // Если был короткий клик по заблокированному паутиной предмету
    if (isTap) {
      this.returnItemToOrigin(item);
      this.selectItem(item);
      soundManager.playTap();
      return;
    }

    // 4. ПЕРЕТАСКИВАНИЕ В КВЕСТ (Quest Card)
    if (this.onDropOrder && this.onDropOrder(item, checkPos.x, checkPos.y)) {
      return; // Обработано (сдано или отклонено со встряской)
    }

    // 5. ПЕРЕТАСКИВАНИЕ В ЗОНУ ПРОДАЖИ (Sell Zone)
    if (this.isOverSellZone && this.isOverSellZone(checkPos.x, checkPos.y)) {
      if (item.isGenerator) {
        soundManager.playError();
        this.returnItemToOrigin(item);
        return;
      }
      if (this.onDropSell) {
        this.onDropSell(item);
        return;
      }
    }

    // 6. ПЕРЕТАСКИВАНИЕ В РЮКЗАК (Backpack)
    if (this.isOverBackpack && this.isOverBackpack(checkPos.x, checkPos.y)) {
      if (this.onDropBackpack) {
        const accepted = this.onDropBackpack(item);
        if (accepted) {
          return;
        } else {
          soundManager.playError();
          this.returnItemToOrigin(item);
          return;
        }
      }
    }

    const targetCell = this.getNearestCell(item.x, item.y);

    if (!targetCell) {
      soundManager.playError();
      this.returnItemToOrigin(item);
      return;
    }

    const { col: targetCol, row: targetRow } = targetCell;
    const originCol = item.originCol;
    const originRow = item.originRow;

    if (targetCol === originCol && targetRow === originRow) {
      this.returnItemToOrigin(item);
      return;
    }

    const cellOccupant = this.itemsGrid[targetRow][targetCol];

    // ВАРИАНТ 1: Пустая ячейка -> перемещение (генераторы тоже можно перемещать!)
    if (!cellOccupant) {
      this.itemsGrid[originRow][originCol] = null;
      this.itemsGrid[targetRow][targetCol] = item;
      item.originCol = targetCol;
      item.originRow = targetRow;

      this.itemsLayer.addChild(item);
      const { x, y } = this.getCellCoords(targetCol, targetRow);
      item.playReturnAnimation(x, y);
      soundManager.playTap();
      this.notifyBoardChanged();
      return;
    }

    // ВАРИАНТ 2: Слияние предметов
    // Генераторы НЕЛЬЗЯ сливать ни с чем!
    const isMergeable =
      !item.isGenerator &&
      !cellOccupant.isGenerator &&
      cellOccupant.itemData.type === item.itemData.type &&
      cellOccupant.itemData.level === item.itemData.level &&
      (item.isCoin ? cellOccupant.itemData.level < 5 : cellOccupant.itemData.level < 9);

    if (isMergeable) {
      this.itemsGrid[originRow][originCol] = null;

      const { x: targetX, y: targetY } = this.getCellCoords(targetCol, targetRow);
      gsap.to(item.position, {
        x: targetX,
        y: targetY,
        duration: 0.12,
        ease: 'power2.in',
        onComplete: () => {
          if (item.parent) {
            item.parent.removeChild(item);
          }
          item.destroy();

          if (cellOccupant.isCobwebbed) {
            cellOccupant.breakCobweb();
          }

          const newLevel = cellOccupant.itemData.level + 1;
          cellOccupant.updateLevel(newLevel);
          cellOccupant.playMergeAnimation();

          playMergeSparks(this.fxLayer, targetX, targetY);
          soundManager.playMerge();

          // ШАНС 5% НА ВЫПАДЕНИЕ МОНЕТКИ (ТОЛЬКО ДЛЯ ОБЫЧНЫХ ПРЕДМЕТОВ, НЕ ПРИ СЛИЯНИИ МОНЕТОК!)
          if (!item.isCoin) {
            this.checkCoinDropChance(targetX, targetY);
          }

          if (this.onMergeSuccess) {
            this.onMergeSuccess(cellOccupant.itemData.type, newLevel);
          }
          this.notifyBoardChanged();
        },
      });
      return;
    }

    // ВАРИАНТ 3: Предметы нельзя соединить -> меняем их местами (Swap items)
    // Защита: нельзя менять местами с предметом в паутине (паутина блокирует перемещение)
    if (cellOccupant.isCobwebbed) {
      soundManager.playError();
      const { x: occCellX } = this.getCellCoords(targetCol, targetRow);
      cellOccupant.shakeLocked(occCellX);
      this.returnItemToOrigin(item);
      return;
    }

    // Обмен позициями в сетке игрового поля
    this.itemsGrid[originRow][originCol] = cellOccupant;
    this.itemsGrid[targetRow][targetCol] = item;

    item.originCol = targetCol;
    item.originRow = targetRow;
    cellOccupant.originCol = originCol;
    cellOccupant.originRow = originRow;

    // Возвращаем перетаскиваемый предмет в слой предметов
    this.itemsLayer.addChild(item);

    const { x: targetX, y: targetY } = this.getCellCoords(targetCol, targetRow);
    const { x: originX, y: originY } = this.getCellCoords(originCol, originRow);

    item.playReturnAnimation(targetX, targetY);
    cellOccupant.playReturnAnimation(originX, originY);

    soundManager.playTap();
    this.notifyBoardChanged();
  }

  /**
   * Спавн предмета из генератора по клику
   */
  private triggerGenerator(genItem: ItemView) {
    const { x: genCellX } = this.getCellCoords(genItem.originCol, genItem.originRow);
    // 1. Проверяем кулдаун
    if (genItem.isGeneratorOnCooldown()) {
      soundManager.playError();
      genItem.shakeLocked(genCellX);
      return;
    }

    // 2. Проверяем свободное место на доске ДО списания энергии!
    const emptyCell = this.findEmptyCellNear(genItem.originCol, genItem.originRow);
    if (!emptyCell) {
      soundManager.playError();
      genItem.shakeLocked(genCellX);
      return;
    }

    // 3. Запрос энергии
    if (this.onRequestEnergy) {
      const hasEnergy = this.onRequestEnergy();
      if (!hasEnergy) {
        soundManager.playError();
        genItem.shakeLocked(genCellX);
        return;
      }
    }

    genItem.playGeneratorTapAnimation();
    soundManager.playTap();

    // Шанс 10% получить предмет 2-го уровня, иначе 1-й уровень!
    const isLuckySecondLevel = Math.random() < GENERATOR_CONFIG.LEVEL_2_CHANCE;
    const spawnLevel = isLuckySecondLevel ? 2 : 1;

    const { col, row } = emptyCell;
    const newItem = this.createAndPlaceItem(col, row, genItem.itemData.type, spawnLevel, false, false);

    // Анимация вылета из генератора в целевую ячейку по дуге
    const startX = genItem.x;
    const startY = genItem.y;
    const { x: targetX, y: targetY } = this.getCellCoords(col, row);

    newItem.position.set(startX, startY);
    newItem.scale.set(0.3);

    gsap.to(newItem.position, {
      x: targetX,
      y: targetY,
      duration: 0.3,
      ease: 'back.out(1.8)',
    });
    gsap.to(newItem.scale, {
      x: 1,
      y: 1,
      duration: 0.3,
      ease: 'back.out(2)',
    });

    if (isLuckySecondLevel) {
      playMergeSparks(this.fxLayer, targetX, targetY);
    }

    // Уменьшаем счетчик тапов генератора
    genItem.generatorTapsLeft--;
    genItem.itemData.generatorTapsLeft = genItem.generatorTapsLeft;
    genItem.updateTapsBadge();

    // Штука с часиками появляется ТОЛЬКО ЕСЛИ 0!
    if (genItem.generatorTapsLeft <= 0) {
      genItem.startCooldown(GENERATOR_CONFIG.COOLDOWN_MS);
    } else if (!genItem.lastRechargeTime || genItem.lastRechargeTime === 0) {
      genItem.lastRechargeTime = Date.now();
      genItem.itemData.lastRechargeTime = genItem.lastRechargeTime;
    }

    this.notifyBoardChanged();
  }

  /**
   * Проверка шанса 5% выпадения монетки при слиянии
   */
  private checkCoinDropChance(fromX: number, fromY: number) {
    if (Math.random() >= COIN_DROP_CHANCE) return;

    const emptyCell = this.findRandomEmptyCell();
    if (!emptyCell) return;

    const { col, row } = emptyCell;
    const coin = this.createAndPlaceItem(col, row, 'coins', 1, false, false);

    const { x: targetX, y: targetY } = this.getCellCoords(col, row);
    coin.position.set(fromX, fromY);
    coin.scale.set(0.4);

    gsap.to(coin.position, {
      x: targetX,
      y: targetY,
      duration: 0.35,
      ease: 'back.out(2)',
    });
    gsap.to(coin.scale, {
      x: 1,
      y: 1,
      duration: 0.35,
    });
  }

  /**
   * Безопасный сбор монетки по двойному клику без краша рендера
   */
  private collectCoin(coinItem: ItemView) {
    // Останавливаем любые запущенные анимации на этом объекте
    gsap.killTweensOf(coinItem);
    gsap.killTweensOf(coinItem.position);
    gsap.killTweensOf(coinItem.scale);

    const level = coinItem.itemData.level;
    const reward = COIN_VALUES[level] || 10;
    const col = coinItem.originCol;
    const row = coinItem.originRow;

    this.itemsGrid[row][col] = null;

    const globalPos = coinItem.toGlobal({ x: 0, y: 0 });

    gsap.to(coinItem.scale, { x: 1.3, y: 1.3, duration: 0.15 });
    gsap.to(coinItem, {
      alpha: 0,
      duration: 0.15,
      onComplete: () => {
        if (coinItem.parent) {
          coinItem.parent.removeChild(coinItem);
        }
        if (!coinItem.destroyed) {
          coinItem.destroy({ children: true });
        }
      },
    });

    soundManager.playOrderComplete();

    if (this.onCoinCollect) {
      this.onCoinCollect(reward, globalPos);
    }

    this.notifyBoardChanged();
  }

  public returnItemToOrigin(item: ItemView) {
    if (item.destroyed) return;
    const { x, y } = this.getCellCoords(item.originCol, item.originRow);
    item.playReturnAnimation(x, y, () => {
      if (item.destroyed) return;
      if (item.parent && item.parent !== this.itemsLayer) {
        item.parent.removeChild(item);
      }
      if (!item.destroyed) {
        this.itemsLayer.addChild(item);
      }
    });
  }

  public selectItem(item: ItemView | null) {
    if (this.selectedItem && this.selectedItem !== item && !this.selectedItem.destroyed) {
      this.selectedItem.setSelected(false);
    }
    this.selectedItem = item;
    if (item && !item.destroyed) {
      item.setSelected(true);
    }
    if (this.onItemSelected) {
      this.onItemSelected(item);
    }
  }

  public deselectItem() {
    this.selectItem(null);
  }

  public removeItem(item: ItemView) {
    const col = item.originCol;
    const row = item.originRow;
    if (row >= 0 && row < GRID_CONFIG.ROWS && col >= 0 && col < GRID_CONFIG.COLS) {
      if (this.itemsGrid[row][col] === item) {
        this.itemsGrid[row][col] = null;
      }
    }
    this.deselectItem();
  }

  public sellItem(item: ItemView): number {
    if (!item || item.destroyed || item.isGenerator || item.isCobwebbed) return 0;

    const sellValue = item.itemData.level * 2;
    const col = item.originCol;
    const row = item.originRow;

    this.itemsGrid[row][col] = null;
    this.deselectItem();

    const globalPos = item.toGlobal({ x: 0, y: 0 });

    gsap.killTweensOf(item);
    gsap.to(item.scale, { x: 0, y: 0, duration: 0.2, ease: 'back.in(2)' });
    gsap.to(item, {
      alpha: 0,
      duration: 0.18,
      onComplete: () => {
        if (item.parent) item.parent.removeChild(item);
        if (!item.destroyed) item.destroy({ children: true });
      },
    });

    soundManager.playOrderComplete();

    if (this.onCoinCollect) {
      this.onCoinCollect(sellValue, globalPos);
    }

    this.notifyBoardChanged();
    return sellValue;
  }

  public updateOrderMatches(activeOrders: { targetType: ItemType; targetLevel: number }[]): void {
    const orderNeeds = new Set<string>();
    for (const o of activeOrders) {
      orderNeeds.add(`${o.targetType}_${o.targetLevel}`);
    }

    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        if (item) {
          if (!item.isGenerator && !item.isCobwebbed && orderNeeds.has(`${item.itemData.type}_${item.itemData.level}`)) {
            item.setOrderMatch(true);
          } else {
            item.setOrderMatch(false);
          }
        }
      }
    }
  }

  private getNearestCell(x: number, y: number): { col: number; row: number } | null {
    const startX = -this.boardWidth / 2;
    const startY = -this.boardHeight / 2;

    const col = Math.round((x - startX - GRID_CONFIG.CELL_SIZE / 2) / (GRID_CONFIG.CELL_SIZE + GRID_CONFIG.CELL_GAP));
    const row = Math.round((y - startY - GRID_CONFIG.CELL_SIZE / 2) / (GRID_CONFIG.CELL_SIZE + GRID_CONFIG.CELL_GAP));

    if (col >= 0 && col < GRID_CONFIG.COLS && row >= 0 && row < GRID_CONFIG.ROWS) {
      return { col, row };
    }
    return null;
  }

  public hasItem(type: ItemType, level: number): boolean {
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        if (
          item &&
          !item.isGenerator &&
          !item.isCobwebbed &&
          item.itemData.type === type &&
          item.itemData.level === level
        ) {
          return true;
        }
      }
    }
    return false;
  }

  public consumeSpecificItem(item: ItemView, flyToGlobalPos?: { x: number; y: number }): { x: number; y: number } | null {
    if (item.destroyed) return null;

    let foundCol = -1;
    let foundRow = -1;
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        if (this.itemsGrid[r][c] === item) {
          foundCol = c;
          foundRow = r;
          break;
        }
      }
      if (foundCol !== -1) break;
    }

    if (foundCol === -1) {
      if (this.itemsGrid[item.originRow]?.[item.originCol] === item) {
        foundCol = item.originCol;
        foundRow = item.originRow;
      }
    }

    if (foundCol !== -1) {
      this.itemsGrid[foundRow][foundCol] = null;
    }

    const pos = { x: item.x, y: item.y };
    gsap.killTweensOf(item);
    gsap.killTweensOf(item.scale);
    gsap.killTweensOf(item.position);

    if (flyToGlobalPos) {
      const localTarget = this.toLocal(flyToGlobalPos);
      gsap.to(item.position, {
        x: localTarget.x,
        y: localTarget.y,
        duration: 0.28,
        ease: 'power2.in',
      });
      gsap.to(item.scale, {
        x: 0.15,
        y: 0.15,
        duration: 0.28,
        ease: 'power2.in',
        onComplete: () => {
          if (item.parent) item.parent.removeChild(item);
          if (!item.destroyed) item.destroy({ children: true });
        },
      });
    } else {
      gsap.to(item.scale, { x: 0, y: 0, duration: 0.22, ease: 'back.in(2)' });
      gsap.to(item, {
        alpha: 0,
        duration: 0.2,
        onComplete: () => {
          if (item.parent) item.parent.removeChild(item);
          if (!item.destroyed) item.destroy({ children: true });
        },
      });
    }

    this.notifyBoardChanged();
    return pos;
  }

  public consumeItem(type: ItemType, level: number, flyToGlobalPos?: { x: number; y: number }): { x: number; y: number } | null {
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        if (
          item &&
          !item.isGenerator &&
          !item.isCobwebbed &&
          item.itemData.type === type &&
          item.itemData.level === level
        ) {
          return this.consumeSpecificItem(item, flyToGlobalPos);
        }
      }
    }
    return null;
  }

  public getSerializedGrid(): SavedCell[] {
    const result: SavedCell[] = [];
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        result.push({
          col: c,
          row: r,
          item: item
            ? {
                type: item.itemData.type,
                level: item.itemData.level,
                isGenerator: item.isGenerator,
                isCobwebbed: item.isCobwebbed,
                generatorTapsLeft: item.generatorTapsLeft,
                cooldownUntil: item.cooldownUntil,
                lastRechargeTime: item.lastRechargeTime,
              }
            : null,
        });
      }
    }
    return result;
  }

  public loadSerializedGrid(savedCells: SavedCell[]): void {
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        if (item) {
          if (item.parent) item.parent.removeChild(item);
          item.destroy();
          this.itemsGrid[r][c] = null;
        }
      }
    }

    const now = Date.now();
    for (const cell of savedCells) {
      if (cell.item && cell.row < GRID_CONFIG.ROWS && cell.col < GRID_CONFIG.COLS) {
        const isGen = !!cell.item.isGenerator;
        let tapsLeft = cell.item.generatorTapsLeft !== undefined ? cell.item.generatorTapsLeft : GENERATOR_CONFIG.MAX_TAPS;
        let cdUntil = cell.item.cooldownUntil || 0;
        const lastRecharge = cell.item.lastRechargeTime || now;

        if (isGen) {
          if (cdUntil > 0) {
            if (cdUntil <= now) {
              const extraMs = now - cdUntil;
              const extraTaps = Math.floor(extraMs / GENERATOR_CONFIG.RECHARGE_TAP_MS);
              tapsLeft = Math.min(GENERATOR_CONFIG.MAX_TAPS, 1 + extraTaps);
              cdUntil = 0;
            } else {
              tapsLeft = 0;
            }
          } else if (cdUntil === 0 && tapsLeft < GENERATOR_CONFIG.MAX_TAPS) {
            // Постепенное восстановление в оффлайне (+1 тап каждые 30 секунд)
            const elapsed = lastRecharge > 0 ? now - lastRecharge : 0;
            const recovered = Math.floor(elapsed / GENERATOR_CONFIG.RECHARGE_TAP_MS);
            tapsLeft = Math.min(GENERATOR_CONFIG.MAX_TAPS, tapsLeft + recovered);
          }
        }

        const itemView = this.createAndPlaceItem(
          cell.col,
          cell.row,
          cell.item.type,
          cell.item.level,
          isGen,
          !!cell.item.isCobwebbed,
          tapsLeft,
          cdUntil,
          lastRecharge
        );

        if (isGen) {
          if (cdUntil > now) {
            itemView.setCooldownUntil(cdUntil);
          } else {
            itemView.generatorTapsLeft = tapsLeft;
            itemView.cooldownUntil = 0;
            itemView.itemData.cooldownUntil = 0;
            itemView.itemData.generatorTapsLeft = tapsLeft;
            itemView.updateTapsBadge();
          }
        }
      }
    }
  }

  public hasGenerator(type: ItemType): boolean {
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        if (item && item.isGenerator && item.itemData.type === type) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Гарантирует наличие всех 7 генераторов на доске или в рюкзаке
   * (если игра загружена из старого сохранения, где было только 2 генератора)
   */
  public ensureAllGeneratorsExist(backpackItems?: (BackpackItemData | null)[]): boolean {
    const allGenerators: ItemType[] = ['tools', 'furniture', 'plants', 'bakery', 'sewing', 'fishing', 'music'];
    let spawnedAny = false;

    for (const genType of allGenerators) {
      const existsOnBoard = this.hasGenerator(genType);
      const existsInBackpack = backpackItems?.some((it) => it && it.type === genType && it.isGenerator);

      if (!existsOnBoard && !existsInBackpack) {
        const empty = this.findRandomEmptyCell();
        if (empty) {
          const newItem = this.createAndPlaceItem(empty.col, empty.row, genType, 0, true, false, GENERATOR_CONFIG.MAX_TAPS, 0);
          newItem.playSpawnAnimation();
          spawnedAny = true;
        }
      }
    }

    if (spawnedAny) {
      this.notifyBoardChanged();
    }
    return spawnedAny;
  }

  /**
   * Начальная расстановка доски со всеми 7 генераторами и паутиной
   */
  public setupInitialBoard(): void {
    // Все 7 генераторов на поле в нижнем ряду (ряд 8, колонки 0..6)
    const allGenerators: ItemType[] = ['tools', 'furniture', 'plants', 'bakery', 'sewing', 'fishing', 'music'];
    allGenerators.forEach((type, col) => {
      this.createAndPlaceItem(col, 8, type, 0, true, false, GENERATOR_CONFIG.MAX_TAPS, 0);
    });

    // Стартовые разблокированные предметы 1-го уровня в предпоследнем ряду
    this.createAndPlaceItem(1, 7, 'tools', 1, false, false);      // Гайка
    this.createAndPlaceItem(2, 7, 'furniture', 1, false, false);  // Доски
    this.createAndPlaceItem(3, 7, 'plants', 1, false, false);     // Семечки
    this.createAndPlaceItem(4, 7, 'bakery', 1, false, false);     // Тесто
    this.createAndPlaceItem(5, 7, 'sewing', 1, false, false);     // Катушка ниток

    // Заблокированные паутиной предметы разных категорий для интересного исследования
    this.createAndPlaceItem(0, 0, 'tools', 2, false, true);       // Болт в паутине
    this.createAndPlaceItem(6, 0, 'furniture', 2, false, true);   // Паркет в паутине
    this.createAndPlaceItem(3, 1, 'plants', 2, false, true);      // Росток в паутине
    this.createAndPlaceItem(1, 2, 'bakery', 2, false, true);      // Корж в паутине
    this.createAndPlaceItem(5, 2, 'sewing', 2, false, true);      // Лоскут в паутине
    this.createAndPlaceItem(0, 3, 'fishing', 2, false, true);     // Поплавок в паутине
    this.createAndPlaceItem(6, 3, 'music', 2, false, true);       // Бубенцы в паутине
    this.createAndPlaceItem(3, 4, 'coins', 1, false, true);       // Монетка в паутине
    this.createAndPlaceItem(2, 5, 'tools', 3, false, true);       // Отвертка в паутине
    this.createAndPlaceItem(4, 5, 'furniture', 3, false, true);   // Табуретка в паутине
  }

  /**
   * Метод обновления состояния доски (вызывается из Pixi Ticker)
   */
  public update(now: number = Date.now()) {
    let stateChanged = false;
    for (let r = 0; r < GRID_CONFIG.ROWS; r++) {
      for (let c = 0; c < GRID_CONFIG.COLS; c++) {
        const item = this.itemsGrid[r][c];
        if (item && item.isGenerator) {
          const changed = item.updateGenerator(now);
          if (changed) {
            stateChanged = true;
          }
        }
      }
    }

    if (stateChanged) {
      this.notifyBoardChanged();
    }
  }

  private notifyBoardChanged() {
    if (this.onBoardChanged) {
      this.onBoardChanged();
    }
  }
}
