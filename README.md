# イオン 3D Explorer (Project PLATEAU × CesiumJS)

国土交通省の「Project PLATEAU（3D都市モデル・地形）」と「CesiumJS」を使用し、OpenStreetMapから収集・厳密補正した日本全国の「イオン」「イオンモール」「イオンスタイル」を3D空間上で探索・紹介するフルスタックWebGISアプリケーションです。

---

## 🌟 主な機能と特徴

1. **Project PLATEAU 連携 3D WebGISビューア (`src/main.js`, `index.html`)**:
   - **全国複合 3D都市モデル (3D Tiles)**: 国土交通省PLATEAU公式の最新複合3D Tiles（全国441自治体）を自動ストリーミング。政令指定都市や主要都市の建物がリアルな立体ジオメトリとして立ち上がります。
   - **地形 (Terrain)**: 国土交通省PLATEAU公式のQuantized-Mesh標高タイル (`https://tile.plateauview.mlit.go.jp/terrain`) により、起伏や標高差を忠実に再現。
   - **ベースマップ切替**: 国土地理院タイル（標準地図、写真オルソ、淡色地図）をワンクリックでシームレスに切替可能。
   - **Macトラックパッドのピンチ操作対応**: 2本指のピンチイン／ピンチアウトで直感的に拡大・縮小が可能。
   - **開閉式サイドバー**: 画面を広く見渡せるサイドバー折りたたみと、フローティングボタン「店舗一覧を開く」によるスムーズな復帰。

2. **実測フットプリント & 空間統計データ (`public/data/`)**:
   - OpenStreetMap（OSM）実測データから取得した全国主要店舗（手稲駅前店、栄町店、麻生店、各大型モールなど）の**正確な建物外形線（ポリゴン）**を地表にドレープ描画。国土地理院標準地図の建物枠線と精密に重なります。
   - 各店舗の詳細カードにて「敷地面積」「延床面積」「外周長」「3D推定建物高」「BBox範囲」を表示。
   - **敷地GeoJSONダウンロード & クリップボードコピー**: 空間統計モデルやGIS解析に即座に活用できるGeoJSONエクスポート機能を搭載。

3. **データ収集 & クレンジングパイプライン (`scripts/fetch_aeon.py`)**:
   - Overpass APIから日本国内のイオン拠点を自動収集。
   - テナント店舗・ATM・物流センター等のノイズを排除し、47都道府県・市区町村のジオコーディング補完を実施。

---

## 📦 大容量データファイルについて (GitHub Releases)

本リポジトリでは、Gitリポジトリの軽量性と高速なクローンを維持するため、容量の大きいローカル解析用データベース（`aeon_stores.duckdb`、約35MB）はGit追跡から除外し、**[GitHub Releases](https://github.com/motti6/aeon_3d/releases)** にて配布しています。

* **Webアプリケーションの起動**:
  本リポジトリに含まれる `public/data/aeon_locations.json` および `public/data/aeon_polygons.geojson` のみでWebアプリは完全動作します（DuckDBのダウンロードは不要です）。
* **DuckDBデータが必要な場合**:
  DuckDBを用いた追加の空間データ集計・分析を行いたい場合は、GitHubリポジトリ右側の **Releases**（タグ `v1.0.0`）から `aeon_stores.duckdb` をダウンロードし、プロジェクトルート直下に配置してください。

---

## 🚀 クイックスタート

### 1. 前提環境
- Node.js (v18以上推奨)
- npm (v9以上)
- Python 3.10以上（データ収集スクリプトを実行する場合のみ）

### 2. インストール & 開発サーバー起動
```bash
# 依存パッケージのインストール
npm install

# ローカル開発サーバー起動 (Vite)
npm run dev
```
ブラウザで `http://localhost:5173/` にアクセスしてください。

### 3. 本番ビルド & プレビュー
```bash
# 本番ビルド (dist/ フォルダへ静的アセットを出力)
npm run build

# ビルド結果のローカルプレビュー
npm run preview
```

### 4. (任意) データ更新スクリプトの実行
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt

# Overpass APIから最新店舗データを取得・整形
python3 scripts/fetch_aeon.py
```

---

## 📁 プロジェクト構成

```
.
├── public/
│   └── data/
│       ├── aeon_locations.json   # 全国のイオン拠点データ (属性・ポリゴン座標付き)
│       └── aeon_polygons.geojson # 実測敷地ポリゴンGeoJSON (空間統計用)
├── src/
│   ├── config.js                 # PLATEAU API、地理院タイル、初期視点設定
│   ├── main.js                   # Cesium Viewer初期化、3D Tiles、カメラ制御、ピン描画
│   ├── ui.js                     # サイドバー、開閉トグル、検索・フィルター、詳細カードUI
│   └── style.css                 # グラスモーフィズムUI、レスポンシブデザイン
├── scripts/
│   ├── fetch_aeon.py             # Overpass APIデータ収集・クレンジングスクリプト
│   └── requirements.txt          # Python依存ライブラリ
├── index.html                    # メインHTML
├── package.json                  # npm設定
├── vite.config.js                # Vite設定
├── .gitignore                    # 一時ファイル・画像・大容量ファイルの除外設定
└── README.md                     # 本ドキュメント
```

---

## 📜 データクレジット & 帰属
- **3D都市モデル・地形データ**: 国土交通省 [Project PLATEAU](https://www.mlit.go.jp/plateau/)
- **地図タイル**: [国土地理院](https://maps.gsi.go.jp/development/ichiran.html) (標準地図・写真オルソ・淡色地図)
- **店舗データ**: [OpenStreetMap](https://www.openstreetmap.org/) contributors (ODbL)
- **3D地球儀ライブラリ**: [CesiumJS](https://cesium.com/cesiumjs/)
