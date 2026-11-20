import { AlertTriangle, Check, Clock3, GitMerge, Lock, ShieldCheck, Signal } from 'lucide-react';
import type { CloseCheckItem, Incident, IncidentStatus, Severity } from '../types';
import { STATUS_META, SEVERITY_TONE, fmtTime } from '../lib/meta';

export function Badge({ tone = 'neutral', children, dot }: { tone?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`badge tone-${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`sev ${severity}`} title={`严重级别 ${severity}`}>
      {severity}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function SectionCard({
  title, sub, icon, actions, children, bodyClass
}: {
  title: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="card">
      <header className="card-head">
        {icon}
        <h3>{title}</h3>
        {sub && <span className="sub">{sub}</span>}
        <span className="spacer" />
        {actions}
      </header>
      <div className={bodyClass ?? 'card-body'}>{children}</div>
    </section>
  );
}

const CHECK_ICONS: Record<string, React.ReactNode> = {
  verification: <ShieldCheck size={11} />,
  close: <Lock size={11} />,
  merge: <GitMerge size={11} />,
  detection: <AlertTriangle size={11} />,
  signal: <Signal size={11} />,
};

export function CheckRow({ item }: { item: CloseCheckItem }) {
  return (
    <div className="check-item">
      <span className={`check-icon ${item.passed ? 'pass' : 'fail'}`} aria-hidden>
        {item.passed ? <Check size={10} strokeWidth={3} /> : <AlertTriangle size={10} />}
      </span>
      <div>
        <div className="check-label">
          {item.label}
          <span className="sr-only">{item.passed ? '：通过' : '：未通过'}</span>
        </div>
        <div className="check-detail">{item.detail}</div>
      </div>
    </div>
  );
}

export function IncidentHeader({
  incident,
  onAssignee, onRootCause, onScope, onClose, onMerge, closeReady, isMerged
}: {
  incident: Incident;
  onAssignee: () => void;
  onRootCause: () => void;
  onScope: () => void;
  onClose: () => void;
  onMerge: () => void;
  closeReady: boolean;
  isMerged: boolean;
}) {
  return (
    <div className="incident-header">
      <div className="ih-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ih-badges">
            <span className="ih-id">{incident.id}</span>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {incident.trigger && (
              <Badge tone={incident.trigger.multiSignal ? 'info' : 'warning'}>
                {incident.trigger.types.length} 类信号 · {incident.trigger.coverage}
              </Badge>
            )}
            {incident.mergedInto && (
              <Badge tone="violet">已合并至 {incident.mergedInto}</Badge>
            )}
          </div>
          <h1 className="ih-title">{incident.title}</h1>
        </div>
        <div className="row wrap" style={{ paddingTop: 4 }}>
          {!isMerged && (
            <>
              <button className="btn small" onClick={onAssignee}>分派</button>
              <button className="btn small" onClick={onRootCause}>根因</button>
              <button className="btn small" onClick={onScope}>影响范围</button>
              <button className="btn small" onClick={onMerge}>合并</button>
              <button
                className={`btn small ${closeReady ? 'primary' : ''}`}
                onClick={onClose}
                title={closeReady ? '关闭检查已全部通过' : '仍有阻断项，查看关闭检查'}
              >
                <Lock size={12} /> 关闭异常
              </button>
            </>
          )}
        </div>
      </div>
      <div className="ih-facts">
        <div className="ih-fact">
          <span className="k">责任团队 / 主责人</span>
          <span className="v">
            {incident.owner ?? '未分派'}
            {incident.assignee && <span className="muted"> · {incident.assignee}</span>}
          </span>
        </div>
        <div className="ih-fact">
          <span className="k">影响范围</span>
          <span className="v">
            {incident.affectedScope.confirmed
              ? `${incident.affectedScope.segments.join('、') || '未填分段'} · ${incident.affectedScope.estimatedUsers.toLocaleString('zh-CN')} 用户`
              : <span className="muted">未确认</span>}
          </span>
        </div>
        <div className="ih-fact">
          <span className="k">验证状态</span>
          <span className="v">
            {incident.verification.status === 'passed' ? (
              <span style={{ color: 'var(--good-text)' }}>已通过</span>
            ) : incident.verification.status === 'stale' ? (
              <span style={{ color: 'var(--critical-text)' }}>已失效</span>
            ) : incident.verification.status === 'failed' ? (
              <span style={{ color: 'var(--critical-text)' }}>未通过</span>
            ) : (
              <span className="muted">待验证</span>
            )}
          </span>
        </div>
        <div className="ih-fact">
          <span className="k">触发信号</span>
          <span className="v">
            {incident.signals.filter((s) => s.resolution !== 'duplicate').length} 条
            {incident.signals.some((s) => s.resolution === 'duplicate') && (
              <span className="muted"> · {incident.signals.filter((s) => s.resolution === 'duplicate').length} 重复</span>
            )}
          </span>
        </div>
        <div className="ih-fact">
          <span className="k">更新时间</span>
          <span className="v">{fmtTime(incident.updatedAt)}</span>
        </div>
        {incident.closedAt && (
          <div className="ih-fact">
            <span className="k">关闭时间</span>
            <span className="v">{fmtTime(incident.closedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function IconHint({ icon }: { icon: React.ReactNode }) {
  return <Clock3 size={12} style={{ color: 'var(--text-muted)' }}>{icon}</Clock3>;
}
