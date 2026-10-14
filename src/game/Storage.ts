import type { ItemType } from '../config';

export interface SavedCell {
  col: number;
  row: number;
  item: {
    type: ItemType;
    level: number;
    isGenerator?: boolean; // Генератор ли это
    isCobwebbed?: boolean; // Находится ли в паутине
    generatorTapsLeft?: number; // Остаток тапов
    cooldownUntil?: number;     // Таймстэмп окончания кулдауна
    lastRechargeTime?: number;  // Время последнего восстановления тапа
  } | null;
}

export interface CharacterOrder {
  id: string;
  charName: string;
  charAvatar: string;
  targetType: ItemType;
  targetLevel: number;
  coinReward: number;
}

export interface BackpackItemData {
  type: ItemType;
  level: number;
  isGenerator?: boolean;
  generatorTapsLeft?: number;
  cooldownUntil?: number;
  lastRechargeTime?: number;
}

export interface GameSaveState {
  coins: number;
  energy: number;
  lastTimestamp: number;
  grid: SavedCell[];
  orders: CharacterOrder[];
  discoveredItems: string[];
  backpackSlots?: number;
  backpackItems?: (BackpackItemData | null)[];
}

const STORAGE_KEY = 'merge_game_tma_save_v4';

export class StorageManager {
  public static save(state: GameSaveState): void {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, data);
    } catch (e) {
      console.warn('Не удалось сохранить прогресс игры в LocalStorage:', e);
    }
  }

  public static load(): GameSaveState | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data) as GameSaveState;
    } catch (e) {
      console.warn('Не удалось загрузить сохранение:', e);
      return null;
    }
  }

  public static clear(): void {
    localStorage.removeItem('merge_game_tma_save_v1');
    localStorage.removeItem('merge_game_tma_save_v2');
    localStorage.removeItem('merge_game_tma_save_v3');
    localStorage.removeItem('merge_game_tma_save_v4');
  }
}
