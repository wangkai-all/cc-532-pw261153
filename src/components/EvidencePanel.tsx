import { useMemo, useState } from 'react';
import { Database, FileText, Link2, Plus, ShieldCheck } from 'lucide-react';
import type { Evidence } from '../types';
import { fmtFull, fmtTime } from '../lib/meta';
import { Badge, Empty, SectionCard } from './common';

const TYPE_LABEL: Record<string, string> = {
  log: '日志',
  metric: '指标',
  query: '查询',
  screenshot: '截图',
  note: '备注'
};

export function EvidencePanel({
  evidence, onAdd, readOnly, highlightId
}: {
  evidence: Evidence[];
  onAdd: () => void;
  readOnly: boolean;
  highlightId?: string | null;
}) {
  const [filter, setFilter] = useState<string>('all');
  const types = useMemo(() => [...new Set(evidence.map((e) => e.type))], [evidence]);
  const shown = filter === 'all' ? evidence : evidence.filter((e) => e.type === filter);

  return (
    <SectionCard
      title="证据链"
      icon={<FileText size={13} className="secondary" />}
      sub={`${evidence.length} 条 · 不可篡改`}
      actions={
        <div className="row" style={{ gap: 4 }}>
          {types.length > 1 && (
            <select className="select" style={{ width: 92, padding: '4px 6px', fontSize: 11 }}
              value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="按证据类型筛选">
              <option value="all">全部类型</option>
              {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
            </select>
          )}
          {!readOnly && (
            <button className="btn small" onClick={onAdd}><Plus size={12} /> 记录证据</button>
          )}
        </div>
      }
      bodyClass="tight"
    >
      {shown.length === 0 ? (
        <Empty>尚无证据。证据一旦记录不可修改或删除；合并异常时证据会全部迁入目标。</Empty>
      ) : (
        <div className="evidence-grid">
          {shown.map((e) => (
            <article
              key={e.id}
              className="evidence-card"
              style={highlightId === e.id ? { borderColor: 'var(--series-1)', boxShadow: '0 0 0 2px var(--series-1-wash)' } : undefined}
            >
              <div className="evidence-head">
                <Badge>{TYPE_LABEL[e.type] ?? e.type}</Badge>
                <strong>{e.title}</strong>
                <span className="mono muted" style={{ fontSize: 10 }}>{e.id}</span>
                <span className="grow" />
                {e.originIncidentId && <span className="origin-tag">合并自 {e.originIncidentId}</span>}
                <span title="记录后不可修改或删除" className="muted" style={{ display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 10 }}>
                  <ShieldCheck size={10} /> 只读
                </span>
              </div>
              <pre className="evidence-content">{e.content}</pre>
              <div className="evidence-meta">
                <span>来源 <span className="mono">{e.source}</span></span>
                <span>记录人 {e.collectedBy}</span>
                <span title={fmtFull(e.collectedAt)}>{fmtTime(e.collectedAt)}</span>
                {e.linkedSignalIds.length > 0 && (
                  <span className="row" style={{ gap: 3 }}>
                    <Link2 size={10} /> 关联 {e.linkedSignalIds.join('、')}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function BackfillBanner({ versions }: { versions: { kind: string; label: string }[] }) {
  const backfills = versions.filter((v) => v.kind === 'backfill');
  if (!backfills.length) return null;
  return (
    <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--violet) 35%, transparent)' }}>
      <div className="card-body row" style={{ gap: 8 }}>
        <Database size={14} style={{ color: 'var(--violet)' }} />
        <span style={{ fontSize: 12 }}>
          该异常包含 <b>{backfills.length}</b> 次数据回补（{backfills.map((b) => b.label).join('、')}）。原始数据版本保留在版本对比中，关闭前需确认验证晚于最近回补。
        </span>
      </div>
    </div>
  );
}
