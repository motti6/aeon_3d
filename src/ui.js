/**
 * AEON 3D Explorer - UI Controller
 * サイドバー、リスト描画、検索、フィルター、詳細カード、イベント制御
 */

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
    this.currentFilter = 'all'; // 'all' | 'イオンモール' | 'イオンスタイル'
    this.currentPrefecture = '';
    this.searchQuery = '';
    this.isOrbiting = false;

    this.initElements();
    this.bindEvents();
    this.populatePrefectureDropdown();
    this.renderStats();
    this.renderList();
  }

  initElements() {
    // Sidebar
    this.sidebar = document.getElementById('sidebar');
    this.sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    this.sidebarToggleBtnOutside = document.getElementById('sidebarToggleBtnOutside');

    // Stats
    this.statTotalCount = document.getElementById('statTotalCount');
    this.statMallCount = document.getElementById('statMallCount');
    this.statStyleCount = document.getElementById('statStyleCount');

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

    // Spatial extent stats
    this.extentSiteArea = document.getElementById('extentSiteArea');
    this.extentFloorArea = document.getElementById('extentFloorArea');
    this.extentPerimeter = document.getElementById('extentPerimeter');
    this.extentBuildingHeight = document.getElementById('extentBuildingHeight');
    this.extentBBox = document.getElementById('extentBBox');
    this.copyGeoJsonBtn = document.getElementById('copyGeoJsonBtn');
    this.copyGeoJsonText = document.getElementById('copyGeoJsonText');

    // Loading overlay
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingStatusText = document.getElementById('loadingStatusText');
  }

  bindEvents() {
    // Navigation HUD Controls
    this.navZoomInBtn?.addEventListener('click', () => this.onZoomIn());
    this.navZoomOutBtn?.addEventListener('click', () => this.onZoomOut());
    this.navTiltToggleBtn?.addEventListener('click', () => this.onToggleTilt());
    this.navCompassBtn?.addEventListener('click', () => this.onResetCompass());

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

  setLocations(locations) {
    this.locations = locations;
    this.populatePrefectureDropdown();
    this.renderStats();
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
      // Category filter
      if (this.currentFilter !== 'all') {
        if (loc.mall_type !== this.currentFilter) return false;
      }

      // Prefecture filter
      if (this.currentPrefecture && loc.prefecture !== this.currentPrefecture) {
        return false;
      }

      // Search query (matches name, name_en, address, city, prefecture)
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
          <p>該当するイオン店舗が見つかりませんでした。</p>
          <p style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">条件を変えて再検索してください。</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(loc => {
      const card = document.createElement('div');
      card.className = `facility-item ${this.selectedLocation?.id === loc.id ? 'selected' : ''}`;
      card.setAttribute('data-id', loc.id);

      const tagClass = loc.mall_type === 'イオンモール' ? 'tag-mall' : (loc.mall_type === 'イオンスタイル' ? 'tag-style' : 'tag-sc');

      card.innerHTML = `
        <div class="facility-item-header">
          <span class="facility-item-title">${this.escapeHtml(loc.name)}</span>
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

  showDetailCard(loc) {
    if (!this.detailCard) return;

    this.detailName.textContent = loc.name;
    this.detailNameEn.textContent = loc.name_en || '';
    this.detailMallTypeBadge.textContent = loc.mall_type;
    this.detailPrefBadge.textContent = loc.prefecture || '日本';
    this.detailAddress.textContent = loc.address || `${loc.prefecture} (位置座標)`;
    this.detailCoords.textContent = `経度: ${loc.lon.toFixed(5)}°, 緯度: ${loc.lat.toFixed(5)}°`;

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
