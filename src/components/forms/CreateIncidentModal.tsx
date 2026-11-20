import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SignalType } from '../../types';
import { SIGNAL_META } from '../../lib/meta';
import { Modal } from '../Modal';

interface DraftSignal {
  type: SignalType;
  name: string;
  detail: string;
  value: string;
  threshold: string;
  window: string;
  source: string;
}

const emptySignal = (type: SignalType): DraftSignal => ({
  type,
  name: '',
  detail: '',
  value: '',
  threshold: '',
  window: '5m',
  source: 'metric-monitor'
});

export function CreateIncidentModal({
  onSubmit, onClose
}: {
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('P2');
  const [signals, setSignals] = useState<DraftSignal[]>([emptySignal('quality'), emptySignal('latency')]);
  const [busy, setBusy] = useState(false);

  const types = [...new Set(signals.map((s) => s.type))];
  const hasQualityOrLatency = types.includes('quality') || types.includes('latency');
  const triggerOk = types.length >= 2 && hasQualityOrLatency;
  const filled = signals.filter((s) => s.name.trim().length > 0);
  const valid = title.trim().length >= 5 && filled.length >= 2 && triggerOk;

  const update = (i: number, patch: Partial<DraftSignal>) =>
    setSignals((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Modal
      title="新建异常"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({
                  title,
                  severity,
                  signals: filled.map((s) => ({
                    type: s.type,
                    name: s.name,
                    detail: s.detail || `${s.name} 超出阈值`,
                    value: s.value === '' ? null : Number(s.value),
                    threshold: s.threshold === '' ? null : Number(s.threshold),
                    window: s.window,
                    source: s.source
                  }))
                });
                onClose();
              } finally { setBusy(false); }
            }}>
            创建异常
          </button>
        </>
      }
    >
      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          <div className="row wrap" style={{ gap: 12 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>触发校验</span>
            <span className={`badge tone-${types.length >= 2 ? 'good' : 'warning'}`}><span className="dot" />
              覆盖 {types.length}/3 类
            </span>
            <span className={`badge tone-${hasQualityOrLatency ? 'good' : 'critical'}`}><span className="dot" />
              {hasQualityOrLatency ? '包含质量或延迟信号' : '缺少质量 / 延迟信号'}
            </span>
            <span className={`badge tone-${filled.length >= 2 ? 'good' : 'warning'}`}><span className="dot" />
              已填 {filled.length} 条信号
            </span>
          </div>
          <div className="coverage-meter" style={{ maxWidth: 280 }} aria-hidden>
            {(['quality', 'business', 'latency'] as const).map((t) => (
              <span key={t} className={`coverage-seg ${types.includes(t) ? 'on' : 'missing'}`}
                style={{ ['--seg' as string]: SIGNAL_META[t].color }} />
            ))}
          </div>
          <span className="hint" style={{ fontSize: 10.5 }}>
            异常必须由至少两类信号共同触发，且其中至少一条为质量或延迟信号；单一业务信号不能建单。
          </span>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="ci-title">异常标题</label>
          <input id="ci-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="如：支付成功率跌破 95% 阈值" />
        </div>
        <div className="field">
          <label htmlFor="ci-sev">严重级别</label>
          <select id="ci-sev" className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {['P0', 'P1', 'P2', 'P3'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>触发信号</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {signals.map((s, i) => (
            <div key={i} className="card" style={{ boxShadow: 'none' }}>
              <div className="card-body" style={{ display: 'grid', gap: 8 }}>
                <div className="row" style={{ gap: 6 }}>
                  <select className="select" style={{ width: 104 }} value={s.type}
                    onChange={(e) => update(i, { type: e.target.value as SignalType })} aria-label={`信号 ${i + 1} 类型`}>
                    {(Object.keys(SIGNAL_META) as SignalType[]).map((t) => (
                      <option key={t} value={t}>{SIGNAL_META[t].label}</option>
                    ))}
                  </select>
                  <input className="input" style={{ flex: 1 }} placeholder="信号名称" value={s.name}
                    onChange={(e) => update(i, { name: e.target.value })} aria-label={`信号 ${i + 1} 名称`} />
                  <button className="btn ghost small" aria-label="删除信号" disabled={signals.length <= 2}
                    onClick={() => setSignals((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <input className="input" placeholder="描述（可选）" value={s.detail}
                  onChange={(e) => update(i, { detail: e.target.value })} aria-label={`信号 ${i + 1} 描述`} />
                <div className="form-row-3">
                  <input className="input" type="number" step="any" placeholder="当前值" value={s.value}
                    onChange={(e) => update(i, { value: e.target.value })} aria-label={`信号 ${i + 1} 当前值`} />
                  <input className="input" type="number" step="any" placeholder="阈值" value={s.threshold}
                    onChange={(e) => update(i, { threshold: e.target.value })} aria-label={`信号 ${i + 1} 阈值`} />
                  <select className="select" value={s.window} onChange={(e) => update(i, { window: e.target.value })}
                    aria-label={`信号 ${i + 1} 窗口`}>
                    {['1m', '5m', '15m', '1h', '6h', '1d'].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn ghost small" style={{ justifySelf: 'start' }}
          onClick={() => setSignals((prev) => [...prev, emptySignal('business')])}>
          <Plus size={12} /> 添加信号
        </button>
      </div>
    </Modal>
  );
}
