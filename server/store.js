import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'workbench.json');

let state = null;

export function nowIso() {
  return new Date().toISOString();
}

function load() {
  if (fs.existsSync(DB_FILE)) {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    syncCounters(state);
    return;
  }
  state = seed();
  // 种子数据自带 ID，必须先同步计数器，否则下一条新记录会复用已有 ID
  syncCounters(state);
  persist();
}

export function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function db() {
  if (!state) load();
  return state;
}

export function resetForTests(seedData) {
  state = seedData ?? seed();
  syncCounters(state);
  persist();
  return state;
}

// 以现有数据中的最大序号为基线，避免新 id 与种子数据冲突
function syncCounters(s) {
  s.counters = s.counters || {};
  const bump = (id) => {
    const m = /^([A-Z]+)-(\d+)$/.exec(String(id || ''));
    if (!m) return;
    const [, prefix, num] = m;
    s.counters[prefix] = Math.max(s.counters[prefix] || 0, Number(num));
  };
  for (const inc of s.incidents || []) {
    bump(inc.id);
    (inc.signals || []).forEach((x) => bump(x.id));
    (inc.versions || []).forEach((x) => bump(x.id));
  }
  (s.events || []).forEach((x) => bump(x.id));
  (s.evidence || []).forEach((x) => bump(x.id));
  (s.tasks || []).forEach((x) => bump(x.id));
}

function usedIds(s) {
  const set = new Set();
  for (const inc of s.incidents || []) {
    set.add(inc.id);
    (inc.signals || []).forEach((x) => set.add(x.id));
    (inc.versions || []).forEach((x) => set.add(x.id));
  }
  for (const key of ['events', 'evidence', 'tasks']) {
    (s[key] || []).forEach((x) => set.add(x.id));
  }
  return set;
}

export function nextId(prefix) {
  const s = db();
  s.counters = s.counters || {};
  const used = usedIds(s);
  // 计数器之外再做一次占用检查，避免历史数据或并发写入造成 ID 冲突
  for (;;) {
    s.counters[prefix] = (s.counters[prefix] || 0) + 1;
    const id = `${prefix}-${String(s.counters[prefix]).padStart(3, '0')}`;
    if (!used.has(id)) return id;
  }
}

export function seed() {
  const t = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();

  const incidents = [
    {
      id: 'INC-001',
      title: '支付成功率跌破 95% 阈值（连续 3 个 5 分钟窗口）',
      status: 'investigating',
      severity: 'P1',
      rootCause: '支付网关上游超时导致回调丢失，订单状态未收敛到成功。',
      rootCauseCategory: 'upstream_dependency',
      signals: [
        {
          id: 'SIG-001', type: 'quality', name: '支付成功率',
          detail: '成功率 93.4%，低于阈值 95%，持续 18 分钟', value: 93.4, threshold: 95,
          window: '5m', firedAt: t(72), source: 'metric-monitor', resolution: 'open'
        },
        {
          id: 'SIG-002', type: 'business', name: '支付订单数',
          detail: '支付订单数环比下降 31%，影响 GMV 约 ¥48.2 万', value: -31, threshold: -20,
          window: '1h', firedAt: t(70), source: 'revenue-monitor', resolution: 'open'
        },
        {
          id: 'SIG-003', type: 'latency', name: '支付网关 P99 延迟',
          detail: 'P99 延迟 4.8s，超过 SLI 2s', value: 4.8, threshold: 2,
          window: '5m', firedAt: t(74), source: 'apm', resolution: 'open'
        }
      ],
      affectedScope: {
        segments: ['国内线上支付', 'iOS 客户端'],
        estimatedUsers: 12400,
        estimatedRevenue: 482000,
        currency: 'CNY',
        periodStart: t(80),
        periodEnd: t(20),
        confirmed: false,
        note: '口径取支付网关回调失败订单，未含订阅续费'
      },
      verification: {
        status: 'pending',
        method: '',
        checkedAt: null,
        checkedBy: '',
        evidenceId: null,
        note: ''
      },
      owner: null,
      assignee: null,
      reporter: 'monitor-bot',
      tags: ['支付', 'P1'],
      createdAt: t(76),
      updatedAt: t(12),
      closedAt: null,
      mergedInto: null,
      merges: [],
      versions: [
        {
          id: 'V-001',
          label: 'v1 · 初始发现',
          kind: 'discovery',
          createdAt: t(76),
          createdBy: 'monitor-bot',
          snapshot: { 支付成功率: 93.4, '支付网关 P99 延迟': 4.8, 支付订单数环比: -31 },
          note: '三路信号同时触发'
        }
      ]
    },
    {
      id: 'INC-002',
      title: '推荐歌单曝光量异常增长 210%，疑似埋点重复上报',
      status: 'triaged',
      severity: 'P2',
      rootCause: '客户端 v8.12.0 埋点 SDK 在重试时重复上报曝光事件。',
      rootCauseCategory: 'instrumentation',
      signals: [
        {
          id: 'SIG-010', type: 'quality', name: '埋点事件唯一性',
          detail: '同一 event_id 重复率 18.7%，阈值 2%', value: 18.7, threshold: 2,
          window: '15m', firedAt: t(300), source: 'data-quality', resolution: 'open'
        },
        {
          id: 'SIG-011', type: 'business', name: '歌单曝光量',
          detail: '曝光量环比 +210%，超出业务合理区间 +40%', value: 210, threshold: 40,
          window: '1h', firedAt: t(297), source: 'metric-monitor', resolution: 'open'
        }
      ],
      affectedScope: {
        segments: ['Android 客户端 v8.12.0'],
        estimatedUsers: 830000,
        estimatedRevenue: 0,
        currency: 'CNY',
        periodStart: t(320),
        periodEnd: t(240),
        confirmed: true,
        note: '仅影响曝光与点击漏斗，不涉及收入口径'
      },
      verification: { status: 'pending', method: '', checkedAt: null, checkedBy: '', evidenceId: null, note: '' },
      owner: '数据平台组',
      assignee: 'lin.xu',
      reporter: 'zhang.min',
      tags: ['埋点', '数据质量'],
      createdAt: t(305),
      updatedAt: t(120),
      closedAt: null,
      mergedInto: null,
      merges: [],
      versions: [
        {
          id: 'V-010', label: 'v1 · 初始发现', kind: 'discovery', createdAt: t(305), createdBy: 'data-quality',
          snapshot: { 埋点重复率: 18.7, 歌单曝光量环比: 210 }, note: '数据质量信号先触发'
        }
      ]
    },
    {
      id: 'INC-003',
      title: '搜索接口 P99 延迟劣化至 3.2s，影响搜索转化',
      status: 'fixing',
      severity: 'P2',
      rootCause: 'ES 索引合并触发大量段合并 IO，搜索节点磁盘 IOPS 打满。',
      rootCauseCategory: 'capacity',
      signals: [
        {
          id: 'SIG-020', type: 'latency', name: '搜索接口 P99',
          detail: 'P99 3.2s，阈值 800ms', value: 3.2, threshold: 0.8, window: '5m',
          firedAt: t(210), source: 'apm', resolution: 'open'
        },
        {
          id: 'SIG-021', type: 'business', name: '搜索→播放转化率',
          detail: '转化率 21.3%，环比 -6.4pp', value: -6.4, threshold: -3, window: '30m',
          firedAt: t(205), source: 'metric-monitor', resolution: 'open'
        }
      ],
      affectedScope: {
        segments: ['搜索', '全端'],
        estimatedUsers: 2100000,
        estimatedRevenue: 0,
        currency: 'CNY',
        periodStart: t(240),
        periodEnd: t(60),
        confirmed: true,
        note: '搜索无结果时降级到热搜，影响被部分稀释'
      },
      verification: { status: 'pending', method: '', checkedAt: null, checkedBy: '', evidenceId: null, note: '' },
      owner: '搜索组',
      assignee: 'wang.lei',
      reporter: 'monitor-bot',
      tags: ['搜索', '性能'],
      createdAt: t(215),
      updatedAt: t(30),
      closedAt: null,
      mergedInto: null,
      merges: [],
      versions: [
        {
          id: 'V-020', label: 'v1 · 初始发现', kind: 'discovery', createdAt: t(215), createdBy: 'apm',
          snapshot: { '搜索接口 P99': 3.2, '搜索转化率环比': -6.4 }, note: '延迟信号领先业务信号 5 分钟'
        },
        {
          id: 'V-021', label: 'v2 · 扩容后中间态', kind: 'mitigation', createdAt: t(40), createdBy: 'wang.lei',
          snapshot: { '搜索接口 P99': 1.1, '搜索转化率环比': -2.1 }, note: '加 2 个搜索节点，P99 下降但未达标'
        }
      ]
    },
    {
      id: 'INC-004',
      title: '日活口径异常：埋点缺失导致 DAU 下跌 12%',
      status: 'verified',
      severity: 'P3',
      rootCause: 'Android 冷启动埋点上报队列在弱网下被丢弃，补齐后数据回补。',
      rootCauseCategory: 'instrumentation',
      signals: [
        {
          id: 'SIG-030', type: 'quality', name: 'DAU 完整性',
          detail: 'Android DAU 完整性 88.2%，阈值 97%', value: 88.2, threshold: 97, window: '1d',
          firedAt: t(1500), source: 'data-quality', resolution: 'resolved'
        },
        {
          id: 'SIG-031', type: 'business', name: 'DAU',
          detail: 'DAU 环比 -12%，偏离预测区间', value: -12, threshold: -5, window: '1d',
          firedAt: t(1495), source: 'metric-monitor', resolution: 'resolved'
        }
      ],
      affectedScope: {
        segments: ['Android 客户端'],
        estimatedUsers: 460000,
        estimatedRevenue: 0,
        currency: 'CNY',
        periodStart: t(1560),
        periodEnd: t(1440),
        confirmed: true,
        note: '仅统计口径，实际用户行为未变化'
      },
      verification: {
        status: 'passed',
        method: '回补后重新跑数，DAU 与本周期预测值偏差 < 1%',
        checkedAt: t(600),
        checkedBy: 'chen.qi',
        evidenceId: 'EV-019',
        note: '回补版本 V-031 与修复后版本一致'
      },
      owner: '数据平台组',
      assignee: 'chen.qi',
      reporter: 'data-quality',
      tags: ['DAU', '数据质量', '已回补'],
      createdAt: t(1510),
      updatedAt: t(580),
      closedAt: null,
      mergedInto: null,
      merges: [],
      versions: [
        {
          id: 'V-030', label: 'v1 · 异常发现（原始数据）', kind: 'discovery', createdAt: t(1510), createdBy: 'data-quality',
          snapshot: { DAU: 3380000, 'Android DAU 完整性': 88.2 }, note: '原始上报数据'
        },
        {
          id: 'V-031', label: 'v2 · 数据回补', kind: 'backfill', createdAt: t(700), createdBy: 'chen.qi',
          snapshot: { DAU: 3850000, 'Android DAU 完整性': 99.1 }, note: '回补 7 天丢失事件'
        },
        {
          id: 'V-032', label: 'v3 · 修复后校验', kind: 'fix', createdAt: t(610), createdBy: 'chen.qi',
          snapshot: { DAU: 3862000, 'Android DAU 完整性': 99.3 }, note: 'SDK 队列上限调高并补发失败事件'
        }
      ]
    },
    {
      id: 'INC-006',
      title: 'Android 支付回调超时，成功率跌破阈值（与 INC-001 同源）',
      status: 'investigating',
      severity: 'P2',
      rootCause: '支付网关上游超时导致回调丢失，订单状态未收敛到成功。',
      rootCauseCategory: 'upstream_dependency',
      signals: [
        {
          id: 'SIG-050', type: 'latency', name: '支付网关 P99 延迟',
          detail: 'P99 延迟 5.2s，超过 SLI 2s', value: 5.2, threshold: 2,
          window: '5m', firedAt: t(45), source: 'apm', resolution: 'open'
        },
        {
          id: 'SIG-051', type: 'quality', name: '支付成功率',
          detail: '成功率 92.1%，低于阈值 95%', value: 92.1, threshold: 95,
          window: '5m', firedAt: t(44), source: 'metric-monitor', resolution: 'open'
        }
      ],
      affectedScope: {
        segments: ['Android 客户端'],
        estimatedUsers: 3200,
        estimatedRevenue: 96000,
        currency: 'CNY',
        periodStart: t(50),
        periodEnd: t(15),
        confirmed: false,
        note: '与 INC-001 同一批次网关超时'
      },
      verification: { status: 'pending', method: '', checkedAt: null, checkedBy: '', evidenceId: null, note: '' },
      owner: null,
      assignee: null,
      reporter: 'monitor-bot',
      tags: ['支付'],
      createdAt: t(48),
      updatedAt: t(30),
      closedAt: null,
      mergedInto: null,
      merges: [],
      versions: [
        {
          id: 'V-050', label: 'v1 · 初始发现', kind: 'discovery', createdAt: t(48), createdBy: 'apm',
          snapshot: { 支付成功率: 92.1, '支付网关 P99 延迟': 5.2 }, note: '与 INC-001 现象一致'
        }
      ]
    },
    {
      id: 'INC-005',
      title: 'CDN 回源率飙升导致播放起播延迟',
      status: 'closed',
      severity: 'P3',
      rootCause: 'CDN 节点缓存配置回滚失败，命中率下降至 62%。',
      rootCauseCategory: 'upstream_dependency',
      signals: [
        {
          id: 'SIG-040', type: 'latency', name: '起播 P95',
          detail: '起播 P95 1.9s，基线 600ms', value: 1.9, threshold: 0.9, window: '5m',
          firedAt: t(4000), source: 'apm', resolution: 'resolved'
        }
      ],
      affectedScope: {
        segments: ['音频播放', '华东区域'],
        estimatedUsers: 120000,
        estimatedRevenue: 0,
        currency: 'CNY',
        periodStart: t(4100),
        periodEnd: t(3800),
        confirmed: true,
        note: ''
      },
      verification: {
        status: 'passed',
        method: '缓存命中率恢复 96%，起播 P95 回到 640ms',
        checkedAt: t(3700),
        checkedBy: 'li.na',
        evidenceId: 'EV-004',
        note: ''
      },
      owner: '基础架构组',
      assignee: 'li.na',
      reporter: 'apm',
      tags: ['CDN', '播放'],
      createdAt: t(4010),
      updatedAt: t(3650),
      closedAt: t(3650),
      mergedInto: null,
      merges: [],
      versions: [
        { id: 'V-040', label: 'v1 · 初始发现', kind: 'discovery', createdAt: t(4010), createdBy: 'apm',
          snapshot: { '起播 P95': 1.9, 'CDN 命中率': 62 }, note: '' },
        { id: 'V-041', label: 'v2 · 配置修复', kind: 'fix', createdAt: t(3720), createdBy: 'li.na',
          snapshot: { '起播 P95': 0.64, 'CDN 命中率': 96 }, note: '重新发布缓存规则' }
      ]
    }
  ];

  const events = [
    {
      id: 'EVT-001', incidentId: 'INC-001', kind: 'detection', at: t(76), actor: 'monitor-bot',
      title: '三路信号共同触发异常', body: '质量、业务、延迟信号在 6 分钟窗口内同时越过阈值，自动创建 P1 异常。',
      refs: ['SIG-001', 'SIG-002', 'SIG-003'], meta: {}
    },
    {
      id: 'EVT-002', incidentId: 'INC-001', kind: 'assignment', at: t(60), actor: 'oncall-manager',
      title: '分派给支付组', body: '值班经理将异常分派至支付组，主责人 zhao.yun。',
      refs: [], meta: { from: null, to: 'zhao.yun' }
    },
    {
      id: 'EVT-003', incidentId: 'INC-001', kind: 'evidence', at: t(40), actor: 'zhao.yun',
      title: '抓取网关超时日志', body: '网关 504 在 10:14-10:31 集中出现，与成功率下跌窗口重合。',
      refs: ['EV-001'], meta: {}
    },
    {
      id: 'EVT-004', incidentId: 'INC-003', kind: 'detection', at: t(215), actor: 'apm',
      title: '延迟信号触发', body: '搜索 P99 超过 800ms 阈值。', refs: ['SIG-020'], meta: {}
    },
    {
      id: 'EVT-005', incidentId: 'INC-003', kind: 'task', at: t(180), actor: 'wang.lei',
      title: '创建扩容任务', body: '为搜索集群增加 2 个节点并观察 30 分钟。', refs: ['TASK-001'], meta: {}
    },
    {
      id: 'EVT-007', incidentId: 'INC-006', kind: 'detection', at: t(48), actor: 'monitor-bot',
      title: '延迟信号先于质量信号触发', body: '支付网关 P99 先超阈值 1 分钟，随后成功率跌破 95%。',
      refs: ['SIG-050', 'SIG-051'], meta: {}
    },
    {
      id: 'EVT-006', incidentId: 'INC-004', kind: 'backfill', at: t(700), actor: 'chen.qi',
      title: '执行数据回补', body: '回补 7 天 Android 冷启动事件，保留原始版本 V-030。', refs: ['V-031'], meta: {}
    }
  ];

  const evidence = [
    {
      id: 'EV-001', incidentId: 'INC-001', title: '支付网关 504 日志片段', type: 'log',
      content: '2026-11-20 10:14:02 WARN gateway upstream timeout after 3000ms (order=PAY88213)\n...共 1,284 条',
      source: 'kibana/payment-gateway', collectedBy: 'zhao.yun', collectedAt: t(40),
      linkedSignalIds: ['SIG-003'], immutable: true
    },
    {
      id: 'EV-002', incidentId: 'INC-001', title: '成功率分组对比（iOS vs Android）', type: 'metric',
      content: 'iOS 成功率 97.1% / Android 91.2%；回调失败集中在 Android 支付 SDK。',
      source: 'bi-dashboard/payment', collectedBy: 'zhao.yun', collectedAt: t(30),
      linkedSignalIds: ['SIG-001'], immutable: true
    },
    {
      id: 'EV-003', incidentId: 'INC-002', title: '重复 event_id 采样', type: 'query',
      content: 'SELECT event_id, count(*) c FROM exposure WHERE dt=2026-11-20 GROUP BY 1 HAVING c>1 LIMIT 20; 最大重复 9 次。',
      source: 'hive/exposure_events', collectedBy: 'lin.xu', collectedAt: t(260),
      linkedSignalIds: ['SIG-010'], immutable: true
    },
    {
      id: 'EV-020', incidentId: 'INC-006', title: '网关 504 采样（Android 支付）', type: 'log',
      content: '10:44:11 WARN gateway upstream timeout after 3000ms (order=PAY90017, client=android/8.12.0)',
      source: 'kibana/payment-gateway', collectedBy: 'zhao.yun', collectedAt: t(40),
      linkedSignalIds: ['SIG-050'], immutable: true
    },
    {
      id: 'EV-004', incidentId: 'INC-005', title: 'CDN 命中率恢复确认', type: 'metric',
      content: '修复后命中率 62% → 96%，持续 40 分钟稳定。', source: 'cdn-dashboard',
      collectedBy: 'li.na', collectedAt: t(3700), linkedSignalIds: ['SIG-040'], immutable: true
    },
    {
      id: 'EV-019', incidentId: 'INC-004', title: '回补后 DAU 与预测值对比', type: 'query',
      content: '回补后 DAU 3,862,000，预测区间 3,850,000-3,900,000，偏差 0.3%。',
      source: 'warehouse/dau_daily', collectedBy: 'chen.qi', collectedAt: t(605),
      linkedSignalIds: ['SIG-030', 'SIG-031'], immutable: true
    }
  ];

  const tasks = [
    {
      id: 'TASK-001', incidentId: 'INC-003', title: '搜索集群扩容并观察 30 分钟',
      status: 'done', priority: 'P1', owner: 'wang.lei',
      dueAt: t(-30), createdAt: t(180), updatedAt: t(40), canceledReason: null,
      result: '已加 2 节点，P99 从 3.2s 降至 1.1s，未达标，需继续排查段合并策略。'
    },
    {
      id: 'TASK-002', incidentId: 'INC-003', title: '调整 ES 段合并限流参数并灰度',
      status: 'in_progress', priority: 'P1', owner: 'wang.lei',
      dueAt: t(-240), createdAt: t(120), updatedAt: t(30), canceledReason: null, result: ''
    },
    {
      id: 'TASK-003', incidentId: 'INC-001', title: '支付回调补偿任务上线',
      status: 'todo', priority: 'P0', owner: 'zhao.yun',
      dueAt: t(-180), createdAt: t(35), updatedAt: t(20), canceledReason: null, result: ''
    },
    {
      id: 'TASK-004', incidentId: 'INC-002', title: 'SDK 去重改造需求评审',
      status: 'done', priority: 'P2', owner: 'lin.xu',
      dueAt: t(60), createdAt: t(240), updatedAt: t(150), canceledReason: null,
      result: '评审通过，排期下个迭代。'
    },
    {
      id: 'TASK-005', incidentId: 'INC-002', title: '临时下线 v8.12.0 曝光指标看板',
      status: 'canceled', priority: 'P3', owner: 'lin.xu',
      dueAt: t(-600), createdAt: t(280), updatedAt: t(270),
      canceledReason: '无需下线看板；在指标血缘中标注数据不可信即可，避免影响其他团队。', result: ''
    },
    {
      id: 'TASK-006', incidentId: 'INC-004', title: '提高 Android 埋点队列上限至 500',
      status: 'done', priority: 'P2', owner: 'chen.qi',
      dueAt: t(900), createdAt: t(1400), updatedAt: t(610), canceledReason: null,
      result: '已随 v8.11.3 发布，弱网补发成功率 99.1%。'
    }
  ];

  return {
    counters: {},
    incidents,
    events,
    evidence,
    tasks,
    currentUser: 'you',
    users: ['you', 'zhao.yun', 'lin.xu', 'wang.lei', 'chen.qi', 'li.na', 'zhang.min', 'oncall-manager'],
    teams: ['支付组', '数据平台组', '搜索组', '基础架构组', '客户端组']
  };
}
