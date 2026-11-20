import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Moon, RotateCcw, Sun, UserRound } from 'lucide-react';
import type { AppState, Bundle, Signal, Task } from './types';
import { api, ApiError } from './lib/api';
import { ToastProvider, useToast, useTheme } from './lib/ui';
import { Sidebar } from './components/Sidebar';
import { DetailView } from './components/DetailView';
import type { DetailActions } from './components/DetailView';
import { AddSignalModal, AssignModal, RootCauseModal, ScopeModal } from './components/forms/IncidentForms';
import { EvidenceModal } from './components/forms/EvidenceModal';
import { CreateIncidentModal } from './components/forms/CreateIncidentModal';
import {
  CloseModal, TaskCancelModal, TaskCompleteModal, TaskCreateModal, VerificationModal, VersionModal
} from './components/forms/TaskForms';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'signal' }
  | { kind: 'assign' }
  | { kind: 'rootCause' }
  | { kind: 'scope' }
  | { kind: 'evidence' }
  | { kind: 'task' }
  | { kind: 'taskDone'; task: Task }
  | { kind: 'taskCancel'; task: Task }
  | { kind: 'version' }
  | { kind: 'verify' }
  | { kind: 'close' };

function Workbench() {
  const [state, setState] = useState<AppState | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightEvidence, setHighlightEvidence] = useState<string | null>(null);
  const [highlightVersion, setHighlightVersion] = useState<string | null>(null);
  const toast = useToast();
  const { theme, setTheme } = useTheme();

  const loadState = useCallback(async (preferId?: string) => {
    try {
      const s = await api.get<AppState>('/api/state');
      setState(s);
      setLoadError(null);
      const nextId = preferId ?? s.incidents[0]?.id ?? null;
      setSelectedId((cur) => (cur && s.incidents.some((i) => i.id === cur) ? cur : nextId));
      return s;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      return null;
    }
  }, []);

  const loadBundle = useCallback(async (id: string) => {
    try {
      const b = await api.get<Bundle>(`/api/incidents/${id}`);
      setBundle(b);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : '加载异常详情失败', 'error');
    }
  }, [toast]);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => {
    if (!selectedId) return;
    setHighlightEvidence(null);
    setHighlightVersion(null);
    void loadBundle(selectedId);
  }, [selectedId, loadBundle]);

  const refreshAll = useCallback(async () => {
    await loadState(selectedId ?? undefined);
    if (selectedId) await loadBundle(selectedId);
  }, [loadState, loadBundle, selectedId]);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError) {
      const details = e.details as { blockers?: { message: string }[] } | null;
      if (e.code === 'CLOSE_CHECK_FAILED' && details?.blockers) {
        toast.push(`关闭被阻断：${details.blockers.slice(0, 2).map((b) => b.message).join('；')}`, 'error');
        return;
      }
      if (e.code === 'VERIFICATION_TASKS_PENDING') {
        toast.push('仍有未完成的修复任务，不能通过验证', 'error');
        return;
      }
      toast.push(e.message, 'error');
      return;
    }
    toast.push(e instanceof Error ? e.message : '操作失败', 'error');
  }, [toast]);

  const run = useCallback(async (fn: () => Promise<unknown>, successMsg?: string): Promise<void> => {
    try {
      const result = await fn();
      await refreshAll();
      if (successMsg) toast.push(successMsg, 'success');
      return result as void;
    } catch (e) {
      handleError(e);
      throw e;
    }
  }, [refreshAll, toast, handleError]);

  const actions: DetailActions = useMemo(() => {
    const id = bundle?.incident.id;
    return {
      addSignal: () => setModal({ kind: 'signal' }),
      resolveSignal: async (s: Signal) => {
        if (!id) return;
        await run(() => api.post(`/api/incidents/${id}/signals/${s.id}/resolve`, {}), `信号 ${s.name} 已恢复`);
      },
      assign: () => setModal({ kind: 'assign' }),
      editRootCause: () => setModal({ kind: 'rootCause' }),
      editScope: () => setModal({ kind: 'scope' }),
      addEvidence: () => setModal({ kind: 'evidence' }),
      createTask: () => setModal({ kind: 'task' }),
      transitionTask: (t, next) => {
        if (next === 'done') setModal({ kind: 'taskDone', task: t });
        else if (next === 'canceled') setModal({ kind: 'taskCancel', task: t });
        else {
          void run(() => api.patch(`/api/tasks/${t.id}`, { status: next }), '任务状态已更新');
        }
      },
      addVersion: () => setModal({ kind: 'version' }),
      verify: () => setModal({ kind: 'verify' }),
      close: () => setModal({ kind: 'close' }),
      merge: async (sourceId: string) => {
        if (!id) return;
        await run(
          () => api.post(`/api/incidents/${id}/merge`, { sourceId }),
          `已将 ${sourceId} 合并到 ${id}，证据全部保留`
        );
      }
    };
  }, [bundle, run, toast, handleError]);

  const saveSignal = async (body: unknown) => {
    const id = bundle?.incident.id;
    if (!id) return;
    const res = await api.post<{ duplicate: boolean; duplicateOf: string | null; signal: Signal }>(
      `/api/incidents/${id}/signals`, body
    );
    await refreshAll();
    if (res.duplicate) {
      toast.push(`重复告警：${res.signal.name} 已关联 ${res.duplicateOf}，不重复计入`, 'default');
    } else {
      toast.push('告警已关联', 'success');
    }
  };

  if (loadError) {
    return (
      <div className="app">
        <header className="topbar"><div className="brand">指标异常复盘工作台</div></header>
        <div className="loading">
          <div>
            <div>无法连接后端：{loadError}</div>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => loadState()}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  if (!state) return <div className="loading">加载中…</div>;

  const incident = bundle?.incident ?? state.incidents.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Activity size={15} /></span>
          <span>
            指标异常复盘工作台
            <small>多信号触发 · 证据链 · 版本对比</small>
          </span>
        </div>
        <span className="topbar-spacer" />
        <div className="topbar-meta">
          <span className="badge"><span className="dot" style={{ background: 'var(--good)' }} />{state.counts.open} 进行中</span>
          <span className="badge">{state.counts.evidence} 条证据</span>
          <span className="badge">{state.counts.tasks} 个任务</span>
          <button className="btn ghost small" title="切换主题" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}>
            {theme === 'dark' ? <Moon size={13} /> : theme === 'light' ? <Sun size={13} /> : <RotateCcw size={13} />}
            {theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'}
          </button>
          <span className="badge"><UserRound size={11} /> {state.currentUser}</span>
        </div>
      </header>
      <div className="workspace">
        <Sidebar
          state={state}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={() => setModal({ kind: 'create' })}
        />
        <main className="main">
          {!bundle ? (
            <div className="loading">选择一条异常查看复盘详情</div>
          ) : (
            <DetailView
              incident={bundle.incident}
              timeline={bundle.timeline}
              evidence={bundle.evidence}
              tasks={bundle.tasks}
              closeCheck={bundle.closeCheck}
              mergeCandidates={bundle.mergeCandidates}
              actions={actions}
              highlightEvidence={highlightEvidence}
              highlightVersion={highlightVersion}
            />
          )}
        </main>
      </div>

      {modal.kind === 'create' && (
        <CreateIncidentModal
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={async (b) => {
            const inc = await api.post<{ id: string }>('/api/incidents', b);
            await loadState(inc.id);
            setSelectedId(inc.id);
            toast.push(`异常 ${inc.id} 已创建`, 'success');
          }}
        />
      )}
      {modal.kind === 'signal' && bundle && (
        <AddSignalModal incident={bundle.incident} onClose={() => setModal({ kind: 'none' })} onSubmit={saveSignal} />
      )}
      {modal.kind === 'assign' && bundle && (
        <AssignModal
          incident={bundle.incident}
          users={state.users}
          teams={state.teams}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.patch(`/api/incidents/${bundle.incident.id}/assignment`, b),
            `已分派给 ${b.assignee}`
          )}
        />
      )}
      {modal.kind === 'rootCause' && bundle && (
        <RootCauseModal
          incident={bundle.incident}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.patch(`/api/incidents/${bundle.incident.id}/root-cause`, b),
            '根因已保存'
          )}
        />
      )}
      {modal.kind === 'scope' && bundle && (
        <ScopeModal
          incident={bundle.incident}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.patch(`/api/incidents/${bundle.incident.id}/scope`, b),
            '影响范围已保存'
          )}
        />
      )}
      {modal.kind === 'evidence' && bundle && (
        <EvidenceModal
          signals={bundle.incident.signals}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={async (b) => {
            const ev = await api.post<{ id: string }>(`/api/incidents/${bundle.incident.id}/evidence`, b);
            await refreshAll();
            setHighlightEvidence(ev.id);
            toast.push('证据已记录（不可修改或删除）', 'success');
          }}
        />
      )}
      {modal.kind === 'task' && bundle && (
        <TaskCreateModal
          users={state.users}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.post(`/api/incidents/${bundle.incident.id}/tasks`, b),
            '修复任务已创建'
          )}
        />
      )}
      {modal.kind === 'taskDone' && (
        <TaskCompleteModal
          task={modal.task}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.patch(`/api/tasks/${modal.task.id}`, b),
            '任务已完成'
          )}
        />
      )}
      {modal.kind === 'taskCancel' && (
        <TaskCancelModal
          task={modal.task}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.patch(`/api/tasks/${modal.task.id}`, b),
            '任务已取消，原因已记录'
          )}
        />
      )}
      {modal.kind === 'version' && bundle && (
        <VersionModal
          versions={bundle.incident.versions}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={async (b) => {
            const v = await api.post<{ id: string }>(`/api/incidents/${bundle.incident.id}/versions`, b);
            await refreshAll();
            setHighlightVersion(v.id);
            toast.push('新版本已保存，变更前版本保留用于对比', 'success');
          }}
        />
      )}
      {modal.kind === 'verify' && bundle && (
        <VerificationModal
          evidence={bundle.evidence}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(b) => run(
            () => api.post(`/api/incidents/${bundle.incident.id}/verification`, b),
            (b as { status: string }).status === 'passed' ? '验证通过' : '已记录验证失败'
          )}
        />
      )}
      {modal.kind === 'close' && bundle && (
        <CloseModal
          onClose={() => setModal({ kind: 'none' })}
          canClose={bundle.closeCheck.canClose}
          blockers={bundle.closeCheck.blockers}
          checks={bundle.closeCheck.checks}
          onConfirm={async (summary) => {
            await run(
              () => api.post(`/api/incidents/${bundle.incident.id}/close`, { summary }),
              '异常已关闭'
            );
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Workbench />
    </ToastProvider>
  );
}
