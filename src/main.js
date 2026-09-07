/**
 * AEON 3D Explorer - Main Application
 * Project PLATEAU (3D都市モデル・地形) × CesiumJS
 * OpenStreetMap イオン・イオンモール 3D WebGIS ビューア
 */

import { CONFIG } from './config.js';
import { UIController } from './ui.js';

class Aeon3DApp {
  constructor() {
    this.viewer = null;
    this.ui = null;
    this.locations = [];
    this.entityMap = new Map();
    this.polygonEntityMap = new Map();
    this.highlightedPolyEntity = null;
    this.dataSource = null;
    this.plateauTileset = null;
    this.currentBasemapLayer = null;

    // Orbit State
    this.isOrbiting = false;
    this.orbitTargetLocation = null;
    this.orbitRadius = 550; // meters from target center
    this.orbitHeight = 380; // altitude in meters
    this.orbitSpeed = 0.0035; // radians per tick
    this.orbitCurrentAngle = 0;
    this.orbitListener = null;

    // Pin SVG Data URLs Cache
    this.pinIcons = {};

    this.init();
  }

  async init() {
    try {
      this.initPinGraphics();
      this.initCesiumViewer();
      this.initBasemap('std');
      this.initTrackpadPinchZoom();

      // UIControllerを先に初期化（ステータス表示や各種コールバックを確実に有効化）
      this.ui = new UIController({
        locations: [],
        onSelectLocation: (loc) => this.flyToLocation(loc),
        onToggleOrbit: (loc, state) => this.setOrbitState(loc, state),
        onSetViewPreset: (loc, preset) => this.setViewPreset(loc, preset),
        onResetView: () => this.resetView(),
        onChangeBasemap: (type) => this.switchBasemap(type),
        onToggle3dTiles: (visible) => this.set3dTilesVisibility(visible),
        onToggleTerrain: (visible) => this.setTerrainVisibility(visible),
        onZoomIn: () => this.zoomIn(),
        onZoomOut: () => this.zoomOut(),
        onToggleTilt: () => this.toggleTilt(),
        onResetCompass: () => this.resetCompass(),
      });

      this.initPickingHandler();

      if (this.ui) this.ui.setLoadingStatus('PLATEAU 地形データを接続中...');
      await this.initTerrain();

      if (this.ui) this.ui.setLoadingStatus('PLATEAU 3D建築物モデルを接続中...');
      await this.init3dTiles();

      if (this.ui) this.ui.setLoadingStatus('イオン店舗・敷地データを読み込み中...');
      await this.loadAeonLocations();

      if (this.ui) {
        this.ui.setLoadingStatus('完了');
        this.ui.hideLoading();
      }

    } catch (err) {
      console.error('[!] アプリケーション初期化エラー:', err);
      if (this.ui) {
        this.ui.setLoadingStatus(`エラーが発生しました: ${err.message}`);
      }
    }
  }

  /**
   * イオンブランドカラー（マゼンタ #ae1e66）の3DカスタムピンアイコンをCanvasで動的生成
   */
  initPinGraphics() {
    this.pinIcons.mall = this.createPinDataUrl('#ae1e66', 'MALL');
    this.pinIcons.style = this.createPinDataUrl('#7c3aed', 'STYLE');
    this.pinIcons.general = this.createPinDataUrl('#0d9488', 'AEON');
  }

  createPinDataUrl(color, label) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 76;
    const ctx = canvas.getContext('2d');

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Pin Body (Tear drop shape)
    ctx.beginPath();
    ctx.arc(32, 28, 24, Math.PI * 0.8, Math.PI * 0.2, false);
    ctx.lineTo(32, 68);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Reset shadow for border & contents
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Inner Circle Badge
    ctx.beginPath();
    ctx.arc(32, 28, 17, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Inner Shopping Bag / Text glyph
    ctx.fillStyle = color;
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 32, 28);

    // Tip dot
    ctx.beginPath();
    ctx.arc(32, 68, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    return canvas.toDataURL('image/png');
  }

  /**
   * Cesium Viewer 初期化
   */
  initCesiumViewer() {
    Cesium.Ion.defaultAccessToken = '';

    this.viewer = new Cesium.Viewer('cesiumContainer', {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      baseLayer: false, // 地理院タイルを手動追加
      requestRenderMode: false, // 拡大縮小やトラックパッド操作が常時スムーズに反映されるよう通常レンダリング
    });

    const scene = this.viewer.scene;
    const globe = scene.globe;

    // カメラ操作の最適化（マウスホイール・トラックパッドピンチ・ドラッグによる拡大縮小を快適化）
    const controller = scene.screenSpaceCameraController;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTranslate = true;
    controller.enableTilt = true;
    controller.enableLook = true;
    controller.zoomFactor = 4.0;
    controller.minimumZoomDistance = 15.0;
    controller.maximumZoomDistance = 45000000.0;

    // 大気・ライティング効果の最適化
    scene.highDynamicRange = true;
    globe.enableLighting = false; // 地理院タイルが暗くならないよう日照シャドウを調整
    scene.sun.show = true;
    scene.moon.show = false;
    scene.skyAtmosphere.show = true;

    // 地形深度テスト（ピンや建物が山に埋もれた際に自然にオクルージョンされる）
    globe.depthTestAgainstTerrain = true;

    // 初期カメラを日本列島上空へ設定
    const cam = CONFIG.initialCamera;
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(cam.longitude, cam.latitude, cam.height),
      orientation: {
        heading: Cesium.Math.toRadians(cam.heading),
        pitch: Cesium.Math.toRadians(cam.pitch),
        roll: Cesium.Math.toRadians(cam.roll),
      },
    });
  }

  /**
   * Macトラックパッドのピンチイン・ピンチアウト拡大縮小およびジェスチャー対応
   */
  initTrackpadPinchZoom() {
    const container = this.viewer.container;
    const canvas = this.viewer.scene.canvas;
    const camera = this.viewer.camera;
    window.CesiumViewer = this.viewer;

    // 1. macOS Chrome / Firefox / Safari: トラックパッドの2本指ピンチは ctrlKey: true の wheel イベントとして発火
    const handleWheelZoom = (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // ブラウザ標準のページ全体ズームを阻止

        const height = camera.positionCartographic ? camera.positionCartographic.height : 1000;
        const zoomDelta = height * e.deltaY * 0.0035;

        if (e.deltaY < 0) {
          camera.zoomIn(Math.min(height * 0.5, Math.abs(zoomDelta)));
        } else {
          camera.zoomOut(Math.min(height * 1.0, Math.abs(zoomDelta)));
        }
      }
    };

    container.addEventListener('wheel', handleWheelZoom, { passive: false });
    canvas.addEventListener('wheel', handleWheelZoom, { passive: false });

    // 2. WebKit / Safari 専用 Gesture イベント
    let lastScale = 1.0;
    const handleGestureStart = (e) => {
      e.preventDefault();
      lastScale = 1.0;
    };
    const handleGestureChange = (e) => {
      e.preventDefault();
      const scaleDiff = e.scale - lastScale;
      lastScale = e.scale;

      const height = camera.positionCartographic ? camera.positionCartographic.height : 1000;
      const zoomDelta = height * scaleDiff * 0.75;

      if (scaleDiff > 0) {
        camera.zoomIn(Math.min(height * 0.5, Math.abs(zoomDelta)));
      } else if (scaleDiff < 0) {
        camera.zoomOut(Math.min(height * 1.0, Math.abs(zoomDelta)));
      }
    };
    const handleGestureEnd = (e) => {
      e.preventDefault();
    };

    container.addEventListener('gesturestart', handleGestureStart, { passive: false });
    container.addEventListener('gesturechange', handleGestureChange, { passive: false });
    container.addEventListener('gestureend', handleGestureEnd, { passive: false });
  }

  /**
   * 国土地理院タイルの設定
   */
  initBasemap(type = 'std') {
    const config = CONFIG.baseMaps[type] || CONFIG.baseMaps.std;

    if (this.currentBasemapLayer) {
      this.viewer.imageryLayers.remove(this.currentBasemapLayer);
    }

    const provider = new Cesium.UrlTemplateImageryProvider({
      url: config.url,
      credit: new Cesium.Credit(config.attribution),
      maximumLevel: config.maxZoom || 18,
    });

    this.currentBasemapLayer = this.viewer.imageryLayers.addImageryProvider(provider);
  }

  switchBasemap(type) {
    this.initBasemap(type);
  }

  /**
   * 国土交通省 PLATEAU-Terrain の適用
   */
  async initTerrain() {
    try {
      if (this.ui) this.ui.setLoadingStatus('PLATEAU 地形データを接続中...');
      const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(CONFIG.plateauTerrainUrl, {
        requestVertexNormals: true,
      });
      this.viewer.terrainProvider = terrainProvider;
      console.log('[✓] PLATEAU 地形タイルを適用しました');
    } catch (err) {
      console.warn('[!] PLATEAU 地形の読み込みに失敗しました。標準楕円体にフォールバックします:', err);
      this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
  }

  setTerrainVisibility(visible) {
    if (visible) {
      this.initTerrain();
    } else {
      this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
  }

  /**
   * 国土交通省 PLATEAU 3D Tiles (建築物モデル) の読み込み
   * LOD2実写テクスチャおよびLOD1ジオメトリを忠実に再現 (PlateauView準拠)
   */
  async init3dTiles() {
    try {
      if (this.ui) this.ui.setLoadingStatus('PLATEAU 3D建築物モデルを接続中...');
      const tileset = await Cesium.Cesium3DTileset.fromUrl(CONFIG.plateau3dTilesUrl, {
        maximumScreenSpaceError: 12, // LOD2実写テクスチャと屋根・窓・壁面をスムーズにロード
        dynamicScreenSpaceError: true,
        dynamicScreenSpaceErrorDensity: 0.00278,
        dynamicScreenSpaceErrorFactor: 4.0,
      });

      // PLATEAU 3D Tilesの実写フォトリアリスティック・テクスチャをそのまま美しくレンダリング
      // (スタイルカラーを単色で強制上書きせず、実写外壁・窓・屋根・看板テクスチャを活かす)
      tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT;

      this.plateauTileset = tileset;
      this.viewer.scene.primitives.add(tileset);
      console.log('[✓] PLATEAU 全国建築物 3D Tiles (LOD2実写テクスチャ/LOD1) を追加しました');
    } catch (err) {
      console.warn('[!] PLATEAU 3D Tiles の読み込みに失敗しました:', err);
    }
  }

  set3dTilesVisibility(visible) {
    if (this.plateauTileset) {
      this.plateauTileset.show = visible;
    }
  }

  /**
   * イオン拠点 GeoJSON データのフェッチ、3D建築物エクスクルージョンモデルおよびピンの配置
   */
  async loadAeonLocations() {
    const res = await fetch(CONFIG.aeonDataUrl);
    if (!res.ok) {
      throw new Error(`データファイルの読み込みに失敗しました (${res.status} ${res.statusText})`);
    }

    const data = await res.json();
    this.locations = data.locations || [];
    console.log(`[✓] ${this.locations.length} 件のイオン拠点を取得しました`);

    this.ui.setLocations(this.locations);

    // CustomDataSource for Aeon locations
    this.dataSource = new Cesium.CustomDataSource('aeon_locations');

    // クラスタリング設定（ズームアウト時の視認性向上）
    this.dataSource.clustering.enabled = true;
    this.dataSource.clustering.pixelRange = 40;
    this.dataSource.clustering.minimumClusterSize = 3;

    // クラスタバッジのカスタム描画
    this.dataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      cluster.label.show = true;
      cluster.label.text = `${clusteredEntities.length}`;
      cluster.label.font = 'bold 12px Inter, sans-serif';
      cluster.label.fillColor = Cesium.Color.WHITE;
      cluster.label.outlineColor = Cesium.Color.fromCssColorString('#ae1e66');
      cluster.label.outlineWidth = 3;
      cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
      cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;

      cluster.billboard.show = true;
      cluster.billboard.image = this.createClusterBadge(clusteredEntities.length);
      cluster.billboard.width = 38;
      cluster.billboard.height = 38;
      cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
    });

    // 各店舗のEntity生成 (3D建築物ポリゴン + ピン)
    this.locations.forEach((loc) => {
      const isMall = loc.mall_type === 'イオンモール';
      const isStyle = loc.mall_type === 'イオンスタイル';
      const pinImage = isMall ? this.pinIcons.mall : (isStyle ? this.pinIcons.style : this.pinIcons.general);
      const colorHex = isMall ? '#ae1e66' : (isStyle ? '#7c3aed' : '#0d9488');
      const bldgHeight = loc.building_height_est_m || (isMall ? 22.0 : (isStyle ? 16.0 : 12.0));

      // 1. 店舗敷地・実測フットプリント境界
      // 実測されたOSM外形線（OSM_exact_footprint）が存在する場合のみ、地表にクランプされた高精度フットプリントとして描画
      // （※推定面積による不正確な矩形描画は排除し、地図の建物線やPLATEAUモデルとの不整合を完全に防止）
      if (loc.polygon_coordinates && loc.polygon_coordinates.length >= 3 && loc.polygon_source === 'OSM_exact_footprint') {
        const flatDegrees = [];
        loc.polygon_coordinates.forEach(pt => {
          flatDegrees.push(pt[0], pt[1]);
        });

        const polyEntity = this.dataSource.entities.add({
          id: `poly-${loc.id}`,
          name: `${loc.name} (実測敷地外形)`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatDegrees),
            material: Cesium.Color.fromCssColorString(colorHex).withAlpha(0.35),
            classificationType: Cesium.ClassificationType.BOTH,
          },
          properties: loc,
        });

        this.polygonEntityMap.set(loc.id, polyEntity);
      }

      // 2. 3D Billboard ピン
      const pinEntity = this.dataSource.entities.add({
        id: loc.id,
        name: loc.name,
        position: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, 0),
        billboard: {
          image: pinImage,
          width: 32,
          height: 38,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          disableDepthTestDistance: 500000,
        },
        properties: loc,
      });

      this.entityMap.set(loc.id, pinEntity);
    });

    await this.viewer.dataSources.add(this.dataSource);
  }

  createClusterBadge(count) {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(24, 24, 21, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(174, 30, 102, 0.4)';
    ctx.fill();

    // Inner core
    ctx.beginPath();
    ctx.arc(24, 24, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#ae1e66';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    return canvas.toDataURL('image/png');
  }

  /**
   * 3D空間上のピンまたは3D敷地モデルをクリックした時のインタラクション
   */
  initPickingHandler() {
    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    handler.setInputAction((movement) => {
      const pickedObject = this.viewer.scene.pick(movement.position);

      if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
        const entity = pickedObject.id;
        const loc = entity.properties.getValue();
        if (loc && loc.name) {
          this.ui.selectLocation(loc, false);
          this.flyToLocation(loc);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // カーソルホバー演出
    handler.setInputAction((movement) => {
      const pickedObject = this.viewer.scene.pick(movement.endPosition);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        this.viewer.scene.canvas.style.cursor = 'pointer';
      } else {
        this.viewer.scene.canvas.style.cursor = 'default';
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  /**
   * 該当のイオン上空へカメラがスムーズにフライスルー
   */
  flyToLocation(loc) {
    this.stopOrbit();
    this.highlightLocationPolygon(loc);

    const p = CONFIG.flyToParams;
    const targetLon = loc.lon;
    const targetLat = loc.lat;

    // 店舗の南側から北向きに俯瞰し、PLATEAU建築物モデルを背景に店舗正面・街並みを美しく捉える
    const cameraOffsetLat = -0.0028;
    const cameraOffsetLon = 0.0004;

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        targetLon + cameraOffsetLon,
        targetLat + cameraOffsetLat,
        320 // 高度320mでPLATEAU 3D建築物モデルと店舗がクリアに見通せる
      ),
      orientation: {
        heading: Cesium.Math.toRadians(8.0),
        pitch: Cesium.Math.toRadians(-32.0), // -32度パース
        roll: 0.0,
      },
      duration: p.duration,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }

  /**
   * 選択中のイオン敷地ポリゴンをハイライト表示
   */
  highlightLocationPolygon(loc) {
    // 既存ハイライトの解除
    if (this.highlightedPolyEntity) {
      const prevLoc = this.highlightedPolyEntity.properties.getValue();
      const isMall = prevLoc.mall_type === 'イオンモール';
      const isStyle = prevLoc.mall_type === 'イオンスタイル';
      const colorHex = isMall ? '#ae1e66' : (isStyle ? '#7c3aed' : '#0d9488');
      this.highlightedPolyEntity.polygon.material = Cesium.Color.fromCssColorString(colorHex).withAlpha(0.35);
      this.highlightedPolyEntity = null;
    }

    // 新規ハイライトの適用 (実測敷地が鮮やかに光る)
    const poly = this.polygonEntityMap.get(loc.id);
    if (poly) {
      poly.polygon.material = Cesium.Color.fromCssColorString('#f43f5e').withAlpha(0.65);
      this.highlightedPolyEntity = poly;
    }
  }

  /**
   * 画面内操作ボタン用ズーム・傾斜制御
   */
  zoomIn() {
    const camera = this.viewer.camera;
    const height = camera.positionCartographic ? camera.positionCartographic.height : 1000;
    camera.zoomIn(Math.max(30, height * 0.4));
  }

  zoomOut() {
    const camera = this.viewer.camera;
    const height = camera.positionCartographic ? camera.positionCartographic.height : 1000;
    camera.zoomOut(Math.max(50, height * 0.6));
  }

  toggleTilt() {
    const camera = this.viewer.camera;
    const currentPitchDeg = Cesium.Math.toDegrees(camera.pitch);
    if (currentPitchDeg < -60) {
      // 俯瞰から3Dパース (-35度) へ
      camera.lookUp(Cesium.Math.toRadians(45));
    } else {
      // 3Dパースから真上俯瞰 (-89度) へ
      camera.lookDown(Cesium.Math.toRadians(currentPitchDeg + 89));
    }
  }

  resetCompass() {
    const camera = this.viewer.camera;
    camera.setView({
      orientation: {
        heading: 0.0, // North
        pitch: camera.pitch,
        roll: 0.0,
      }
    });
  }

  /**
   * カメラプリセット（鳥瞰ビュー / 近接3Dパース）
   */
  setViewPreset(loc, preset) {
    this.stopOrbit();
    this.highlightLocationPolygon(loc);

    if (preset === 'topDown') {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, 850),
        orientation: {
          heading: 0.0,
          pitch: Cesium.Math.toRadians(-89.0),
          roll: 0.0,
        },
        duration: 1.6,
      });
    } else if (preset === 'perspective') {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(loc.lon - 0.0022, loc.lat - 0.0022, 280),
        orientation: {
          heading: Cesium.Math.toRadians(45.0),
          pitch: Cesium.Math.toRadians(-26.0),
          roll: 0.0,
        },
        duration: 1.6,
      });
    }
  }

  /**
   * 360度オービット旋回（自動回転）
   */
  setOrbitState(loc, enable) {
    if (enable && loc) {
      this.startOrbit(loc);
    } else {
      this.stopOrbit();
    }
  }

  startOrbit(loc) {
    this.stopOrbit();
    this.isOrbiting = true;
    this.orbitTargetLocation = loc;
    this.highlightLocationPolygon(loc);

    const cameraPos = this.viewer.camera.positionCartographic;
    const targetLon = Cesium.Math.toRadians(loc.lon);
    const targetLat = Cesium.Math.toRadians(loc.lat);

    this.orbitCurrentAngle = Math.atan2(
      cameraPos.longitude - targetLon,
      cameraPos.latitude - targetLat
    );

    this.orbitListener = () => {
      if (!this.isOrbiting || !this.orbitTargetLocation) return;

      this.orbitCurrentAngle += this.orbitSpeed;

      const rLat = (this.orbitRadius / 111000.0);
      const rLon = (this.orbitRadius / (111000.0 * Math.cos(Cesium.Math.toRadians(loc.lat))));

      const camLon = loc.lon + Math.sin(this.orbitCurrentAngle) * rLon;
      const camLat = loc.lat + Math.cos(this.orbitCurrentAngle) * rLat;

      const targetCartesian = Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, 20);
      const cameraCartesian = Cesium.Cartesian3.fromDegrees(camLon, camLat, this.orbitHeight);

      this.viewer.camera.position = cameraCartesian;
      this.viewer.camera.lookAt(
        targetCartesian,
        new Cesium.HeadingPitchRange(
          this.viewer.camera.heading,
          Cesium.Math.toRadians(-32),
          this.orbitRadius
        )
      );
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    };

    this.viewer.scene.postRender.addEventListener(this.orbitListener);
  }

  stopOrbit() {
    if (this.isOrbiting) {
      this.isOrbiting = false;
      if (this.orbitListener) {
        this.viewer.scene.postRender.removeEventListener(this.orbitListener);
        this.orbitListener = null;
      }
      if (this.ui) {
        this.ui.updateOrbitButtonState(false);
      }
    }
  }

  /**
   * 日本全域俯瞰ビューへリセット
   */
  resetView() {
    this.stopOrbit();
    if (this.highlightedPolyEntity) {
      const prevLoc = this.highlightedPolyEntity.properties.getValue();
      const isMall = prevLoc.mall_type === 'イオンモール';
      const isStyle = prevLoc.mall_type === 'イオンスタイル';
      const colorHex = isMall ? '#ae1e66' : (isStyle ? '#7c3aed' : '#0d9488');
      this.highlightedPolyEntity.polygon.material = Cesium.Color.fromCssColorString(colorHex).withAlpha(0.35);
      this.highlightedPolyEntity = null;
    }
    if (this.ui) {
      this.ui.hideDetailCard();
    }

    const cam = CONFIG.initialCamera;
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cam.longitude, cam.latitude, cam.height),
      orientation: {
        heading: Cesium.Math.toRadians(cam.heading),
        pitch: Cesium.Math.toRadians(cam.pitch),
        roll: 0.0,
      },
      duration: 2.0,
    });
  }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  window.app = new Aeon3DApp();
});
