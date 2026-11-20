import { Plus, Zap } from 'lucide-react';
import type { Task } from '../types';
import { TASK_META, fmtTime } from '../lib/meta';
import { Badge, Empty, SectionCard } from './common';

const NEXT_ACTIONS: Record<Task['status'], { label: string; next: 'in_progress' | 'done' | 'canceled' | null }[]> = {
  todo: [
    { label: '开始', next: 'in_progress' },
    { label: '取消', next: 'canceled' }
  ],
  in_progress: [
    { label: '完成', next: 'done' },
    { label: '取消', next: 'canceled' }
  ],
  done: [],
  canceled: []
};

export function TaskTable({
  tasks, onTransition, onCreate, readOnly
}: {
  tasks: Task[];
  onTransition: (task: Task, next: 'in_progress' | 'done' | 'canceled') => void;
  onCreate: () => void;
  readOnly: boolean;
}) {
  return (
    <SectionCard
      title="修复任务"
      icon={<Zap size={13} className="secondary" />}
      sub={`${tasks.filter((t) => t.status === 'done').length}/${tasks.length} 已完成`}
      actions={!readOnly && (
        <button className="btn small" onClick={onCreate}><Plus size={12} /> 新建任务</button>
      )}
      bodyClass="tight"
    >
      {tasks.length === 0 ? (
        <Empty>尚未创建修复任务。关闭异常前至少需要一个已闭环的修复任务。</Empty>
      ) : (
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: '46%' }}>任务</th>
              <th>负责人</th>
              <th>状态</th>
              <th style={{ width: 140 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const meta = TASK_META[t.status];
              return (
                <tr key={t.id} className={t.status === 'canceled' ? 'canceled' : ''}>
                  <td>
                    <div className="task-title">
                      <span>{t.title}</span>
                      <span className="sev P3" style={{ border: 'none', padding: 0 }}>{t.priority}</span>
                      {t.originIncidentId && <span className="origin-tag">合并自 {t.originIncidentId}</span>}
                    </div>
                    {t.result && <div className="task-result">结果：{t.result}</div>}
                    {t.status === 'canceled' && (
                      <div className="cancel-note"><b>取消原因：</b>{t.canceledReason || '未填写'}</div>
                    )}
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 11 }}>{t.owner}</span>
                    {t.dueAt && <div className="muted" style={{ fontSize: 10.5 }}>截止 {fmtTime(t.dueAt)}</div>}
                  </td>
                  <td>
                    <Badge tone={meta.tone} dot>{meta.label}</Badge>
                  </td>
                  <td>
                    <div className="task-actions">
                      {!readOnly && NEXT_ACTIONS[t.status].map((a) => (
                        <button
                          key={a.next}
                          className={`btn small ${a.next === 'canceled' ? 'ghost' : a.next === 'done' ? 'success' : ''}`}
                          onClick={() => onTransition(t, a.next!)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
