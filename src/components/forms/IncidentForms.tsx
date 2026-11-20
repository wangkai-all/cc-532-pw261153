import { useState } from 'react';
import type { Incident, SignalType } from '../../types';
import { SIGNAL_META } from '../../lib/meta';
import { Modal } from '../Modal';

function isoLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const nowLocal = () => isoLocal(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));

export function AddSignalModal({
  incident, onSubmit, onClose
}: {
  incident: Incident;
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [type, setType] = useState<SignalType>('latency');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [value, setValue] = useState('');
  const [threshold, setThreshold] = useState('');
  const [window, setWindow] = useState('5m');
  const [source, setSource] = useState('metric-monitor');
  const [firedAt, setFiredAt] = useState(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({
        type,
        name,
        detail: detail || `${name} 超过阈值`,
        value: value === '' ? null : Number(value),
        threshold: threshold === '' ? null : Number(threshold),
        window,
        source,
        firedAt: firedAt ? new Date(firedAt).toISOString() : undefined
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = name.trim().length >= 2;

  return (
    <Modal
      title="关联新告警"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!canSubmit || busy} onClick={submit}>
            提交告警
          </button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: 11.5 }}>
        提交后系统会自动判定是否属于 <b>30 分钟同名窗口的重复告警</b>；重复告警不会改变原信号状态，并保留为独立记录。
      </div>
      <div className="form-grid">
        <div className="field">
          <label>信号类型</label>
          <div className="row" style={{ gap: 6 }}>
            {(Object.keys(SIGNAL_META) as SignalType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn small ${type === t ? '' : 'ghost'}`}
                style={type === t ? { borderColor: SIGNAL_META[t].color, color: SIGNAL_META[t].color } : undefined}
                onClick={() => setType(t)}
              >
                <span className="signal-type-dot" style={{ background: SIGNAL_META[t].color, marginTop: 0 }} />
                {SIGNAL_META[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="sig-name">信号名称</label>
          <input id="sig-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="如：支付网关 P99 延迟" />
          <span className="hint">同名 + 同类型 + 30 分钟内会被识别为重复告警</span>
        </div>
        <div className="field">
          <label htmlFor="sig-detail">信号描述</label>
          <textarea id="sig-detail" className="textarea" value={detail} onChange={(e) => setDetail(e.target.value)}
            placeholder="描述异常表现与业务影响" />
        </div>
        <div className="form-row-3">
          <div className="field">
            <label htmlFor="sig-value">当前值</label>
            <input id="sig-value" className="input" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sig-threshold">阈值</label>
            <input id="sig-threshold" className="input" type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sig-window">统计窗口</label>
            <select id="sig-window" className="select" value={window} onChange={(e) => setWindow(e.target.value)}>
              {['1m', '5m', '15m', '1h', '6h', '1d'].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="sig-source">来源系统</label>
            <input id="sig-source" className="input" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sig-at">触发时间</label>
            <input id="sig-at" className="input" type="datetime-local" value={firedAt} onChange={(e) => setFiredAt(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function AssignModal({
  incident, users, teams, onSubmit, onClose
}: {
  incident: Incident;
  users: string[];
  teams: string[];
  onSubmit: (body: { owner: string; assignee: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [owner, setOwner] = useState(incident.owner ?? teams[0] ?? '');
  const [assignee, setAssignee] = useState(incident.assignee ?? users[0] ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="分派责任"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={busy || !owner || !assignee}
            onClick={async () => { setBusy(true); try { await onSubmit({ owner, assignee }); onClose(); } finally { setBusy(false); } }}>
            确认分派
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="owner">责任团队</label>
          <input id="owner" className="input" list="team-list" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <datalist id="team-list">{teams.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="assignee">主责人</label>
          <select id="assignee" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {incident.assignee && (
          <div className="muted" style={{ fontSize: 11 }}>
            当前：{incident.owner} · {incident.assignee}；改派会记录在时间线。
          </div>
        )}
      </div>
    </Modal>
  );
}

export function RootCauseModal({
  incident, onSubmit, onClose
}: {
  incident: Incident;
  onSubmit: (body: { rootCause: string; rootCauseCategory: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [rootCause, setRootCause] = useState(incident.rootCause);
  const [category, setCategory] = useState(incident.rootCauseCategory || 'unknown');
  const [busy, setBusy] = useState(false);
  const options: [string, string][] = [
    ['upstream_dependency', '上游依赖'],
    ['instrumentation', '埋点 / 数据质量'],
    ['capacity', '容量 / 资源'],
    ['code_defect', '代码缺陷'],
    ['config', '配置变更'],
    ['business_campaign', '业务活动'],
    ['unknown', '未分类']
  ];
  return (
    <Modal
      title={incident.rootCause ? '更新根因' : '记录根因'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={rootCause.trim().length < 6 || busy}
            onClick={async () => { setBusy(true); try { await onSubmit({ rootCause, rootCauseCategory: category }); onClose(); } finally { setBusy(false); } }}>
            保存根因
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="rc-text">根因描述</label>
          <textarea id="rc-text" className="textarea" value={rootCause} onChange={(e) => setRootCause(e.target.value)}
            placeholder="描述可执行的根因结论，例如：上游网关超时导致回调丢失" />
          <span className="hint">根因内容 + 分类一致的两个异常才能合并</span>
        </div>
        <div className="field">
          <label htmlFor="rc-cat">根因分类</label>
          <select id="rc-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}

export function ScopeModal({
  incident, onSubmit, onClose
}: {
  incident: Incident;
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const s = incident.affectedScope;
  const toLocal = (iso: string | null) => (iso ? isoLocal(new Date(iso)) : '');
  const [segments, setSegments] = useState(s.segments.join('，'));
  const [users, setUsers] = useState(String(s.estimatedUsers || ''));
  const [revenue, setRevenue] = useState(String(s.estimatedRevenue || ''));
  const [start, setStart] = useState(toLocal(s.periodStart) || isoLocal(new Date(Date.now() - 3600_000)));
  const [end, setEnd] = useState(toLocal(s.periodEnd) || nowLocal());
  const [note, setNote] = useState(s.note);
  const [confirmed, setConfirmed] = useState(s.confirmed);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="影响范围"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={busy || !segments.trim() || !users}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({
                  segments: segments.split(/[，,]/).map((x: string) => x.trim()).filter(Boolean),
                  estimatedUsers: Number(users),
                  estimatedRevenue: Number(revenue || 0),
                  periodStart: start ? new Date(start).toISOString() : null,
                  periodEnd: end ? new Date(end).toISOString() : null,
                  note,
                  confirmed
                });
                onClose();
              } finally { setBusy(false); }
            }}>
            保存
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sc-seg">影响分段（逗号分隔）</label>
          <input id="sc-seg" className="input" value={segments} onChange={(e) => setSegments(e.target.value)}
            placeholder="如：国内线上支付，iOS 客户端" />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="sc-users">影响人数</label>
            <input id="sc-users" className="input" type="number" min="0" value={users} onChange={(e) => setUsers(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sc-rev">预估影响金额（元）</label>
            <input id="sc-rev" className="input" type="number" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="sc-start">影响开始</label>
            <input id="sc-start" className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sc-end">影响结束</label>
            <input id="sc-end" className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sc-note">口径备注</label>
          <textarea id="sc-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="统计口径、未覆盖的部分等" />
        </div>
        <label className="row" style={{ gap: 7, fontSize: 12 }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          我已核对口径并确认影响范围
        </label>
      </div>
    </Modal>
  );
}
