---
name: 浪浪虎
description: Use when the user wants to plan a travel route (self-driving, cycling, hiking, motorcycle) and visualize it as an interactive web map. Triggers on "路线规划", "自驾路线", "行程地图", "road trip", "骑行路线", "徒步路线", "出境自驾", "路线可视化". Supports domestic and international travel with multi-route comparison, key node filtering, map customization, and one-click web deployment.
---

# 浪浪虎 — 路线规划到交互地图

## Overview

四阶段流水线：用户口述出行意图 → 结构化路线分析 → `build.js` 一键生成 HTML → 部署到网页。

**核心原则**: 数据驱动，组件通用，判断点明确。每次只让用户做最低限度的决策。

**v2.1 自动化**: 阶段二和阶段三已通过 `scripts/build.js` 实现全自动——读取 YAML → 调用 OSRM 拉取实际道路坐标 → 生成包含全部 8 项 UI 组件的完整 HTML。`scripts/validate.js` 提供 34 项自动自查。模型不再需要记忆设计细节或手工操作代码，只需准备 YAML 配置文件。

---

## 四阶段流水线

```
用户需求（口头描述）
    │
    ▼
┌─────────────────────────────┐
│ 阶段一：路线规划              │  ← 判断密集：选方案/口岸/节点
│  天气→政策→矩阵→YAML         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 阶段二：地图构建              │  ← 全自动：build.js
│  YAML → OSRM → HTML          │     node scripts/build.js config.yaml
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 阶段三：UI 定制               │  ← 已内置于 build.js
│  8 项 UI 组件自动注入         │     同时生成完整 HTML
└──────────────┬──────────────┘
               │
               ▼
         preview_url 本地预览
               │
         用户确认
               │
               ▼
┌─────────────────────────────┐
│ 阶段四：自查 + 部署           │
│  validate → CloudStudio       │
└─────────────────────────────┘
```

---
## 设计系统：线型 × 颜色

路线的视觉表达由两个**独立维度**决定。两者正交，不可混淆。

### 维度一：线型 = 路线确定性

| 路线角色 | 线型 | dashArray | weight | 
|---------|------|-----------|--------|
| 唯一路线（无替代方案）| 实线 | 无 | 3.5 |
| 可选方案（多选一）| 点状虚线 | `"2, 5"` | 2.5 |
| 飞航段/轮渡 | 长虚线 | `"6, 8"` | 1.5 |

**规则：线型与方向（去程/返程）无关。** 去程、返程都可以是实线或虚线，取决于是否存在替代路线。

### 维度二：颜色 = 方向/角色

| 路线方向 | 色值 | 色名 |
|---------|------|------|
| 去程首选 | `#7c3aed` | 紫色 |
| 去程备选 | `#2563eb` | 蓝色 |
| 回程首选 | `#DB536A` | 珊瑚 |
| 回程备选 | `#d97706` | 琥珀 |
| 飞航/轮渡 | `#0891b2` | 青色 |
| 终点标记 | `#059669` | 绿色 |
| 极值节点 | `#06b6d4` | 青蓝 |
| 路况警告 | `#eab308` | 黄色 |
| 途经城市 | `#9ca3af` | 灰色 |

**示例：** 贝加尔湖去程唯一→紫色实线；G331 草原线/中心线二选一→紫色+蓝色虚线；G331 返程唯一→珊瑚实线。

### 节点形状约定

| 节点类型 | 形状 | 尺寸 | 说明 |
|---------|------|------|------|
| 起点/终点 | 大圆 ● | radius 8 | circleMarker，配 addLabel 文字 |
| 口岸/关键城市 | 菱形 ◆ | 15px SVG | 纯色无文字，靠 bindTooltip |
| 途经城市 | 小圆 ● | radius 6 | 灰色 fill，白色边框 |
| 路况警告 | 三角 ▲ | 14px SVG | 半透明黄，fill-opacity:0.65 |

### 城市标注规则

- **以城市为主体**：标注名 = "城市名"
- **相邻合并**：不重复标注
- **特征后缀**：`城市 · 特征` 格式（如"抚远 · 中国东极"）
- **极值点用鲜明色**：北极/东极等用 `#06b6d4`

---

## 阶段一：路线规划

### 强制约束

阶段一结束时必须产出完整的 YAML 配置，以下字段不可缺省：

- `scenario.type` / `scenario.departure` / `scenario.season` / `scenario.vehicle`
- 每条 route 必须有 `id` / `name` / `style` / `color`
- 每个关键节点必须有 `name` / `lat` / `lng` / `node_type`
- 风险节点必须有 `alerts` 数组

### 步骤

1. **解析用户意图**：出发地、目的地、时间、出行方式、是否出境
2. **检索政策法规**（出境游）：签证要求、驾驶证互认、过境手续
3. **分析天气季节**：按出发月份查询沿途气候、路况
4. **识别关键节点**：按分类体系标注（见下方）
5. **方案对比**：用"十字架"矩阵对比不同路线方案
6. **输出 YAML**：按模板填入结构化数据

### 十字架方案矩阵

用于多方案对比时的辅助判断工具：

|  | 快（时间短） | 慢（时间长） |
|---|---|---|
| **省心（成熟路线）** | 方案A | 方案C |
| **冒险（探索路线）** | 方案B | 方案D |

### YAML 配置模板

```yaml
scenario:
  type: domestic               # domestic | international
  departure: "YYYY-MM-DD"
  season: summer               # spring | summer | autumn | winter
  vehicle: car                 # car | motorcycle | bicycle | hiking

routes:
  # 每条路线: style=确定性, color=方向（参照设计系统）
  - id: route_out               # 必填: 唯一标识
    name: "去程"                 # 必填: 图例显示名
    style: solid                # solid(唯一) | dashed(可选)
    color: "#7c3aed"            # 参照颜色表
    segments:                   # 途经坐标序列
      - [42.26, 118.89]         # [lat, lng]
      - [49.58, 117.45]
  - id: route_ret
    name: "回程"
    style: solid
    color: "#DB536A"
    segments: [...]

stops:
  - name: "城市/节点名"         # 必填
    lat: 39.90, lng: 116.40     # 必填
    node_type: border_out       # 必填, 见分类体系
    alerts:                     # 风险节点必填
      - "冻土路段，需低速通过"
    extra: "备注（音乐节/赛事等）" # 选填

filters:                       # 阶段三自动生成
  - filter_group: "border"
    label: "边境节点"
```

---

## 关键节点分类体系

通用分类，适用于境内/境外所有场景：

```
关键节点（Key Node）
│
├── 起止点
│   ├── start（起点）
│   └── end（终点）
│
├── 边境节点（出境游时激活，境内路线自动跳过）
│   ├── border_out（出境口岸）
│   ├── border_in（入境口岸）
│   └── border_transit（过境口岸，第三国）
│
├── 补给/休整节点（长距离路线自动激活）
│   ├── fuel（稀疏路段关键加油站）
│   ├── rest（住宿/休整城市）
│   └── repair（维修点，越野/无人区路线）
│
├── 交通切换节点
│   ├── ferry（轮渡/车船联运）
│   ├── flight（飞航段衔接，如勘察加往返）
│   └── trailhead（徒步起点/骑行起点）
│
├── 景观/兴趣节点（可选）
│   ├── scenic（观景台/国家公园）
│   ├── cultural（历史遗迹/博物馆）
│   └── event（音乐节/赛事等特殊事件）
│
└── 风险节点（建议标注）
    ├── danger（塌方/泥石流/冻土高发段）
    ├── police（检查站/限速点）
    └── altitude（高海拔预警）
```

---

## 阶段二 + 阶段三：地图构建 + UI 注入（全自动）

阶段二和阶段三已合并为 `scripts/build.js` 的单次运行——读取阶段一产出的 YAML → 自动完成 OSRM 坐标拉取 + HTML 生成 + 8 项 UI 注入。

```bash
node scripts/build.js scripts/<项目>.yaml
# 输出: examples/<项目>.html
```

### 自动化流程

```
阶段一 YAML 配置
    ↓
解析 routes[].waypoints → OSRM API 逐段拉取道路曲线
    ↓
生成完整 HTML（Leaflet polyline + 坐标硬编码 + 全部 UI 组件）
    ↓
验证: node scripts/validate.js examples/<项目>.html
    ↓
输出完整可部署 HTML
```

---

## 阶段三：UI 定制（规则注入）

阶段三对阶段二产出的 HTML 骨架注入以下 UI 组件。每一项是**强制规则**，不得跳过。

### 注入清单（按顺序）

#### 1. 缩放控制
```javascript
var map = L.map("map", {
  zoomControl: false,          // 必须禁掉默认 zoom control
  zoomSnap: 0.2,               // 三项必须同时设
  zoomDelta: 0.2,              // 否则缩放按钮失效
  wheelPxPerZoomLevel: 300     // 滚轮细腻度（默认60太粗糙）
}).setView([49, 95], 4);
L.control.zoom({position: 'topleft'}).addTo(map);
```

**🚨 已知坑：`wheelPxPerZoomLevel` 设太大（如 300）会让滚轮感觉"没反应"，但这是设计意图——配合 `zoomSnap:0.2` 实现 1/5 级缩放。必须三项一起设。**

#### 2. 底部图例栏

CSS：
```css
.legend.panel { padding: 0; border-radius: 10px; max-width: 75%; margin: 0 auto 2px auto; }
.legend { display: flex; justify-content: center; align-items: stretch; width: 100%; }
.legend-section {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 14px; border-right: 1px solid #e5e7eb; flex: 1;
}
.legend-section:last-child { border-right: none; }
```

JS（底部铺满 + 左侧留白）：
```javascript
(function(){
  var bl = document.querySelector('.leaflet-bottom.leaflet-left');
  if(bl) { bl.style.width = '100%'; bl.style.paddingLeft = '4px'; }
})();
```

**🚨 已知坑：Leaflet 的 `bottomcenter` 不存在，只能用 `bottomleft` + CSS 居中。覆盖 Leaflet 内联样式必须用 `!important`。**

**图例 route-dot 规范：线型可视化**

图例中每条路线左侧的 `.dot` 色块必须反映该路线的**线型**（solid/dashed）：

| 路线线型 | `.dot` CSS | 视觉效果 |
|---------|-----------|---------|
| 实线 (唯一路线) | `background:<颜色>;` (默认 28×4px 实心条) | ━━━ |
| 虚线 (可选方案) | `border-top:2px dotted <颜色>; height:0; background:none;` | ╌╌╌ |

**图例 HTML 模板（每个 legend-section）：**
```html
<div class="legend-section">
  <!-- 实线路线： -->
  <span class="dot" style="background:#DB536A;"></span>
  <!-- 虚线路线： -->
  <span class="dot" style="border-top:2px dotted #7c3aed;height:0;background:none;"></span>
  <div class="route-info">
    <div class="row-main">
      <span class="route-name" style="color:<路线颜色>">路线名称</span>
      <span class="route-dist">约 XXXX km</span>
    </div>
    <span class="route-detail">途经城市序列</span>
    <span class="route-extra">✈/▲ 补充信息</span>
  </div>
</div>
```

**关键 CSS（补充）：**
```css
.legend-section .dot { width: 28px; height: 4px; border-radius: 2px; flex-shrink: 0; margin-top: 3px; }
.legend-section .route-info { display: flex; flex-direction: column; gap: 2px; }
.legend-section .row-main { display: flex; align-items: baseline; gap: 8px; }
.legend-section .route-name { font-size: 14px; font-weight: 700; line-height: 1.2; }
.legend-section .route-dist { font-size: 10px; color: #94a3b8; font-weight: 400; }
.legend-section .route-detail { font-size: 11px; color: #1e293b; line-height: 1.35; }
.legend-section .route-extra { font-size: 10px; color: #64748b; margin-top: 2px; font-style: italic; }
```

#### 3. 关键节点筛选器

标记分两组：`layers.ports`（筛选目标）和 `layers.nonPorts`（其余标记）。

勾选筛选时同时隐藏路线层：
```javascript
if(this.checked) {
  map.removeLayer(layers.ob);     // 去程路线
  map.removeLayer(layers.ea);     // 东线回程
  map.removeLayer(layers.we);     // 西线回程
  map.removeLayer(layers.nonPorts);
  layers.ports.addTo(map);
} else {
  layers.ob.addTo(map);
  layers.ea.addTo(map);
  layers.we.addTo(map);
  layers.nonPorts.addTo(map);
}
```

#### 4. 飞航段/轮渡

```javascript
var FLIGHT_COLOR = "#0891b2";
layers.flight = L.polyline([[from_lat,from_lng], [mid_lat,mid_lng], [to_lat,to_lng]], {
  color: FLIGHT_COLOR, weight: 1.5, opacity: 0.7,
  dashArray: "6, 8", lineJoin: "round"
}).bindTooltip("A地 ✈ B地往返", {direction: "right", sticky: true});
```

#### 5. 路况标记

使用**半透明黄色三角形**（无边框）标注需注意路段，形状区分于圆形地点标记：

```javascript
segData.forEach(function(s){
  var icon = L.divIcon({
    className: "",
    html: '<svg width="14" height="14"><polygon points="7,0 14,14 0,14" fill="'+s.color+'" fill-opacity="0.65"/></svg>',
    iconSize: [14,14], iconAnchor: [7,10]
  });
  segMarkers.push(L.marker([s.lat,s.lng], {icon: icon}).bindTooltip(
    '<b>'+s.title+'</b><br><span style="font-size:10px;color:#666">'+s.sub+'</span>',
    {className:"mini-tooltip", direction:"top"}
  ));
});
```

**设计原则：** 路况标记用三角形 ▲，城市/地点标记用圆形 ●，形状区分 + 半透明黄色区别于实心圆点。只标注"需注意/难行"路段，路况良好的不标。

#### 6. 城市/口岸标记（菱形图标）

口岸、关键城市等需要突出但不喧宾夺主的节点，使用 **SVG 纯菱形图标**。

**CSS（必须加入）：**
```css
/* 菱形图标投影 */
.diamond-icon svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2)); }
```

**JS（必须使用 SVG 实现，禁止 CSS rotate 方案）：**
```javascript
// 纯菱形图标（无文字），颜色区分口岸状态
function diamondIcon(col) {
  return L.divIcon({
    className: "diamond-icon",
    html: '<svg width="15" height="15" viewBox="0 0 22 22">' +
            '<polygon points="11,2 20,11 11,20 2,11" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>' +
          '</svg>',
    iconSize: [15, 15], iconAnchor: [7, 7]
  });
}
```

**关键参数：**
- `width="15" height="15"` + `viewBox="0 0 22 22"` → 15px 显示尺寸，SVG 内部坐标系用 22x22 保持精度
- `stroke="#fff" stroke-width="1.5"` → 白边切割地图底色
- `className: "diamond-icon"` → CSS 投影让图标不"贴"在地图上
- 纯菱形无文字 → 口岸名称靠 `bindTooltip` 显示

**🚨 禁止：** CSS `transform: rotate(45deg)` + 内层 `rotate(-45deg)` 模拟菱形——Leaflet divIcon 中无法可靠居中，且丢投影。

#### 7. 起点/终点标记

起点和终点使用比普通节点更显眼的标记：

**JS：**
```javascript
// 起点：大号圆形 + 静态文字标签
L.circleMarker([lat,lng], {
  radius: 8,
  fillColor: color,      // 与所属路线颜色一致
  color: "#fff",
  weight: 2.5,
  fillOpacity: 1
}).bindTooltip("城市 · 起点", {direction: "top", className: "mini-tooltip"});

addLabel(lat, lng, '<b style="font-size:11px;color:' + color + '">起点 · 城市名</b>');
```

`addLabel` 工具函数：
```javascript
function addLabel(lat, lng, html, w) {
  w = w || 160;
  return L.marker([lat, lng], {
    icon: L.divIcon({
      className: "static-label",
      html: html,
      iconSize: [w, 14],
      iconAnchor: [-8, 10]
    })
  });
}
```

对应 CSS：
```css
.static-label {
  background: none; border: none; box-shadow: none !important;
  font-size: 11px; color: #1a1a2e; font-weight: 600;
  white-space: nowrap;
  text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 5px #fff;
}
```

#### 8. 城市标注规则

沿途城市的文字标注遵循：

- **以城市为主体**：标注名 = "城市名"，非"景点名"或"路段名"
- **相邻城市合并**：同一条路线上距离近的城市不重复标注，选最具代表性的
- **特征城市追加后缀**：`城市 · 特征` 格式，如"抚远 · 中国东极"、"漠河 · 中国北极"、"赤峰 · 起点"
- **特殊颜色**：极值点（北极漠河、东极抚远）用鲜明色 `#06b6d4`，起点用路线主色

> 完整颜色表、线型规则、节点形状见本文档顶部的「设计系统：线型 × 颜色」章节。

---

### 阶段三检查点：本地预览

阶段三全部注入完成后，**必须**用 `preview_url` 打开本地 HTML 文件，让用户确认以下项目：

- 路线颜色和线型（实线/虚线）是否正确
- 底部图例栏是否居中、底部留白 2px、左侧留白 4px
- 菱形图标尺寸和位置是否正常
- 缩放按钮和滚轮细腻度是否生效
- 口岸筛选器是否正常工作
- 路况三角是否出现在正确路段

用户确认无误后，进入阶段四。

---
## 自动自查

部署前运行 `validate.js` 对输出 HTML 执行 34 项自动检查（覆盖 8 项 UI 组件 + 通用规则 + 隐私安全）：

```bash
node scripts/validate.js examples/<项目>.html
```

全部通过后进入部署。

---

## 阶段四：部署（确认后执行）

用户已在阶段三检查点确认视觉效果，直接执行部署：

```bash
# 确保目录下有 index.html
cp 项目名.html index.html
# CloudStudio 部署
cp index.html ~/Desktop/路线地图.html  # 选做
```

部署后 `preview_url` 确认页面正常加载即可。

---

## 常见错误速查

| 症状 | 根因 | 修复 |
|------|------|------|
| 滚轮缩放没反应 | `zoomSnap`/`zoomDelta`/`wheelPxPerZoomLevel` 未同时设 | 三项全部设为 0.2 / 0.2 / 300 |
| 加减按钮消失 | 默认 zoom control 被覆盖或 z-index 冲突 | `zoomControl:false` + 手动 `L.control.zoom` |
| 图例不居中 | `bottomcenter` 不存在 | `bottomleft` + CSS `margin:0 auto` + JS 扩展宽度 + 左侧 `paddingLeft:4px` |
| 图例竖排 | JS 里设了 `display:inline-block` | 只用 CSS `flex` 控制横向排列 |
| 图例贴边无呼吸感 | margin 0 | `margin: 0 auto 2px auto` + `border-radius: 10px` |
| UI 组件遗漏 | build 后未验证 | `node scripts/validate.js` 跑一遍 34 项检查 |
| 菱形图标无呼吸感 | 用了 CSS rotate 或缺少 `diamond-icon` 类 | 用 SVG 纯菱形 + `className:"diamond-icon"` |
| 菱形太大/太小 | 尺寸未统一 | 默认 15px（`width="15" height="15"` + `iconSize:[15,15]`） |
| 路线是直线不是沿路 | 没用 OSRM 拉坐标 | build.js 自动处理，YAML 的 waypoints 设置正确即可 |
| 缩放动画不连贯 | `zoomSnap` 非整数导致 Leaflet 动画 bug | 保持 0.2 即可 |

---

## 工作模式：判断点分布

| 阶段 | 判断密度 | 用户参与 | AI 做什么 |
|------|---------|---------|----------|
| ① 路线规划 | **高** | 方案选择、口岸决策 | 天气政策搜索、矩阵生成、YAML输出 |
| ② 地图构建 | 零 | 无 | OSRM拉取、坐标生成、HTML构建 |
| ③ UI 定制 | 零 | 无（全部自动化） | 按规则库逐项注入 UI 组件 |
| ④ 部署 | **低** | 确认后执行 | CloudStudio + 本地打包 + 部署后验证 |

## 安全检查（部署前）

部署/打包前必须检查 HTML 中是否包含：
- 手机号（11位数字模式）
- 身份证号（18位数字模式）
- 邮箱地址
- 真实姓名
- 家庭住址

地理坐标和旅行提示文字属于公开信息，不含个人隐私。
