import { useState } from 'react';
import type { Signal } from '../../types';
import { SIGNAL_META } from '../../lib/meta';
import { Modal } from '../Modal';

export function EvidenceModal({
  signals, onSubmit, onClose
}: {
  signals: Signal[];
  onSubmit: (body: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('log');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [linked, setLinked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 3 && content.trim().length >= 3 && source.trim().length >= 2;
  const toggle = (id: string) =>
    setLinked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal
      title="记录证据"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ title, type, content, source, linkedSignalIds: linked });
                onClose();
              } finally { setBusy(false); }
            }}>
            保存证据
          </button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: 11.5 }}>
        证据记录后不可修改、删除，也不能被合并覆盖；请粘贴原始内容而不是结论性描述。
      </div>
      <div className="form-grid">
        <div className="form-row">
          <div className="field">
            <label htmlFor="ev-title">证据标题</label>
            <input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="如：网关 504 日志片段" />
          </div>
          <div className="field">
            <label htmlFor="ev-type">类型</label>
            <select id="ev-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {[['log', '日志'], ['metric', '指标'], ['query', '查询'], ['screenshot', '截图'], ['note', '备注']].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ev-content">原始内容</label>
          <textarea id="ev-content" className="textarea" style={{ minHeight: 110, fontFamily: 'var(--mono)' }}
            value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="粘贴日志、查询语句、指标截图说明等" />
        </div>
        <div className="field">
          <label htmlFor="ev-source">来源</label>
          <input id="ev-source" className="input" value={source} onChange={(e) => setSource(e.target.value)}
            placeholder="如：kibana/payment-gateway" />
        </div>
        <div className="field">
          <label>关联信号（可选）</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {signals.filter((s) => s.resolution !== 'duplicate').map((s) => (
              <label key={s.id} className="btn small" style={{ gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={linked.includes(s.id)} onChange={() => toggle(s.id)} />
                <span className="signal-type-dot" style={{ background: SIGNAL_META[s.type].color, marginTop: 0 }} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
