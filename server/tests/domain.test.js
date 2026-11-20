import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-test-'));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';

const { app } = await import('../index.js');
const { resetForTests } = await import('../store.js');

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetForTests();
});

async function api(method, url, body, actor = 'tester') {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-actor': actor },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function signal(type, name, extra = {}) {
  return { type, name, detail: `${name} 超出阈值`, value: 10, threshold: 5, window: '5m', ...extra };
}

async function makeIncident(overrides = {}) {
  const res = await api('POST', '/api/incidents', {
    title: '测试异常：核心指标异常',
    severity: 'P2',
    signals: [signal('latency', '接口 P99'), signal('business', '订单量')],
    ...overrides
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function fullyPrepare(incidentId, actor = 'tester') {
  await api('PATCH', `/api/incidents/${incidentId}/root-cause`, {
    rootCause: '上游限流导致请求被拒绝', rootCauseCategory: 'upstream_dependency'
  }, actor);
  await api('PATCH', `/api/incidents/${incidentId}/assignment`, { owner: '支付组', assignee: 'zhao.yun' }, actor);
  await api('PATCH', `/api/incidents/${incidentId}/scope`, {
    segments: ['iOS'], estimatedUsers: 1000, estimatedRevenue: 5000,
    periodStart: new Date(Date.now() - 3600_000).toISOString(),
    periodEnd: new Date(Date.now() - 1800_000).toISOString(), confirmed: true
  }, actor);
  const ev = await api('POST', `/api/incidents/${incidentId}/evidence`, {
    title: '限流日志', content: '429 数量激增', source: 'kibana'
  }, actor);
  assert.equal(ev.status, 201);
  const task = await api('POST', `/api/incidents/${incidentId}/tasks`, {
    title: '调整限流阈值', owner: 'zhao.yun', priority: 'P1'
  }, actor);
  assert.equal(task.status, 201);
  await api('PATCH', `/api/tasks/${task.body.id}`, { status: 'done', result: '阈值已从 100 调到 300' }, actor);
  const version = await api('POST', `/api/incidents/${incidentId}/versions`, {
    kind: 'fix', note: '调整限流阈值', snapshot: { 成功率: 99.2 }
  }, actor);
  assert.equal(version.status, 201);
  const ver = await api('POST', `/api/incidents/${incidentId}/verification`, {
    status: 'passed', method: '观察 30 分钟，成功率恢复', evidenceId: ev.body.id
  }, actor);
  assert.equal(ver.status, 200, JSON.stringify(ver.body));
  for (const s of ver.body.signals) {
    if (s.resolution === 'open') {
      await api('POST', `/api/incidents/${incidentId}/signals/${s.id}/resolve`, {}, actor);
    }
  }
}

describe('多信号触发', () => {
  it('拒绝只有单一业务信号的异常', async () => {
    const res = await api('POST', '/api/incidents', {
      title: '业务信号单独触发', signals: [signal('business', '订单量')]
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION');
  });

  it('拒绝两类但缺少质量/延迟信号的组合', async () => {
    const res = await api('POST', '/api/incidents', {
      title: '业务信号重复', signals: [signal('business', '订单量'), signal('business', 'GMV')]
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TRIGGER_INSUFFICIENT');
  });

  it('允许质量 + 业务 + 延迟共同触发', async () => {
    const inc = await makeIncident({
      signals: [signal('quality', '完整性'), signal('business', '订单量'), signal('latency', 'P99')]
    });
    assert.equal(inc.signals.length, 3);
    assert.deepEqual(inc.trigger.types.sort(), ['business', 'latency', 'quality']);
    assert.equal(inc.trigger.coverage, '3/3');
  });

  it('异常创建事件进入时间线且包含所有信号引用', async () => {
    const inc = await makeIncident();
    const bundle = await api('GET', `/api/incidents/${inc.id}`);
    assert.equal(bundle.status, 200);
    const detection = bundle.body.timeline.find((e) => e.kind === 'detection');
    assert.ok(detection);
    assert.equal(detection.refs.length, 2);
  });
});

describe('重复告警', () => {
  it('窗口内同名同类型告警标记为重复但保留两条记录', async () => {
    const inc = await makeIncident();
    const first = inc.signals.find((s) => s.type === 'latency');
    const res = await api('POST', `/api/incidents/${inc.id}/signals`, signal('latency', '接口 P99'));
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicate, true);
    assert.equal(res.body.duplicateOf, first.id);
    assert.equal(res.body.signal.resolution, 'duplicate');

    const bundle = await api('GET', `/api/incidents/${inc.id}`);
    const latencySignals = bundle.body.incident.signals.filter((s) => s.type === 'latency');
    assert.equal(latencySignals.length, 2, '重复告警不得删除原信号');
    assert.equal(bundle.body.incident.signals.find((s) => s.id === first.id).resolution, 'open');
    const dupEvent = bundle.body.timeline.find((e) => e.kind === 'duplicate_alert');
    assert.ok(dupEvent);
    assert.deepEqual(dupEvent.refs.sort(), [first.id, res.body.signal.id].sort());
  });

  it('超出窗口的同名告警视为新信号并让验证失效', async () => {
    const inc = await makeIncident();
    await fullyPrepare(inc.id);
    const before = await api('GET', `/api/incidents/${inc.id}`);
    assert.equal(before.body.incident.status, 'verified');

    const res = await api('POST', `/api/incidents/${inc.id}/signals`, signal('latency', '接口 P99', {
      firedAt: new Date(Date.now() + 60 * 60000).toISOString()
    }));
    assert.equal(res.body.duplicate, false);
    const after = await api('GET', `/api/incidents/${inc.id}`);
    assert.equal(after.body.incident.verification.status, 'stale');
    assert.equal(after.body.incident.status, 'investigating');
  });

  it('重复告警不能单独恢复，需处理原信号', async () => {
    const inc = await makeIncident();
    const dup = await api('POST', `/api/incidents/${inc.id}/signals`, signal('latency', '接口 P99'));
    const res = await api('POST', `/api/incidents/${inc.id}/signals/${dup.body.signal.id}/resolve`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'SIGNAL_DUPLICATE');
  });
});

describe('关闭检查与验证', () => {
  it('未准备完成的异常关闭被阻断并列出阻断项', async () => {
    const inc = await makeIncident();
    const check = await api('GET', `/api/incidents/${inc.id}/close-check`);
    assert.equal(check.status, 200);
    assert.equal(check.body.canClose, false);
    const codes = check.body.blockers.map((b) => b.code);
    for (const key of ['root_cause', 'ownership', 'scope', 'evidence', 'tasks', 'verification']) {
      assert.ok(codes.includes(key), `缺少阻断项 ${key}`);
    }
    const close = await api('POST', `/api/incidents/${inc.id}/close`, {});
    assert.equal(close.status, 409);
    assert.equal(close.body.code, 'CLOSE_CHECK_FAILED');
  });

  it('存在未完成任务时验证不能通过', async () => {
    const inc = await makeIncident();
    const ev = await api('POST', `/api/incidents/${inc.id}/evidence`, {
      title: '限流日志证据', content: '429 响应激增', source: 'kibana'
    });
    await api('POST', `/api/incidents/${inc.id}/tasks`, { title: '待修复任务', owner: 'zhao.yun' });
    const ver = await api('POST', `/api/incidents/${inc.id}/verification`, {
      status: 'passed', method: '观察指标恢复', evidenceId: ev.body.id
    });
    assert.equal(ver.status, 409);
    assert.equal(ver.body.code, 'VERIFICATION_TASKS_PENDING');
  });

  it('验证通过必须带同异常的证据', async () => {
    const inc = await makeIncident();
    const res = await api('POST', `/api/incidents/${inc.id}/verification`, {
      status: 'passed', method: '观察指标恢复'
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VERIFICATION_EVIDENCE_REQUIRED');
  });

  it('修复/回补后验证时间早于版本时失效并阻断关闭', async () => {
    const inc = await makeIncident();
    await fullyPrepare(inc.id);
    const check = await api('GET', `/api/incidents/${inc.id}/close-check`);
    assert.equal(check.body.canClose, true, JSON.stringify(check.body.blockers));

    await api('POST', `/api/incidents/${inc.id}/versions`, {
      kind: 'backfill', note: '回补丢失数据', snapshot: { 成功率: 99.4 }
    });
    const after = await api('GET', `/api/incidents/${inc.id}/close-check`);
    assert.equal(after.body.canClose, false);
    const codes = after.body.blockers.map((b) => b.code);
    assert.ok(codes.includes('verification') || codes.includes('verification_after_change'));
  });

  it('完整闭环后关闭成功并留痕', async () => {
    const inc = await makeIncident();
    await fullyPrepare(inc.id);
    const close = await api('POST', `/api/incidents/${inc.id}/close`, { summary: '复盘完成' });
    assert.equal(close.status, 200, JSON.stringify(close.body));
    assert.equal(close.body.incident.status, 'closed');
    assert.ok(close.body.incident.closedAt);
    const bundle = await api('GET', `/api/incidents/${inc.id}`);
    const closeEvent = bundle.body.timeline.find((e) => e.kind === 'close');
    assert.equal(closeEvent.body, '复盘完成');
    assert.equal(bundle.body.closeCheck.canClose, false, '已关闭异常不应再次通过关闭检查');
  });

  it('关闭后所有写操作被拒绝', async () => {
    const inc = await makeIncident();
    await fullyPrepare(inc.id);
    await api('POST', `/api/incidents/${inc.id}/close`, {});
    const res = await api('PATCH', `/api/incidents/${inc.id}/root-cause`, {
      rootCause: '修改后的根因描述', rootCauseCategory: 'instrumentation'
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INCIDENT_CLOSED');
  });
});

describe('合并异常', () => {
  it('相同根因可合并，证据全部保留且原始出处可追溯', async () => {
    const a = await makeIncident({ title: '异常现象 A' });
    const b = await makeIncident({ title: '异常现象 B' });
    for (const inc of [a, b]) {
      await api('PATCH', `/api/incidents/${inc.id}/root-cause`, {
        rootCause: '上游限流导致请求被拒绝', rootCauseCategory: 'upstream_dependency'
      });
    }
    await api('POST', `/api/incidents/${a.id}/evidence`, { title: 'A 证据 1', content: '证据内容 a1', source: 'log' });
    await api('POST', `/api/incidents/${a.id}/evidence`, { title: 'A 证据 2', content: '证据内容 a2', source: 'log' });
    const bEv = await api('POST', `/api/incidents/${b.id}/evidence`, { title: 'B 证据 1', content: '证据内容 b1', source: 'log' });

    const candidates = await api('GET', `/api/incidents/${a.id}/merge-candidates`);
    assert.equal(candidates.body.length, 1);
    assert.equal(candidates.body[0].id, b.id);

    const res = await api('POST', `/api/incidents/${a.id}/merge`, { sourceId: b.id });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const target = await api('GET', `/api/incidents/${a.id}`);
    assert.equal(target.body.evidence.length, 3, '合并后证据不能丢失');
    const moved = target.body.evidence.find((e) => e.id === bEv.body.id);
    assert.equal(moved.incidentId, a.id);
    assert.equal(moved.originIncidentId, b.id);
    assert.equal(moved.content, '证据内容 b1');

    const source = await api('GET', `/api/incidents/${b.id}`);
    assert.equal(source.body.incident.status, 'merged');
    assert.equal(source.body.incident.mergedInto, a.id);
    assert.deepEqual(source.body.incident.evidenceSnapshot.sort(), [bEv.body.id]);
    assert.ok(source.body.timeline.some((e) => e.kind === 'merge'));
  });

  it('根因不同拒绝合并', async () => {
    const a = await makeIncident({ title: '异常现象 A' });
    const b = await makeIncident({ title: '异常现象 B' });
    await api('PATCH', `/api/incidents/${a.id}/root-cause`, { rootCause: '原因甲导致异常', rootCauseCategory: 'capacity' });
    await api('PATCH', `/api/incidents/${b.id}/root-cause`, { rootCause: '原因乙导致异常', rootCauseCategory: 'capacity' });
    const res = await api('POST', `/api/incidents/${a.id}/merge`, { sourceId: b.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'MERGE_ROOT_CAUSE_MISMATCH');
  });

  it('合并后被合并异常不可再写入，且不能作为关闭目标', async () => {
    const a = await makeIncident({ title: '异常现象 A' });
    const b = await makeIncident({ title: '异常现象 B' });
    for (const inc of [a, b]) {
      await api('PATCH', `/api/incidents/${inc.id}/root-cause`, {
        rootCause: '上游限流导致请求被拒绝', rootCauseCategory: 'upstream_dependency'
      });
    }
    await api('POST', `/api/incidents/${a.id}/merge`, { sourceId: b.id });
    const res = await api('POST', `/api/incidents/${b.id}/evidence`, { title: '事后补充证据', content: '补充内容', source: 'log' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INCIDENT_MERGED');
    const close = await api('POST', `/api/incidents/${b.id}/close`, {});
    assert.equal(close.status, 409);
  });

  it('合并后同根因重复信号标记为 duplicate 但两条都保留', async () => {
    const a = await makeIncident({ title: '异常现象 A' });
    const b = await makeIncident({ title: '异常现象 B' });
    for (const inc of [a, b]) {
      await api('PATCH', `/api/incidents/${inc.id}/root-cause`, {
        rootCause: '上游限流导致请求被拒绝', rootCauseCategory: 'upstream_dependency'
      });
    }
    const res = await api('POST', `/api/incidents/${a.id}/merge`, { sourceId: b.id });
    assert.equal(res.status, 200);
    const bundle = await api('GET', `/api/incidents/${a.id}`);
    const latency = bundle.body.incident.signals.filter((s) => s.type === 'latency' && s.name === '接口 P99');
    assert.equal(latency.length, 2);
    const dup = latency.find((s) => s.resolution === 'duplicate');
    assert.ok(dup);
    assert.ok(latency.find((s) => s.id === dup.duplicateOf));
  });
});

describe('任务取消', () => {
  it('取消任务必须填写原因且写入时间线', async () => {
    const inc = await makeIncident();
    const task = await api('POST', `/api/incidents/${inc.id}/tasks`, { title: '临时任务', owner: 'zhao.yun' });
    const failed = await api('PATCH', `/api/tasks/${task.body.id}`, { status: 'canceled' });
    assert.equal(failed.status, 400);
    const okRes = await api('PATCH', `/api/tasks/${task.body.id}`, {
      status: 'canceled', canceledReason: '已有其他修复覆盖该场景'
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.task.status, 'canceled');
    const bundle = await api('GET', `/api/incidents/${inc.id}`);
    assert.ok(bundle.body.timeline.some((e) => e.kind === 'task_cancel'));
  });

  it('已取消任务不能重新激活或完成，也不阻塞关闭', async () => {
    const inc = await makeIncident();
    await fullyPrepare(inc.id);
    const task = await api('POST', `/api/incidents/${inc.id}/tasks`, { title: '不需要的任务', owner: 'zhao.yun' });
    await api('PATCH', `/api/tasks/${task.body.id}`, { status: 'canceled', canceledReason: '验证后确认无需处理' });
    const reopen = await api('PATCH', `/api/tasks/${task.body.id}`, { status: 'in_progress' });
    assert.equal(reopen.status, 409);
    assert.equal(reopen.body.code, 'TASK_TRANSITION');

    const check = await api('GET', `/api/incidents/${inc.id}/close-check`);
    assert.equal(check.body.canClose, false, '新增任务让验证失效');
    assert.equal(check.body.taskSummary.canceled, 1);
    assert.equal(check.body.taskSummary.pending, 0);
  });
});

describe('版本差异', () => {
  it('返回新增/删除/变化的指标并计算差值', async () => {
    const inc = await makeIncident();
    const v2 = await api('POST', `/api/incidents/${inc.id}/versions`, {
      kind: 'fix', note: '修复后指标', snapshot: { 成功率: 99.2, 新增指标: 5 }
    });
    const v1 = inc.versions[0];
    const diff = await api('GET', `/api/incidents/${inc.id}/versions/diff?a=${v1.id}&b=${v2.body.id}`);
    assert.equal(diff.status, 200);
    const map = Object.fromEntries(diff.body.rows.map((r) => [r.key, r]));
    assert.equal(map['新增指标'].change, 'added');
    assert.equal(map['成功率'].before, null);
    assert.equal(map['成功率'].change, 'added');
  });

  it('同一快照两个版本差异为空', async () => {
    const inc = await makeIncident({ initialSnapshot: { 成功率: 93 } });
    const v2 = await api('POST', `/api/incidents/${inc.id}/versions`, {
      kind: 'mitigation', note: '配置回滚', snapshot: { 成功率: 93 }
    });
    const diff = await api('GET', `/api/incidents/${inc.id}/versions/diff?a=${inc.versions[0].id}&b=${v2.body.id}`);
    assert.equal(diff.body.changedCount, 0);
    assert.equal(diff.body.rows[0].change, 'same');
  });
});

describe('合并时重复信号归一', () => {
  it('合并后最早触发的信号保留为原始信号，后续同名信号标记为重复', async () => {
    const a = await makeIncident({ title: '支付异常目标' });
    const b = await makeIncident({ title: '支付异常来源' });
    for (const inc of [a, b]) {
      await api('PATCH', `/api/incidents/${inc.id}/root-cause`, {
        rootCause: '网关超时导致回调丢失', rootCauseCategory: 'upstream_dependency'
      });
    }
    // 把目标侧的同名信号改到更晚的时间，验证判定按触发时间而非对象顺序
    const targetSignals = a.signals.filter((s) => s.type === 'latency');
    await api('POST', `/api/incidents/${a.id}/signals`, signal('latency', '接口 P99', {
      firedAt: new Date(Date.now() + 5 * 60000).toISOString()
    }));
    const res = await api('POST', `/api/incidents/${a.id}/merge`, { sourceId: b.id });
    assert.equal(res.status, 200);

    const bundle = await api('GET', `/api/incidents/${a.id}`);
    const latency = bundle.body.incident.signals.filter((s) => s.type === 'latency' && s.name === '接口 P99');
    const originals = latency.filter((s) => s.resolution !== 'duplicate');
    assert.equal(latency.length, 3, '目标原信号 + 合并迁入信号全部保留');
    assert.equal(originals.length, 1, '同名信号只保留一个原始信号');
    const original = originals[0];
    assert.equal(original.resolution, 'open');
    for (const dup of latency.filter((s) => s.id !== original.id)) {
      assert.equal(dup.resolution, 'duplicate');
      assert.equal(dup.duplicateOf, original.id);
      assert.ok(new Date(dup.firedAt) >= new Date(original.firedAt));
    }
    assert.ok(targetSignals.length >= 1);
  });
});

describe('ID 分配', () => {
  it('新建记录不会复用种子数据里已有的 ID', async () => {
    const inc = await makeIncident({ title: 'ID 冲突回归验证' });
    const ev = await api('POST', `/api/incidents/${inc.id}/evidence`, {
      title: '证据 A', content: '证据内容 A', source: 'log'
    });
    const task = await api('POST', `/api/incidents/${inc.id}/tasks`, {
      title: '任务 A', owner: 'zhao.yun'
    });
    const version = await api('POST', `/api/incidents/${inc.id}/versions`, {
      kind: 'fix', note: '修复说明', snapshot: { 指标: 1 }
    });
    const created = [inc.id, inc.signals[0].id, inc.signals[1].id, ev.body.id, task.body.id, version.body.id];

    const stateAll = []; // 收集全库 ID
    const resRoles = await api('GET', '/api/state');
    for (const i of resRoles.body.incidents) {
      const b = await api('GET', `/api/incidents/${i.id}`);
      stateAll.push(b.body.incident.id);
      b.body.incident.signals.forEach((s) => stateAll.push(s.id));
      b.body.incident.versions.forEach((v) => stateAll.push(v.id));
      b.body.evidence.forEach((e) => stateAll.push(e.id));
      b.body.tasks.forEach((t) => stateAll.push(t.id));
    }
    const dupes = stateAll.filter((id, idx) => stateAll.indexOf(id) !== idx);
    assert.deepEqual(dupes, [], '全库 ID 必须唯一');
    for (const id of created) {
      assert.equal(stateAll.filter((x) => x === id).length, 1, `${id} 应只出现一次`);
    }
  });

  it('新建 ID 序号大于种子数据中的最大序号', async () => {
    const inc = await makeIncident({ title: '序号递增验证' });
    const signalIds = inc.signals.map((s) => Number(s.id.split('-')[1]));
    assert.ok(signalIds.every((n) => n > 51), `信号序号应大于种子最大值 51，实际 ${signalIds}`);
  });
});
