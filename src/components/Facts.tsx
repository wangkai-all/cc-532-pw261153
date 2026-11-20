import { useState } from 'react';
import { Pencil, Target, ScanLine, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Incident } from '../types';
import { CATEGORY_LABEL, fmtFull, fmtTime } from '../lib/meta';
import { Badge, SectionCard } from './common';

export function RootCauseCard({
  incident, onEdit, readOnly
}: {
  incident: Incident;
  onEdit: () => void;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <SectionCard
      title="根因"
      icon={<Target size={13} className="secondary" />}
      sub={incident.rootCause ? CATEGORY_LABEL[incident.rootCauseCategory] ?? incident.rootCauseCategory : '未记录'}
      actions={!readOnly && (
        <button className="btn small" onClick={onEdit}>
          <Pencil size={11} /> {incident.rootCause ? '更新' : '记录根因'}
        </button>
      )}
    >
      {incident.rootCause ? (
        <div className="root-cause-text">{incident.rootCause}</div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          尚未记录根因。相同根因的异常在记录后才能合并。
        </div>
      )}
      {incident.merges.length > 0 && (
        <div className="merge-history" style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            合并记录
          </div>
          {incident.merges.map((m, i) => (
            <div className="mh-row" key={i}>
              <Badge tone="violet">合并</Badge>
              <span className="grow">
                {m.sourceIncidentId ? (
                  <>
                    <span className="mono">{m.sourceIncidentId}</span> · {m.sourceTitle}
                  </>
                ) : (
                  <>
                    并入 <span className="mono">{m.targetIncidentId}</span> · {m.targetTitle}
                  </>
                )}
              </span>
              <span className="muted">{m.evidenceIds?.length ?? 0} 条证据</span>
              <span className="muted">{fmtTime(m.mergedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function ScopeCard({
  incident, onEdit, readOnly
}: {
  incident: Incident;
  onEdit: () => void;
  readOnly: boolean;
}) {
  const scope = incident.affectedScope;
  return (
    <SectionCard
      title="影响范围"
      icon={<ScanLine size={13} className="secondary" />}
      sub={scope.confirmed ? <Badge tone="good">已确认</Badge> : <Badge tone="warning">待确认</Badge>}
      actions={!readOnly && (
        <button className="btn small" onClick={onEdit}><Pencil size={11} /> 编辑</button>
      )}
    >
      <div className="kv-grid">
        <div className="kv">
          <span className="k">影响人数</span>
          <span className="v big">{scope.estimatedUsers.toLocaleString('zh-CN')}</span>
        </div>
        <div className="kv">
          <span className="k">预估影响金额</span>
          <span className="v big">
            {scope.currency} {scope.estimatedRevenue.toLocaleString('zh-CN')}
          </span>
        </div>
        <div className="kv" style={{ gridColumn: '1 / -1' }}>
          <span className="k">影响分段</span>
          <div className="scope-chips">
            {scope.segments.length
              ? scope.segments.map((s) => <Badge key={s}>{s}</Badge>)
              : <span className="muted">未填写</span>}
          </div>
        </div>
        <div className="kv">
          <span className="k">时间窗开始</span>
          <span className="v" title={fmtFull(scope.periodStart)}>{scope.periodStart ? fmtFull(scope.periodStart) : '—'}</span>
        </div>
        <div className="kv">
          <span className="k">时间窗结束</span>
          <span className="v" title={fmtFull(scope.periodEnd)}>{scope.periodEnd ? fmtFull(scope.periodEnd) : '—'}</span>
        </div>
        {scope.note && (
          <div className="kv" style={{ gridColumn: '1 / -1' }}>
            <span className="k">口径备注</span>
            <span className="v secondary">{scope.note}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export function VerificationCard({
  incident, onVerify, readOnly, evidenceCount
}: {
  incident: Incident;
  onVerify: () => void;
  readOnly: boolean;
  evidenceCount: number;
}) {
  const v = incident.verification;
  const tone = v.status === 'passed' ? 'good' : v.status === 'stale' || v.status === 'failed' ? 'critical' : 'warning';
  const label = {
    passed: '验证通过',
    failed: '验证未通过',
    stale: '验证已失效',
    pending: '待验证'
  }[v.status];
  return (
    <SectionCard
      title="验证结果"
      icon={v.status === 'passed' ? <ShieldCheck size={13} style={{ color: 'var(--good-text)' }} /> : <ShieldAlert size={13} style={{ color: 'var(--critical-text)' }} />}
      sub={<Badge tone={tone} dot>{label}</Badge>}
      actions={!readOnly && (
        <button className={`btn small ${v.status === 'passed' ? '' : 'primary'}`} onClick={onVerify} disabled={evidenceCount === 0}
          title={evidenceCount === 0 ? '请先记录至少一条证据' : '记录验证结果'}>
          记录验证
        </button>
      )}
    >
      <div className="kv-grid">
        <div className="kv" style={{ gridColumn: '1 / -1' }}>
          <span className="k">验证方法</span>
          <span className="v">{v.method || <span className="muted">未填写</span>}</span>
        </div>
        <div className="kv">
          <span className="k">验证人</span>
          <span className="v">{v.checkedBy || '—'}</span>
        </div>
        <div className="kv">
          <span className="k">验证时间</span>
          <span className="v">{v.checkedAt ? fmtFull(v.checkedAt) : '—'}</span>
        </div>
        <div className="kv">
          <span className="k">关联证据</span>
          <span className="v mono">{v.evidenceId || '—'}</span>
        </div>
        {v.note && (
          <div className="kv">
            <span className="k">备注</span>
            <span className="v secondary">{v.note}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
