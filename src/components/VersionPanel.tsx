import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, Table2 } from 'lucide-react';
import type { Version, VersionDiff } from '../types';
import { VERSION_META, fmtFull, fmtNum, fmtTime } from '../lib/meta';
import { api } from '../lib/api';
import { Badge, Empty, SectionCard } from './common';

function Sparkline({
  series, fromIdx, toIdx, label
}: {
  series: { value: number; version: string }[];
  fromIdx: number;
  toIdx: number;
  label: string;
}) {
  const W = 190;
  const H = 46;
  const pad = 7;
  const values = series.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(series.length - 1, 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const points = series.map((s, i) => `${x(i)},${y(s.value)}`).join(' ');
  const last = series[series.length - 1];
  const lastLabel = fmtNum(last.value);
  const labelW = Math.max(18, lastLabel.length * 6.2);
  return (
    <svg viewBox={`0 0 ${W + labelW + 4} ${H}`} width="100%" height={H} role="img"
      aria-label={`${label}：${series.map((s) => `${s.version} ${s.value}`).join('，')}`}>
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--grid)" strokeWidth={1} />
      <polyline points={points} fill="none" stroke="var(--series-1)" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
      {series.map((s, i) => {
        const isEdge = i === fromIdx || i === toIdx;
        const r = isEdge ? 4.5 : 2.6;
        return (
          <circle key={i} cx={x(i)} cy={y(s.value)} r={r}
            fill={isEdge ? 'var(--series-1)' : 'var(--surface-1)'}
            stroke={isEdge ? 'var(--surface-1)' : 'var(--series-1)'}
            strokeWidth={isEdge ? 2 : 1.5}>
            <title>{`${s.version}：${fmtNum(s.value)}`}</title>
          </circle>
        );
      })}
      <text x={W - pad + 5} y={y(last.value) + 4} fontSize={10.5}
        fill="var(--text-secondary)" fontFamily="var(--font)">{lastLabel}</text>
    </svg>
  );
}

export function VersionPanel({
  incidentId, versions, onAdd, readOnly, highlightVersion
}: {
  incidentId: string;
  versions: Version[];
  onAdd: () => void;
  readOnly: boolean;
  highlightVersion?: string | null;
}) {
  const sorted = useMemo(() => [...versions].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)), [versions]);
  const latest = sorted[sorted.length - 1];
  const [fromId, setFromId] = useState<string>(() => {
    if (highlightVersion) {
      const idx = sorted.findIndex((v) => v.id === highlightVersion);
      return sorted[Math.max(0, idx - 1)]?.id ?? sorted[0]?.id;
    }
    return sorted[Math.max(0, sorted.length - 2)]?.id ?? sorted[0]?.id;
  });
  const [toId, setToId] = useState<string>(highlightVersion ?? latest?.id);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const maxAbsDelta = diff ? Math.max(1, ...diff.rows.map((r) => (r.delta == null ? 0 : Math.abs(r.delta)))) : 1;

  useEffect(() => {
    if (highlightVersion && sorted.some((v) => v.id === highlightVersion)) {
      setToId(highlightVersion);
    }
  }, [highlightVersion, sorted]);
  const [err, setErr] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!fromId || !toId || fromId === toId) {
      setDiff(null);
      return;
    }
    let alive = true;
    api.get<VersionDiff>(`/api/incidents/${incidentId}/versions/diff?a=${fromId}&b=${toId}`)
      .then((d) => { if (alive) { setDiff(d); setErr(null); } })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [incidentId, fromId, toId]);

  const allMetricKeys = useMemo(() => {
    const keys: string[] = [];
    for (const v of sorted) for (const k of Object.keys(v.snapshot)) if (!keys.includes(k)) keys.push(k);
    return keys;
  }, [sorted]);

  const numericKeys = useMemo(
    () => allMetricKeys.filter((k) => sorted.every((v) => typeof v.snapshot[k] === 'number' || v.snapshot[k] === undefined)),
    [allMetricKeys, sorted]
  );

  const fromIdx = sorted.findIndex((v) => v.id === fromId);
  const toIdx = sorted.findIndex((v) => v.id === toId);

  return (
    <SectionCard
      title="版本与前后对比"
      icon={<Layers size={13} className="secondary" />}
      sub={`${versions.length} 个版本`}
      actions={!readOnly && (
        <button className="btn small" onClick={onAdd}><Plus size={12} /> 保存新版本</button>
      )}
      bodyClass="tight"
    >
      <div className="version-strip" role="group" aria-label="选择要对比的版本">
        {sorted.map((v) => {
          const meta = VERSION_META[v.kind];
          const role = v.id === fromId ? '基准' : v.id === toId ? '对比' : '';
          return (
            <button
              key={v.id}
              className="version-pill"
              aria-pressed={v.id === fromId || v.id === toId}
              style={v.id === fromId || v.id === toId ? { borderColor: 'var(--text-primary)' } : undefined}
              onClick={() => {
                if (v.id === fromId) return;
                if (v.id === toId) { setToId(fromId); setFromId(v.id); return; }
                setFromId(toId);
                setToId(v.id);
              }}
              title={`${v.label} · ${fmtFull(v.createdAt)} · ${v.note}`}
            >
              <span className="vp-kind" style={{ color: meta.tone === 'violet' ? 'var(--violet)' : 'var(--text-muted)' }}>
                {meta.label}
              </span>
              <span className="vp-label">
                {role && <span style={{ color: 'var(--series-1)', marginRight: 4 }}>{role}</span>}
                {v.label}
              </span>
              <span className="vp-meta">{v.createdBy} · {fmtTime(v.createdAt)}</span>
              {v.originIncidentId && <span className="vp-meta" style={{ color: 'var(--violet)' }}>合并自 {v.originIncidentId}</span>}
            </button>
          );
        })}
      </div>

      {err && <div className="error-box" style={{ margin: 12 }}>{err}</div>}

      {diff && diff.rows.length > 0 && (
        <div className="chart-block">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {numericKeys.length > 0 ? '指标演进（圆点为所选版本）' : '无连续数值指标'}
            </span>
            <button className="btn ghost small" onClick={() => setShowTable((s) => !s)}>
              <Table2 size={11} /> {showTable ? '隐藏数据表' : '数据表'}
            </button>
          </div>
          <div className="small-multiples">
            {numericKeys.map((key) => {
              const series = sorted
                .filter((v) => typeof v.snapshot[key] === 'number')
                .map((v) => ({ value: v.snapshot[key] as number, version: v.label }));
              const before = sorted[fromIdx]?.snapshot[key];
              const after = sorted[toIdx]?.snapshot[key];
              const delta = typeof before === 'number' && typeof after === 'number' ? after - before : null;
              return (
                <div className="sm-item" key={key}>
                  <div className="sm-title">
                    <span title={key}>{key}</span>
                    <b>
                      {fmtNum(after ?? null)}
                      {delta != null && delta !== 0 && (
                        <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                          ({delta > 0 ? '+' : ''}{Number(delta.toFixed(2))})
                        </span>
                      )}
                    </b>
                  </div>
                  <Sparkline series={series} fromIdx={fromIdx} toIdx={toIdx} label={key} />
                  <div className="sm-axis">
                    <span>{sorted[0]?.label}</span>
                    <span>{latest?.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {showTable && (
            <div className="table-view" style={{ padding: '8px 0 0' }}>
              <table>
                <thead>
                  <tr>
                    <th>指标</th>
                    {sorted.map((v) => <th key={v.id}>{v.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {allMetricKeys.map((k) => (
                    <tr key={k}>
                      <td>{k}</td>
                      {sorted.map((v) => (
                        <td key={v.id}>{v.snapshot[k] === undefined ? '—' : fmtNum(v.snapshot[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {diff ? (
        <>
          <div className="diff-head">
            <Badge tone="info">基准</Badge>
            <span style={{ fontSize: 12 }}>{diff.from.label}</span>
            <span className="vs">→</span>
            <Badge tone="violet">对比</Badge>
            <span style={{ fontSize: 12 }}>{diff.to.label}</span>
            <span className="grow" />
            <span className="muted" style={{ fontSize: 11 }}>{diff.changedCount} 项变化 / {diff.rows.length} 项指标</span>
          </div>
          {diff.rows.length === 0 ? (
            <Empty>两个版本快照均为空，无法对比</Empty>
          ) : (
            <table className="diff-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>指标</th>
                  <th>基准值</th>
                  <th>对比值</th>
                  <th>变化</th>
                  <th style={{ textAlign: 'right' }}>差值</th>
                </tr>
              </thead>
              <tbody>
                {diff.rows.map((r) => {
                  const up = r.direction === 'up';
                  const down = r.direction === 'down';
                  return (
                    <tr key={r.key}>
                      <td className="metric">{r.key}</td>
                      <td>{r.before == null ? '—' : fmtNum(r.before)}</td>
                      <td>{r.after == null ? '—' : fmtNum(r.after)}</td>
                      <td>
                        {r.change === 'added' && <Badge tone="info">新增</Badge>}
                        {r.change === 'removed' && <Badge tone="muted">移除</Badge>}
                        {r.change === 'same' && <span className="muted">无变化</span>}
                        {r.change === 'changed' && (
                          <span className="row" style={{ gap: 4, fontSize: 11.5 }}>
                            {up ? <ArrowUp size={11} /> : down ? <ArrowDown size={11} /> : null}
                            <span>{up ? '上升' : down ? '下降' : '变化'}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="delta-bar-wrap">
                          <span className={`delta-bar`}>
                            {r.delta != null && r.delta !== 0 && (
                              <i
                                style={{
                                  width: `${Math.max(2, (Math.abs(r.delta) / maxAbsDelta) * 42)}px`,
                                  left: r.delta > 0 ? '50%' : undefined,
                                  right: r.delta < 0 ? '50%' : undefined,
                                  background: r.delta > 0 ? 'var(--critical)' : 'var(--series-1)'
                                }}
                              />
                            )}
                          </span>
                          <span className={r.delta != null && r.delta > 0 ? 'delta-pos' : r.delta != null && r.delta < 0 ? 'delta-neg' : 'muted'}
                            style={{ minWidth: 46, textAlign: 'right' }}>
                            {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${Number(r.delta.toFixed(2))}`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="card-foot">
            <span className="muted" style={{ fontSize: 10.5 }}>
              <span style={{ color: 'var(--critical)' }}>■</span> 上升 &nbsp;
              <span style={{ color: 'var(--series-1)' }}>■</span> 下降 &nbsp;· 颜色只表示方向，数值以符号为准
            </span>
            <span className="grow" />
            <span className="muted" style={{ fontSize: 10.5 }}>
              所有版本永久保留，修复/回补不会覆盖原始数据
            </span>
          </div>
        </>
      ) : (
        <Empty>选择两个不同版本以查看差异</Empty>
      )}
    </SectionCard>
  );
}
