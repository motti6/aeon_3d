/**
 * AEON 3D Explorer - UI Controller
 * サイドバー、リスト描画、検索、フィルター、詳細カード、イベント制御
 * Firebase ユーザーID連携・来訪スタンプ機能・進捗管理
 */

import { stampManager } from './stampManager.js';
import { firebaseService } from './firebase.js';

export class UIController {
  constructor(options) {
    this.locations = options.locations || [];
    this.onSelectLocation = options.onSelectLocation || (() => {});
    this.onToggleOrbit = options.onToggleOrbit || (() => {});
    this.onSetViewPreset = options.onSetViewPreset || (() => {});
    this.onResetView = options.onResetView || (() => {});
    this.onChangeBasemap = options.onChangeBasemap || (() => {});
    this.onToggle3dTiles = options.onToggle3dTiles || (() => {});
    this.onToggleTerrain = options.onToggleTerrain || (() => {});
    this.onZoomIn = options.onZoomIn || (() => {});
    this.onZoomOut = options.onZoomOut || (() => {});
    this.onToggleTilt = options.onToggleTilt || (() => {});
    this.onResetCompass = options.onResetCompass || (() => {});

    this.selectedLocation = null;
    this.currentFilter = 'all'; // 'all' | 'イオンモール' | 'イオンスタイル' | '一般イオン' | 'visited'
    this.currentPrefecture = '';
    this.searchQuery = '';
    this.isOrbiting = false;

    this.initElements();
    this.initStampIntegration();
    this.bindEvents();
    this.populatePrefectureDropdown();
    this.renderStats();
    this.renderStampProgress();
    this.renderList();
  }

  initElements() {
    // Sidebar
    this.sidebar = document.getElementById('sidebar');
    this.sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    this.sidebarToggleBtnOutside = document.getElementById('sidebarToggleBtnOutside');
    this.userSyncBtn = document.getElementById('userSyncBtn');
    this.userBadgeText = document.getElementById('userBadgeText');

    // Stats
    this.statTotalCount = document.getElementById('statTotalCount');
    this.statMallCount = document.getElementById('statMallCount');
    this.statStyleCount = document.getElementById('statStyleCount');

    // Stamp Progress Card
    this.stampProgressCard = document.getElementById('stampProgressCard');
    this.stampProgressRate = document.getElementById('stampProgressRate');
    this.stampProgressBarFill = document.getElementById('stampProgressBarFill');
    this.stampVisitedCount = document.getElementById('stampVisitedCount');
    this.stampPrefCount = document.getElementById('stampPrefCount');
    this.visitedTabCount = document.getElementById('visitedTabCount');

    // Search & Filter
    this.searchInput = document.getElementById('searchInput');
    this.searchClearBtn = document.getElementById('searchClearBtn');
    this.categoryTabs = document.querySelectorAll('.category-tabs .tab-btn');
    this.prefectureSelect = document.getElementById('prefectureSelect');
    this.matchCountText = document.getElementById('matchCountText');
    this.resetViewBtn = document.getElementById('resetViewBtn');
    this.locationList = document.getElementById('locationList');

    // Top Controls
    this.basemapMenuBtn = document.getElementById('basemapMenuBtn');
    this.basemapDropdown = document.getElementById('basemapDropdown');
    this.toggle3dTilesBtn = document.getElementById('toggle3dTilesBtn');
    this.toggleTerrainBtn = document.getElementById('toggleTerrainBtn');
    this.downloadPolygonsBtn = document.getElementById('downloadPolygonsBtn');

    // Navigation HUD
    this.navZoomInBtn = document.getElementById('navZoomInBtn');
    this.navZoomOutBtn = document.getElementById('navZoomOutBtn');
    this.navTiltToggleBtn = document.getElementById('navTiltToggleBtn');
    this.navCompassBtn = document.getElementById('navCompassBtn');

    // Orbit HUD
    this.orbitIndicator = document.getElementById('orbitIndicator');
    this.stopOrbitBtn = document.getElementById('stopOrbitBtn');

    // Detail Card
    this.detailCard = document.getElementById('detailCard');
    this.detailCloseBtn = document.getElementById('detailCloseBtn');
    this.detailName = document.getElementById('detailName');
    this.detailNameEn = document.getElementById('detailNameEn');
    this.detailMallTypeBadge = document.getElementById('detailMallTypeBadge');
    this.detailPrefBadge = document.getElementById('detailPrefBadge');
    this.detailAddress = document.getElementById('detailAddress');
    this.detailCoords = document.getElementById('detailCoords');
    this.detailArea = document.getElementById('detailArea');
    this.detailAreaRow = document.getElementById('detailAreaRow');
    this.detailOpening = document.getElementById('detailOpening');
    this.detailOpeningRow = document.getElementById('detailOpeningRow');
    this.detailFormer = document.getElementById('detailFormer');
    this.detailFormerRow = document.getElementById('detailFormerRow');
    this.detailHours = document.getElementById('detailHours');
    this.detailHoursRow = document.getElementById('detailHoursRow');
    this.detailPlateauContext = document.getElementById('detailPlateauContext');
    this.orbitActionBtn = document.getElementById('orbitActionBtn');
    this.orbitActionText = document.getElementById('orbitActionText');
    this.topDownViewBtn = document.getElementById('topDownViewBtn');
    this.perspectiveViewBtn = document.getElementById('perspectiveViewBtn');
    this.detailWebLink = document.getElementById('detailWebLink');

    // Stamp Components in Detail Card
    this.detailStampSection = document.getElementById('detailStampSection');
    this.stampUnvisitedWrap = document.getElementById('stampUnvisitedWrap');
    this.stampVisitedWrap = document.getElementById('stampVisitedWrap');
    this.stampActionBtn = document.getElementById('stampActionBtn');
    this.stampVisitedDate = document.getElementById('stampVisitedDate');
    this.stampMemoInput = document.getElementById('stampMemoInput');
    this.stampMemoSaveBtn = document.getElementById('stampMemoSaveBtn');
    this.stampRemoveBtn = document.getElementById('stampRemoveBtn');

    // Spatial extent stats
    this.extentSiteArea = document.getElementById('extentSiteArea');
    this.extentFloorArea = document.getElementById('extentFloorArea');
    this.extentPerimeter = document.getElementById('extentPerimeter');
    this.extentBuildingHeight = document.getElementById('extentBuildingHeight');
    this.extentBBox = document.getElementById('extentBBox');
    this.copyGeoJsonBtn = document.getElementById('copyGeoJsonBtn');
    this.copyGeoJsonText = document.getElementById('copyGeoJsonText');

    // Sync Modal
    this.syncModal = document.getElementById('syncModal');
    this.syncModalCloseBtn = document.getElementById('syncModalCloseBtn');
    this.modalCurrentUserId = document.getElementById('modalCurrentUserId');
    this.copyUserIdBtn = document.getElementById('copyUserIdBtn');
    this.modalSwitchUserId = document.getElementById('modalSwitchUserId');
    this.applyUserIdBtn = document.getElementById('applyUserIdBtn');
    this.syncStatusDot = document.getElementById('syncStatusDot');
    this.syncStatusText = document.getElementById('syncStatusText');
    this.syncStatusDesc = document.getElementById('syncStatusDesc');
    this.cfgProjectId = document.getElementById('cfgProjectId');
    this.cfgApiKey = document.getElementById('cfgApiKey');
    this.saveCustomFirebaseBtn = document.getElementById('saveCustomFirebaseBtn');
    this.resetCustomFirebaseBtn = document.getElementById('resetCustomFirebaseBtn');
    this.exportStampsBtn = document.getElementById('exportStampsBtn');
    this.importStampsInput = document.getElementById('importStampsInput');

    // Loading overlay
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingStatusText = document.getElementById('loadingStatusText');
  }

  initStampIntegration() {
    this.updateUserBadge();

    // スタンプデータ変更監視
    stampManager.onChange(() => {
      this.renderStampProgress();
      if (this.selectedLocation) {
        this.renderDetailStamp(this.selectedLocation);
      }
      this.renderList();
    });

    // Firebase 認証・同期ステータス変更監視
    firebaseService.onAuthChanged(() => {
      this.updateUserBadge();
      this.updateSyncModalStatus();
    });
  }

  updateUserBadge() {
    if (!this.userBadgeText) return;
    const uid = stampManager.getUserId();
    const shortUid = uid.length > 10 ? uid.substring(0, 8) + '…' : uid;
    this.userBadgeText.textContent = shortUid;
  }

  renderStampProgress() {
    const stats = stampManager.getStats(this.locations);

    if (this.stampProgressRate) {
      this.stampProgressRate.textContent = `${stats.percent}%`;
    }
    if (this.stampProgressBarFill) {
      this.stampProgressBarFill.style.width = `${Math.min(100, stats.percent)}%`;
    }
    if (this.stampVisitedCount) {
      this.stampVisitedCount.textContent = `${stats.visitedCount} / ${stats.totalCount} 店舗訪問`;
    }
    if (this.stampPrefCount) {
      this.stampPrefCount.textContent = `${stats.visitedPrefCount} / ${stats.totalPrefCount} 都道府県`;
    }
    if (this.visitedTabCount) {
      this.visitedTabCount.textContent = stats.visitedCount;
    }
  }

  bindEvents() {
    // Navigation HUD Controls
    this.navZoomInBtn?.addEventListener('click', () => this.onZoomIn());
    this.navZoomOutBtn?.addEventListener('click', () => this.onZoomOut());
    this.navTiltToggleBtn?.addEventListener('click', () => this.onToggleTilt());
    this.navCompassBtn?.addEventListener('click', () => this.onResetCompass());

    // User Sync Button -> Open Modal
    this.userSyncBtn?.addEventListener('click', () => {
      this.openSyncModal();
    });

    // Modal Close
    this.syncModalCloseBtn?.addEventListener('click', () => {
      this.closeSyncModal();
    });
    this.syncModal?.addEventListener('click', (e) => {
      if (e.target === this.syncModal) {
        this.closeSyncModal();
      }
    });

    // Copy User ID
    this.copyUserIdBtn?.addEventListener('click', () => {
      if (!this.modalCurrentUserId) return;
      navigator.clipboard.writeText(this.modalCurrentUserId.value).then(() => {
        const originalText = this.copyUserIdBtn.textContent;
        this.copyUserIdBtn.textContent = 'コピー完了！';
        setTimeout(() => {
          this.copyUserIdBtn.textContent = originalText;
        }, 1800);
      });
    });

    // Apply Switch User ID
    this.applyUserIdBtn?.addEventListener('click', () => {
      const newId = this.modalSwitchUserId.value.trim();
      if (!newId) return;
      stampManager.setUserId(newId);
      this.modalCurrentUserId.value = newId;
      this.modalSwitchUserId.value = '';
      const originalText = this.applyUserIdBtn.textContent;
      this.applyUserIdBtn.textContent = '同期完了！';
      setTimeout(() => {
        this.applyUserIdBtn.textContent = originalText;
      }, 1800);
    });

    // Save Custom Firebase Config
    this.saveCustomFirebaseBtn?.addEventListener('click', async () => {
      const projectId = this.cfgProjectId?.value.trim();
      const apiKey = this.cfgApiKey?.value.trim();
      if (!projectId || !apiKey) {
        alert('Project ID と API Key を入力してください。');
        return;
      }
      await firebaseService.setCustomFirebaseConfig({ projectId, apiKey });
      this.updateSyncModalStatus();
      alert('Firebase設定を保存し接続を試行しました。');
    });

    this.resetCustomFirebaseBtn?.addEventListener('click', async () => {
      await firebaseService.setCustomFirebaseConfig(null);
      if (this.cfgProjectId) this.cfgProjectId.value = '';
      if (this.cfgApiKey) this.cfgApiKey.value = '';
      this.updateSyncModalStatus();
      alert('Firebase設定をクリアしローカルモードに戻しました。');
    });

    // Export JSON
    this.exportStampsBtn?.addEventListener('click', () => {
      const json = stampManager.exportStampsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aeon_stamps_${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import JSON
    this.importStampsInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await stampManager.importStampsJson(text);
        alert('スタンプデータをインポートしました！');
      } catch (err) {
        alert('インポートに失敗しました: ' + err.message);
      }
      e.target.value = '';
    });

    // Stamp Action Button in Detail Card
    this.stampActionBtn?.addEventListener('click', async () => {
      if (!this.selectedLocation) return;
      this.stampActionBtn.classList.add('stamping');
      await stampManager.addStamp(this.selectedLocation);
      this.stampActionBtn.classList.remove('stamping');
    });

    // Stamp Memo Save
    this.stampMemoSaveBtn?.addEventListener('click', async () => {
      if (!this.selectedLocation) return;
      const memo = this.stampMemoInput?.value || '';
      await stampManager.updateMemo(this.selectedLocation.id, memo);
      const originalText = this.stampMemoSaveBtn.textContent;
      this.stampMemoSaveBtn.textContent = '保存済';
      setTimeout(() => {
        this.stampMemoSaveBtn.textContent = originalText;
      }, 1500);
    });

    // Stamp Remove
    this.stampRemoveBtn?.addEventListener('click', async () => {
      if (!this.selectedLocation) return;
      if (confirm(`「${this.selectedLocation.name}」の訪問スタンプを取り消しますか？`)) {
        await stampManager.removeStamp(this.selectedLocation.id);
      }
    });

    // Download Polygons GeoJSON
    this.downloadPolygonsBtn?.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = '/data/aeon_polygons.geojson';
      link.download = 'aeon_sites_polygon.geojson';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // Copy GeoJSON for selected store
    this.copyGeoJsonBtn?.addEventListener('click', () => {
      if (!this.selectedLocation) return;
      const loc = this.selectedLocation;
      const geojsonFeature = {
        type: "Feature",
        id: loc.id,
        geometry: {
          type: "Polygon",
          coordinates: [loc.polygon_coordinates || []]
        },
        properties: {
          id: loc.id,
          name: loc.name,
          mall_type: loc.mall_type,
          prefecture: loc.prefecture,
          city: loc.city,
          address: loc.address,
          site_area_m2: loc.site_area_m2,
          floor_area_m2: loc.floor_area_m2,
          perimeter_m: loc.perimeter_m,
          building_height_est_m: loc.building_height_est_m,
          bbox: loc.bbox,
          polygon_source: loc.polygon_source,
          opening_year: loc.opening_year,
          area_text: loc.area,
        }
      };

      navigator.clipboard.writeText(JSON.stringify(geojsonFeature, null, 2)).then(() => {
        this.copyGeoJsonBtn.classList.add('copied');
        if (this.copyGeoJsonText) this.copyGeoJsonText.textContent = 'コピー完了！';
        setTimeout(() => {
          this.copyGeoJsonBtn.classList.remove('copied');
          if (this.copyGeoJsonText) this.copyGeoJsonText.textContent = '敷地ポリゴン(GeoJSON)をコピー';
        }, 2000);
      });
    });

    // Sidebar Collapse / Expand
    this.sidebarToggleBtn?.addEventListener('click', () => {
      this.sidebar.classList.add('collapsed');
    });
    this.sidebarToggleBtnOutside?.addEventListener('click', () => {
      this.sidebar.classList.remove('collapsed');
    });

    // Search Input
    this.searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim();
      this.searchClearBtn.style.display = this.searchQuery ? 'block' : 'none';
      this.renderList();
    });

    this.searchClearBtn?.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.searchClearBtn.style.display = 'none';
      this.renderList();
    });

    // Category Tabs
    this.categoryTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        this.categoryTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.getAttribute('data-filter') || 'all';
        this.renderList();
      });
    });

    // Prefecture Select
    this.prefectureSelect?.addEventListener('change', (e) => {
      this.currentPrefecture = e.target.value;
      this.renderList();
    });

    // Reset View
    this.resetViewBtn?.addEventListener('click', () => {
      this.onResetView();
    });

    // Basemap Menu Toggle
    this.basemapMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = this.basemapDropdown.style.display === 'flex';
      this.basemapDropdown.style.display = isVisible ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      if (this.basemapDropdown) {
        this.basemapDropdown.style.display = 'none';
      }
    });

    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.onChangeBasemap(e.target.value);
        this.basemapDropdown.style.display = 'none';
      });
    });

    // 3D Tiles Toggle
    this.toggle3dTilesBtn?.addEventListener('click', () => {
      const active = this.toggle3dTilesBtn.classList.toggle('active');
      this.onToggle3dTiles(active);
    });

    // Terrain Toggle
    this.toggleTerrainBtn?.addEventListener('click', () => {
      const active = this.toggleTerrainBtn.classList.toggle('active');
      this.onToggleTerrain(active);
    });

    // Detail Card Close
    this.detailCloseBtn?.addEventListener('click', () => {
      this.hideDetailCard();
    });

    // Orbit Action
    this.orbitActionBtn?.addEventListener('click', () => {
      if (this.selectedLocation) {
        this.toggleOrbit();
      }
    });

    this.stopOrbitBtn?.addEventListener('click', () => {
      if (this.isOrbiting) {
        this.toggleOrbit();
      }
    });

    // View Presets
    this.topDownViewBtn?.addEventListener('click', () => {
      if (this.selectedLocation) {
        this.onSetViewPreset(this.selectedLocation, 'topDown');
      }
    });

    this.perspectiveViewBtn?.addEventListener('click', () => {
      if (this.selectedLocation) {
        this.onSetViewPreset(this.selectedLocation, 'perspective');
      }
    });
  }

  openSyncModal() {
    if (!this.syncModal) return;
    if (this.modalCurrentUserId) {
      this.modalCurrentUserId.value = stampManager.getUserId();
    }
    const customConfig = firebaseService.getCustomFirebaseConfig();
    if (customConfig) {
      if (this.cfgProjectId) this.cfgProjectId.value = customConfig.projectId || '';
      if (this.cfgApiKey) this.cfgApiKey.value = customConfig.apiKey || '';
    }
    this.updateSyncModalStatus();
    this.syncModal.style.display = 'flex';
  }

  closeSyncModal() {
    if (this.syncModal) {
      this.syncModal.style.display = 'none';
    }
  }

  updateSyncModalStatus() {
    const isConnected = firebaseService.isConnected();
    if (this.syncStatusDot) {
      this.syncStatusDot.className = `status-indicator-dot ${isConnected ? 'online' : 'local'}`;
    }
    if (this.syncStatusText) {
      this.syncStatusText.textContent = isConnected
        ? 'Firebase Firestore クラウド同期中 (オンライン)'
        : 'ローカル保存モード (即座にご利用可能)';
    }
    if (this.syncStatusDesc) {
      this.syncStatusDesc.textContent = isConnected
        ? 'あなたのユーザーIDに紐付く訪問スタンプは安全にFirebaseクラウドに同期されています。'
        : 'スタンプはお使いのブラウザに即時保存されています。他端末と同期するにはユーザーIDを共有するかFirebase設定を追加してください。';
    }
  }

  setLocations(locations) {
    this.locations = locations;
    this.populatePrefectureDropdown();
    this.renderStats();
    this.renderStampProgress();
    this.renderList();
  }

  populatePrefectureDropdown() {
    if (!this.prefectureSelect) return;
    const currentVal = this.prefectureSelect.value;
    const prefs = Array.from(new Set(this.locations.map(loc => loc.prefecture).filter(Boolean)));

    this.prefectureSelect.innerHTML = '<option value="">すべての都道府県（全国）</option>';
    prefs.forEach(pref => {
      const count = this.locations.filter(l => l.prefecture === pref).length;
      const opt = document.createElement('option');
      opt.value = pref;
      opt.textContent = `${pref} (${count})`;
      this.prefectureSelect.appendChild(opt);
    });

    if (currentVal) {
      this.prefectureSelect.value = currentVal;
    }
  }

  renderStats() {
    const total = this.locations.length;
    const malls = this.locations.filter(l => l.mall_type === 'イオンモール').length;
    const stylesAndGeneral = this.locations.filter(l => l.mall_type !== 'イオンモール').length;

    if (this.statTotalCount) this.statTotalCount.textContent = total.toLocaleString();
    if (this.statMallCount) this.statMallCount.textContent = malls.toLocaleString();
    if (this.statStyleCount) this.statStyleCount.textContent = stylesAndGeneral.toLocaleString();
  }

  getFilteredLocations() {
    return this.locations.filter(loc => {
      // 訪問済み専用タブフィルター
      if (this.currentFilter === 'visited') {
        if (!stampManager.hasStamped(loc.id)) return false;
      } else if (this.currentFilter !== 'all') {
        if (loc.mall_type !== this.currentFilter) return false;
      }

      // 都道府県フィルター
      if (this.currentPrefecture && loc.prefecture !== this.currentPrefecture) {
        return false;
      }

      // 検索キーワード
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const n = (loc.name || '').toLowerCase();
        const ne = (loc.name_en || '').toLowerCase();
        const a = (loc.address || '').toLowerCase();
        const c = (loc.city || '').toLowerCase();
        const p = (loc.prefecture || '').toLowerCase();
        if (!n.includes(q) && !ne.includes(q) && !a.includes(q) && !c.includes(q) && !p.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }

  renderList() {
    if (!this.locationList) return;
    const filtered = this.getFilteredLocations();

    if (this.matchCountText) {
      this.matchCountText.textContent = `${filtered.length} 件表示`;
    }

    if (filtered.length === 0) {
      this.locationList.innerHTML = `
        <div class="empty-placeholder">
          <p>${this.currentFilter === 'visited' ? '訪問済みスタンプがまだありません。' : '該当するイオン店舗が見つかりませんでした。'}</p>
          <p style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">${this.currentFilter === 'visited' ? '店舗を選択して「訪問スタンプを押す」を記録してみましょう！' : '条件を変えて再検索してください。'}</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(loc => {
      const isVisited = stampManager.hasStamped(loc.id);
      const card = document.createElement('div');
      card.className = `facility-item ${this.selectedLocation?.id === loc.id ? 'selected' : ''} ${isVisited ? 'visited-item' : ''}`;
      card.setAttribute('data-id', loc.id);

      const tagClass = loc.mall_type === 'イオンモール' ? 'tag-mall' : (loc.mall_type === 'イオンスタイル' ? 'tag-style' : 'tag-sc');

      card.innerHTML = `
        <div class="facility-item-header">
          <div class="facility-title-wrap">
            ${isVisited ? '<span class="item-visited-icon" title="訪問済">★</span>' : ''}
            <span class="facility-item-title">${this.escapeHtml(loc.name)}</span>
          </div>
          <span class="facility-tag ${tagClass}">${this.escapeHtml(loc.mall_type)}</span>
        </div>
        <div class="facility-item-sub">
          <span class="facility-pref">${this.escapeHtml(loc.prefecture || '')} ${this.escapeHtml(loc.city || '')}</span>
          <span class="fly-indicator">3Dへジャンプ &rarr;</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectLocation(loc, true);
      });

      fragment.appendChild(card);
    });

    this.locationList.innerHTML = '';
    this.locationList.appendChild(fragment);
  }

  selectLocation(loc, triggerCameraFly = true) {
    this.selectedLocation = loc;

    // Update selected state in list
    document.querySelectorAll('.facility-item').forEach(el => {
      if (el.getAttribute('data-id') === loc.id) {
        el.classList.add('selected');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.classList.remove('selected');
      }
    });

    this.showDetailCard(loc);

    if (triggerCameraFly) {
      this.onSelectLocation(loc);
    }
  }

  renderDetailStamp(loc) {
    const stamp = stampManager.getStamp(loc.id);
    if (stamp) {
      // 訪問済
      if (this.stampUnvisitedWrap) this.stampUnvisitedWrap.style.display = 'none';
      if (this.stampVisitedWrap) this.stampVisitedWrap.style.display = 'flex';
      if (this.stampVisitedDate) {
        const d = new Date(stamp.visitedAt);
        const dateStr = !isNaN(d.getTime())
          ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
          : '訪問済';
        this.stampVisitedDate.textContent = dateStr;
      }
      if (this.stampMemoInput) {
        this.stampMemoInput.value = stamp.memo || '';
      }
    } else {
      // 未訪問
      if (this.stampVisitedWrap) this.stampVisitedWrap.style.display = 'none';
      if (this.stampUnvisitedWrap) this.stampUnvisitedWrap.style.display = 'flex';
    }
  }

  showDetailCard(loc) {
    if (!this.detailCard) return;

    this.detailName.textContent = loc.name;
    this.detailNameEn.textContent = loc.name_en || '';
    this.detailMallTypeBadge.textContent = loc.mall_type;
    this.detailPrefBadge.textContent = loc.prefecture || '日本';
    this.detailAddress.textContent = loc.address || `${loc.prefecture} (位置座標)`;
    this.detailCoords.textContent = `経度: ${loc.lon.toFixed(5)}°, 緯度: ${loc.lat.toFixed(5)}°`;

    // スタンプ情報の描画
    this.renderDetailStamp(loc);

    if (loc.area && this.detailAreaRow) {
      this.detailAreaRow.style.display = 'flex';
      this.detailArea.textContent = loc.area;
    } else if (this.detailAreaRow) {
      this.detailAreaRow.style.display = 'none';
    }

    if (loc.opening_year && this.detailOpeningRow) {
      this.detailOpeningRow.style.display = 'flex';
      this.detailOpening.textContent = loc.opening_year;
    } else if (this.detailOpeningRow) {
      this.detailOpeningRow.style.display = 'none';
    }

    if (loc.former_building && this.detailFormerRow) {
      this.detailFormerRow.style.display = 'flex';
      this.detailFormer.textContent = loc.former_building;
    } else if (this.detailFormerRow) {
      this.detailFormerRow.style.display = 'none';
    }

    if (loc.opening_hours) {
      this.detailHoursRow.style.display = 'flex';
      this.detailHours.textContent = loc.opening_hours;
    } else {
      this.detailHoursRow.style.display = 'none';
    }

    // Spatial extent data for statistical modeling
    if (this.extentSiteArea) {
      this.extentSiteArea.textContent = loc.site_area_m2 ? `${Math.round(loc.site_area_m2).toLocaleString()} m²` : '-';
    }
    if (this.extentFloorArea) {
      this.extentFloorArea.textContent = loc.floor_area_m2 ? `${Math.round(loc.floor_area_m2).toLocaleString()} m²` : '-';
    }
    if (this.extentPerimeter) {
      this.extentPerimeter.textContent = loc.perimeter_m ? `${Math.round(loc.perimeter_m).toLocaleString()} m` : '-';
    }
    if (this.extentBuildingHeight) {
      this.extentBuildingHeight.textContent = loc.building_height_est_m ? `${loc.building_height_est_m} m` : '-';
    }
    if (this.extentBBox) {
      if (loc.bbox && loc.bbox.length === 4) {
        this.extentBBox.textContent = `[${loc.bbox[0].toFixed(4)}, ${loc.bbox[1].toFixed(4)}, ${loc.bbox[2].toFixed(4)}, ${loc.bbox[3].toFixed(4)}]`;
      } else {
        this.extentBBox.textContent = '-';
      }
    }

    // Context description: prefer rich demand_and_features from DuckDB if available
    if (this.detailPlateauContext) {
      if (loc.demand_and_features) {
        this.detailPlateauContext.textContent = loc.demand_and_features;
      } else {
        this.detailPlateauContext.textContent =
          `${loc.prefecture || '周辺地域'}のProject PLATEAU 3D都市建築物モデル・地形データと重畳中。広大な敷地と周辺街並みの高低差が3Dで確認できます。`;
      }
    }

    // Web Link
    if (loc.website) {
      this.detailWebLink.href = loc.website;
      this.detailWebLink.style.display = 'inline-flex';
    } else {
      // Fallback search link on Google
      this.detailWebLink.href = `https://www.google.com/search?q=${encodeURIComponent(loc.name)}`;
      this.detailWebLink.style.display = 'inline-flex';
    }

    this.updateOrbitButtonState(this.isOrbiting);
    this.detailCard.style.display = 'flex';
  }

  hideDetailCard() {
    if (!this.detailCard) return;
    this.detailCard.style.display = 'none';
    if (this.isOrbiting) {
      this.toggleOrbit(false);
    }
  }

  toggleOrbit(forceState = null) {
    const newState = forceState !== null ? forceState : !this.isOrbiting;
    this.isOrbiting = newState;

    this.updateOrbitButtonState(newState);

    if (this.orbitIndicator) {
      this.orbitIndicator.style.display = newState ? 'block' : 'none';
    }

    this.onToggleOrbit(this.selectedLocation, newState);
  }

  updateOrbitButtonState(isOrbiting) {
    if (!this.orbitActionText) return;
    if (isOrbiting) {
      this.orbitActionText.textContent = 'オービット旋回を停止';
      this.orbitActionBtn.classList.add('active');
    } else {
      this.orbitActionText.textContent = '360° オービット旋回';
      this.orbitActionBtn.classList.remove('active');
    }
  }

  setLoadingStatus(message) {
    if (this.loadingStatusText) {
      this.loadingStatusText.textContent = message;
    }
  }

  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        this.loadingOverlay.style.display = 'none';
      }, 500);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
