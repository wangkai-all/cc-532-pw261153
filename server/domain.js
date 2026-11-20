import { db, nextId, nowIso, persist } from './store.js';

export const SIGNAL_TYPES = ['quality', 'business', 'latency'];
export const INCIDENT_STATUSES = ['triaged', 'investigating', 'fixing', 'verified', 'closed', 'merged'];
export const DUPLICATE_WINDOW_MINUTES = 30;
const TERMINAL_TASKS = ['done', 'canceled'];

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const bad = (code, message, details) => new ApiError(400, code, message, details);
const conflict = (code, message, details) => new ApiError(409, code, message, details);

function requireText(value, field, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw bad('VALIDATION', `${field} 至少需要 ${min} 个字符`);
  }
  return value.trim();
}

function isoOrNull(value, field) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw bad('VALIDATION', `${field} 不是合法时间`);
  return d.toISOString();
}

export function normalizeRootCause(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\s，。；、,.;:：!！?？"'“”‘’()（）]/g, '')
    .trim();
}

export function getIncident(id) {
  const inc = db().incidents.find((i) => i.id === id);
  if (!inc) throw new ApiError(404, 'NOT_FOUND', `异常 ${id} 不存在`);
  return inc;
}

export function getTask(id) {
  const t = db().tasks.find((x) => x.id === id);
  if (!t) throw new ApiError(404, 'NOT_FOUND', `任务 ${id} 不存在`);
  return t;
}

function addEvent(incidentId, kind, title, body, actor, refs = [], meta = {}) {
  const event = {
    id: nextId('EVT'),
    incidentId,
    kind,
    at: nowIso(),
    actor: actor || db().currentUser,
    title,
    body: body || '',
    refs,
    meta
  };
  db().events.push(event);
  return event;
}

function touch(incident) {
  incident.updatedAt = nowIso();
}

function assertWritable(incident) {
  if (incident.status === 'merged') {
    throw conflict('INCIDENT_MERGED', `异常已合并至 ${incident.mergedInto}，请在合并目标中操作`);
  }
  if (incident.status === 'closed') {
    throw conflict('INCIDENT_CLOSED', '异常已关闭，不能再修改');
  }
}

function validateSignal(raw, index) {
  const label = `signals[${index}]`;
  if (!raw || typeof raw !== 'object') throw bad('VALIDATION', `${label} 必须是对象`);
  if (!SIGNAL_TYPES.includes(raw.type)) {
    throw bad('VALIDATION', `${label}.type 必须是 quality / business / latency 之一`);
  }
  const name = requireText(raw.name, `${label}.name`);
  const detail = requireText(raw.detail ?? name, `${label}.detail`, 1);
  const value = raw.value == null ? null : Number(raw.value);
  if (value != null && Number.isNaN(value)) throw bad('VALIDATION', `${label}.value 必须是数字`);
  const threshold = raw.threshold == null ? null : Number(raw.threshold);
  if (threshold != null && Number.isNaN(threshold)) throw bad('VALIDATION', `${label}.threshold 必须是数字`);
  return {
    type: raw.type,
    name,
    detail,
    value,
    threshold,
    window: raw.window || '5m',
    firedAt: isoOrNull(raw.firedAt, `${label}.firedAt`) || nowIso(),
    source: raw.source || 'manual',
    resolution: 'open'
  };
}

function assessTrigger(signals) {
  const types = [...new Set(signals.map((s) => s.type))];
  const missing = SIGNAL_TYPES.filter((t) => !types.includes(t));
  return {
    types,
    coverage: `${types.length}/3`,
    missing,
    multiSignal: types.length >= 2,
    hasQualityOrLatency: types.includes('quality') || types.includes('latency')
  };
}

export function createIncident(body = {}) {
  const title = requireText(body.title, 'title', 5);
  const severity = body.severity || 'P2';
  if (!['P0', 'P1', 'P2', 'P3'].includes(severity)) {
    throw bad('VALIDATION', 'severity 必须是 P0-P3');
  }
  if (!Array.isArray(body.signals) || body.signals.length < 2) {
    throw bad('VALIDATION', '异常必须由至少 2 条信号共同触发');
  }
  const signals = body.signals.map(validateSignal);
  const trigger = assessTrigger(signals);
  if (!trigger.multiSignal) {
    throw bad('TRIGGER_INSUFFICIENT', '至少需要质量 / 业务 / 延迟中的两类信号才能创建异常', { trigger });
  }
  if (!trigger.hasQualityOrLatency) {
    throw bad('TRIGGER_INSUFFICIENT', '业务信号不能单独触发异常，需至少一条质量或延迟信号', { trigger });
  }

  const incident = {
    id: nextId('INC'),
    title,
    status: 'triaged',
    severity,
    rootCause: (body.rootCause || '').trim(),
    rootCauseCategory: body.rootCauseCategory || 'unknown',
    signals: [],
    affectedScope: {
      segments: [],
      estimatedUsers: 0,
      estimatedRevenue: 0,
      currency: 'CNY',
      periodStart: null,
      periodEnd: null,
      confirmed: false,
      note: ''
    },
    verification: {
      status: 'pending', method: '', checkedAt: null, checkedBy: '', evidenceId: null, note: ''
    },
    owner: body.owner || null,
    assignee: body.assignee || null,
    reporter: body.reporter || db().currentUser,
    tags: Array.isArray(body.tags) ? body.tags : [],
    trigger,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    closedAt: null,
    mergedInto: null,
    merges: [],
    versions: [
      {
        id: nextId('V'),
        label: 'v1 · 初始发现',
        kind: 'discovery',
        createdAt: nowIso(),
        createdBy: body.reporter || db().currentUser,
        snapshot: body.initialSnapshot || {},
        note: '异常创建时的基线'
      }
    ]
  };
  incident.signals = signals.map((s) => ({ ...s, id: nextId('SIG'), incidentId: incident.id }));
  db().incidents.push(incident);
  addEvent(
    incident.id,
    'detection',
    `${trigger.types.length} 类信号共同触发异常`,
    signals.map((s) => `${s.type}:${s.name}`).join(' · '),
    incident.reporter,
    incident.signals.map((s) => s.id),
    { trigger }
  );
  persist();
  return incident;
}

function findDuplicateSignal(incident, incoming) {
  const windowMs = DUPLICATE_WINDOW_MINUTES * 60000;
  const t = new Date(incoming.firedAt).getTime();
  return incident.signals.find((s) => {
    if (s.resolution === 'duplicate') return false;
    if (s.type !== incoming.type) return false;
    if (s.name.trim().toLowerCase() !== incoming.name.trim().toLowerCase()) return false;
    return Math.abs(new Date(s.firedAt).getTime() - t) <= windowMs;
  });
}

export function addSignal(incidentId, raw, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const signal = validateSignal(raw, 0);
  const duplicateOf = findDuplicateSignal(incident, signal);
  const saved = {
    ...signal,
    id: nextId('SIG'),
    incidentId,
    source: signal.source || 're-alert',
    duplicateOf: duplicateOf ? duplicateOf.id : null,
    resolution: duplicateOf ? 'duplicate' : 'open'
  };
  incident.signals.push(saved);
  if (duplicateOf) {
    addEvent(
      incidentId,
      'duplicate_alert',
      `重复告警已关联 ${duplicateOf.id}`,
      `${saved.name} 在 ${DUPLICATE_WINDOW_MINUTES} 分钟窗口内再次触发，不重复触发异常，原信号状态保留。`,
      actor,
      [saved.id, duplicateOf.id],
      { duplicateOf: duplicateOf.id }
    );
  } else {
    if (incident.verification.status === 'passed') {
      incident.verification.status = 'stale';
      incident.verification.note = '新告警到达，原验证结论失效';
      incident.status = 'investigating';
    }
    addEvent(
      incidentId,
      'signal',
      `新增${SIGNAL_TYPES.includes(saved.type) ? saved.type : ''}信号：${saved.name}`,
      saved.detail,
      actor,
      [saved.id],
      { value: saved.value, threshold: saved.threshold }
    );
  }
  touch(incident);
  persist();
  return {
    signal: saved,
    duplicate: Boolean(duplicateOf),
    duplicateOf: duplicateOf ? duplicateOf.id : null,
    incident
  };
}

export function resolveSignal(incidentId, signalId, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const signal = incident.signals.find((s) => s.id === signalId);
  if (!signal) throw new ApiError(404, 'NOT_FOUND', `信号 ${signalId} 不存在`);
  if (signal.resolution === 'duplicate') {
    throw conflict('SIGNAL_DUPLICATE', '重复告警无需单独恢复，请处理原信号');
  }
  if (signal.resolution === 'resolved') return { signal, incident };
  signal.resolution = 'resolved';
  signal.resolvedAt = nowIso();
  addEvent(incidentId, 'signal_resolved', `信号恢复：${signal.name}`, signal.detail, actor, [signal.id]);
  touch(incident);
  persist();
  return { signal, incident };
}

export function assignIncident(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const owner = requireText(body.owner, 'owner', 2);
  const assignee = requireText(body.assignee, 'assignee', 2);
  if (!db().users.includes(assignee)) throw bad('VALIDATION', `未知的 assignee：${assignee}`);
  const prev = { owner: incident.owner, assignee: incident.assignee };
  incident.owner = owner;
  incident.assignee = assignee;
  if (incident.status === 'triaged') incident.status = 'investigating';
  addEvent(
    incidentId,
    'assignment',
    prev.assignee ? `改派给 ${assignee}` : `分派给 ${assignee}`,
    `责任团队：${owner}；主责人：${assignee}`,
    actor,
    [],
    { from: prev, to: { owner, assignee } }
  );
  touch(incident);
  persist();
  return incident;
}

export function updateRootCause(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const rootCause = requireText(body.rootCause, 'rootCause', 6);
  const category = body.rootCauseCategory || incident.rootCauseCategory || 'unknown';
  const prev = incident.rootCause;
  incident.rootCause = rootCause;
  incident.rootCauseCategory = category;
  if (incident.status === 'triaged') incident.status = 'investigating';
  addEvent(
    incidentId,
    'root_cause',
    prev ? '更新根因' : '记录根因',
    rootCause,
    actor,
    [],
    { category, previous: prev || null }
  );
  touch(incident);
  persist();
  return incident;
}

export function updateScope(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const prev = incident.affectedScope;
  const segments = Array.isArray(body.segments)
    ? body.segments.map((s) => String(s).trim()).filter(Boolean)
    : prev.segments;
  const estimatedUsers = body.estimatedUsers == null ? prev.estimatedUsers : Number(body.estimatedUsers);
  if (Number.isNaN(estimatedUsers) || estimatedUsers < 0) throw bad('VALIDATION', 'estimatedUsers 必须是非负数');
  const estimatedRevenue = body.estimatedRevenue == null ? prev.estimatedRevenue : Number(body.estimatedRevenue);
  if (Number.isNaN(estimatedRevenue) || estimatedRevenue < 0) throw bad('VALIDATION', 'estimatedRevenue 必须是非负数');
  const periodStart = body.periodStart === undefined ? prev.periodStart : isoOrNull(body.periodStart, 'periodStart');
  const periodEnd = body.periodEnd === undefined ? prev.periodEnd : isoOrNull(body.periodEnd, 'periodEnd');
  if (periodStart && periodEnd && new Date(periodEnd) <= new Date(periodStart)) {
    throw bad('VALIDATION', '影响结束时间必须晚于开始时间');
  }
  incident.affectedScope = {
    segments,
    estimatedUsers,
    estimatedRevenue,
    currency: body.currency || prev.currency || 'CNY',
    periodStart,
    periodEnd,
    confirmed: body.confirmed == null ? prev.confirmed : Boolean(body.confirmed),
    note: body.note == null ? prev.note : String(body.note)
  };
  addEvent(
    incidentId,
    'scope',
    incident.affectedScope.confirmed ? '确认影响范围' : '更新影响范围',
    `${segments.join('、') || '未填分段'} · 约 ${estimatedUsers.toLocaleString('zh-CN')} 用户`,
    actor,
    [],
    { before: prev, after: incident.affectedScope }
  );
  touch(incident);
  persist();
  return incident;
}

export function addEvidence(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const title = requireText(body.title, 'title', 3);
  const content = requireText(body.content, 'content', 3);
  const source = requireText(body.source, 'source', 2);
  const type = body.type || 'note';
  if (!['log', 'metric', 'query', 'screenshot', 'note'].includes(type)) {
    throw bad('VALIDATION', 'type 必须是 log / metric / query / screenshot / note');
  }
  const linkedSignalIds = Array.isArray(body.linkedSignalIds) ? body.linkedSignalIds : [];
  for (const sid of linkedSignalIds) {
    if (!incident.signals.some((s) => s.id === sid)) {
      throw bad('VALIDATION', `关联信号 ${sid} 不属于该异常`);
    }
  }
  const evidence = {
    id: nextId('EV'),
    incidentId,
    title,
    type,
    content,
    source,
    collectedBy: body.collectedBy || actor,
    collectedAt: nowIso(),
    linkedSignalIds,
    immutable: true,
    originIncidentId: null
  };
  db().evidence.push(evidence);
  addEvent(incidentId, 'evidence', `记录证据：${title}`, source, actor, [evidence.id], { evidenceType: type });
  touch(incident);
  persist();
  return evidence;
}

export function createTask(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const title = requireText(body.title, 'title', 4);
  const owner = requireText(body.owner, 'owner', 2);
  const priority = body.priority || 'P2';
  if (!['P0', 'P1', 'P2', 'P3'].includes(priority)) throw bad('VALIDATION', 'priority 必须是 P0-P3');
  const task = {
    id: nextId('TASK'),
    incidentId,
    title,
    status: 'todo',
    priority,
    owner,
    dueAt: isoOrNull(body.dueAt, 'dueAt'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    canceledReason: null,
    result: '',
    originIncidentId: null
  };
  db().tasks.push(task);
  if (incident.verification.status === 'passed') {
    incident.verification.status = 'stale';
    incident.verification.note = '新增修复任务，原验证结论失效';
  }
  if (incident.status === 'verified') incident.status = 'fixing';
  addEvent(incidentId, 'task', `创建修复任务：${title}`, `负责人 ${owner} · ${priority}`, actor, [task.id]);
  touch(incident);
  persist();
  return task;
}

const TASK_TRANSITIONS = {
  todo: ['in_progress', 'done', 'canceled'],
  in_progress: ['todo', 'done', 'canceled'],
  done: [],
  canceled: []
};

export function updateTask(taskId, body = {}, actor) {
  const task = getTask(taskId);
  const incident = getIncident(task.incidentId);
  assertWritable(incident);
  const next = body.status;
  if (!next) throw bad('VALIDATION', '缺少 status');
  if (!['todo', 'in_progress', 'done', 'canceled'].includes(next)) {
    throw bad('VALIDATION', 'status 必须是 todo / in_progress / done / canceled');
  }
  if (next === task.status) {
    throw conflict('TASK_NOOP', `任务已处于 ${next} 状态`);
  }
  if (!TASK_TRANSITIONS[task.status].includes(next)) {
    throw conflict('TASK_TRANSITION', `任务不能从 ${task.status} 变更为 ${next}`);
  }
  if (next === 'done') {
    requireText(body.result, 'result', 3);
    task.result = body.result.trim();
  }
  if (next === 'canceled') {
    requireText(body.canceledReason, 'canceledReason', 4);
    task.canceledReason = body.canceledReason.trim();
    addEvent(
      incident.id,
      'task_cancel',
      `取消任务：${task.title}`,
      `原因：${task.canceledReason}`,
      actor,
      [task.id],
      { from: task.status }
    );
  } else if (next === 'done') {
    addEvent(incident.id, 'task', `任务完成：${task.title}`, task.result, actor, [task.id]);
  } else {
    addEvent(incident.id, 'task', `任务流转：${task.title}`, `${task.status} → ${next}`, actor, [task.id]);
  }
  task.status = next;
  task.updatedAt = nowIso();
  touch(incident);
  persist();
  return { task, incident };
}

export function addVersion(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const kind = body.kind || 'fix';
  if (!['fix', 'backfill', 'mitigation', 'discovery'].includes(kind)) {
    throw bad('VALIDATION', 'kind 必须是 fix / backfill / mitigation / discovery');
  }
  const note = requireText(body.note, 'note', 3);
  if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) {
    throw bad('VALIDATION', 'snapshot 必须是对象');
  }
  const snapshot = {};
  for (const [key, value] of Object.entries(body.snapshot)) {
    if (!key.trim()) continue;
    if (value == null || value === '') continue;
    snapshot[key.trim()] = typeof value === 'number' ? value : String(value);
  }
  if (!Object.keys(snapshot).length) throw bad('VALIDATION', 'snapshot 至少包含一个指标');
  // 修复 / 回补必须存在变更前版本，否则无法做前后对比
  if (incident.versions.length === 0) {
    throw bad('VERSION_NO_BASELINE', '缺少变更前版本，无法保留前后对照');
  }
  const seq = incident.versions.length + 1;
  const kindLabel = { fix: '修复后', backfill: '数据回补', mitigation: '缓解后', discovery: '发现' }[kind];
  const version = {
    id: nextId('V'),
    label: body.label ? String(body.label) : `v${seq} · ${kindLabel}`,
    kind,
    createdAt: nowIso(),
    createdBy: body.createdBy || actor,
    snapshot,
    note,
    originIncidentId: null
  };
  incident.versions.push(version);
  if (kind === 'fix' || kind === 'backfill') {
    if (incident.status !== 'fixing') incident.status = 'fixing';
    if (incident.verification.status === 'passed') {
      incident.verification.status = 'stale';
      incident.verification.note = '修复/回补产生新版本，需要重新验证';
    }
  }
  addEvent(
    incidentId,
    kind === 'backfill' ? 'backfill' : 'version',
    `保留版本：${version.label}`,
    note,
    actor,
    [version.id],
    { kind, snapshot }
  );
  touch(incident);
  persist();
  return version;
}

export function recordVerification(incidentId, body = {}, actor) {
  const incident = getIncident(incidentId);
  assertWritable(incident);
  const status = body.status;
  if (!['passed', 'failed'].includes(status)) throw bad('VALIDATION', 'status 必须是 passed 或 failed');
  const method = requireText(body.method, 'method', 4);
  const checkedBy = body.checkedBy || actor;
  let evidenceId = body.evidenceId || null;
  if (status === 'passed') {
    if (!evidenceId) throw bad('VERIFICATION_EVIDENCE_REQUIRED', '验证通过必须关联一条验证证据');
    const ev = db().evidence.find((e) => e.id === evidenceId && e.incidentId === incidentId);
    if (!ev) throw bad('VERIFICATION_EVIDENCE_REQUIRED', '验证证据必须属于当前异常');
    const pending = db().tasks.filter((t) => t.incidentId === incidentId && !TERMINAL_TASKS.includes(t.status));
    if (pending.length) {
      throw conflict('VERIFICATION_TASKS_PENDING', `仍有 ${pending.length} 个修复任务未完成，不能通过验证`, {
        taskIds: pending.map((t) => t.id)
      });
    }
  }
  incident.verification = {
    status,
    method,
    checkedAt: nowIso(),
    checkedBy,
    evidenceId,
    note: body.note ? String(body.note) : ''
  };
  if (status === 'passed') incident.status = 'verified';
  addEvent(
    incidentId,
    'verification',
    status === 'passed' ? '验证通过' : '验证未通过',
    method,
    checkedBy,
    evidenceId ? [evidenceId] : [],
    { status }
  );
  touch(incident);
  persist();
  return incident;
}

function latestChangeVersion(incident) {
  return [...incident.versions]
    .filter((v) => v.kind === 'fix' || v.kind === 'backfill')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

export function closeCheck(incidentId) {
  const incident = getIncident(incidentId);
  const scopedEvidence = db().evidence.filter((e) => e.incidentId === incidentId);
  const tasks = db().tasks.filter((t) => t.incidentId === incidentId);
  const scope = incident.affectedScope;
  const verification = incident.verification;
  const nonDuplicateSignals = incident.signals.filter((s) => s.resolution !== 'duplicate');
  const unresolved = nonDuplicateSignals.filter((s) => s.resolution !== 'resolved');
  const pendingTasks = tasks.filter((t) => !TERMINAL_TASKS.includes(t.status));
  const badCanceled = tasks.filter((t) => t.status === 'canceled' && !(t.canceledReason || '').trim());
  const change = latestChangeVersion(incident);
  const verificationEvidence = scopedEvidence.find((e) => e.id === verification.evidenceId);
  const verificationAfterChange = !change || !verification.checkedAt
    ? !change
    : new Date(verification.checkedAt) >= new Date(change.createdAt);
  const hasBaseline = !change || incident.versions.some(
    (v) => v.id !== change.id && new Date(v.createdAt) <= new Date(change.createdAt)
  );
  const merged = incident.status === 'merged';

  const checks = [
    {
      key: 'status',
      label: '异常处于可关闭状态',
      passed: !['closed', 'merged'].includes(incident.status),
      detail: incident.status === 'closed'
        ? `已于 ${incident.closedAt} 关闭`
        : '当前状态可关闭'
    },
    {
      key: 'root_cause',
      label: '根因已定位',
      passed: Boolean(incident.rootCause && incident.rootCauseCategory && incident.rootCauseCategory !== 'unknown'),
      detail: incident.rootCause || '尚未记录根因与分类'
    },
    {
      key: 'ownership',
      label: '责任已分派',
      passed: Boolean(incident.owner && incident.assignee),
      detail: incident.owner ? `${incident.owner} · ${incident.assignee}` : '尚未分派责任团队与主责人'
    },
    {
      key: 'scope',
      label: '影响范围已确认',
      passed: Boolean(
        scope.confirmed && scope.segments.length > 0 && scope.estimatedUsers > 0 &&
        scope.periodStart && scope.periodEnd &&
        new Date(scope.periodEnd) > new Date(scope.periodStart)
      ),
      detail: scope.confirmed
        ? `${scope.segments.join('、') || '无分段'} · ${scope.estimatedUsers.toLocaleString('zh-CN')} 用户 · ¥${Number(scope.estimatedRevenue || 0).toLocaleString('zh-CN')}`
        : '影响范围尚未确认（需分段、人数与时间窗）'
    },
    {
      key: 'evidence',
      label: '证据链完整',
      passed: scopedEvidence.length > 0,
      detail: `已记录 ${scopedEvidence.length} 条证据`
    },
    {
      key: 'signals',
      label: '信号已收敛',
      passed: nonDuplicateSignals.length > 0 && unresolved.length === 0,
      detail: unresolved.length
        ? `${unresolved.length} 条信号仍为 open：${unresolved.map((s) => s.name).join('、')}`
        : `${nonDuplicateSignals.length} 条有效信号均已恢复，重复告警已归档`
    },
    {
      key: 'tasks',
      label: '修复任务已闭环',
      passed: tasks.length > 0 && pendingTasks.length === 0 && badCanceled.length === 0,
      detail: tasks.length === 0
        ? '尚未创建修复任务'
        : pendingTasks.length
          ? `${pendingTasks.length} 个任务未完成：${pendingTasks.map((t) => t.title).join('、')}`
          : badCanceled.length
            ? '取消任务必须记录取消原因'
            : `${tasks.length} 个任务均已结束（含 ${tasks.filter((t) => t.status === 'canceled').length} 个已取消）`
    },
    {
      key: 'verification',
      label: '验证结果通过',
      passed: verification.status === 'passed' && Boolean(verificationEvidence) && Boolean(verification.method && verification.checkedBy),
      detail: verification.status === 'passed' && !verificationEvidence
        ? '验证通过但缺少关联证据'
        : verification.status === 'passed'
          ? `${verification.method} · ${verification.checkedBy}`
          : verification.status === 'stale'
            ? `验证已失效：${verification.note || '需重新验证'}`
            : `当前验证状态：${verification.status}`
    },
    {
      key: 'verification_after_change',
      label: '验证晚于最近修复/回补',
      passed: verificationAfterChange,
      detail: change
        ? verificationAfterChange
          ? `验证晚于 ${change.label}`
          : `验证时间早于 ${change.label}，需重新验证`
        : '无修复/回补版本，按发现版本验证'
    },
    {
      key: 'versions',
      label: '前后版本已保留',
      passed: incident.versions.length > 0 && hasBaseline,
      detail: `${incident.versions.length} 个版本${change ? `，最近变更：${change.label}` : ''}`
    },
    {
      key: 'not_merged',
      label: '异常未被合并',
      passed: !merged,
      detail: merged ? `已合并至 ${incident.mergedInto}，请在目标异常中关闭` : '当前异常独立存在'
    }
  ];
  const blockers = checks
    .filter((c) => !c.passed)
    .map((c) => ({ code: c.key, message: `${c.label}：${c.detail}` }));
  return { canClose: blockers.length === 0, blockers, checks, evidenceCount: scopedEvidence.length, taskSummary: {
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    canceled: tasks.filter((t) => t.status === 'canceled').length,
    pending: pendingTasks.length
  } };
}

export function closeIncident(incidentId, actor, body = {}) {
  const incident = getIncident(incidentId);
  if (incident.status === 'closed') throw conflict('INCIDENT_CLOSED', '异常已关闭');
  if (incident.status === 'merged') throw conflict('INCIDENT_MERGED', `异常已合并至 ${incident.mergedInto}`);
  const check = closeCheck(incidentId);
  if (!check.canClose) {
    throw new ApiError(409, 'CLOSE_CHECK_FAILED', '关闭检查未通过，请先处理阻断项', check);
  }
  const summary = (body.summary || '').trim();
  incident.status = 'closed';
  incident.closedAt = nowIso();
  addEvent(
    incidentId,
    'close',
    '异常关闭',
    summary || `影响范围与验证结果均已确认 · ${check.evidenceCount} 条证据 · ${check.taskSummary.done} 个完成任务`,
    actor,
    incident.versions.map((v) => v.id),
    { checks: check.checks.map((c) => c.key) }
  );
  touch(incident);
  persist();
  return { incident, check };
}

export function mergeCandidates(incidentId) {
  const incident = getIncident(incidentId);
  if (!incident.rootCause) return [];
  const target = normalizeRootCause(incident.rootCause);
  return db().incidents.filter((other) => {
    if (other.id === incident.id) return false;
    if (other.status === 'closed' || other.status === 'merged') return false;
    if (!other.rootCause || !other.rootCauseCategory) return false;
    return normalizeRootCause(other.rootCause) === target &&
      other.rootCauseCategory === incident.rootCauseCategory;
  }).map((other) => ({
    id: other.id,
    title: other.title,
    status: other.status,
    severity: other.severity,
    evidenceCount: db().evidence.filter((e) => e.incidentId === other.id).length,
    signalCount: other.signals.length,
    updatedAt: other.updatedAt
  }));
}

export function mergeIncidents(targetId, sourceId, actor, body = {}) {
  const target = getIncident(targetId);
  const source = getIncident(sourceId);
  if (targetId === sourceId) throw bad('VALIDATION', '不能合并到自身');
  assertWritable(target);
  assertWritable(source);
  if (!target.rootCause || !source.rootCause) {
    throw conflict('MERGE_NO_ROOT_CAUSE', '双方都必须已记录根因才能合并');
  }
  if (normalizeRootCause(target.rootCause) !== normalizeRootCause(source.rootCause) ||
      target.rootCauseCategory !== source.rootCauseCategory) {
    throw conflict('MERGE_ROOT_CAUSE_MISMATCH', '仅相同根因（内容与分类一致）的异常可以合并', {
      target: { rootCause: target.rootCause, category: target.rootCauseCategory },
      source: { rootCause: source.rootCause, category: source.rootCauseCategory }
    });
  }
  const sourceEvidence = db().evidence.filter((e) => e.incidentId === sourceId);
  const sourceTasks = db().tasks.filter((t) => t.incidentId === sourceId);
  const sourceSignals = source.signals;
  const sourceVersions = source.versions;
  const beforeEvidenceCount = db().evidence.filter((e) => e.incidentId === targetId).length;

  for (const signal of sourceSignals) {
    signal.incidentId = targetId;
    signal.originIncidentId = sourceId;
    target.signals.push(signal);
  }
  source.signals = [];
  for (const ev of sourceEvidence) {
    ev.incidentId = targetId;
    ev.originIncidentId = sourceId;
  }
  for (const task of sourceTasks) {
    task.incidentId = targetId;
    task.originIncidentId = sourceId;
  }
  for (const version of sourceVersions) {
    target.versions.push({
      ...version,
      originVersionId: version.id,
      originIncidentId: sourceId,
      id: nextId('V'),
      mergedFrom: sourceId
    });
  }
  target.versions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 重复告警在合并后再次校验：按类型+名称分组，最早触发的保留为原始信号，
  // 其余标记为 duplicate 并重新指向原始信号；每一条都保留，绝不删除。
  const groups = new Map();
  for (const signal of target.signals) {
    if (signal.resolution === 'duplicate') continue;
    const key = `${signal.type}::${signal.name.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(signal);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.firedAt) - new Date(b.firedAt) || a.id.localeCompare(b.id));
    const original = group[0];
    // 原始信号若此前被标记为重复（指向了一个更晚的信号），恢复它并清理悬空引用
    if (original.resolution === 'duplicate') {
      original.resolution = 'open';
      original.duplicateOf = null;
    }
    for (const dup of group.slice(1)) {
      if (dup.resolution === 'resolved') continue;
      dup.resolution = 'duplicate';
      dup.duplicateOf = original.id;
    }
  }

  const movedEvidenceIds = sourceEvidence.map((e) => e.id);
  const afterEvidenceCount = db().evidence.filter((e) => e.incidentId === targetId).length;
  if (afterEvidenceCount !== beforeEvidenceCount + sourceEvidence.length) {
    throw new ApiError(500, 'EVIDENCE_LOSS', '合并完整性校验失败：证据数量不守恒');
  }

  const mergeAt = nowIso();
  const targetMerge = {
    sourceIncidentId: sourceId,
    sourceTitle: source.title,
    mergedAt: mergeAt,
    mergedBy: actor,
    evidenceIds: movedEvidenceIds,
    signalIds: sourceSignals.map((s) => s.id),
    taskIds: sourceTasks.map((t) => t.id),
    versionIds: sourceVersions.map((v) => v.id),
    note: (body.note || '').trim()
  };
  target.merges.push(targetMerge);
  if (target.status === 'triaged') target.status = 'investigating';
  addEvent(
    targetId,
    'merge',
    `合并异常 ${sourceId}`,
    `同根因合并：${source.title}；迁入 ${sourceSignals.length} 条信号、${movedEvidenceIds.length} 条证据、${sourceTasks.length} 个任务，单条证据全部保留。`,
    actor,
    [sourceId, ...movedEvidenceIds],
    { sourceIncidentId: sourceId, evidenceIds: movedEvidenceIds }
  );

  source.merges.push({
    targetIncidentId: targetId,
    targetTitle: target.title,
    mergedAt: mergeAt,
    mergedBy: actor,
    evidenceIds: movedEvidenceIds,
    note: targetMerge.note
  });
  source.status = 'merged';
  source.mergedInto = targetId;
  source.mergedAt = mergeAt;
  addEvent(
    sourceId,
    'merge',
    `已合并至 ${targetId}`,
    `根因与 ${targetId} 一致；${movedEvidenceIds.length} 条证据迁入并保留原始出处。`,
    actor,
    [targetId, ...movedEvidenceIds],
    { targetIncidentId: targetId }
  );
  source.evidenceSnapshot = movedEvidenceIds;
  touch(target);
  touch(source);
  persist();
  return { target, source, moved: { evidenceIds: movedEvidenceIds, signalIds: targetMerge.signalIds, taskIds: targetMerge.taskIds } };
}

export function getTimeline(incidentId) {
  getIncident(incidentId);
  return db().events
    .filter((e) => e.incidentId === incidentId)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function getIncidentBundle(incidentId) {
  const incident = getIncident(incidentId);
  const evidence = db().evidence.filter((e) => e.incidentId === incidentId);
  const tasks = db().tasks.filter((t) => t.incidentId === incidentId);
  let mergeSource = null;
  if (incident.mergedInto) {
    const t = db().incidents.find((i) => i.id === incident.mergedInto);
    if (t) mergeSource = { id: t.id, title: t.title, status: t.status };
  }
  return {
    incident,
    timeline: getTimeline(incidentId),
    evidence,
    tasks,
    closeCheck: closeCheck(incidentId),
    mergeCandidates: incident.status === 'closed' || incident.status === 'merged' ? [] : mergeCandidates(incidentId),
    mergedTarget: mergeSource
  };
}

export function diffVersions(incidentId, aId, bId) {
  const incident = getIncident(incidentId);
  const a = incident.versions.find((v) => v.id === aId);
  const b = incident.versions.find((v) => v.id === bId);
  if (!a || !b) throw new ApiError(404, 'NOT_FOUND', '版本不存在');
  const keys = [...new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)])];
  const rows = keys.map((key) => {
    const before = a.snapshot[key] ?? null;
    const after = b.snapshot[key] ?? null;
    const numeric = typeof before === 'number' && typeof after === 'number';
    const delta = numeric ? Number((after - before).toFixed(4)) : null;
    let change = 'same';
    if (before == null && after != null) change = 'added';
    else if (before != null && after == null) change = 'removed';
    else if (before !== after) change = 'changed';
    return { key, before, after, delta, change, direction: delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
  });
  return {
    from: { id: a.id, label: a.label, kind: a.kind, createdAt: a.createdAt },
    to: { id: b.id, label: b.label, kind: b.kind, createdAt: b.createdAt },
    rows,
    changedCount: rows.filter((r) => r.change !== 'same').length
  };
}

export function listState() {
  const state = db();
  return {
    incidents: state.incidents,
    users: state.users,
    teams: state.teams,
    currentUser: state.currentUser,
    counts: {
      open: state.incidents.filter((i) => !['closed', 'merged'].includes(i.status)).length,
      evidence: state.evidence.length,
      tasks: state.tasks.length
    }
  };
}
