import { useMemo, useState } from 'react';
import { AlertCircle, Copy, Plus, RotateCcw, Signal as SignalIcon, XCircle } from 'lucide-react';
import type { Incident, Signal } from '../types';
import { SIGNAL_META, fmtFull, fmtTime } from '../lib/meta';
import { Badge, Empty, SectionCard } from './common';

function deviationRatio(signal: Signal): number | null {
  if (signal.value == null || signal.threshold == null) return null;
  if (signal.threshold === 0) return null;
  return Math.abs(signal.value) / Math.abs(signal.threshold);
}

function signalState(signal: Signal): 'open' | 'resolved' | 'duplicate' {
  return signal.resolution;
}

export function SignalPanel({
  incident, onAddSignal, onResolve, readOnly
}: {
  incident: Incident;
  onAddSignal: () => void;
  onResolve: (signal: Signal) => void;
  readOnly: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const signals = incident.signals;
  const openCount = signals.filter((s) => s.resolution === 'open').length;
  const dupCount = signals.filter((s) => s.resolution === 'duplicate').length;
  const types = useMemo(() => new Set(signals.filter((s) => s.resolution !== 'duplicate').map((s) => s.type)), [signals]);

  const sorted = useMemo(() => {
    const order: Record<string, number> = { open: 0, duplicate: 1, resolved: 2 };
    return [...signals].sort((a, b) => {
      if (showAll) return order[a.resolution] - order[b.resolution] || +new Date(b.firedAt) - +new Date(a.firedAt);
      return order[a.resolution] - order[b.resolution];
    });
  }, [signals, showAll]);

  const shown = showAll ? sorted : sorted.filter((s) => s.resolution !== 'resolved');

  return (
    <SectionCard
      title="触发信号"
      icon={<SignalIcon size={13} className="secondary" />}
      sub={`${openCount} 待处理 · ${dupCount} 重复`}
      actions={
        !readOnly && (
          <button className="btn small" onClick={onAddSignal}>
            <Plus size={12} /> 关联告警
          </button>
        )
      }
      bodyClass="tight"
    >
      <div className="signal-coverage">
        <div className="coverage-meter" role="img" aria-label={`信号覆盖 ${types.size} 类，共 3 类`}>
          {(['quality', 'business', 'latency'] as const).map((t) => (
            <span
              key={t}
              className={`coverage-seg ${types.has(t) ? 'on' : 'missing'}`}
              style={{ ['--seg' as string]: SIGNAL_META[t].color }}
              title={`${SIGNAL_META[t].label}：${types.has(t) ? '已触发' : '未触发'}`}
            />
          ))}
        </div>
        <span className="coverage-label">
          <b>{types.size}/3</b> 类信号覆盖
        </span>
        <span className="grow" />
        <div className="dev-legend">
          {(['quality', 'business', 'latency'] as const).map((t) => (
            <span className="sig-badge" key={t}>
              <i style={{ background: SIGNAL_META[t].color }} /> {SIGNAL_META[t].short}
            </span>
          ))}
        </div>
      </div>

      <div className="deviation" aria-label="信号偏离阈值程度（条长按阈值归一）">
        <div className="dev-legend" style={{ justifyContent: 'space-between' }}>
          <span>偏离阈值程度 · 竖线为阈值位置</span>
          <span>按 |值| / |阈值| 归一，超过 2× 截断</span>
        </div>
        {incident.signals
          .filter((s) => s.resolution !== 'duplicate')
          .slice(0, 5)
          .map((s) => {
            const ratio = deviationRatio(s);
            const pct = ratio == null ? 0 : Math.min(ratio, 2) / 2;
            return (
              <div className="dev-row" key={`dev-${s.id}`}>
                <span className="dev-name" title={s.name}>{s.name}</span>
                <span className="dev-track">
                  <i
                    className="dev-fill"
                    style={{
                      width: `${Math.max(pct * 100, ratio == null ? 0 : 3)}%`,
                      background: SIGNAL_META[s.type].color
                    }}
                  />
                  <i style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--axis)' }} />
                </span>
                <span className="dev-val">
                  {ratio == null ? '—' : `${ratio.toFixed(1)}× 阈值`}
                </span>
              </div>
            );
          })}
        {incident.signals.filter((s) => s.resolution !== 'duplicate').length === 0 && (
          <span className="muted" style={{ fontSize: 11 }}>暂无指标类信号</span>
        )}
      </div>

      {shown.length === 0 && <Empty>所有信号均已恢复</Empty>}
      <div className="signal-list">
        {shown.map((s) => {
          const state = signalState(s);
          const meta = SIGNAL_META[s.type];
          const ratio = deviationRatio(s);
          return (
            <div key={s.id} className={`signal-row${state === 'duplicate' ? ' dup' : ''}`}>
              <span className="signal-type-dot" style={{ background: meta.color }} aria-hidden />
              <div className="signal-main">
                <div className="signal-title">
                  <strong>{s.name}</strong>
                  <span className="mono muted" style={{ fontSize: 10 }}>{s.id}</span>
                  {state === 'open' && <Badge tone="critical" dot>触发中</Badge>}
                  {state === 'resolved' && <Badge tone="good">已恢复</Badge>}
                  {state === 'duplicate' && (
                    <Badge tone="muted"><Copy size={10} /> 重复于 {s.duplicateOf}</Badge>
                  )}
                  {s.originIncidentId && <span className="origin-tag">合并自 {s.originIncidentId}</span>}
                </div>
                <div className="signal-detail">{s.detail}</div>
                <div className="signal-sub">
                  <span>{meta.label}</span>
                  <span>{s.window} 窗口</span>
                  <span>来源 <span className="mono">{s.source}</span></span>
                  <span title={fmtFull(s.firedAt)}>{fmtTime(s.firedAt)} 触发</span>
                  {s.value != null && s.threshold != null && (
                    <span className={ratio != null && ratio > 1 ? 'vs-threshold over' : 'vs-threshold'}>
                      当前 {s.value} / 阈值 {s.threshold}
                    </span>
                  )}
                </div>
              </div>
              <div className="signal-actions">
                {state === 'open' && !readOnly && (
                  <button className="btn ghost small" onClick={() => onResolve(s)} title="标记该信号已恢复">
                    <RotateCcw size={11} /> 恢复
                  </button>
                )}
                {state === 'duplicate' && (
                  <span className="muted" style={{ fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <XCircle size={11} /> 不重复计入
                  </span>
                )}
                {state === 'open' && <AlertCircle size={12} style={{ color: 'var(--critical-text)' }} aria-hidden />}
              </div>
            </div>
          );
        })}
      </div>
      {(signals.some((s) => s.resolution === 'resolved') || showAll) && (
        <div className="card-foot">
          <button className="btn ghost small" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '仅显示活跃信号' : `显示已恢复信号（${signals.filter((s) => s.resolution === 'resolved').length}）`}
          </button>
          <span className="grow" />
          <span className="muted" style={{ fontSize: 10.5 }}>
            证据关联在下方「证据链」中维护
          </span>
        </div>
      )}
    </SectionCard>
  );
}