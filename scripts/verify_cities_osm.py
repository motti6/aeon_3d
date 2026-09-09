#!/usr/bin/env python3
"""
scripts/verify_cities_osm.py
仙台・広島・福岡エリアのイオン店舗について、OpenStreetMap公式APIと照合し
実測の建物外形ポリゴン（OSM_exact_footprint）を取得・補正するスクリプト。
"""

import json
import urllib.request
import xml.etree.ElementTree as ET
import time
import math

def get_building_for_store(lat, lon, store_name):
    # Try searching with bounding box
    delta = 0.0035
    bbox = f'{lon-delta},{lat-delta*0.75},{lon+delta},{lat+delta*0.75}'
    url = f'https://api.openstreetmap.org/api/0.6/map?bbox={bbox}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Aeon3DResearch/1.0 (watanabemotosan@gmail.com)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            tree = ET.fromstring(resp.read())
            nodes = {n.attrib['id']: (float(n.attrib['lon']), float(n.attrib['lat'])) for n in tree.findall('node')}
            ways = tree.findall('way')
            
            candidates = []
            for w in ways:
                tags = {t.attrib['k']: t.attrib['v'] for t in w.findall('tag')}
                if 'building' in tags:
                    nd_refs = [nd.attrib['ref'] for nd in w.findall('nd')]
                    pts = [nodes[ref] for ref in nd_refs if ref in nodes]
                    if len(pts) >= 4:
                        bname = tags.get('name', tags.get('name:ja', ''))
                        bldg = tags.get('building', '')
                        levels = float(tags.get('building:levels', '3')) if tags.get('building:levels', '').replace('.', '').isdigit() else 3.0
                        
                        lons = [p[0] for p in pts]
                        lats = [p[1] for p in pts]
                        c_lon = sum(lons) / len(lons)
                        c_lat = sum(lats) / len(lats)
                        
                        # Distance to query lat/lon
                        dist = math.sqrt((c_lon - lon)**2 + (c_lat - lat)**2)
                        
                        # Approximate area
                        width = (max(lons) - min(lons)) * 111000 * math.cos(math.radians(lat))
                        height = (max(lats) - min(lats)) * 111000
                        approx_area = width * height
                        
                        score = 0
                        # Name matching
                        clean_name = store_name.replace('イオンモール', '').replace('イオンスタイル', '').replace('イオン', '').replace('店', '').strip()
                        if clean_name and (clean_name in bname or bname in clean_name):
                            score += 200
                        if any(k in bname for k in ['イオン', 'AEON', 'ダイエー', 'サティ', 'ジャスコ']):
                            score += 150
                        if bldg in ['retail', 'supermarket', 'commercial', 'mall']:
                            score += 50
                        
                        # Big buildings in the vicinity
                        score += min(100, approx_area / 200)
                        # Penalty for distance
                        score -= dist * 10000
                        
                        candidates.append({
                            'score': score,
                            'way_id': w.attrib['id'],
                            'name': bname,
                            'bldg': bldg,
                            'levels': levels,
                            'pts': pts,
                            'area_m2': approx_area,
                            'centroid': (round(c_lon, 6), round(c_lat, 6)),
                            'bbox': [round(min(lons), 6), round(min(lats), 6), round(max(lons), 6), round(max(lats), 6)]
                        })
            
            if candidates:
                candidates.sort(key=lambda x: x['score'], reverse=True)
                best = candidates[0]
                if best['score'] > 20: # reasonable match threshold
                    return best
    except Exception as e:
        print(f'    [!] OSM fetch error for {store_name}: {e}')
    return None

def compute_perimeter(pts):
    perimeter = 0.0
    for i in range(len(pts) - 1):
        p1 = pts[i]
        p2 = pts[i+1]
        dx = (p2[0] - p1[0]) * 111000 * math.cos(math.radians(p1[1]))
        dy = (p2[1] - p1[1]) * 111000
        perimeter += math.sqrt(dx*dx + dy*dy)
    return round(perimeter, 1)

def main():
    print('[1] Loading public/data/aeon_locations.json...')
    with open('public/data/aeon_locations.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    locations = data.get('locations', [])
    features = data.get('features', [])
    
    target_prefs = ['宮城県', '広島県', '福岡県']
    
    updated_count = 0
    
    for loc in locations:
        pref = loc.get('prefecture', '')
        if pref not in target_prefs:
            continue
            
        current_src = loc.get('polygon_source')
        name = loc.get('name')
        store_id = loc.get('id')
        lat = loc.get('lat')
        lon = loc.get('lon')
        
        # Special fixes for known names:
        if '福津郵便局' in name:
            loc['name'] = 'イオンモール福津'
            loc['mall_type'] = 'イオンモール'
            name = 'イオンモール福津'
            print(f'[*] Corrected name to: {name}')
        if '名取内郵便局' in name:
            loc['name'] = 'イオンモール名取'
            loc['mall_type'] = 'イオンモール'
            name = 'イオンモール名取'
            print(f'[*] Corrected name to: {name}')

        # If already exact and has >= 6 points, skip
        pts_count = len(loc.get('polygon_coordinates', []))
        if current_src == 'OSM_exact_footprint' and pts_count >= 6:
            print(f'[-] Already exact footprint: {name} ({pts_count} pts)')
            continue

        print(f'[*] Searching exact building for: {name} ({pref}) at ({lat}, {lon})...')
        res = get_building_for_store(lat, lon, name)
        
        if res and len(res['pts']) >= 4:
            pts = res['pts']
            # Ensure closed polygon
            if pts[0] != pts[-1]:
                pts.append(pts[0])
                
            loc['polygon_coordinates'] = pts
            loc['polygon_source'] = 'OSM_exact_footprint'
            loc['lon'] = res['centroid'][0]
            loc['lat'] = res['centroid'][1]
            loc['bbox'] = res['bbox']
            loc['site_area_m2'] = round(res['area_m2'] * 1.6, 1) # site area typically 1.5 - 2x footprint
            loc['floor_area_m2'] = round(res['area_m2'] * res['levels'], 1)
            loc['perimeter_m'] = compute_perimeter(pts)
            loc['building_height_est_m'] = round(res['levels'] * 4.0, 1)
            
            wid = res['way_id']
            wname = res['name'] or res['bldg']
            print(f"    [✓] Found way/{wid} ({wname}) -> {len(pts)} nodes, center: {loc['lat']}, {loc['lon']}")
            updated_count += 1
            time.sleep(1.2)
        else:
            print(f'    [?] No confident building found for {name}')
            time.sleep(0.5)

    print(f'\n[2] Total updated stores: {updated_count}')
    
    # Sync with features
    loc_map = {l['id']: l for l in locations}
    for feat in features:
        fid = feat.get('id')
        if fid in loc_map:
            l = loc_map[fid]
            feat['properties'] = l.copy()
            if l.get('polygon_source') == 'OSM_exact_footprint' and l.get('polygon_coordinates'):
                feat['geometry'] = {
                    'type': 'Polygon',
                    'coordinates': [l['polygon_coordinates']]
                }

    print('[3] Writing updated public/data/aeon_locations.json...')
    with open('public/data/aeon_locations.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print('[4] Exporting public/data/aeon_polygons.geojson...')
    exact_features = [f for f in features if f.get('properties', {}).get('polygon_source') == 'OSM_exact_footprint']
    fc = {
        'type': 'FeatureCollection',
        'features': exact_features
    }
    with open('public/data/aeon_polygons.geojson', 'w', encoding='utf-8') as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)

    print(f'[✓] All done! Exact polygon count across Japan is now: {len(exact_features)}')

if __name__ == '__main__':
    main()
