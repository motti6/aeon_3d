/**
 * AEON 3D Explorer - Firebase Service
 * Firebase v10/v11 Modular SDK によるユーザー認証（匿名Auth）およびFirestore同期
 * 設定未設定時やオフライン時は透過的にLocalStorageへフォールバック
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

const STORAGE_KEY_CUSTOM_CONFIG = 'aeon_firebase_custom_config';
const STORAGE_KEY_USER_ID = 'aeon_user_id';
const STORAGE_KEY_LOCAL_STAMPS_PREFIX = 'aeon_stamps_';

export class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.userId = this.getStoredUserId();
    this.isFirebaseReady = false;
    this.authListeners = [];
    this.unsubscribeFirestore = null;

    this.init();
  }

  /**
   * ローカル保存されたユーザーIDまたは新規UUIDライクIDを取得
   */
  getStoredUserId() {
    let uid = localStorage.getItem(STORAGE_KEY_USER_ID);
    if (!uid) {
      uid = 'user_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
      localStorage.setItem(STORAGE_KEY_USER_ID, uid);
    }
    return uid;
  }

  /**
   * Firebase設定情報を取得（環境変数 または localStorage のカスタム設定）
   */
  getResolvedConfig() {
    // 1. ユーザーが画面から保存したカスタム設定
    try {
      const custom = localStorage.getItem(STORAGE_KEY_CUSTOM_CONFIG);
      if (custom) {
        const parsed = JSON.parse(custom);
        if (parsed && parsed.projectId && parsed.apiKey) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Firebase] Custom config parse error:', e);
    }

    // 2. Vite 環境変数 (VITE_FIREBASE_...)
    const env = import.meta.env || {};
    if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
      return {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: env.VITE_FIREBASE_APP_ID || '',
      };
    }

    return null;
  }

  /**
   * Firebase 初期化
   */
  async init() {
    const config = this.getResolvedConfig();

    if (!config || !config.apiKey || !config.projectId) {
      console.log('[Firebase] 設定未検出: ローカルストレージモードで動作します (User ID:', this.userId, ')');
      this.isFirebaseReady = false;
      this.notifyAuthChanged();
      return;
    }

    try {
      if (!getApps().length) {
        this.app = initializeApp(config);
      } else {
        this.app = getApp();
      }

      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);

      // 匿名認証で自動サインイン
      onAuthStateChanged(this.auth, (user) => {
        if (user) {
          this.userId = user.uid;
          localStorage.setItem(STORAGE_KEY_USER_ID, this.userId);
          this.isFirebaseReady = true;
          console.log('[Firebase] 認証成功! UID:', this.userId);
          this.notifyAuthChanged();
        }
      });

      try {
        await signInAnonymously(this.auth);
      } catch (authErr) {
        console.warn('[Firebase] 匿名認証スキップまたはエラー (ローカルID使用):', authErr.message);
        this.isFirebaseReady = true; // DB操作自体がルールにより可能な場合もあるため
        this.notifyAuthChanged();
      }

    } catch (err) {
      console.warn('[Firebase] 初期化エラー。ローカルモードにフォールバックします:', err);
      this.isFirebaseReady = false;
      this.notifyAuthChanged();
    }
  }

  onAuthChanged(callback) {
    this.authListeners.push(callback);
    callback({ userId: this.userId, isFirebaseReady: this.isFirebaseReady });
  }

  notifyAuthChanged() {
    this.authListeners.forEach(cb => {
      try {
        cb({ userId: this.userId, isFirebaseReady: this.isFirebaseReady });
      } catch (e) {
        console.error(e);
      }
    });
  }

  getUserId() {
    return this.userId;
  }

  /**
   * 別の端末から取得したユーザーIDに切り替え（同期・復元）
   */
  setUserId(newUserId) {
    if (!newUserId || typeof newUserId !== 'string') return;
    const cleanId = newUserId.trim();
    if (!cleanId) return;

    this.userId = cleanId;
    localStorage.setItem(STORAGE_KEY_USER_ID, cleanId);
    this.notifyAuthChanged();
  }

  isConnected() {
    return this.isFirebaseReady;
  }

  /**
   * カスタムFirebase設定を保存して再初期化
   */
  async setCustomFirebaseConfig(config) {
    if (!config) {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_CONFIG);
    } else {
      localStorage.setItem(STORAGE_KEY_CUSTOM_CONFIG, JSON.stringify(config));
    }
    await this.init();
  }

  getCustomFirebaseConfig() {
    try {
      const val = localStorage.getItem(STORAGE_KEY_CUSTOM_CONFIG);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  }

  // --- スタンプデータ操作 ---

  getLocalStampsKey(uid = this.userId) {
    return `${STORAGE_KEY_LOCAL_STAMPS_PREFIX}${uid}`;
  }

  getLocalStamps(uid = this.userId) {
    try {
      const data = localStorage.getItem(this.getLocalStampsKey(uid));
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('[FirebaseService] getLocalStamps error:', e);
      return {};
    }
  }

  saveLocalStamps(stamps, uid = this.userId) {
    try {
      localStorage.setItem(this.getLocalStampsKey(uid), JSON.stringify(stamps));
    } catch (e) {
      console.error('[FirebaseService] saveLocalStamps error:', e);
    }
  }

  /**
   * スタンプのリアルタイム監視
   * Firestoreが有効なら onSnapshot で双方向同期、無効ならローカルストレージ
   */
  subscribeStamps(onUpdate) {
    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
      this.unsubscribeFirestore = null;
    }

    // 初回は即座にローカルキャッシュを返してUI遅延を防ぐ
    const localData = this.getLocalStamps();
    onUpdate(localData);

    if (this.isFirebaseReady && this.db && this.userId) {
      try {
        const stampsColRef = collection(this.db, 'users', this.userId, 'stamps');
        this.unsubscribeFirestore = onSnapshot(stampsColRef, (snapshot) => {
          const stamps = {};
          snapshot.forEach((docSnap) => {
            stamps[docSnap.id] = docSnap.data();
          });
          // ローカルストレージにもキャッシュ同期
          this.saveLocalStamps(stamps);
          onUpdate(stamps);
        }, (err) => {
          console.warn('[Firebase] Firestore onSnapshot エラー。ローカルモードを継続:', err.message);
          onUpdate(this.getLocalStamps());
        });
      } catch (err) {
        console.warn('[Firebase] subscribeStamps 例外:', err);
        onUpdate(localData);
      }
    }

    // ウィンドウ間同期（同一ブラウザの他タブ対応）
    const storageHandler = (e) => {
      if (e.key === this.getLocalStampsKey()) {
        try {
          const updated = e.newValue ? JSON.parse(e.newValue) : {};
          onUpdate(updated);
        } catch (err) {}
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      if (this.unsubscribeFirestore) {
        this.unsubscribeFirestore();
        this.unsubscribeFirestore = null;
      }
      window.removeEventListener('storage', storageHandler);
    };
  }

  /**
   * スタンプを追加/更新
   */
  async saveStamp(storeId, stampData) {
    const uid = this.userId;
    // 1. ローカルを即時更新
    const local = this.getLocalStamps(uid);
    const updatedRecord = {
      ...stampData,
      storeId,
      updatedAt: new Date().toISOString(),
    };
    local[storeId] = updatedRecord;
    this.saveLocalStamps(local, uid);

    // 2. Firestoreが利用可能ならクラウドへ保存
    if (this.isFirebaseReady && this.db) {
      try {
        const docRef = doc(this.db, 'users', uid, 'stamps', String(storeId));
        await setDoc(docRef, {
          ...updatedRecord,
          firestoreSyncedAt: serverTimestamp(),
        }, { merge: true });
        console.log(`[Firebase] スタンプ同期成功 (ID: ${storeId})`);
      } catch (err) {
        console.warn('[Firebase] Firestore saveStamp エラー (ローカルには保存済):', err.message);
      }
    }

    return updatedRecord;
  }

  /**
   * スタンプを削除
   */
  async deleteStamp(storeId) {
    const uid = this.userId;
    // 1. ローカル削除
    const local = this.getLocalStamps(uid);
    delete local[storeId];
    this.saveLocalStamps(local, uid);

    // 2. Firestore削除
    if (this.isFirebaseReady && this.db) {
      try {
        const docRef = doc(this.db, 'users', uid, 'stamps', String(storeId));
        await deleteDoc(docRef);
        console.log(`[Firebase] スタンプ削除成功 (ID: ${storeId})`);
      } catch (err) {
        console.warn('[Firebase] Firestore deleteStamp エラー (ローカルからは削除済):', err.message);
      }
    }
  }
}

export const firebaseService = new FirebaseService();
