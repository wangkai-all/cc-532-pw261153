import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Check, Copy, Database, FileText, GitMerge,
  History, Layers, Lock, Radar, ScanLine, ShieldCheck, Target, UserRound, ListChecks, X
} from 'lucide-react';
import type { TimelineEvent } from '../types';
import { EVENT_META, fmtFull, fmtTime } from '../lib/meta';
import { Empty, SectionCard } from './common';

const ICONS: Record<string, React.ReactNode> = {
  radar: <Radar size={11} />,
  activity: <Activity size={11} />,
  copy: <Copy size={11} />,
  check: <Check size={11} />,
  user: <UserRound size={11} />,
  target: <Target size={11} />,
  scan: <ScanLine size={11} />,
  file: <FileText size={11} />,
  list: <ListChecks size={11} />,
  x: <X size={11} />,
  layers: <Layers size={11} />,
  database: <Database size={11} />,
  shield: <ShieldCheck size={11} />,
  'git-merge': <GitMerge size={11} />,
  lock: <Lock size={11} />
};

const GROUPS: { key: string; label: string; kinds: string[] }[] = [
  { key: 'all', label: '全部', kinds: [] },
  { key: 'signals', label: '信号', kinds: ['detection', 'signal', 'duplicate_alert', 'signal_resolved'] },
  { key: 'work', label: '处理', kinds: ['assignment', 'root_cause', 'scope', 'evidence', 'task', 'task_cancel'] },
  { key: 'versions', label: '版本', kinds: ['version', 'backfill'] },
  { key: 'closure', label: '验证与关闭', kinds: ['verification', 'merge', 'close'] }
];

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const [group, setGroup] = useState('all');
  const filtered = useMemo(() => {
    if (group === 'all') return events;
    const g = GROUPS.find((x) => x.key === group);
    return g ? events.filter((e) => g.kinds.includes(e.kind)) : events;
  }, [events, group]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => +new Date(b.at) - +new Date(a.at)), [filtered]);

  return (
    <SectionCard
      title="时间线"
      icon={<History size={13} className="secondary" />}
      sub={`${events.length} 条记录`}
      bodyClass="tight"
    >
      <div className="timeline-filters" role="group" aria-label="时间线筛选">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            className={`btn small ${group === g.key ? '' : 'ghost'}`}
            aria-pressed={group === g.key}
            onClick={() => setGroup(g.key)}
            style={group === g.key ? { borderColor: 'var(--text-primary)' } : undefined}
          >
            {g.label}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <Empty>该分类下暂无记录</Empty>
      ) : (
        <div className="timeline">
          {sorted.map((e) => {
            const meta = EVENT_META[e.kind] ?? { label: e.kind, icon: 'activity' };
            return (
              <div className="tl-item" key={e.id}>
                <span className={`tl-icon k-${e.kind}`} aria-hidden>
                  {ICONS[meta.icon] ?? <Activity size={11} />}
                </span>
                <div className="tl-body">
                  <div className="tl-title">
                    <span>{e.title}</span>
                    <span className="at" title={fmtFull(e.at)}>{fmtTime(e.at)}</span>
                    <span className="tl-actor">· {e.actor}</span>
                  </div>
                  {e.body && <div className="tl-text">{e.body}</div>}
                  {e.refs.length > 0 && (
                    <div className="tl-refs">
                      {e.refs.map((r) => <span className="tl-ref" key={r}>{r}</span>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function CloseCheckPanel({
  checks, canClose, onClose, readOnly, onJump
}: {
  checks: import('../types').CloseCheck;
  canClose: boolean;
  onClose: () => void;
  readOnly: boolean;
  onJump: (key: string) => void;
}) {
  const visibleChecks = readOnly ? checks.checks.filter((c) => c.passed || c.key === 'not_merged') : checks.checks;
  const passed = visibleChecks.filter((c) => c.passed).length;
  const total = visibleChecks.length;
  const pct = Math.round((passed / total) * 100);
  return (
    <SectionCard
      title="关闭检查"
      icon={<ShieldCheck size={13} className="secondary" />}
      sub={readOnly ? '归档' : canClose ? '全部通过' : `${checks.blockers.length} 项阻断`}
      actions={!readOnly && (
        <button className="btn small primary" onClick={onClose} disabled={!canClose}>
          <Lock size={11} /> 关闭
        </button>
      )}
      bodyClass="tight"
    >
      <div className="close-summary">
        <div className="close-status">
          <span style={{ color: canClose ? 'var(--good-text)' : 'var(--critical-text)' }}>
            {canClose ? <Check size={14} /> : <AlertTriangle size={14} />}
          </span>
          <span>{readOnly ? '异常已归档，记录只读' : canClose ? '满足关闭条件' : '尚未满足关闭条件'}</span>
          <span className="bar">
            <i style={{ width: `${pct}%`, background: canClose || readOnly ? 'var(--good)' : 'var(--warning)' }} />
          </span>
          <span className="blocker-count">{passed}/{total}</span>
        </div>
        <div className="row wrap" style={{ gap: 10, fontSize: 11 }}>
          <span className="muted">{checks.evidenceCount} 条证据</span>
          <span className="muted">任务 完成 {checks.taskSummary.done} / 取消 {checks.taskSummary.canceled} / 待办 {checks.taskSummary.pending}</span>
        </div>
      </div>
      <div className="check-list">
        {!readOnly && visibleChecks.filter((c) => !c.passed).map((c) => (
          <button
            key={c.key}
            className="check-item"
            onClick={() => onJump(c.key)}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', width: '100%' }}
          >
            <span className="check-icon fail" aria-hidden><AlertTriangle size={10} /></span>
            <div>
              <div className="check-label">{c.label}</div>
              <div className="check-detail">{c.detail}</div>
            </div>
            <ArrowRight size={11} style={{ color: 'var(--text-muted)', alignSelf: 'center' }} />
          </button>
        ))}
        {(readOnly || checks.canClose) && visibleChecks.map((c) => (
          <div className="check-item" key={c.key}>
            <span className="check-icon pass" aria-hidden><Check size={10} strokeWidth={3} /></span>
            <div>
              <div className="check-label">{c.label}</div>
              <div className="check-detail">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
