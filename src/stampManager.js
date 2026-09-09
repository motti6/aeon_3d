/**
 * AEON 3D Explorer - Stamp Rally Manager
 * 来訪スタンプの管理、進捗率計算、Firebase/LocalStorage同期通知
 */

import { firebaseService } from './firebase.js';

export class StampManager {
  constructor() {
    this.stamps = {}; // { [storeId]: { storeId, storeName, mallType, prefecture, visitedAt, memo } }
    this.listeners = [];
    this.unsubscribeSync = null;

    this.init();
  }

  init() {
    this.setupSyncSubscription();

    // ユーザーIDや認証状態が変わったら自動で再購読
    firebaseService.onAuthChanged(() => {
      this.setupSyncSubscription();
    });
  }

  setupSyncSubscription() {
    if (this.unsubscribeSync) {
      this.unsubscribeSync();
      this.unsubscribeSync = null;
    }

    this.unsubscribeSync = firebaseService.subscribeStamps((stamps) => {
      this.stamps = stamps || {};
      this.notifyListeners();
    });
  }

  /**
   * 変更通知リスナーを登録
   */
  onChange(callback) {
    this.listeners.push(callback);
    // 初期状態を即時通知
    callback(this.stamps);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try {
        cb(this.stamps);
      } catch (err) {
        console.error('[StampManager] listener error:', err);
      }
    });
  }

  /**
   * 指定店舗にスタンプが押されているか確認
   */
  hasStamped(storeId) {
    return Boolean(this.stamps && this.stamps[storeId]);
  }

  /**
   * 指定店舗のスタンプ情報を取得
   */
  getStamp(storeId) {
    return this.stamps ? this.stamps[storeId] || null : null;
  }

  /**
   * スタンプを押す（来訪記録）
   */
  async addStamp(store, memo = '') {
    if (!store || !store.id) return null;

    const stampData = {
      storeId: store.id,
      storeName: store.name,
      mallType: store.mall_type || '一般店舗',
      prefecture: store.prefecture || '',
      city: store.city || '',
      visitedAt: new Date().toISOString(),
      memo: memo.trim(),
    };

    // 楽観的ローカル更新
    this.stamps[store.id] = stampData;
    this.notifyListeners();

    // Firebase / LocalStorageへ永続化
    const saved = await firebaseService.saveStamp(store.id, stampData);
    return saved;
  }

  /**
   * メモのみ更新
   */
  async updateMemo(storeId, memo) {
    const existing = this.getStamp(storeId);
    if (!existing) return;

    existing.memo = memo.trim();
    this.stamps[storeId] = existing;
    this.notifyListeners();

    await firebaseService.saveStamp(storeId, existing);
  }

  /**
   * スタンプを取り消す（削除）
   */
  async removeStamp(storeId) {
    if (!storeId || !this.stamps[storeId]) return;

    delete this.stamps[storeId];
    this.notifyListeners();

    await firebaseService.deleteStamp(storeId);
  }

  /**
   * 訪問済店舗IDのセットを取得
   */
  getVisitedStoreIds() {
    return new Set(Object.keys(this.stamps || {}));
  }

  /**
   * 全訪問記録の配列を取得
   */
  getAllStamps() {
    return Object.values(this.stamps || {});
  }

  /**
   * 訪問統計・進捗率の計算
   */
  getStats(allLocations = []) {
    const totalCount = allLocations.length || 601;
    const visitedStamps = this.getAllStamps();
    const visitedCount = visitedStamps.length;
    const percent = totalCount > 0 ? ((visitedCount / totalCount) * 100).toFixed(1) : 0;

    // カテゴリ別集計
    let visitedMalls = 0;
    let visitedStyles = 0;
    const visitedPrefectures = new Set();

    visitedStamps.forEach(stamp => {
      if (stamp.mallType === 'イオンモール') visitedMalls++;
      if (stamp.mallType === 'イオンスタイル') visitedStyles++;
      if (stamp.prefecture) visitedPrefectures.add(stamp.prefecture);
    });

    return {
      visitedCount,
      totalCount,
      percent: Number(percent),
      visitedMalls,
      visitedStyles,
      visitedPrefCount: visitedPrefectures.size,
      totalPrefCount: 47,
    };
  }

  getUserId() {
    return firebaseService.getUserId();
  }

  setUserId(newUserId) {
    firebaseService.setUserId(newUserId);
  }

  isFirebaseConnected() {
    return firebaseService.isConnected();
  }

  /**
   * JSONエクスポート (バックアップ)
   */
  exportStampsJson() {
    const exportData = {
      version: '1.0',
      userId: this.getUserId(),
      exportedAt: new Date().toISOString(),
      stamps: this.stamps,
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * JSONインポート (復元)
   */
  async importStampsJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const incomingStamps = data.stamps || data;
      if (typeof incomingStamps !== 'object') {
        throw new Error('無効なデータ形式です。');
      }

      for (const [storeId, stampData] of Object.entries(incomingStamps)) {
        if (storeId && typeof stampData === 'object') {
          await firebaseService.saveStamp(storeId, stampData);
        }
      }

      this.stamps = firebaseService.getLocalStamps();
      this.notifyListeners();
      return true;
    } catch (err) {
      console.error('[StampManager] import error:', err);
      throw err;
    }
  }
}

export const stampManager = new StampManager();
