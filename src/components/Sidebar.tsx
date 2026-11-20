import { useMemo, useState } from 'react';
import { Filter, Plus, Search } from 'lucide-react';
import type { AppState, Incident } from '../types';
import { SIGNAL_META, fmtTime } from '../lib/meta';
import { Badge, SeverityBadge, StatusBadge } from './common';

const STATUS_FILTERS: { key: string; label: string; test: (i: Incident) => boolean }[] = [
  { key: 'open', label: '进行中', test: (i) => !['closed', 'merged'].includes(i.status) },
  { key: 'verify', label: '待验证', test: (i) => i.status === 'verified' || i.verification.status === 'stale' },
  { key: 'closed', label: '已关闭', test: (i) => i.status === 'closed' },
  { key: 'merged', label: '已合并', test: (i) => i.status === 'merged' },
  { key: 'all', label: '全部', test: () => true }
];

export function Sidebar({
  state, selectedId, onSelect, onCreate
}: {
  state: AppState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('open');
  const [sev, setSev] = useState<string>('all');

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of STATUS_FILTERS) map[f.key] = state.incidents.filter(f.test).length;
    return map;
  }, [state.incidents]);

  const list = useMemo(() => {
    const f = STATUS_FILTERS.find((x) => x.key === filter) ?? STATUS_FILTERS[0];
    const query = q.trim().toLowerCase();
    return state.incidents
      .filter(f.test)
      .filter((i) => (sev === 'all' ? true : i.severity === sev))
      .filter((i) =>
        !query ||
        i.id.toLowerCase().includes(query) ||
        i.title.toLowerCase().includes(query) ||
        (i.rootCause || '').toLowerCase().includes(query) ||
        i.signals.some((s) => s.name.toLowerCase().includes(query)))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [state.incidents, filter, q, sev]);

  return (
    <aside className="sidebar" aria-label="异常列表">
      <div className="sidebar-head">
        <div className="sidebar-title">
          <h2>异常队列</h2>
          <span>{counts.open} 进行中</span>
        </div>
        <button className="btn small primary" onClick={onCreate} style={{ justifySelf: 'start' }}>
          <Plus size={12} /> 新建异常
        </button>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ position: 'relative', flex: 1 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-muted)' }} />
            <input
              className="input"
              style={{ paddingLeft: 26 }}
              placeholder="搜索 ID / 标题 / 信号"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="搜索异常"
            />
          </span>
          <select className="select" style={{ width: 68 }} value={sev} onChange={(e) => setSev(e.target.value)} aria-label="按严重级别筛选">
            <option value="all">级别</option>
            {['P0', 'P1', 'P2', 'P3'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="filters" role="group" aria-label="按状态筛选">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`btn small ${filter === f.key ? '' : 'ghost'}`}
              aria-pressed={filter === f.key}
              style={filter === f.key ? { borderColor: 'var(--text-primary)' } : undefined}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="muted" style={{ fontSize: 10 }}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="incident-list">
        {list.length === 0 && <div className="empty"><Filter size={14} /> 没有匹配的异常</div>}
        {list.map((i) => {
          const types = [...new Set(i.signals.filter((s) => s.resolution !== 'duplicate').map((s) => s.type))];
          const openSignals = i.signals.filter((s) => s.resolution === 'open').length;
          return (
            <button
              key={i.id}
              className="incident-card"
              aria-current={selectedId === i.id}
              onClick={() => onSelect(i.id)}
            >
              <div className="ic-top">
                <span className="ic-id">{i.id}</span>
                <SeverityBadge severity={i.severity} />
                <span className="grow" />
                <StatusBadge status={i.status} />
              </div>
              <div className="ic-title">{i.title}</div>
              <div className="ic-meta">
                {types.map((t) => (
                  <span className="sig-badge" key={t} title={`${SIGNAL_META[t].label}`}>
                    <i style={{ background: SIGNAL_META[t].color }} />
                  </span>
                ))}
                <span>{i.signals.length} 信号</span>
                {openSignals > 0 && <span style={{ color: 'var(--critical-text)' }}>{openSignals} 触发中</span>}
                <span className="grow" />
                <span>{fmtTime(i.updatedAt)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
