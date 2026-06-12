#!/usr/bin/env node
// 浪浪虎 build.js — YAML → OSRM 道路曲线 → 完整 HTML 地图
// 用法: node build.js scripts/g331.yaml

const yaml = require('js-yaml');
const fs   = require('fs');
const https = require('https');

const [,, yamlPath] = process.argv;
if (!yamlPath) { console.error('用法: node build.js <config.yaml>'); process.exit(1); }

const cfg = yaml.load(fs.readFileSync(yamlPath, 'utf8'));

// ========== OSRM ==========
function osmGet(coordStr) {
  return new Promise((resolve, reject) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    https.get(url, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchRoutes(routes) {
  const result = {};
  for (const r of routes) {
    const pts = r.waypoints || r.segments;
    if (!pts || pts.length < 2) continue;
    // OSRM: lng,lat 顺序，分号分隔 (最多100个坐标点一请求)
    const coordStr = pts.map(p => `${p[1]},${p[0]}`).join(';');
    console.log(`  OSRM 拉取: ${r.name} (${pts.length} 个节点)...`);
    const json = await osmGet(coordStr);
    if (json.code === 'Ok' && json.routes?.[0]?.geometry?.coordinates) {
      // GeoJSON coords are [lng, lat], convert to [lat, lng]
      result[r.id] = json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      console.log(`    → ${result[r.id].length} 个坐标点`);
    } else {
      console.error(`    ✗ OSRM 失败: ${r.name}, 回退到原始 waypoints`);
      result[r.id] = pts.map(p => [p[0], p[1]]);
    }
  }
  return result;
}

// ========== HTML 生成 ==========
function coordsJS(arr) {
  return JSON.stringify(arr).replace(/],/g, '],\n  ');
}

function generateHTML(cfg, osmData) {
  const routes = cfg.routes;
  const flights = cfg.flightSegments || [];
  const stops = cfg.stops || [];
  const roadConds = cfg.roadConditions || [];
  const filters = cfg.filters || [];
  const title = cfg.title || '路线地图';
  const center = cfg.center || [49, 110];
  const zoom = cfg.zoom || 4;

  // 颜色变量
  const colorJs = routes.map(r => `var ${r.id.toUpperCase()}="${r.color}";`).join(' ');
  const colorsObj = {};
  routes.forEach(r => colorsObj[r.id] = r.color);

  // ====== 路由 polyline JS ======
  const routeJS = routes.map(r => {
    const data = osmData[r.id] || [];
    return `var ${r.id}_p = ${coordsJS(data)};`;
  }).join('\n\n');

  // ====== Route layer JS ======
  const layerJS = routes.map(r => {
    const dash = r.dashArray ? `, dashArray: "${r.dashArray}"` : '';
    return `layers.${r.id} = L.polyline(${r.id}_p, { color: "${r.color}", weight: ${r.style === 'solid' ? '3.5' : '2.5'}${dash}, lineJoin: "round" }).addTo(map);`;
  }).join('\n');

  // ====== Legend HTML ======
  const legendSections = routes.map(r => {
    const isSolid = r.style === 'solid';
    const dotStyle = isSolid
      ? `background:${r.color};`
      : `border-top:2px dotted ${r.color};height:0;background:none;`;
    return `<div class="legend-section">
      <span class="dot" style="${dotStyle}"></span>
      <div class="route-info">
        <div class="row-main">
          <span class="route-name" style="color:${r.color}">${r.name}</span>
          <span class="route-dist" id="dist-${r.id}">计算中...</span>
        </div>
        <span class="route-detail">${(r.waypoints || []).map((_,i,arr) => {
          // 用途经城市名
          const cityStops = stops.filter(s => arr.some(w => w[0] === s.lat && w[1] === s.lng));
          return cityStops.map(s => s.name).join(' → ') || '...';
        })}</span>
      </div>
    </div>`;
  }).join('\n');

  // ====== 飞航 segment JS ======
  const flightJS = flights.map((f, i) => {
    const coords = JSON.stringify([f.from, ...(f.mid ? [f.mid] : []), f.to]);
    return `layers.flight${i+1} = L.polyline(${coords}, {
  color: "#0891b2", weight: 1.5, opacity: 0.7, dashArray: "6, 8", lineJoin: "round"
}).bindTooltip("${f.label}", {direction: "right", sticky: true}).addTo(map);`;
  }).join('\n\n');

  // ====== Stops JS ======
  const startStops = stops.filter(s => s.node_type === 'start');
  const endStops = stops.filter(s => s.node_type === 'end');
  const diamondStops = stops.filter(s => s.label_type === 'diamond');
  const labelStops = stops.filter(s => s.label && s.node_type !== 'start' && s.node_type !== 'end' && s.label_type !== 'diamond');
  const circleStops = stops.filter(s => !s.label && s.label_type !== 'diamond' && s.node_type !== 'start' && s.node_type !== 'end' && s.node_type !== 'flight');
  const flightStops = stops.filter(s => s.node_type === 'flight');

  const stopJS = [];

  // 起点
  startStops.forEach(s => {
    const color = colorsObj[s.route] || cfg.routes[0].color;
    stopJS.push(`// 起点: ${s.name}
otherMarkers.push(L.circleMarker([${s.lat},${s.lng}], {radius:8,fillColor:"${color}",color:"#fff",weight:2.5,fillOpacity:1}).bindTooltip("${s.label || s.name}", {direction:"top",className:"mini-tooltip"}));
otherMarkers.push(addLabel(${s.lat},${s.lng}, '<b style="font-size:11px;color:${color}">${s.label || '起点 · '+s.name}</b>'));`);
  });

  // 终点
  endStops.forEach(s => {
    const color = s.label_color || '#059669';
    stopJS.push(`// ${s.label || s.name}
otherMarkers.push(L.circleMarker([${s.lat},${s.lng}], {radius:7,fillColor:"${color}",color:"#fff",weight:2,fillOpacity:0.9}).bindTooltip("${s.name}", {direction:"top",className:"mini-tooltip"}));
otherMarkers.push(addLabel(${s.lat},${s.lng}, '<span style="font-size:10px;color:${color};font-weight:600">${s.label || s.name}</span>',150));`);
  });

  // 菱形口岸
  diamondStops.forEach(s => {
    const color = colorsObj[s.route] || cfg.routes[0].color;
    stopJS.push(`// 口岸: ${s.name}
portMarkers.push(L.marker([${s.lat},${s.lng}], {icon:diamondIcon("${color}")}).bindTooltip("${s.name}", {direction:"bottom",className:"mini-tooltip"}));`);
  });

  // 文字标注城市
  labelStops.forEach(s => {
    const color = s.label_color || '#9ca3af';
    stopJS.push(`// ${s.name}
otherMarkers.push(addCircle(${s.lat},${s.lng}, "${s.name}", "${color}"));
otherMarkers.push(addLabel(${s.lat},${s.lng}, '<span style="font-size:10px;color:${color};font-weight:600">${s.label || s.name}</span>',170));`);
  });

  // 途经小圆点
  circleStops.forEach(s => {
    stopJS.push(`otherMarkers.push(addCircle(${s.lat},${s.lng}, "${s.name}", "#9ca3af"));`);
  });

  // 飞航端
  flightStops.forEach(s => {
    stopJS.push(`// ${s.label || s.name}
otherMarkers.push(L.circleMarker([${s.lat},${s.lng}], {radius:6,fillColor:"#0891b2",color:"#fff",weight:2,fillOpacity:0.85}).bindTooltip("${s.name}", {direction:"top",className:"mini-tooltip"}));
otherMarkers.push(addLabel(${s.lat},${s.lng}, '<span style="font-size:10px;color:#0891b2;font-weight:600">${s.label || s.name}</span>',160));`);
  });

  // ====== 路况 ======
  const roadJS = roadConds.length > 0 ? `
// ── Road conditions ──
var segData = ${JSON.stringify(roadConds, null, 2)};
var segMarkers = [];
segData.forEach(function(s){
  var icon = L.divIcon({className:"",html:'<svg width="14" height="14"><polygon points="7,0 14,14 0,14" fill="#eab308" fill-opacity="0.65"/></svg>',iconSize:[14,14],iconAnchor:[7,10]});
  segMarkers.push(L.marker([s.lat,s.lng],{icon:icon}).bindTooltip('<b>'+s.title+'</b><br><span style="font-size:10px;color:#666">'+s.sub+'</span>',{className:"mini-tooltip",direction:"top"}));
});
var segGroup = L.layerGroup(segMarkers).addTo(map);
` : '';

  // ====== 筛选器 ======
  const filterJS = filters.length > 0 ? `
// ── Port toggle ──
var portTog = L.control({position:"topright"});
portTog.onAdd = function(){
  var d = L.DomUtil.create("div","port-toggle");
  d.innerHTML = '${filters.map(f =>
    `<label><input type="checkbox" id="toggle-${f.group}"> ${f.label}</label>`
  ).join(' ')}';
  return d;
};
portTog.addTo(map);

document.getElementById("toggle-border").addEventListener("change", function(){
  if(this.checked) {
    ${routes.map(r => `map.removeLayer(layers.${r.id});`).join('\n    ')}
    map.removeLayer(layers.nonPorts);
    layers.ports.addTo(map);
  } else {
    ${routes.map(r => `layers.${r.id}.addTo(map);`).join('\n    ')}
    layers.nonPorts.addTo(map);
  }
});
` : '';

  // ====== 组装完整 HTML ======
  const distCalcJS = routes.map(r => {
    // 计算路线距离
    return `(function(){
  var d=0;
  for(var i=1;i<${r.id}_p.length;i++) {
    var a=${r.id}_p[i-1], b=${r.id}_p[i];
    var dlat=b[0]-a[0], dlng=b[1]-a[1];
    d+=Math.sqrt(dlat*dlat+dlng*dlng)*111000;
  }
  var el=document.getElementById("dist-${r.id}");
  if(el) el.textContent="约 "+Math.round(d/1000)+" km";
})();`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<style>
  #map { height: 100vh; width: 100vw; }
  body,html { margin:0; padding:0; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .panel { background:rgba(255,255,255,0.95); padding:12px 16px; border-radius:10px; font-size:13px; line-height:1.7; box-shadow:0 2px 10px rgba(0,0,0,0.12); backdrop-filter:blur(4px); }
  .legend.panel { padding:0; border-radius:10px; max-width:75%; margin:0 auto 2px auto; }
  .legend { display:flex; justify-content:center; align-items:stretch; font-size:12px; width:100%; }
  .legend-section { display:flex; align-items:flex-start; gap:10px; padding:10px 18px; border-right:1px solid #e5e7eb; flex:1; }
  .legend-section:last-child { border-right:none; }
  .legend-section .dot { width:28px; height:4px; border-radius:2px; flex-shrink:0; margin-top:3px; }
  .legend-section .route-info { display:flex; flex-direction:column; gap:2px; }
  .legend-section .row-main { display:flex; align-items:baseline; gap:8px; }
  .legend-section .route-name { font-size:14px; font-weight:700; line-height:1.2; }
  .legend-section .route-dist { font-size:10px; color:#94a3b8; font-weight:400; }
  .legend-section .route-detail { font-size:11px; color:#1e293b; line-height:1.35; }
  .legend-section .route-extra { font-size:10px; color:#64748b; margin-top:2px; font-style:italic; }
  .leaflet-control-zoom { z-index:1001!important; }
  .leaflet-control-zoom a { width:30px!important; height:30px!important; line-height:30px!important; font-size:18px!important; }
  .port-toggle { background:rgba(255,255,255,0.95); padding:8px 14px; border-radius:8px; font-size:12px; box-shadow:0 2px 10px rgba(0,0,0,0.12); backdrop-filter:blur(4px); }
  .port-toggle label { cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
  .port-toggle input[type="checkbox"] { width:14px; height:14px; accent-color:#059669; outline:1.5px solid #94a3b8; cursor:pointer; }
  .static-label { background:none; border:none; box-shadow:none!important; font-size:11px; color:#1a1a2e; font-weight:600; white-space:nowrap; text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff; }
  .diamond-icon svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2)); }
  .mini-tooltip { font-size:11px!important; padding:2px 6px!important; border:none!important; box-shadow:0 1px 4px rgba(0,0,0,0.15)!important; border-radius:4px!important; }
  .leaflet-tooltip { border:none!important; box-shadow:0 2px 8px rgba(0,0,0,0.12)!important; border-radius:4px!important; font-size:11px!important; padding:4px 10px!important; }
  .leaflet-container { background:#f0f7ff; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
// ── Colors ──
${colorJs}
var FLIGHT = "#0891b2", END = "#059669";

// ── Route coordinates (OSRM) ──
${routeJS}

// ── Map init ──
var map = L.map("map", {
  zoomControl: false,
  zoomSnap: 0.2, zoomDelta: 0.2, wheelPxPerZoomLevel: 300
}).setView(${JSON.stringify(center)}, ${zoom});
L.control.zoom({position:'topleft'}).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

// ── Route layers ──
var layers = {};
${layerJS}

// ── Flight segments ──
${flightJS}

// ── Icon helpers ──
function diamondIcon(col) {
  return L.divIcon({
    className: "diamond-icon",
    html: '<svg width="15" height="15" viewBox="0 0 22 22"><polygon points="11,2 20,11 11,20 2,11" fill="'+col+'" stroke="#fff" stroke-width="1.5"/></svg>',
    iconSize: [15,15], iconAnchor: [7,7]
  });
}
function addCircle(lat,lng,name,color,cls) {
  cls=cls||"left";
  return L.circleMarker([lat,lng],{radius:6,fillColor:color,color:"#fff",weight:2,fillOpacity:0.9}).bindTooltip(name,{className:"mini-tooltip",direction:cls});
}
function addLabel(lat,lng,html,w) {
  w=w||160;
  return L.marker([lat,lng],{icon:L.divIcon({className:"static-label",html:html,iconSize:[w,14],iconAnchor:[-8,10]})});
}

// ── Markers ──
var portMarkers=[], otherMarkers=[];
${stopJS.join('\n')}

layers.ports = L.layerGroup(portMarkers);
layers.nonPorts = L.layerGroup(otherMarkers);

// ── Legend ──
(function(){
  var leg = L.control({position:"bottomleft"});
  leg.onAdd = function(){
    var d = L.DomUtil.create("div","panel legend");
    d.innerHTML = \`${legendSections}\`;
    return d;
  };
  leg.addTo(map);

  var bl = document.querySelector('.leaflet-bottom.leaflet-left');
  if(bl) { bl.style.width = '100%'; bl.style.paddingLeft = '4px'; }
})();

${roadJS}

${filterJS}

// ── Distance calc ──
setTimeout(function(){
  ${distCalcJS}
}, 500);
</script>
</body>
</html>`;
}

// ========== Main ==========
(async () => {
  console.log(`\n🔨 浪浪虎 build.js\n`);
  console.log(`  项目: ${cfg.title || yamlPath}`);
  console.log(`  路线: ${cfg.routes.length} 条`);

  // Step 1: 拉取 OSRM 坐标
  const osmData = await fetchRoutes(cfg.routes);

  // Step 2: 生成 HTML
  const html = generateHTML(cfg, osmData);

  // Step 3: 写出文件
  const outDir = process.env.OUT_DIR || 'examples';
  const outName = cfg.title ? cfg.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') + '.html' : 'index.html';
  const outPath = `${outDir}/${outName}`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  console.log(`\n✅ 完成! → ${outPath}`);
  console.log(`\n下一步: node validate.js ${outPath}\n`);
})();
