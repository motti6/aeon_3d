#!/usr/bin/env python3
"""
OpenStreetMap (Overpass API) および aeon_stores.duckdb から
日本全国のイオン・イオンモール最新データを取得・統合・クレンジングし、
3D WebGISビューア用 GeoJSON / JSON (public/data/aeon_locations.json) および
空間統計モデル用 敷地ポリゴンGeoJSON (public/data/aeon_polygons.geojson) を生成するスクリプト。
"""

import json
import math
import os
import re
import sys
import time
import requests

try:
    import duckdb
    HAS_DUCKDB = True
except ImportError:
    HAS_DUCKDB = False

OVERPASS_ENDPOINTS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# Overpass QLクエリ（敷地・建物の外形ポリゴンジオメトリを取得するため out geom tags を指定）
OVERPASS_QL_AREA = """[out:json][timeout:90];
area["ISO3166-1"="JP"][admin_level=2]->.japan;
(
  nwr["brand:wikidata"="Q305335"](area.japan);
  nwr["name"~"イオンモール|イオンショッピングセンター|イオンスタイル"](area.japan);
);
out geom tags;
"""

OVERPASS_QL_BBOX = """[out:json][timeout:90];
(
  nwr["brand:wikidata"="Q305335"](24.0,122.0,46.0,154.0);
  nwr["name"~"イオンモール|イオンショッピングセンター|イオンスタイル"](24.0,122.0,46.0,154.0);
);
out geom tags;
"""

# 47都道府県の庁舎代表座標
PREFECTURE_CENTROIDS = [
    ("北海道", 43.06417, 141.34694),
    ("青森県", 40.82444, 140.74000),
    ("岩手県", 39.70361, 141.15250),
    ("宮城県", 38.26889, 140.87194),
    ("秋田県", 39.71861, 140.10250),
    ("山形県", 38.24056, 140.36333),
    ("福島県", 37.75000, 140.46778),
    ("茨城県", 36.34139, 140.44667),
    ("栃木県", 36.56583, 139.88361),
    ("群馬県", 36.39111, 139.06083),
    ("埼玉県", 35.85694, 139.64889),
    ("千葉県", 35.60472, 140.12333),
    ("東京都", 35.68944, 139.69167),
    ("神奈川県", 35.44778, 139.64250),
    ("新潟県", 37.90222, 139.02361),
    ("富山県", 36.69528, 137.21139),
    ("石川県", 36.59444, 136.62556),
    ("福井県", 36.06528, 136.22194),
    ("山梨県", 35.66389, 138.56833),
    ("長野県", 36.65139, 138.18111),
    ("岐阜県", 35.39111, 136.72222),
    ("静岡県", 34.97694, 138.38306),
    ("愛知県", 35.18028, 136.90667),
    ("三重県", 34.73028, 136.50861),
    ("滋賀県", 35.00444, 135.86833),
    ("京都府", 35.02139, 135.75556),
    ("大阪府", 34.68639, 135.52000),
    ("兵庫県", 34.69139, 135.18306),
    ("奈良県", 34.68528, 135.83278),
    ("和歌山県", 34.22611, 135.16750),
    ("鳥取県", 35.50361, 134.23833),
    ("島根県", 35.47222, 133.05056),
    ("岡山県", 34.66167, 133.93500),
    ("広島県", 34.39639, 132.45944),
    ("山口県", 34.18583, 131.47139),
    ("徳島県", 34.06583, 134.55944),
    ("香川県", 34.34028, 134.04333),
    ("愛媛県", 33.84167, 132.76611),
    ("高知県", 33.55972, 133.53111),
    ("福岡県", 33.60639, 130.41806),
    ("佐賀県", 33.24944, 130.29889),
    ("長崎県", 32.74472, 129.87361),
    ("熊本県", 32.78972, 130.74167),
    ("大分県", 33.23806, 131.61250),
    ("宮崎県", 31.91111, 131.42389),
    ("鹿児島県", 31.56028, 130.55806),
    ("沖縄県", 26.21250, 127.68111),
]

def distance_m(lat1, lon1, lat2, lon2):
    """2地点間の大円距離（メートル）を計算"""
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def calculate_polygon_metrics(coords):
    """
    閉じたポリゴン頂点リスト [[lon, lat], ...] から面積(m²)、外周長(m)、BBoxを計算
    """
    if not coords or len(coords) < 3:
        return 0.0, 0.0, [0.0, 0.0, 0.0, 0.0]

    min_lon = min(p[0] for p in coords)
    max_lon = max(p[0] for p in coords)
    min_lat = min(p[1] for p in coords)
    max_lat = max(p[1] for p in coords)
    bbox = [round(min_lon, 6), round(min_lat, 6), round(max_lon, 6), round(max_lat, 6)]

    mid_lat = math.radians((min_lat + max_lat) / 2.0)
    m_per_deg_lat = 110574.0
    m_per_deg_lon = 111320.0 * math.cos(mid_lat)

    pts = [(p[0] * m_per_deg_lon, p[1] * m_per_deg_lat) for p in coords]
    area = 0.0
    perimeter = 0.0
    n = len(pts)
    for i in range(n - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        area += (x1 * y2 - x2 * y1)
        perimeter += math.hypot(x2 - x1, y2 - y1)
    area = abs(area) / 2.0
    return round(area, 1), round(perimeter, 1), bbox

def generate_footprint_polygon(lat, lon, target_area_m2, aspect_ratio=1.35):
    """
    中心座標と指定面積(m²)から、統計モデル用敷地矩形ポリゴン(GeoJSON座標形式)を生成
    """
    if target_area_m2 <= 0:
        target_area_m2 = 10000.0

    mid_lat = math.radians(lat)
    m_per_deg_lat = 110574.0
    m_per_deg_lon = 111320.0 * math.cos(mid_lat)

    width_m = math.sqrt(target_area_m2 * aspect_ratio)
    height_m = math.sqrt(target_area_m2 / aspect_ratio)

    d_lon = (width_m / 2.0) / m_per_deg_lon
    d_lat = (height_m / 2.0) / m_per_deg_lat

    poly = [
        [round(lon - d_lon, 6), round(lat - d_lat, 6)],
        [round(lon + d_lon, 6), round(lat - d_lat, 6)],
        [round(lon + d_lon, 6), round(lat + d_lat, 6)],
        [round(lon - d_lon, 6), round(lat + d_lat, 6)],
        [round(lon - d_lon, 6), round(lat - d_lat, 6)],
    ]
    calc_area, perimeter, bbox = calculate_polygon_metrics(poly)
    return poly, calc_area, perimeter, bbox

def parse_area_str(text):
    """
    DuckDB内のテキストから敷地面積・延床面積(m²)を抽出
    例: '95,157 m² (敷地面積 145,822 m²)', '商業施設面積: 39,486㎡（敷地面積: 約97,988㎡）'
    """
    if not text:
        return None, None
    site_m2 = None
    floor_m2 = None

    # 敷地面積抽出
    m_site = re.search(r"敷地(?:面積)?[^\d]*?([0-9,]+(?:\.[0-9]+)?)\s*(?:m²|㎡|平米)", text)
    if m_site:
        try:
            site_m2 = float(m_site.group(1).replace(",", ""))
        except ValueError:
            pass

    # 商業/売場/延床/店舗面積抽出
    m_floor = re.search(r"(?:商業施設面積|直営売場面積|売場面積|延床面積|店舗面積|総賃貸面積)[^\d]*?([0-9,]+(?:\.[0-9]+)?)\s*(?:m²|㎡|平米)", text)
    if m_floor:
        try:
            floor_m2 = float(m_floor.group(1).replace(",", ""))
        except ValueError:
            pass

    # フォールバック抽出
    if not site_m2 and not floor_m2:
        m_any = re.search(r"([0-9,]+(?:\.[0-9]+)?)\s*(?:m²|㎡|平米)", text)
        if m_any:
            try:
                val = float(m_any.group(1).replace(",", ""))
                floor_m2 = val
                site_m2 = round(val * 1.5, 1)
            except ValueError:
                pass

    if site_m2 and not floor_m2:
        floor_m2 = round(site_m2 * 0.45, 1)
    if floor_m2 and not site_m2:
        site_m2 = round(floor_m2 * 1.6, 1)

    return site_m2, floor_m2

def determine_mall_type(name, tags=None):
    """施設名やタグからモール種別を判定"""
    if not tags:
        tags = {}
    if "イオンモール" in name or tags.get("mall") == "yes":
        return "イオンモール"
    elif "イオンスタイル" in name:
        return "イオンスタイル"
    elif "イオンタウン" in name or "イオンショッピングセンター" in name or "SC" in name or "ＳＣ" in name:
        return "イオンショッピングセンター"
    else:
        return "一般イオン"

def extract_address(tags, lat, lon, name=""):
    """タグ情報・店舗名・近傍都道府県中心座標から住所情報を抽出"""
    province = tags.get("addr:province") or tags.get("addr:prefecture") or ""
    city = tags.get("addr:city") or ""
    suburb = tags.get("addr:suburb") or tags.get("addr:quarter") or tags.get("addr:neighbourhood") or ""
    street = tags.get("addr:street") or ""
    housenumber = tags.get("addr:housenumber") or ""
    full_addr = tags.get("addr:full") or ""

    if not province:
        for pref, _, _ in PREFECTURE_CENTROIDS:
            if pref in full_addr or (city and pref in city) or pref in name:
                province = pref
                break

    if not province:
        best_pref = "東京都"
        min_dist_sq = float("inf")
        lat_rad = math.radians(lat)
        for pref, c_lat, c_lon in PREFECTURE_CENTROIDS:
            d_lat = lat - c_lat
            d_lon = (lon - c_lon) * math.cos(lat_rad)
            dist_sq = d_lat * d_lat + d_lon * d_lon
            if dist_sq < min_dist_sq:
                min_dist_sq = dist_sq
                best_pref = pref
        province = best_pref

    if not city and full_addr:
        m = re.search(r"(\w+?[市区町村])", full_addr)
        if m:
            city = m.group(1)

    parts = [province, city, suburb, street, housenumber]
    combined = "".join(p for p in parts if p).strip()
    if not combined and full_addr:
        combined = full_addr
    if not combined:
        combined = f"{province} {city}".strip()
    if not combined:
        combined = f"{province} (緯度:{lat:.4f}, 経度:{lon:.4f})"

    return {
        "prefecture": province,
        "city": city,
        "formatted": combined,
    }

def clean_facility_name(raw_name):
    if not raw_name:
        return ""
    return raw_name.strip()

def is_valid_store(elem, tags, name):
    """商業施設・店舗としての妥当性判定"""
    if not name:
        return False

    if elem.get("type") == "relation" and tags.get("type") == "route":
        return False
    if tags.get("route") or tags.get("highway") in ["bus_stop", "platform"] or tags.get("public_transport"):
        return False
    if any(p in name for p in ["=>", "⇒", "～", "系統", "行", "線", "のりば", "バス停", "停留所"]):
        return False
    if name.startswith("Bus ") or name.startswith("bus "):
        return False

    if not (name.startswith("イオン") or name.startswith("AEON") or name.startswith("イオンスタイル")):
        if not (tags.get("shop") == "mall" and "イオンモール" in name):
            return False

    exclude_keywords = [
        "バス停", "停留所", "のりば", "駐車場", "駐輪場", "ATM", "SS", "給油所",
        "配送センター", "流通センター", "物流センター", "プロセスセンター",
        "研修センター", "事務所", "事務所棟", "管理事務所"
    ]
    for kw in exclude_keywords:
        if kw in name:
            return False

    if name in ["イオン", "AEON", "イオンモール", "イオンスタイル"]:
        return False

    return True

def query_overpass(query_text, query_desc="Overpass Query"):
    headers = {
        "User-Agent": "Aeon3DGIS/1.0 (Project PLATEAU Visualizer; contact@aeon3d.local)",
        "Accept": "application/json",
    }
    data = {"data": query_text}

    for endpoint in OVERPASS_ENDPOINTS:
        print(f"[+] Overpass API へリクエスト送信中 ({query_desc}): {endpoint} ...")
        try:
            resp = requests.post(endpoint, data=data, headers=headers, timeout=90)
            if resp.status_code == 200:
                print(f"[✓] データ受信成功 ({len(resp.content)} bytes)")
                return resp.json()
            else:
                print(f"[!] エンドポイント {endpoint} から HTTP {resp.status_code} が返却されました")
        except Exception as e:
            print(f"[!] エンドポイント {endpoint} 接続エラー: {e}")
        time.sleep(2)
    return None

def fetch_from_overpass():
    res = query_overpass(OVERPASS_QL_BBOX, "全国BBOXクエリ (外形ジオメトリ付)")
    if res and "elements" in res and len(res["elements"]) > 0:
        return res

    print("[!] BBOXクエリ失敗。エリア指定クエリを試行します...")
    res = query_overpass(OVERPASS_QL_AREA, "エリア指定クエリ")
    if res and "elements" in res and len(res["elements"]) > 0:
        return res

    return None

def extract_osm_polygon(elem):
    """
    OSM elementから外形閉曲線ポリゴン座標 [[lon, lat], ...] を抽出
    """
    elem_type = elem.get("type")
    coords = []

    if elem_type == "way" and "geometry" in elem:
        raw_geom = elem["geometry"]
        if len(raw_geom) >= 3:
            coords = [[round(pt["lon"], 6), round(pt["lat"], 6)] for pt in raw_geom]
            if coords[0] != coords[-1]:
                coords.append(coords[0])

    elif elem_type == "relation" and "members" in elem:
        for m in elem["members"]:
            if m.get("role") in ["outer", ""] and "geometry" in m and len(m["geometry"]) >= 3:
                coords = [[round(pt["lon"], 6), round(pt["lat"], 6)] for pt in m["geometry"]]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                break

    if len(coords) >= 4:
        calc_area, perimeter, bbox = calculate_polygon_metrics(coords)
        if calc_area > 150: # 有効な建築物・敷地サイズ
            return coords, calc_area, perimeter, bbox

    return None, 0.0, 0.0, None

def process_osm_elements(raw_data):
    elements = raw_data.get("elements", [])
    print(f"[+] OSM取得エレメント総数: {len(elements)} 件")

    raw_candidates = []
    for elem in elements:
        elem_type = elem.get("type", "node")
        elem_id = elem.get("id")
        tags = elem.get("tags", {})
        raw_name = tags.get("name") or tags.get("name:ja") or tags.get("official_name")

        # 座標抽出
        if elem_type == "node":
            lat = elem.get("lat")
            lon = elem.get("lon")
        else:
            center = elem.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")

        # 外形ポリゴン抽出
        osm_poly, osm_area, osm_peri, osm_bbox = extract_osm_polygon(elem)

        if (lat is None or lon is None) and osm_bbox:
            lon = (osm_bbox[0] + osm_bbox[2]) / 2.0
            lat = (osm_bbox[1] + osm_bbox[3]) / 2.0

        if lat is None or lon is None:
            continue

        lat = float(lat)
        lon = float(lon)

        name = clean_facility_name(raw_name)
        if not is_valid_store(elem, tags, name):
            continue

        mall_type = determine_mall_type(name, tags)
        addr_info = extract_address(tags, lat, lon, name)

        type_priority = 3 if elem_type == "relation" else (2 if elem_type == "way" else 1)

        raw_candidates.append({
            "id": f"{elem_type}/{elem_id}",
            "osm_id": elem_id,
            "osm_type": elem_type,
            "name": name,
            "name_en": tags.get("name:en") or tags.get("int_name") or "",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "brand": tags.get("brand") or "イオン",
            "brand_wikidata": tags.get("brand:wikidata") or "Q305335",
            "mall_type": mall_type,
            "prefecture": addr_info["prefecture"],
            "city": addr_info["city"],
            "address": addr_info["formatted"],
            "website": tags.get("website") or tags.get("contact:website") or "",
            "opening_hours": tags.get("opening_hours") or "",
            "phone": tags.get("phone") or tags.get("contact:phone") or "",
            "opening_year": "",
            "area": "",
            "former_building": "",
            "demand_and_features": "",
            "source": "OpenStreetMap",
            "priority": type_priority,
            "osm_polygon": osm_poly,
            "osm_area": osm_area,
            "osm_perimeter": osm_peri,
            "osm_bbox": osm_bbox,
        })

    raw_candidates.sort(key=lambda x: x["priority"], reverse=True)

    deduped = []
    for cand in raw_candidates:
        is_duplicate = False
        for existing in deduped:
            d = distance_m(cand["lat"], cand["lon"], existing["lat"], existing["lon"])
            if cand["name"] == existing["name"] and d < 1500:
                is_duplicate = True
                if cand.get("osm_polygon") and not existing.get("osm_polygon"):
                    existing["osm_polygon"] = cand["osm_polygon"]
                    existing["osm_area"] = cand["osm_area"]
                    existing["osm_perimeter"] = cand["osm_perimeter"]
                    existing["osm_bbox"] = cand["osm_bbox"]
                break
            if d < 400:
                core_cand = re.sub(r"イオンモール|イオンスタイル|イオンショッピングセンター|イオンタウン|イオン|店|\s", "", cand["name"])
                core_existing = re.sub(r"イオンモール|イオンスタイル|イオンショッピングセンター|イオンタウン|イオン|店|\s", "", existing["name"])
                if core_cand and core_existing and (core_cand in core_existing or core_existing in core_cand):
                    if cand["mall_type"] == "イオンモール" and existing["mall_type"] != "イオンモール":
                        existing["name"] = cand["name"]
                        existing["mall_type"] = "イオンモール"
                    if cand.get("osm_polygon") and not existing.get("osm_polygon"):
                        existing["osm_polygon"] = cand["osm_polygon"]
                        existing["osm_area"] = cand["osm_area"]
                        existing["osm_perimeter"] = cand["osm_perimeter"]
                        existing["osm_bbox"] = cand["osm_bbox"]
                    is_duplicate = True
                    break
        if not is_duplicate:
            deduped.append(cand)

    return deduped

def load_and_enrich_from_duckdb(base_locations, db_path):
    """
    aeon_stores.duckdb を読み込み、OSMデータと統合・補完する。
    1. 既存のOSM店舗（特にイオンモール）に対し、至近距離または名称一致する詳細情報を付与。
    2. OSMに含まれていないDuckDB内の一般イオン・イオンスタイル店舗を追加。
    """
    if not os.path.exists(db_path):
        print(f"[!] DuckDBファイルが見つかりません: {db_path}")
        return base_locations

    print(f"[+] aeon_stores.duckdb を読み込み中: {db_path} ...")
    con = duckdb.connect(db_path, read_only=True)
    rows = con.execute("""
        SELECT m.name, m.address, m.prefecture, m.municipality, m.latitude, m.longitude,
               d.opening_year, d.area, d.former_building, d.demand_and_features
        FROM aeon_master m
        LEFT JOIN aeon_details d ON m.name = d.name
        WHERE m.latitude IS NOT NULL AND m.longitude IS NOT NULL
    """).fetchall()
    print(f"[✓] aeon_stores.duckdb から {len(rows)} 件の拠点レコードを読み込みました")

    enriched_count = 0
    used_db_indices = set()

    for osm in base_locations:
        best_match = None
        best_dist = float("inf")
        best_idx = None

        for idx, row in enumerate(rows):
            db_name, db_addr, db_pref, db_city, db_lat, db_lon, op_year, area, former, features = row
            d = distance_m(osm["lat"], osm["lon"], db_lat, db_lon)

            core_osm = re.sub(r"イオンモール|イオンスタイル|イオンショッピングセンター|イオンタウン|イオン|店|\s", "", osm["name"])
            core_db = re.sub(r"イオンモール|イオンスタイル|イオンショッピングセンター|イオンタウン|イオン|店|\s", "", db_name)
            name_similar = (core_osm and core_db and (core_osm in core_db or core_db in core_osm))

            if (d < 600 or (name_similar and d < 2000)) and d < best_dist:
                best_dist = d
                best_match = row
                best_idx = idx

        if best_match:
            db_name, db_addr, db_pref, db_city, db_lat, db_lon, op_year, area, former, features = best_match
            osm["opening_year"] = op_year or ""
            osm["area"] = area or ""
            osm["former_building"] = former or ""
            osm["demand_and_features"] = features or ""
            if not osm["address"] or "位置座標" in osm["address"]:
                osm["address"] = db_addr or osm["address"]
            enriched_count += 1
            if best_idx is not None:
                used_db_indices.add(best_idx)

    print(f"[✓] 既存OSM拠点のうち {enriched_count} 件に詳細情報（開業年・面積・沿革・特徴）を付与しました")

    added_from_db = 0
    for idx, row in enumerate(rows):
        if idx in used_db_indices:
            continue

        db_name, db_addr, db_pref, db_city, db_lat, db_lon, op_year, area, former, features = row

        too_close = False
        for ex in base_locations:
            if distance_m(db_lat, db_lon, ex["lat"], ex["lon"]) < 450:
                too_close = True
                break
        if too_close:
            continue

        mall_type = determine_mall_type(db_name)

        base_locations.append({
            "id": f"duckdb/{idx + 1}",
            "osm_id": f"db_{idx + 1}",
            "osm_type": "duckdb",
            "name": db_name,
            "name_en": "",
            "lat": round(float(db_lat), 6),
            "lon": round(float(db_lon), 6),
            "brand": "イオン",
            "brand_wikidata": "Q305335",
            "mall_type": mall_type,
            "prefecture": db_pref or "",
            "city": db_city or "",
            "address": db_addr or f"{db_pref} {db_city}".strip(),
            "website": "",
            "opening_hours": "",
            "phone": "",
            "opening_year": op_year or "",
            "area": area or "",
            "former_building": former or "",
            "demand_and_features": features or "",
            "source": "aeon_stores.duckdb",
            "priority": 1,
            "osm_polygon": None,
            "osm_area": 0.0,
            "osm_perimeter": 0.0,
            "osm_bbox": None,
        })
        added_from_db += 1

    print(f"[✓] aeon_stores.duckdb から {added_from_db} 件の一般店舗・スタイル店舗を追加しました")
    return base_locations

KNOWN_STORE_CALIBRATIONS = {
    'イオン札幌栄町店': {'lat': 43.11393, 'lon': 141.36762, 'address': '北海道札幌市東区北42条東16-1-5'},
    'イオン札幌麻生店': {'lat': 43.10722, 'lon': 141.33972, 'address': '北海道札幌市北区北39条西4-1-5'},
    'イオン札幌桑園店': {'lat': 43.06937, 'lon': 141.33312, 'address': '北海道札幌市中央区北8条西14-28'},
    'イオン札幌元町店': {'lat': 43.10160, 'lon': 141.36815, 'address': '北海道札幌市東区北31条東15-1-1'},
    'イオン札幌琴似店': {'lat': 43.07672, 'lon': 141.30294, 'address': '北海道札幌市西区琴似2条4-2-2'},
    'イオン札幌西町店': {'lat': 43.07812, 'lon': 141.28880, 'address': '北海道札幌市西区西町南6-1-1'},
    'イオン札幌藻岩店': {'lat': 42.99944, 'lon': 141.33639, 'address': '北海道札幌市南区川沿2条2-1-1'},
    'イオン札幌西岡店': {'lat': 43.01899, 'lon': 141.38726, 'address': '北海道札幌市豊平区西岡3条3-4-1'},
    'イオン東札幌店': {'lat': 43.05274, 'lon': 141.38520, 'address': '北海道札幌市白石区東札幌3条2-1'},
    'イオン札幌厚別店': {'lat': 43.05333, 'lon': 141.46917, 'address': '北海道札幌市厚別区厚別西4条6-700-126'},
    'イオン札幌手稲駅前店': {'lat': 43.12036, 'lon': 141.24510, 'address': '北海道札幌市手稲区前田1条11-1-1'},
    'イオン新さっぽろ店': {'lat': 43.03818, 'lon': 141.47158, 'address': '北海道札幌市厚別区厚別中央2条5-7-1'},
    'イオン南平岸店': {'lat': 43.02678, 'lon': 141.37033, 'address': '北海道札幌市豊平区平岸3条13-6-1'},
}

def finalize_locations_with_polygons(locations):
    """
    全店舗に対して、空間統計モデルで使用可能な敷地ポリゴン(GeoJSON Polygon)、
    敷地面積(m²)、延床面積(m²)、外周長(m)、BBox、3D推定高(m)を確定する。
    """
    for loc in locations:
        if loc.get("name") in KNOWN_STORE_CALIBRATIONS:
            calib = KNOWN_STORE_CALIBRATIONS[loc["name"]]
            loc["lat"] = calib["lat"]
            loc["lon"] = calib["lon"]
            if calib.get("address"):
                loc["address"] = calib["address"]

        site_m2, floor_m2 = parse_area_str(loc.get("area", ""))
        mall_type = loc.get("mall_type", "一般イオン")

        # 3D推定建物高 (メートル)
        if mall_type == "イオンモール":
            height_est = 22.0
            default_site = 65000.0
            default_floor = 45000.0
        elif mall_type == "イオンスタイル":
            height_est = 16.0
            default_site = 18000.0
            default_floor = 12000.0
        elif mall_type == "イオンショッピングセンター":
            height_est = 14.0
            default_site = 25000.0
            default_floor = 15000.0
        else:
            height_est = 12.0
            default_site = 9000.0
            default_floor = 5000.0

        loc["building_height_est_m"] = height_est

        # 敷地面積・延床面積の補完
        if not site_m2:
            site_m2 = loc.get("osm_area") if loc.get("osm_area", 0) > 200 else default_site
        if not floor_m2:
            floor_m2 = round(site_m2 * 0.55, 1) if site_m2 else default_floor

        loc["site_area_m2"] = round(site_m2, 1)
        loc["floor_area_m2"] = round(floor_m2, 1)

        # 敷地ポリゴンの決定: OSMポリゴンが存在すれば優先、無ければ実面積から高精度矩形を生成
        if loc.get("osm_polygon") and len(loc["osm_polygon"]) >= 4:
            poly_coords = loc["osm_polygon"]
            calc_area, perimeter, bbox = calculate_polygon_metrics(poly_coords)
            loc["polygon_coordinates"] = poly_coords
            loc["calculated_area_m2"] = calc_area
            loc["perimeter_m"] = perimeter
            loc["bbox"] = bbox
            loc["polygon_source"] = "OSM_exact_footprint"
        else:
            poly_coords, calc_area, perimeter, bbox = generate_footprint_polygon(
                loc["lat"], loc["lon"], loc["site_area_m2"]
            )
            loc["polygon_coordinates"] = poly_coords
            loc["calculated_area_m2"] = calc_area
            loc["perimeter_m"] = perimeter
            loc["bbox"] = bbox
            loc["polygon_source"] = "DuckDB_area_derived"

        # 一時作業用キーの削除
        loc.pop("osm_polygon", None)
        loc.pop("osm_area", None)
        loc.pop("osm_perimeter", None)
        loc.pop("osm_bbox", None)

    return locations

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(repo_root, "public", "data")
    os.makedirs(output_dir, exist_ok=True)
    output_json_path = os.path.join(output_dir, "aeon_locations.json")
    output_geojson_path = os.path.join(output_dir, "aeon_polygons.geojson")
    duckdb_path = os.path.join(repo_root, "aeon_stores.duckdb")

    print("[*] 日本国内のイオン・イオンモールデータ収集・統合を開始します...")

    locations = None
    raw_data = fetch_from_overpass()
    if raw_data:
        locations = process_osm_elements(raw_data)
        print(f"[+] OSM抽出店舗数: {len(locations)} 件")
    else:
        print("[!] Overpass API からの最新取得がタイムアウトしたため、既存の aeon_locations.json をベースにポリゴン構築・統合します...")
        if os.path.exists(output_json_path):
            with open(output_json_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                locations = existing_data.get("locations", [])
                print(f"[+] 既存データから {len(locations)} 件を読み込みました")

    if not locations:
        raise RuntimeError("有効な拠点データを取得できませんでした。")

    # DuckDB によるエンリッチメント・補完
    if HAS_DUCKDB and os.path.exists(duckdb_path):
        locations = load_and_enrich_from_duckdb(locations, duckdb_path)

    # 敷地ポリゴン・空間統計メトリクスの確定
    locations = finalize_locations_with_polygons(locations)

    # ソート（都道府県順 -> モール優先 -> 店舗名順）
    pref_order = {p[0]: i for i, p in enumerate(PREFECTURE_CENTROIDS)}
    locations.sort(key=lambda x: (
        pref_order.get(x["prefecture"], 99),
        0 if x["mall_type"] == "イオンモール" else (1 if x["mall_type"] == "イオンスタイル" else 2),
        x["name"]
    ))

    stats = {
        "total": len(locations),
        "aeon_mall": sum(1 for x in locations if x["mall_type"] == "イオンモール"),
        "aeon_style": sum(1 for x in locations if x["mall_type"] == "イオンスタイル"),
        "aeon_sc": sum(1 for x in locations if x["mall_type"] == "イオンショッピングセンター"),
        "general_aeon": sum(1 for x in locations if x["mall_type"] == "一般イオン"),
        "with_exact_osm_polygon": sum(1 for x in locations if x.get("polygon_source") == "OSM_exact_footprint"),
        "with_area_derived_polygon": sum(1 for x in locations if x.get("polygon_source") == "DuckDB_area_derived"),
    }

    # 1. 3D WebGIS用 aeon_locations.json
    result_webgis = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "日本全国のイオン・イオンモール統合拠点・敷地範囲データ (PLATEAU 3D / 空間統計用)",
            "source": "OpenStreetMap contributors (Overpass API) & aeon_stores.duckdb",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stats": stats,
        },
        "features": [
            {
                "type": "Feature",
                "id": loc["id"],
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [loc["polygon_coordinates"]],
                },
                "properties": {
                    "id": loc["id"],
                    "name": loc["name"],
                    "name_en": loc["name_en"],
                    "center": [loc["lon"], loc["lat"]],
                    "lat": loc["lat"],
                    "lon": loc["lon"],
                    "brand": loc["brand"],
                    "mall_type": loc["mall_type"],
                    "prefecture": loc["prefecture"],
                    "city": loc["city"],
                    "address": loc["address"],
                    "site_area_m2": loc["site_area_m2"],
                    "floor_area_m2": loc["floor_area_m2"],
                    "perimeter_m": loc["perimeter_m"],
                    "building_height_est_m": loc["building_height_est_m"],
                    "bbox": loc["bbox"],
                    "polygon_source": loc["polygon_source"],
                    "opening_year": loc["opening_year"],
                    "area": loc["area"],
                    "former_building": loc["former_building"],
                    "demand_and_features": loc["demand_and_features"],
                    "website": loc["website"],
                    "opening_hours": loc["opening_hours"],
                    "phone": loc["phone"],
                    "source": loc["source"],
                }
            }
            for loc in locations
        ],
        "locations": locations,
    }

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(result_webgis, f, ensure_ascii=False, indent=2)

    # 2. 空間統計モデル・GIS直接読み込み用 GeoJSON (Polygon)
    with open(output_geojson_path, "w", encoding="utf-8") as f:
        json.dump({
            "type": "FeatureCollection",
            "name": "aeon_sites_polygon",
            "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
            "features": result_webgis["features"]
        }, f, ensure_ascii=False, indent=2)

    print(f"[✓] 統合データを保存しました:")
    print(f"    - WebGIS用データ: {output_json_path}")
    print(f"    - 統計モデル用GeoJSON: {output_geojson_path}")
    print(f"    - 総店舗数: {stats['total']}")
    print(f"    - イオンモール: {stats['aeon_mall']}")
    print(f"    - イオンスタイル: {stats['aeon_style']}")
    print(f"    - イオンSC/タウン: {stats['aeon_sc']}")
    print(f"    - 一般イオン: {stats['general_aeon']}")
    print(f"    - OSM実外形ポリゴン: {stats['with_exact_osm_polygon']}")
    print(f"    - 敷地面積導出ポリゴン: {stats['with_area_derived_polygon']}")

if __name__ == "__main__":
    main()
