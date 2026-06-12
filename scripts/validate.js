#!/usr/bin/env node
// 浪浪虎 validate.js — HTML 自查：验证 8 项 UI 组件 + 关键规则
// 用法: node validate.js examples/G331_东北边境自驾环线.html

const fs = require('fs');
const [, , htmlPath] = process.argv;
if (!htmlPath) { console.error('用法: node validate.js <output.html>'); process.exit(1); }

const html = fs.readFileSync(htmlPath, 'utf8');
const results = [];
let pass = 0, fail = 0;

function check(id, rule, fn) {
  try {
    const ok = fn(html);
    if (ok) { pass++; results.push({ status: '✅', id, rule }); }
    else     { fail++; results.push({ status: '❌', id, rule, detail: '未通过检测' }); }
  } catch(e) {
    fail++; results.push({ status: '💥', id, rule, detail: e.message });
  }
}

// ====== 1. 缩放控制 ======
check('UI-01', 'zoomControl 已禁用',     h => h.includes('zoomControl: false'));
check('UI-02', 'zoomSnap/zoomDelta 已设', h => h.includes('zoomSnap: 0.2') && h.includes('zoomDelta: 0.2'));
check('UI-03', 'wheelPxPerZoomLevel=300', h => h.includes('wheelPxPerZoomLevel: 300'));

// ====== 2. 底部图例栏 ======
check('UI-04', 'legend 容器 class 存在',   h => h.includes('panel legend'));
check('UI-05', 'legend-section 存在',      h => h.includes('legend-section'));
check('UI-06', '左侧留白 paddingLeft:4px', h => h.includes("paddingLeft = '4px'"));
check('UI-07', '底部呼吸 margin:0 auto 2px', h => h.includes('margin:0 auto 2px auto'));
check('UI-08', '实线路由 dot 用 background', h => /<span class="dot" style="background:#[0-9A-Fa-f]+;">/.test(h));
check('UI-09', '虚线用 border-top dotted',   h => h.includes('border-top:2px dotted'));

// ====== 3. 筛选器 ======
check('UI-10', 'port-toggle 容器存在',  h => h.includes('port-toggle'));
check('UI-11', 'checkbox change 事件',  h => h.includes('addEventListener("change"'));

// ====== 4. 飞航段 ======
check('UI-12', '飞航色 #0891b2',       h => h.includes('#0891b2'));
check('UI-13', '飞航虚线 dashArray',    h => h.includes('dashArray: "6, 8"'));
check('UI-14', '飞航 opacity 0.7',      h => h.includes('opacity: 0.7'));

// ====== 5. 路况标记 ======
check('UI-15', '路况三角 SVG',          h => h.includes('<polygon') && h.includes('fill-opacity="0.65"'));
check('UI-16', '路况黄色 #eab308',      h => h.includes('#eab308'));
check('UI-17', '路况 iconSize [14,14]', h => h.includes('[14,14]'));

// ====== 6. 菱形图标 ======
check('UI-18', 'diamondIcon 函数定义',   h => h.includes('function diamondIcon('));
check('UI-19', 'SVG 菱形 polygon',       h => h.includes('points="11,2 20,11 11,20 2,11"'));
check('UI-20', 'diamond-icon CSS 类',    h => h.includes('diamond-icon'));
check('UI-21', 'iconSize [15,15]',       h => h.includes('[15,15]'));
check('UI-22', '白边 stroke="#fff"',     h => h.includes('stroke="#fff"'));
check('UI-23', '无 CSS rotate 模拟',     h => !h.includes('rotate(45deg)'));

// ====== 7. 起点/终点 ======
check('UI-24', 'circleMarker 入口',      h => h.includes('circleMarker'));
check('UI-25', 'addLabel 函数定义',      h => h.includes('function addLabel'));
check('UI-26', 'static-label CSS 类',    h => h.includes('static-label'));
check('UI-27', '白色文字阴影',            h => h.includes('text-shadow'));

// ====== 8. 城市标注 ======
check('UI-28', '特征后缀 · 格式',       h => h.includes('·'));
check('UI-29', '极值点色 #06b6d4',      h => h.includes('#06b6d4'));

// ====== 通用 ======
check('GEN-01', 'Leaflet CSS 引入',       h => h.includes('leaflet/1.9.4/leaflet.min.css'));
check('GEN-02', 'Leaflet JS 引入',        h => h.includes('leaflet/1.9.4/leaflet.min.js'));
check('GEN-03', 'OSM 瓦片 tileLayer',     h => h.includes('tile.openstreetmap.org'));
check('GEN-04', '无 phone number',        h => !/\b1[3-9]\d{9}\b/.test(h));
check('GEN-05', '无 ID card',             h => !/\b\d{17}[\dXx]\b/.test(h));

// ====== 输出结果 ======
console.log(`\n🔍 浪浪虎 validate.js`);
console.log(`  文件: ${htmlPath}\n`);
console.log('| # | 检查项 | 结果 |');
console.log('|---|--------|------|');
results.forEach(r => {
  const flag = r.status === '✅' ? '' : ` — ${r.detail || 'FAIL'}`;
  console.log(`| ${r.id} | ${r.rule} | ${r.status}${flag} |`);
});
console.log(`\n  通过: ${pass}  失败: ${fail}  总计: ${pass+fail}`);
if (fail === 0) console.log('\n🎉 全部检查通过!\n');
else console.log(`\n⚠️  ${fail} 项未通过，请检查输出 HTML。\n`);

process.exit(fail > 0 ? 1 : 0);
