import { useState } from 'react';
import type { Evidence, Task } from '../../types';
import { Modal } from '../Modal';

export function TaskCreateModal({
  users, onSubmit, onClose
}: {
  users: string[];
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState(users[0] ?? '');
  const [priority, setPriority] = useState('P2');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="新建修复任务"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={title.trim().length < 4 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ title, owner, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null });
                onClose();
              } finally { setBusy(false); }
            }}>
            创建任务
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="tk-title">任务标题</label>
          <input id="tk-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="如：调整网关超时阈值并灰度" />
        </div>
        <div className="form-row-3">
          <div className="field">
            <label htmlFor="tk-owner">负责人</label>
            <select id="tk-owner" className="select" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tk-priority">优先级</label>
            <select id="tk-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['P0', 'P1', 'P2', 'P3'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tk-due">截止时间</label>
            <input id="tk-due" className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          新任务会使已通过的验证失效，关闭异常前需要全部完成或带原因取消。
        </div>
      </div>
    </Modal>
  );
}

export function TaskCompleteModal({
  task, onSubmit, onClose
}: {
  task: Task;
  onSubmit: (body: { status: 'done'; result: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [result, setResult] = useState(task.result || '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="完成任务"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={result.trim().length < 3 || busy}
            onClick={async () => { setBusy(true); try { await onSubmit({ status: 'done', result }); onClose(); } finally { setBusy(false); } }}>
            标记完成
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="tk-result">完成结果</label>
        <textarea id="tk-result" className="textarea" value={result} onChange={(e) => setResult(e.target.value)}
          placeholder="描述实际改动、验证方式与结果" />
        <span className="hint">结果会写入时间线，并作为关闭检查的一部分</span>
      </div>
    </Modal>
  );
}

export function TaskCancelModal({
  task, onSubmit, onClose
}: {
  task: Task;
  onSubmit: (body: { status: 'canceled'; canceledReason: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="取消任务"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>返回</button>
          <button className="btn danger" disabled={reason.trim().length < 4 || busy}
            onClick={async () => { setBusy(true); try { await onSubmit({ status: 'canceled', canceledReason: reason }); onClose(); } finally { setBusy(false); } }}>
            确认取消
          </button>
        </>
      }
    >
      <div className="secondary" style={{ fontSize: 12 }}>{task.title}</div>
      <div className="field">
        <label htmlFor="tk-reason">取消原因（必填）</label>
        <textarea id="tk-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="如：已有其他修复覆盖该场景 / 验证后确认无需处理" />
        <span className="hint">取消后任务不可重新激活；原因会写入时间线，并可在关闭检查中追溯</span>
      </div>
    </Modal>
  );
}

export function VersionModal({
  versions, onSubmit, onClose
}: {
  versions: { id: string; label: string; snapshot: Record<string, number | string> }[];
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const latest = versions[versions.length - 1];
  const baseKeys = latest ? Object.keys(latest.snapshot) : [];
  const [kind, setKind] = useState('fix');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<{ key: string; value: string }[]>(
    baseKeys.length ? baseKeys.map((k) => ({ key: k, value: String(latest.snapshot[k]) })) : [{ key: '', value: '' }]
  );
  const [busy, setBusy] = useState(false);
  const snapshot: Record<string, number | string> = {};
  for (const r of rows) {
    if (!r.key.trim() || r.value === '') continue;
    const n = Number(r.value);
    snapshot[r.key.trim()] = Number.isNaN(n) || r.value.trim() === '' ? r.value : n;
  }
  const valid = note.trim().length >= 3 && Object.keys(snapshot).length > 0;

  return (
    <Modal
      title="保存变更后版本"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!valid || busy}
            onClick={async () => { setBusy(true); try { await onSubmit({ kind, note, snapshot }); onClose(); } finally { setBusy(false); } }}>
            保存版本
          </button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: 11.5 }}>
        当前最新版本 <b>{latest?.label ?? '—'}</b> 会作为变更前基准永久保留。修复与数据回补版本不会覆盖历史数据，并会使既有验证结论失效。
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="vr-kind">版本类型</label>
          <select id="vr-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="fix">修复</option>
            <option value="backfill">数据回补</option>
            <option value="mitigation">临时缓解</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="vr-note">变更说明</label>
          <input id="vr-note" className="input" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="如：调整限流阈值并观察 30 分钟" />
        </div>
      </div>
      <div className="field">
        <label>指标快照</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input
                className="input"
                style={{ flex: 1.2 }}
                placeholder="指标名"
                value={r.key}
                onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
              />
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="值"
                value={r.value}
                onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
              <button className="btn ghost small" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                aria-label="删除该指标">×</button>
            </div>
          ))}
        </div>
        <button className="btn ghost small" style={{ justifySelf: 'start' }}
          onClick={() => setRows((prev) => [...prev, { key: '', value: '' }])}>
          + 添加指标
        </button>
      </div>
    </Modal>
  );
}

export function VerificationModal({
  evidence, onSubmit, onClose
}: {
  evidence: Evidence[];
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'passed' | 'failed'>('passed');
  const [method, setMethod] = useState('');
  const [evidenceId, setEvidenceId] = useState(evidence[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = method.trim().length >= 4 && (status === 'failed' || Boolean(evidenceId));
  return (
    <Modal
      title="记录验证结果"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className={`btn ${status === 'passed' ? 'primary' : 'danger'}`} disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ status, method, evidenceId: evidenceId || null, note });
                onClose();
              } finally { setBusy(false); }
            }}>
            {status === 'passed' ? '验证通过' : '记录失败'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>验证结论</label>
          <div className="row" style={{ gap: 6 }}>
            <button className={`btn small ${status === 'passed' ? '' : 'ghost'}`}
              style={status === 'passed' ? { borderColor: 'var(--good)' } : undefined}
              onClick={() => setStatus('passed')}>通过</button>
            <button className={`btn small ${status === 'failed' ? '' : 'ghost'}`}
              style={status === 'failed' ? { borderColor: 'var(--critical)' } : undefined}
              onClick={() => setStatus('failed')}>未通过</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="vf-method">验证方法</label>
          <textarea id="vf-method" className="textarea" value={method} onChange={(e) => setMethod(e.target.value)}
            placeholder="如：回补后重新跑数，DAU 与预测值偏差 < 1%" />
        </div>
        <div className="field">
          <label htmlFor="vf-ev">验证证据{status === 'passed' ? '（必填）' : ''}</label>
          {evidence.length ? (
            <select id="vf-ev" className="select" value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}>
              <option value="">选择一条证据…</option>
              {evidence.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.title}</option>)}
            </select>
          ) : (
            <div className="muted" style={{ fontSize: 11.5 }}>暂无证据，请先在证据链中记录验证证据。</div>
          )}
        </div>
        <div className="field">
          <label htmlFor="vf-note">备注</label>
          <input id="vf-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {status === 'passed' && (
          <div className="muted" style={{ fontSize: 11 }}>
            验证通过要求：所有修复任务已结束、关联证据属于本异常、验证晚于最近一次修复/回补。
          </div>
        )}
      </div>
    </Modal>
  );
}

export function CloseModal({
  onClose, onConfirm, canClose, blockers, checks
}: {
  onClose: () => void;
  onConfirm: (summary: string) => Promise<void>;
  canClose: boolean;
  blockers: { code: string; message: string }[];
  checks: { key: string; label: string; passed: boolean; detail: string }[];
}) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="关闭异常"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{canClose ? '取消' : '返回处理'}</button>
          <button className="btn primary" disabled={!canClose || busy}
            onClick={async () => { setBusy(true); try { await onConfirm(summary); onClose(); } finally { setBusy(false); } }}>
            确认关闭
          </button>
        </>
      }
    >
      {canClose ? (
        <div className="form-grid">
          <div className="muted" style={{ fontSize: 12 }}>
            关闭前已完成影响范围确认、证据链、任务闭环与验证结果检查。关闭后异常变为只读。
          </div>
          <div className="field">
            <label htmlFor="cl-summary">复盘总结（可选）</label>
            <textarea id="cl-summary" className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="如：复盘完成，已更新网关超时告警阈值" />
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <div className="error-box"><b>关闭检查未通过</b>，请先处理以下阻断项：</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
            {blockers.map((b) => (
              <li key={b.code} style={{ marginBottom: 4 }}>{b.message}</li>
            ))}
          </ul>
          <div className="muted" style={{ fontSize: 11 }}>
            已通过 {checks.filter((c) => c.passed).length}/{checks.length} 项检查。关闭操作本身不会修改数据，
            处理完阻断项后可再次提交。
          </div>
        </div>
      )}
    </Modal>
  );
}
