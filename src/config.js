/**
 * AEON 3D Explorer - Configuration
 * Project PLATEAU 3D都市モデル・地形および地理院タイル設定
 */

export const CONFIG = {
  // 国土交通省 PLATEAU 3D都市モデル (3D Tiles)
  // 全国複合 3D Tiles (LOD2 実写テクスチャ最新版 - 提供都市はLOD2実写、他はLOD1)
  plateau3dTilesUrl: 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-maxlod2-latest/tileset.json',

  // 国土交通省 PLATEAU-Terrain (Quantized-Mesh, 楕円体高補正済み)
  plateauTerrainUrl: 'https://tile.plateauview.mlit.go.jp/terrain',

  // 国土地理院タイル
  baseMaps: {
    std: {
      name: '地理院タイル (標準地図)',
      url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
      attribution: '国土地理院',
      maxZoom: 18,
    },
    ortho: {
      name: '地理院タイル (写真オルソ)',
      url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
      attribution: '国土地理院',
      maxZoom: 18,
    },
    pale: {
      name: '地理院タイル (淡色地図)',
      url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
      attribution: '国土地理院',
      maxZoom: 18,
    },
  },

  // イオン ブランドカラー定義
  colors: {
    primaryMagenta: '#ae1e66',
    secondaryPink: '#e6007e',
    accentGold: '#f0b429',
    darkBg: '#0f172a',
    cardBg: 'rgba(15, 23, 42, 0.85)',
  },

  // 日本列島全体を見渡す初期カメラ視点
  initialCamera: {
    longitude: 137.8,
    latitude: 36.0,
    height: 1400000,
    heading: 0.0,
    pitch: -65.0,
    roll: 0.0,
  },

  // 施設フライスルー時の標準カメラパラメータ
  flyToParams: {
    heightOffset: 380,   // 高度約380-400m
    distanceOffset: 450, // 店舗からの水平距離
    pitch: -35.0,        // ピッチ -35度
    duration: 2.2,       // 飛行アニメーション秒数
  },

  // データファイルパス
  aeonDataUrl: '/data/aeon_locations.json',
};
