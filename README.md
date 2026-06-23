# Next K 量化看板前端

纯静态 HTML/JS/CSS 量化交易仪表盘。零构建步骤、零打包器、零 ESM 模块。部署于 Vercel。

## 项目概览

next-k-frontend 是 Next K 量化交易系统的前端展示层，作为纯静态资源部署，通过 HTTP 请求与后端两个服务通信：

| 后端服务 | 端口 | 职责 |
|---------|------|------|
| next-k-api | 8000 | 市场分析、信号生成、OI 雷达、收筹池、ORB 纸面策略 |
| Next-k-protocol | 8001 | 币安合约实盘交易执行层 |

## 文件结构

```
next-k-frontend/
  index.html            2213 行 — 主仪表盘，所有 JS 内联
  binance.html           662 行 — 实盘交易终端
  api-base.js             20 行 — next-k-api URL 解析
  binance-api-base.js     20 行 — Next-k-protocol URL 解析
  theme.css              438 行 — 共享 CSS 主题系统
```

**总计: 3350 行**，无需任何构建工具。

## 技术栈

| 技术 | 用途 |
|------|------|
| Tailwind CSS 3.4.16 | CDN 加载的原子化 CSS 框架 |
| Google Fonts: Noto Serif SC | 标题字体（中文衬线风格） |
| Google Fonts: Source Sans 3 | 正文字体 |
| 原生 JavaScript | 所有逻辑内联于 HTML，无构建/打包/ESM |
| CSS 自定义属性 | 亮/暗双主题变量系统 |

## 主题系统 (theme.css)

### 双主题架构

通过 CSS 类 `dark` 切换主题，`:root` 为亮色主题，`.dark` 为暗色主题。

持久化机制：`localStorage` 键 `"theme"`，值为 `"dark"` 或 `"light"`。

### 完整 CSS 变量表

| CSS 变量 | 亮色主题 (Zen) | 暗色主题 | 用途 |
|----------|---------------|---------|------|
| `--bg` | `#F7F5F2` | `#0E0E10` | 页面背景色 |
| `--surface` | `#FDFCFB` | `#161618` | 卡片/面板表面色 |
| `--surface-light` | `#F0EBE3` | `#1E1E22` | 浅色表面（表头、渐变起点） |
| `--border` | `#E2DDD4` | `#2E2E34` | 边框色 |
| `--accent` | `#7A4544` | `#D48483` | 强调色（品牌红棕） |
| `--gold` | `#B8956B` | `#D4B483` | 金色（边框高亮、kicker） |
| `--gold-soft` | `rgba(184,149,107,0.14)` | `rgba(212,180,131,0.1)` | 柔金（卡片内渐变） |
| `--neon-green` | `#6B8F71` | `#8FBA8A` | 涨/盈利色 |
| `--neon-red` | `#A65D56` | `#E08B84` | 跌/亏损色 |
| `--neon-purple` | `#B8956B` | `#D4B483` | OI/埋伏色 |
| `--neon-blue` | `#6B7F8F` | `#8FA3B0` | 费率/冷色 |
| `--neon-yellow` | `#C4A05A` | `#D4B483` | 持仓中/警告色 |
| `--warn` | `#C4A05A` | `#D4B483` | 警告色 |
| `--text-primary` | `#2C2826` | `#EEECE8` | 主文字色 |
| `--text-secondary` | `#5C5650` | `#A8A4A0` | 次要文字色 |
| `--text-muted` | `#8A837A` | `#6E6A66` | 弱化文字色 |
| `--code-bg` | `#F0EBE3` | `#222228` | 代码块背景 |
| `--hover-bg` | `color-mix(…)` | `rgba(38,38,44,0.72)` | 表格行/可交互元素的悬停背景 |
| `--oi-hover` | `#F0EBE3` | `#222228` | OI 相关元素悬停背景 |
| `--scrollbar-track` | `#EDE8E0` | `#1A1A1E` | 滚动条轨道 |
| `--scrollbar-thumb` | `#C9C0B4` | `#3A3A40` | 滚动条滑块 |
| `--scrollbar-thumb-hover` | `#B0A69A` | `#505058` | 滚动条滑块悬停 |
| `--shadow-color` | `rgba(44,40,38,0.07)` | `rgba(0,0,0,0.45)` | 阴影基色 |
| `--glass` | `rgba(253,252,251,0.78)` | `rgba(22,22,24,0.82)` | 毛玻璃背景 |
| `--glass-border` | `rgba(226,221,212,0.65)` | `rgba(46,46,52,0.75)` | 毛玻璃边框 |

### 设计风格：暖色禅意 (Zen)

亮色主题使用羊皮纸色调（`#F7F5F2`/`#FDFCFB`），搭配红棕强调色和金色点缀，营造温暖、沉稳的交易终端氛围。

### 背景纹理

`body` 背景由 4 层 CSS 渐变组成：
- 左上角金色放射渐变
- 右上角强调色放射渐变
- 底部中央金色放射渐变
- 线性渐变过渡

叠加一个固定的 SVG 噪点纹理（`feTurbulence`），opacity 0.35，模拟纸张颗粒质感。

### 核心组件类

| 类名 | 作用 |
|------|------|
| `.app-header` | 毛玻璃头部栏（`backdrop-filter: blur(16px)`） |
| `.brand-mark` | 品牌图标容器：渐变背景+发光阴影+金色边框 |
| `.nav-pill` | 导航胶囊按钮，透明背景，hover 时显示边框 |
| `.nav-pill-active` | 激活态导航胶囊：金色渐变背景+阴影 |
| `.status-pill` | 连接状态指示器（内嵌脉冲圆点） |
| `.status-pill-ok` | 正常状态：绿色+脉冲动画 |
| `.status-pill-warn` | 警告状态：黄色+脉冲动画 |
| `.status-pill-err` | 错误状态：红色（无脉冲） |
| `.dash-card` | 仪表盘通用卡片：带阴影+边框 |
| `.panel-head` | 面板头部：浅色渐变+底边框 |
| `.panel-kicker` | 面板小标题：金色粗体大写 |
| `.panel-title` | 面板大标题：衬线字体 |
| `.panel-sub` | 面板副标题：弱化文字 |
| `.panel-body` | 面板内容区：padding 16px |
| `.panel-toolbar` | 面板工具栏：flex 横向排列 |
| `.panel-ts` | 面板时间戳：等宽字体 |
| `.btn-ghost` | 幽灵按钮：透明背景，hover 时高亮 |
| `.theme-toggle` | 主题切换按钮：圆角方形 |
| `.data-table` | 数据表格：sticky 表头，hover 行背景 |
| `.highlights-hero` | 优先信号英雄面板：多层渐变+金色边框 |
| `.skeleton` | 骨架屏加载动画（shimmer 效果） |
| `.card-hover` | 卡片悬停效果：边框高亮+阴影加深 |

### 内容区域描述

| 区域 | 定义 |
|------|------|
| **Header (头部栏)** | 品牌标识、导航胶囊、ET 时钟、主题切换、连接状态指示器；毛玻璃效果，`position: sticky` |
| **Section 1: 优先信号** | 双列网格——左侧 "值得关注" 英雄面板（OI 雷达亮点，金色圆点标记），右侧 S2 资金费率信号面板 |
| **Section 2: 收筹池 OI 监控** | OI 雷达面板，含 4 个迷你卡片（热度、追多、综合、埋伏）及刷新机制 |
| **Section 3: ORB 交易桌** | ORB V2.2 美股纸面交易查看器，含摘要卡片、Robot 卡片网格、12 列信号表格 |
| **Section 4: 历史归档** | 值得关注+重点关注的 8 标签页视图，含客户端排序及分页 |

## API URL 分辨率

### api-base.js —— next-k-api 地址

```
resolveApiBase()
```

解析逻辑（按优先级）：
1. `localStorage.NEXT_K_API_BASE`（用户可覆盖）
2. 本地开发：`http://127.0.0.1:8000`（当 hostname 为 localhost/127.0.0.1 或协议为 file:）
3. 生产环境：`http://13.158.69.58:8000`

### binance-api-base.js —— Next-k-protocol 地址

```
resolveProtocolApiBase()
```

解析逻辑（按优先级）：
1. `localStorage.PROTOCOL_API_BASE`（用户可覆盖）
2. 本地开发：`http://127.0.0.1:8001`
3. 生产环境：`http://13.158.69.58:8001`

### 安全措施

页面加载时自动清除 `localStorage` 中的敏感令牌：
- `NEXT_K_MAINTENANCE_TOKEN`
- `PROTOCOL_MAINTENANCE_TOKEN`

## 页面布局架构

页面通过 `enforceDashboardLayout()` 函数（在 DOM 构建时通过 IIFE 执行）强制执行 4 个区域的顺序：

1. 优先信号
2. 收筹池 OI 监控
3. 美股权益模拟（ORB 交易桌）
4. 值得关注与重点关注归档

该函数确保即使 HTML 元素在 DOM 中顺序发生变化，渲染顺序也保持一致。

## API 客户端（内联 JavaScript）

### 基础架构

```javascript
const API_BASE = resolveApiBase();          // next-k-api 基地址
const PROTOCOL_BASE = resolveProtocolApiBase(); // Protocol 基地址
```

**fetchWithTimeout**：使用 `AbortController` 实现超时控制，默认 12 秒（health 接口 8 秒）。

**maintenanceHeaders**：当前返回空对象 `{}`（鉴权已禁用），接受可选的额外头部合并。

**apiErrorDetail**：解析多种错误形状：
- `rate_limited` 错误（显示重试秒数）
- 字符串类型 detail
- 数组类型 detail
- `export_volume_disabled` 特殊错误
- 通用 JSON/文本回退

### 完整 API 方法表（15 个方法）

| 方法名 | HTTP 方法 | 端点 | 超时 | 说明 |
|--------|----------|------|------|------|
| `health()` | GET | `/api/health` | 8s | 健康检查 |
| `accumulationOiRadar()` | GET | `/api/accumulation/oi-radar` | 默认 | 获取 OI 雷达缓存快照 |
| `accumulationOiRadarRefresh()` | POST | `/api/accumulation/oi-radar/refresh` | 默认 | 触发后台扫描（有约 2 分钟冷却） |
| `worthWatch()` | GET | `/api/accumulation/worth-watch` | 默认 | 获取 7 类值得关注数据 |
| `focusWatch()` | GET | `/api/accumulation/focus-watch` | 默认 | 获取重点关注数据 |
| `heatAccumWatch()` | GET | `/api/accumulation/heat-accum-watch` | 默认 | 获取热度+收筹看盘 |
| `s2FundingSignals()` | GET | `/api/s2/funding-signals` | 默认 | 获取费率转负信号 |
| `clearWatchlistPool()` | POST | `/api/accumulation/maintenance/clear-watch-tables` | 默认 | 清空收筹池（仅 watchlist 表） |
| `clearWatchTables(tables)` | POST | `/api/accumulation/maintenance/clear-watch-tables` | 默认 | 清空指定看盘表 |
| `triggerCron(task)` | POST | `/api/accumulation/maintenance/trigger-cron` | 默认 | 手动触发定时任务 |
| `refreshHeatWatch()` | POST | `/api/accumulation/maintenance/refresh-heat-watch` | 默认 | 刷新热度看盘 |
| `orbSummary()` | GET | `/api/orb/summary` | 默认 | ORB 盘面摘要 |
| `orbSignals()` | GET | `/api/orb/signals?limit=200` | 默认 | ORB 信号列表 |
| `orbSessionToday()` | GET | `/api/orb/session/today` | 默认 | 当日交易会话信息 |
| `orbLiveBundle()` | GET | `/api/orb/live-bundle` | 默认 | ORB 实盘参数包状态 |
| `orbClearDb()` | POST | `/api/orb/maintenance/clear-db` | 默认 | 清空 ORB 纸面库 |

## 交互模式

### 无自动轮询

所有数据加载均由用户触发（点击"刷新"按钮或页面初始加载）。不存在定时自动轮询，以减轻 API 服务器压力。

### 连接健康检查

- **频率**：每 60 秒一次（仅可见标签页）
- **触发**：`visibilitychange` 事件（用户切换回标签页时）
- **并发**：`Promise.allSettled` 同时检查 API 和 Protocol 两个端点
- **显示**：头部栏状态指示灯（OK / Warn / Err，带脉冲动画）

### ET 时钟

- **频率**：每 30 秒更新
- **时区**：`America/New_York`（ET 美东时间）
- **格式**：`HH:mm ET`

### OI 雷达刷新流程

完整刷新流程（`forceRefresh=true`）：

1. POST `/api/accumulation/oi-radar/refresh` 触发后台扫描
2. 如果 API 返回 `rate_limited`：显示错误及重试秒数
3. 如果已有扫描在运行（`accepted=false, busy=true`）：提示等待
4. 如果扫描已接受（`accepted=true`）：进入轮询阶段
5. 轮询：每 4 秒 GET 一次快照，最多 45 轮（约 3 分钟）
6. 每轮更新进度提示（"已等待 n/45 轮"）
7. 快照就绪时渲染数据
8. 超时则提示查看后端日志

### ORB 数据加载

`hydrateOrbBoard()` 使用 `Promise.allSettled` 并行请求：

1. `API.orbSummary()` — 摘要统计 + Robot 配置 + 当日提示
2. `API.orbSignals()` — 信号列表（200 条限制）
3. `API.orbLiveBundle()` — 参数包状态

如果 `orbSummary` 失败，回退到 `API.orbSessionToday()` 获取当日提示。

### 客户端数据处理

- **`_orbSignalsCache`**：信号缓存，用于客户端筛选
- **`laneFilterRows(items, status, symQ)`**：筛选逻辑，支持按状态（全部/持仓中/已结算）和标的模糊搜索
- **280ms 防抖**：标的搜索使用 `setTimeout` 防抖

### 事件委托

- **标签页切换**：通过点击委托实现（`data-worth-tab-key` 属性）
- **可点击行**：OI 雷达标的行通过事件委托打开币安合约页面

### 错误处理模式

- **网络错误**：检测 `Failed to fetch` / `NetworkError`，提示用户检查 API 连接
- **API 错误**：显示返回的 `message` 或 `error` 字段
- **速率限制**：显示 `retry_after_sec` 等待时间
- **Toast 通知**：仅在用户主动刷新失败时弹出（避免初始化失败重复打扰）

### localStorage 使用

| 键 | 用途 |
|---|------|
| `theme` | 主题持久化（`"light"` 或 `"dark"`） |
| `NEXT_K_API_BASE` | 自定义 API 地址 |
| `PROTOCOL_API_BASE` | 自定义 Protocol 地址 |
| `worthHistoryTabKey` | 历史归档当前激活的标签页 |
| `NEXT_K_MAINTENANCE_TOKEN` | 页面加载时被清除（安全） |
| `PROTOCOL_MAINTENANCE_TOKEN` | 页面加载时被清除（安全） |

## 第一部分：优先信号

### 左侧："值得关注"英雄面板

- **组件类**：`highlights-hero`
- **数据来源**：OI 雷达快照中的 `highlights` 数组
- **渲染**：金色圆点标记列表，每行一条文本提示
- **布局**：固定高度区域，内部可滚动（`max-h-[min(320px,46vh)]`）
- **空状态**：显示"暂无提醒"

### 右侧：S2 费率转负信号

- **标题**：费率转负 + OI 涨
- **API**：`GET /api/s2/funding-signals`
- **条件**：近 2 日费率由非负刚转负且 OI 四段首尾抬升
- **表格列（9 列）**：

| 列 | 格式 |
|----|------|
| 时间 (CST) | 北京时间，MM/DD HH:mm |
| 币种 | 可点击，跳转币安合约页面 |
| 费率 前->今 | 百分比，4 位小数 |
| OI Delta | 百分比变化，绿涨红跌 |
| 24h | 百分比变化，绿涨红跌 |
| 成交额 | USD，M 单位 |
| 市值 | USD，B/M/K 单位 |
| 现货 | "有"（绿色）/ "仅合约"（弱化） |
| 广场 | 帖子数/阅读量 |

### 空状态消息

当无信号时显示："近 2 日尚无强信号。信号在「费率由非负刚转负」且「OI 四段首尾抬升」时写入（与 TG 推送条件一致）。"

## 第二部分：收筹池 OI 监控

### 面板头部

- **Kicker**："Accumulation / 收筹池 / OI 监控"
- **时间戳**：快照生成时间（CST）
- **刷新按钮**：用户手动触发

### 4 个迷你卡片

| 卡片 | 数据字段 | 展示内容 |
|------|---------|---------|
| 热度榜 | `hot_coins` | 标的、市值、价格变化、标签（CG热搜/放量/OI变化/收筹池/费率） |
| 追多（按费率） | `chase` | 标的、费率、趋势、价格变化、市值 |
| 综合 | `combined` | 标的、总分、维度标签（费率/市值/横盘天数/OI变化） |
| 埋伏 | `ambush` | 标的、总分、暗流标记、横盘天数、费率 |

每个卡片最多显示 8 条记录。每行标的可点击，在新标签页打开币安合约页面。

### 图例

面板底部显示颜色/图标图例：
- 热度 = CG 热搜 + 成交量暴增（OI 领先指标）
- 费率负 = 空头燃料
- 热度+吸筹 = 最强预判
- 热度+OI = 正在发生

### 刷新状态

| 状态 | 视觉表现 |
|------|---------|
| 加载快照 | 文字脉冲动画 |
| 后台扫描中 | 进度轮次提示（n/45） |
| 暂无快照 | 黄色警告框 + 自动启动后台轮询 |
| 速率限制 | 红色错误 + 等待秒数 |
| 网络错误 | 红色错误 + 连接诊断提示 |
| 扫描冲突 | 黄色提示"已有扫描在运行" |

## 第三部分：ORB 交易桌

### 面板头部

- **Kicker**："US Equities / ORB V2.2"
- **Title**："Next K 交易桌"
- **Meta 标签**：ML Gate 状态、实盘参数包状态、交易日期/星期
- **工具栏**：状态筛选下拉框、标的搜索输入框（280ms 防抖）、时间戳、刷新按钮

### 实盘参数包横幅

通过 `renderOrbLiveBundle()` 渲染，具有三个严重等级：

| 等级 | 图标 | 含义 | 展示内容 |
|------|------|------|---------|
| `ok` | 隐藏横幅 | 参数包就绪 | 无（或仅 tag） |
| `warn` | 警告三角 | 参数路径异常 | 缺失文件清单（红色标记） |
| `block` | 禁止标志 | 参数包缺失 | 缺失文件清单 + 部署步骤 |

横幅包含：
- 核心文件检查清单（排除 `ml_` 前缀的 ML 工件）
- 每个文件的 `live_exists` 状态（勾/叉）
- 部署修复步骤（最多 4 条）
- 参数包根目录路径

### 当日交易提示

通过 `renderOrbTodayAlerts()` 渲染：

- **可交易日**：绿色勾，显示"今日可交易 · 非休市日，无 FOMC/CPI 宏观事件"
- **含警告**：每个警告为独立横幅，含严重等级颜色边框
- **含屏蔽**：红色横幅，阻止新开仓
- **会话元数据**：session_date + weekday + session_close_time

警报类型可包含：FOMC 会议日、CPI 发布日、节假日、非交易日。

### 6 个摘要统计卡片

| 卡片 | 数据来源 | 格式 |
|------|---------|------|
| Robot | `robot_count` + `robot_equity_usdt` | "N 台 · 每台 X U · 复利 · 标" |
| 持仓 | `open_positions` + gate info | "N · 平仓释放 slot" |
| 已结算 | `settled_trades` | 数字 |
| 累计 U | `sum_pnl_usdt` | 等宽字体、绿涨红跌、4 位小数 |
| Gate | `min_p_true` + `max_opens_per_day` | "min P X.XX · 并发 N" |
| 宏观过滤 | `macro_filter_enabled` | "已开启"（紫色）或 "未开启"（弱化） |

当 `today.skip_new_entries` 为 true 时，Robot 卡片旁显示红色"不新开仓"标签。

### Robot 卡片网格

2-8 列响应式网格，每个卡片显示：
- Robot 标签（如 R1）
- 方向徽章（LONG 绿色 / SHORT 红色 / 空闲 弱化）
- 标的符号
- 钱包余额（USDT）
- 已实现盈亏（带符号和颜色）
- 禁用状态（降低透明度+去色）

卡片着色逻辑：
- 有持仓：强调色边框+背景
- 正盈利：绿色边框
- 亏损：红色边框
- 空闲：默认边框

### 信号表格（12 列）

| 列 | 宽度 | 格式 |
|----|------|------|
| Robot | 等宽 | Robot 标签 |
| UTC | 等宽 | ISO 时间戳 |
| 标的 | - | 加粗符号 |
| 状态 | - | 颜色药丸 |
| 方向 | - | LONG (绿) / SHORT (红) |
| 入场 | 右对齐等宽 | 4 位小数 |
| 止损 | 右对齐等宽 | 4 位小数（红色） |
| 止盈 | 右对齐等宽 | 4 位小数 |
| OR高 | 右对齐等宽 | 4 位小数 |
| OR低 | 右对齐等宽 | 4 位小数 |
| 量比 | 右对齐等宽 | Volume/MA 比率 |
| 盈亏U | 右对齐等宽 | 4 位小数（绿涨红跌） |

表格在 42rem 高度内可滚动，表头为 sticky。

### 状态药丸

| 状态 | 颜色 |
|------|------|
| 持仓中 | 黄色（warn） |
| 盈利 / win | 绿色 |
| 止损 / loss | 红色 |
| 收盘平仓 / session_close | 绿色 |
| 持平 / 其他 | 弱化 |

### 空状态

当无交易记录时显示：
- "—" 图标
- "暂无交易记录"
- "维护面板可触发纸面扫描"

### 客户端筛选

通过 `applyOrbTableFilters()` 实现，筛选维度：
- **状态**：全部 / 持仓中 / 已结算
- **标的**：大小写不敏感的符号子串匹配

## 第四部分：值得关注历史归档

### 8 个标签页

| 标签 | 数据库来源 | 表格列数 |
|------|----------|---------|
| 重点关注 | `focus_watch` 表 | 4 列 |
| 热度+收筹 | `worth_watch_heat_accum` 表 | 3 列 |
| Patrick核心 | `worth_watch_patrick_core` 表 | 3 列 |
| 热度+OI | `worth_watch_hot_oi` 表 | 3 列 |
| 追多·费率加速 | `worth_watch_chase_fire` 表 | 3 列 |
| 追多+综合双榜 | `worth_watch_dual_list` 表 | 3 列 |
| 埋伏·暗流 | `worth_watch_ambush_dark` 表 | 3 列 |
| 埋伏·低市值+OI | `worth_watch_ambush_gem` 表 | 3 列 |

### 重点关注表格（4 列）

| 列 | 内容 |
|----|------|
| 标的 | 可点击的币种符号，跳转币安合约 |
| 通道 | 通道标签（中文） |
| 摘要 | 摘要行（可点击） |
| 策略提示 | 文本，最大宽度 220px |

### 7 类值得关注表格（3 列）

| 列 | 内容 |
|----|------|
| 标的 | 可点击的币种符号 |
| 生成日期 | 等宽字体 YYYY-MM-DD |
| 摘要 | 摘要行（可点击） |

### 排序规则

双向排序：
1. 按 `generated_date` 倒序（最新的在前）
2. 同日期内按 `last_seen_cst` 倒序
3. 重点关注：额外按 `rank_in_category` 升序（排名靠前优先）

### 标签页持久化

当前激活标签页保存在 `localStorage.worthHistoryTabKey`，页面重新加载时恢复。

### 表格滚动

每类表格最大高度 `max-h-[min(26rem,40vh)]`，内部支持纵向和横向滚动。

## 隐藏维护面板

### 打开方式

1. **URL 参数**：`?maint=1`
2. **页脚连点**：点击页脚品牌行 5 次（1 秒内）
3. 关闭后 URL 中 `maint` 参数自动移除

### 左侧：数据清理

| 按钮 | API | 影响范围 |
|------|-----|---------|
| 收筹池 | `POST clearWatchlistPool()` | 仅 watchlist 表 |
| 全部看盘表 | `POST clearWatchTables([全部表])` | watchlist + focus_watch + 5 类 ambush/heat/patrick/watch 表 |
| ORB 库 | `POST orbClearDb()` | orb_signals + orb_settlements + orb_v2_runs + orb_robots |

### 右侧：手动触发定时任务

| 按钮 | task 参数 | 说明 |
|------|----------|------|
| pool 收筹池 | `pool` | 扫描标的加入收筹池 |
| oi 雷达 | `oi` | 运行 OI 雷达全量扫描 |
| S2 费率转负 | `s2_funding` | 运行费率转负信号扫描 |
| ORB 扫描 | `orb_scan` | 运行 ORB 美股纸面扫描 |

### 底部：数据备份

一键导出流程：
1. `GET /api/export-volume/info` — 查询数据目录信息（文件数、大小）
2. 确认对话框显示路径/文件数/大小
3. `GET /export-volume?fmt=zip` — 触发浏览器下载

需要后端设置 `NEXT_K_EXPORT_VOLUME_ENABLED=1`。

## binance.html —— 实盘交易终端

### 概述

独立的实盘交易监控页面，直接连接到 Next-k-protocol。

依赖：`binance-api-base.js` + `theme.css` + Tailwind CSS CDN。

### 4 个功能区域

| 区域 | API | 刷新策略 |
|------|-----|---------|
| 系统状态 | `GET /api/binance/status` | 每 30 秒自动刷新（可见标签页） |
| 交易配置编辑器 | `GET /api/binance/config` | 手动加载 |
| 当前持仓 | `GET /api/binance/positions?status=open&limit=50` | 每 30 秒自动刷新 |
| 信号日志 | `GET /api/binance/signals?limit=100` | 手动加载 |

### 系统状态面板

显示：
- 交易状态（启用/禁用 徽章）
- 网络（主网/Testnet 徽章）
- 当前持仓数
- 最大持仓数

状态指示灯：绿色（实盘）、黄色（TESTNET）、红色（已禁用/离线）。

### 交易配置编辑器

可编辑的键（全局配置）：

| 键 | 标签 | 类型 |
|----|------|------|
| `enabled` | 启用交易 | 文本（true/false） |
| `testnet` | 测试网 | 文本（true/false） |
| `max_positions` | 最大持仓(总) | 文本（数字） |
| `entry_type` | 入场单类型(默认) | 下拉（MARKET/LIMIT） |

通过 `POST /api/binance/config` 保存，body 格式 `{ pairs: { key: value } }`。

### 当前持仓表格（9 列）

| 列 | 格式 |
|----|------|
| 标的 | 加粗 |
| 方向 | 徽章（LONG 绿色 / SHORT 红色） |
| 开仓价 | 6 位小数 |
| 标记价 | 6 位小数 |
| 数量 | 6 位小数 |
| 浮盈 U | 带符号颜色，4 位小数 |
| 杠杆 | 整数 |
| 强平价 | 6 位小数 |
| 保证金模式 | 文本 |

### 信号日志表格（10 列）

| 列 | 说明 |
|----|------|
| 来源 | 策略信号来源标识 |
| 动作 | 入场动作类型 |
| 标的 | 加粗 |
| 方向 | 徽章 |
| 入场价 | 4 位小数 |
| 止损 | 4 位小数（红色） |
| 止盈 | 4 位小数（绿色） |
| 状态 | 状态徽章（accepted/executed/skipped/expired） |
| 跳过原因 | 可点击展开/折叠（最大宽度 160px 截断） |
| 收到时间 | 相对时间格式化 |

### 徽章系统

| 徽章类 | 含义 | 颜色 |
|--------|------|------|
| `badge-open` | 持仓中 | 绿色 |
| `badge-closed` | 已平仓 | 灰色 |
| `badge-long` | 多头 | 绿色 |
| `badge-short` | 空头 | 红色 |
| `badge-tp` | 止盈 | 绿色 |
| `badge-sl` | 止损 | 红色 |
| `badge-expired` | 已过期 | 黄色 |
| `badge-manual` | 手动 | 强调色 |
| `badge-unknown` | 未知 | 灰色 |
| `badge-enabled` | 已启用 | 绿色 |
| `badge-disabled` | 已禁用 | 红色 |
| `badge-testnet` | 测试网 | 黄色 |

### 自动刷新

- **持仓**：每 30 秒（仅可见标签页）
- **状态**：每 30 秒（仅可见标签页）
- **visibilitychange**：标签页切换回时立即刷新持仓和状态
- **配置和信号日志**：仅在手动刷新时加载

### 数据过期倒计时

HTML 元素带 `data-expire` 属性会展示自该时间戳起的经过时间，每 30 秒更新。

## 本地开发

```bash
cd next-k-frontend
python3 -m http.server 5173
# 访问 http://localhost:5173
```

无需安装依赖，无需构建。确保后端服务运行在：
- next-k-api: `http://127.0.0.1:8000`
- Next-k-protocol: `http://127.0.0.1:8001`

### 切换 API 地址

在浏览器控制台设置 localStorage 值以覆盖默认 API 地址：

```javascript
// 覆盖 API 地址
localStorage.setItem('NEXT_K_API_BASE', 'http://your-server:8000');

// 覆盖 Protocol 地址
localStorage.setItem('PROTOCOL_API_BASE', 'http://your-server:8001');
```

刷新页面后生效。

## 部署

### Vercel 部署

纯静态文件，无需构建步骤。Vercel 自动检测并部署。

项目根目录 `next-k-frontend/` 直接作为部署根目录。Vercel 会为以下资源提供服务：
- `index.html`
- `binance.html`
- `api-base.js`
- `binance-api-base.js`
- `theme.css`

### CORS 注意事项

由于前端和后端分离部署，确保后端服务返回正确的 CORS 头部，允许来自 Vercel 部署域名的请求。

## 代码架构特点

### 零依赖前端

- 无 `package.json`、无 `node_modules`
- 无构建步骤（webpack/vite/esbuild 均不使用）
- 非 ESM 模块（所有函数在全局作用域）
- Tailwind CSS 通过 CDN 运行时编译

### 全局函数命名

所有工具函数为全局函数，采用描述性命名：
- `escHtml()` — HTML 转义
- `fmtNum()` — 数字格式化
- `formatMcapUsd()` — 市值格式化
- `pxClass()` — 价格涨跌颜色类
- `oiRadarRowClickable()` — OI 雷达可点击行
- `perpSymToPairLabel()` — 合约符号转交易对

### 数据流

```
用户点击刷新 → fetch API → JSON 解析 → DOM 渲染
                              ↓
                         错误分支 → Toast / 内联错误
```

### 状态管理

无状态管理库。状态来源：
- 模块级变量缓存（如 `_orbSignalsCache`）
- DOM 本身作为状态（data 属性、类名）
- localStorage（主题、标签页选择、API 地址）

## 性能考量

- **单线程模型**：所有逻辑在主线程运行，长任务使用 Promise 异步化
- **AbortController**：12 秒默认超时防止挂起请求
- **可见性 API**：标签页不可见时跳过轮询
- **事件委托**：大量可点击元素使用单个事件监听器
- **防抖**：280ms 的搜索输入防抖
- **Promise.allSettled**：并行 API 调用容错（单个失败不影响其他）

## Tailwind 自定义配置

```javascript
tailwind.config = {
    theme: {
        extend: {
            fontFamily: {
                serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
                sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
            },
            colors: {
                background: 'var(--bg)',
                surface: 'var(--surface)',
                'surface-light': 'var(--surface-light)',
                border: 'var(--border)',
                accent: 'var(--accent)',
                'neon-green': 'var(--neon-green)',
                'neon-red': 'var(--neon-red)',
                'neon-purple': 'var(--neon-purple)',
                'neon-blue': 'var(--neon-blue)',
                'neon-yellow': 'var(--neon-yellow)',
                warn: 'var(--warn)',
                'text-primary': 'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'text-muted': 'var(--text-muted)',
            },
            borderRadius: {
                sm: '0.125rem',
                DEFAULT: '0.1875rem',
                md: '0.1875rem',
                lg: '0.25rem',
                xl: '0.3125rem',
            },
        }
    }
}
```

所有颜色值通过 CSS 自定义属性桥接，只写一次变量，亮/暗双主题自动生效。
