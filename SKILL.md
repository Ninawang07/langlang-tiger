---
name: 浪浪虎
description: Use when the user wants to plan a travel route (self-driving, cycling, hiking, motorcycle) and visualize it as an interactive web map. Triggers on "路线规划", "自驾路线", "行程地图", "road trip", "骑行路线", "徒步路线", "出境自驾", "路线可视化". Supports domestic and international travel with multi-route comparison, key node filtering, map customization, and one-click web deployment.
---

# 浪浪虎 — 路线规划到交互地图

## Overview

四阶段流水线：用户口述出行意图 → AI 做路线研究和方案对比 → 生成交互式 Leaflet 地图 → 部署到网页。

**核心原则**: 数据驱动，组件通用，判断点明确。每次只让用户做最低限度的决策。

---

## 四阶段流水线

```
用户需求（口头描述）
    │
    ▼
┌─────────────────────────────┐
│ 阶段一：路线规划              │  ← 判断密集：选方案/口岸/节点
│  天气→政策→方案矩阵→YAML     │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 阶段二：地图构建              │  ← 全自动：OSRM拉取+HTML生成
│  YAML→坐标→基础地图          │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 阶段三：UI 定制               │  ← 低判断：颜色/宽度/顺序微调
│  图例/筛选/缩放/飞航段       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 阶段四：部署                  │  ← 全自动
│  CloudStudio + 本地打包       │
└─────────────────────────────┘
```

---

## 阶段一：路线规划

### 步骤

1. **解析用户意图**：出发地、目的地、时间、出行方式、是否出境
2. **检索政策法规**（出境游）：签证要求、驾驶证互认、过境手续（如ATA单证册状态）
3. **分析天气季节**：按出发月份查询沿途气候、路况（冻土/雨季/台风季）
4. **识别关键节点**：按分类体系标注（见下方）
5. **方案对比**：用"十字架"矩阵对比不同路线方案
6. **输出 YAML 配置文件**：结构化记录所有路线、节点、警告信息

### 十字架方案矩阵

用于多方案对比时的辅助判断工具：

|  | 快（时间短） | 慢（时间长） |
|---|---|---|
| **省心（成熟路线）** | 方案A | 方案C |
| **冒险（探索路线）** | 方案B | 方案D |

### YAML 配置模板

```yaml
scenario:
  type: domestic               # domestic | international | multi-country
  departure: "YYYY-MM-DD"
  season: summer               # spring | summer | autumn | winter
  vehicle: car                 # car | motorcycle | bicycle | hiking

routes:
  - id: route_1
    name: "去程"
    style: solid               # solid | dotted | dashed
    color: "#7c3aed"

stops:
  - name: "城市/节点名"
    lat: 39.90, lng: 116.40
    node_type: border_out      # 见下方分类体系
    alerts: ["警告信息"]
    extra: "备注（音乐节/赛事等）"

filters:                       # 按 node_type 自动生成
  - filter_group: "border"
    label: "边境节点"
  - filter_group: "supply"
    label: "补给休整"
  - filter_group: "danger"
    label: "风险点"
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

## 阶段二：地图构建

### 技术栈
- **Leaflet.js** + OpenStreetMap 瓦片
- **OSRM** 拉取实际道路曲线坐标（非直线）
- Python 构建脚本生成基础 HTML

### 构建流程

```
YAML 配置文件
    ↓
解析途经点坐标
    ↓
OSRM API 逐段拉取道路曲线 → route_data.json
    ↓
build_map.py 生成基础 HTML
    ↓
手动注入 UI 组件（阶段三）
```

### 路线样式约定

**核心原则：唯一路线用实线，可选方案用虚线。与方向（去程/返程）无关。**

| 路线角色 | 样式 | dashArray | weight | 说明 |
|---------|------|-----------|--------|------|
| 唯一路线（无替代方案） | 实线 | 无 | 3.5 | 视觉重心，必走的路 |
| 可选方案（多选一） | 点状虚线 | `"2, 5"` | 2.5 | 备选应弱于必选 |
| 飞航段/轮渡 | 长虚线 | `"6, 8"` | 1.5 | opacity 0.7，不抢驾驶路线 |

**示例：** 贝加尔湖：去程唯一→实线，东/西线二选一→虚线。G331环线：草原/中心二选一→虚线，返程唯一→实线。

### ⚠️ 致命坑：build_map.py 会覆盖手动修改

**`build_map.py` 每次运行都会彻底重写 HTML 文件，所有阶段三的 UI 定制都会被抹掉。**
因此阶段三的所有修改必须记录成清单，每次 build 后重新应用。

---

## 阶段三：UI 定制（通用组件库）

### 必须手动应用的配置（每次 build 后）

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

### 颜色体系参考

| 用途 | 色值 | 说明 |
|------|------|------|
| 唯一路线（必走） | 任意色 | 实线，视觉重心 |
| 可选方案A | `#7c3aed` | 紫色点状虚线 |
| 可选方案B | `#2563eb` | 蓝色点状虚线 |
| 飞航段 | `#0891b2` | 青色长虚线 |
| 路况警告 | `#eab308` | 黄色半透明三角 (fill-opacity:0.65) |
| 终点旗标 | `#059669` | 绿色 |

---

## 阶段四：部署

```bash
cp index.html deploy/index.html
# then: workbuddy_cloudstudio_deploy → deploy/
```

本地交付：
```bash
cp index.html ~/Desktop/路线地图.html
# optional: Compress-Archive for .zip
```

---

## 常见错误速查

| 症状 | 根因 | 修复 |
|------|------|------|
| 滚轮缩放没反应 | `zoomSnap`/`zoomDelta`/`wheelPxPerZoomLevel` 未同时设 | 三项全部设为 0.2 / 0.2 / 300 |
| 加减按钮消失 | 默认 zoom control 被覆盖或 z-index 冲突 | `zoomControl:false` + 手动 `L.control.zoom` |
| 图例不居中 | `bottomcenter` 不存在 | `bottomleft` + CSS `margin:0 auto` + JS 扩展宽度 + 左侧 `paddingLeft:4px` |
| 图例竖排 | JS 里设了 `display:inline-block` | 只用 CSS `flex` 控制横向排列 |
| 图例贴边无呼吸感 | margin 0 | `margin: 0 auto 2px auto` + `border-radius: 10px` |
| build后UI全部丢失 | `build_map.py` 覆盖 HTML | 记录"必须重新应用的修改"清单 |
| 路线是直线不是沿路 | 没用 OSRM 拉坐标 | 用 OSRM API 逐段拉取道路曲线 |
| 东线西线不能同时选 | toggle 含互斥逻辑 | 删除互斥，改用独立的 add/remove 逻辑 |
| 缩放动画不连贯 | `zoomSnap` 非整数导致 Leaflet 动画 bug | 保持 0.2 即可，这是 OSM 瓦片缩放级别的限制 |

---

## 工作模式：判断点分布

| 阶段 | 判断密度 | 用户参与 | AI 做什么 |
|------|---------|---------|----------|
| ① 路线规划 | **高** | 方案选择、口岸决策 | 天气政策搜索、矩阵生成、YAML输出 |
| ② 地图构建 | 零 | 无 | OSRM拉取、坐标生成、HTML构建 |
| ③ UI 定制 | **低** | 颜色/宽度/顺序微调 | 默认值+通用组件注入 |
| ④ 部署 | 零 | 无 | 一键CloudStudio + 本地打包 |

## 安全检查（部署前）

部署/打包前必须检查 HTML 中是否包含：
- 手机号（11位数字模式）
- 身份证号（18位数字模式）
- 邮箱地址
- 真实姓名
- 家庭住址

地理坐标和旅行提示文字属于公开信息，不含个人隐私。
