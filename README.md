# 指标异常复盘工作台

面向指标异常的复盘与闭环工作台：异常必须由**质量、业务、延迟**三类信号共同触发（至少两类，且必须含质量或延迟信号），
支持关联事件、分派责任、记录证据、生成修复任务，并在关闭前校验影响范围与验证结果。
修复或数据回补后保留前后版本，相同根因的异常可以合并但**单条证据不会丢失**。

页面展示时间线、根因、任务状态与版本差异，并覆盖重复告警与任务取消这两个容易漏掉的边界。

## 快速开始

```bash
npm install
npm run dev        # API :5174 + Vite :5173（已配置 /api 代理）
```

生产：

```bash
npm run build
npm start          # 单进程同时提供 API 与 dist 静态资源，默认 :5174
```

数据默认持久化到 `data/workbench.json`（可用 `DATA_DIR` 覆盖），首次启动写入种子数据。
清空该文件即可恢复演示数据。

```bash
npm test           # 22 个后端行为测试（node:test）
npm run typecheck  # 前端类型检查
```

## 领域规则

### 触发
- 单条业务信号**不能**建单；至少两类信号，且必须包含质量或延迟信号。
- 建单时记录信号覆盖度（`x/3`），信号携带当前值、阈值、窗口、来源与触发时间。
- 重复告警：**同名 + 同类型 + 30 分钟窗口内**视为重复。重复告警会作为独立记录保留（不删除原信号），
  标记 `resolution = duplicate` 并指向 `duplicateOf`，不重复计入触发类型覆盖。
- 超窗口的同名告警视为新信号，并会让已通过的验证失效（回到排查中）。

### 处理
- 分派：责任团队 + 主责人，改派写入时间线。
- 根因：内容 + 分类，二者一致才能匹配为合并候选。
- 证据：记录后不可修改、删除；合并时整体迁入目标并保留 `originIncidentId`。
- 修复任务：`todo → in_progress → done/canceled`；`done` 必须填写结果，`canceled` 必须填写原因并写入时间线；
  `done` / `canceled` 为终态，不可重新激活。
- 版本：`discovery / mitigation / fix / backfill`。修复或回补必须已有变更前版本，历史版本永久保留，绝不覆盖。

### 关闭检查（全部通过才能关闭）
1. 异常处于可关闭状态（未关闭、未合并）
2. 根因已定位
3. 责任已分派
4. 影响范围已确认（分段、人数、时间窗）
5. 证据链非空
6. 非重复信号全部恢复
7. 修复任务全部完成或带原因取消
8. 验证结论为 `passed`，且关联了本异常的证据
9. 验证时间晚于最近一次修复 / 数据回补
10. 前后版本均已保留

关闭后异常变为只读；被合并的异常同样只读，并展示合并去向与迁出的证据 ID。

### 合并
- 仅在根因内容（归一化后）与分类完全一致时允许合并。
- 迁入信号、证据、任务、版本；每条证据保留 `originIncidentId`，并做**数量守恒校验**，不守恒直接 500 拒绝。
- 合并后同名同类型信号按触发时间归一：最早的一条保留为原始信号，其余标记为重复并指向它。

### 版本差异
- `GET /api/incidents/:id/versions/diff?a=&b=` 返回新增 / 移除 / 变化的指标、差值与方向。
- 界面以小型多序列折线（small multiples）展示各指标随版本的走势，并给出基准 / 对比版本的差异表与数据表视图。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 异常列表、用户、团队与计数 |
| GET | `/api/incidents/:id` | 详情：异常、时间线、证据、任务、关闭检查、合并候选 |
| POST | `/api/incidents` | 建单（多信号触发校验） |
| POST | `/api/incidents/:id/signals` | 关联告警（自动判重） |
| POST | `/api/incidents/:id/signals/:sid/resolve` | 恢复信号 |
| PATCH | `/api/incidents/:id/assignment` | 分派 |
| PATCH | `/api/incidents/:id/root-cause` | 根因 |
| PATCH | `/api/incidents/:id/scope` | 影响范围 |
| POST | `/api/incidents/:id/evidence` | 记录证据 |
| POST | `/api/incidents/:id/tasks` | 创建修复任务 |
| PATCH | `/api/tasks/:id` | 任务流转（done 需 result、canceled 需 canceledReason） |
| POST | `/api/incidents/:id/versions` | 保存版本 |
| GET | `/api/incidents/:id/versions/diff?a=&b=` | 版本差异 |
| POST | `/api/incidents/:id/verification` | 记录验证 |
| GET | `/api/incidents/:id/close-check` | 关闭检查 |
| POST | `/api/incidents/:id/close` | 关闭 |
| GET | `/api/incidents/:id/merge-candidates` | 同根因候选 |
| POST | `/api/incidents/:id/merge` | 合并（`{ sourceId }`） |

错误统一返回 `{ error, code, details }`，关键码：`TRIGGER_INSUFFICIENT`、`CLOSE_CHECK_FAILED`、
`VERIFICATION_TASKS_PENDING`、`VERIFICATION_EVIDENCE_REQUIRED`、`MERGE_ROOT_CAUSE_MISMATCH`、
`TASK_TRANSITION`、`INCIDENT_CLOSED`、`INCIDENT_MERGED`。

## 结构

```
server/
  store.js     种子数据、JSON 持久化、ID 分配
  domain.js    全部领域规则（触发/告警判重/合并/关闭检查/版本差异）
  index.js     Express 路由与错误映射
  tests/       行为测试
src/
  App.tsx      数据加载与操作编排
  components/  侧栏、信号、根因/范围/验证、任务、证据、时间线、版本、合并
  lib/         API 客户端、文案与格式化、主题/Toast
```

## 视觉

图表配色取自已校验的分类色板（蓝 / 橙 / 青对应质量 / 业务 / 延迟），浅色与深色模式均通过
色盲分离度与对比度校验；差异表同时用符号与方向色表达升降，避免只用颜色承载信息。
