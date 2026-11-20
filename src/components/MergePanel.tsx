import { useState } from 'react';
import { GitMerge, ShieldCheck } from 'lucide-react';
import type { Incident, MergeCandidate } from '../types';
import { CATEGORY_LABEL, fmtTime } from '../lib/meta';
import { Badge, Empty, SectionCard } from './common';

export function MergePanel({
  incident, candidates, onMerge, readOnly
}: {
  incident: Incident;
  candidates: MergeCandidate[];
  onMerge: (sourceId: string) => void;
  readOnly: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const existingIds = incident.merges.map((m) => m.sourceIncidentId).filter(Boolean);
  return (
    <SectionCard
      title="同根因合并"
      icon={<GitMerge size={13} className="secondary" />}
      sub={candidates.length ? `${candidates.length} 个候选` : '无候选'}
      bodyClass="tight"
    >
      <div className="merge-card">
        <div className="row" style={{ gap: 6, fontSize: 11.5 }}>
          <ShieldCheck size={12} style={{ color: 'var(--good-text)' }} />
          <span className="secondary">
            合并条件：根因内容与分类完全一致。合并后证据、信号、任务、版本全部迁入目标并标注原始出处，
            <b>单条证据不会丢失</b>。
          </span>
        </div>
        {!incident.rootCause && (
          <div className="muted" style={{ fontSize: 11.5 }}>请先记录根因，系统才能匹配同根因异常。</div>
        )}
        {candidates.length === 0 && incident.rootCause && (
          <Empty>暂无同根因的待处理异常</Empty>
        )}
        {candidates.map((c) => (
          <div key={c.id} className="merge-candidate">
            <span className="mc-id">{c.id}</span>
            <span className="mc-title" title={c.title}>{c.title}</span>
            <Badge tone="muted">{c.evidenceCount} 证据</Badge>
            <Badge tone="muted">{c.signalCount} 信号</Badge>
            {confirming === c.id ? (
              <>
                <button className="btn small danger" onClick={() => { onMerge(c.id); setConfirming(null); }}>
                  确认并入
                </button>
                <button className="btn small ghost" onClick={() => setConfirming(null)}>返回</button>
              </>
            ) : (
              <button className="btn small" disabled={readOnly} onClick={() => setConfirming(c.id)}>
                合并到当前
              </button>
            )}
          </div>
        ))}
        {existingIds.length > 0 && (
          <div className="merge-history">
            <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              已并入 {existingIds.length} 个异常
            </div>
            {incident.merges.map((m, i) => (
              <div className="mh-row" key={i}>
                <span className="mono">{m.sourceIncidentId}</span>
                <span className="grow" title={m.sourceTitle}>{m.sourceTitle}</span>
                <span className="muted">{m.evidenceIds.length} 条证据</span>
                <span className="muted">{fmtTime(m.mergedAt)}</span>
              </div>
            ))}
          </div>
        )}
        {incident.rootCause && (
          <div className="muted" style={{ fontSize: 10.5 }}>
            当前根因分类：{CATEGORY_LABEL[incident.rootCauseCategory] ?? incident.rootCauseCategory}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
