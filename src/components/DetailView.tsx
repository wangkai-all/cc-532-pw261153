import { useRef } from 'react';
import type { CloseCheck, Evidence, Incident, MergeCandidate, Signal, Task, TimelineEvent } from '../types';
import { SignalPanel } from './SignalPanel';
import { RootCauseCard, ScopeCard, VerificationCard } from './Facts';
import { TaskTable } from './TaskTable';
import { EvidencePanel, BackfillBanner } from './EvidencePanel';
import { Timeline, CloseCheckPanel } from './Timeline';
import { VersionPanel } from './VersionPanel';
import { MergePanel } from './MergePanel';
import { IncidentHeader } from './common';

export interface DetailActions {
  addSignal: () => void;
  resolveSignal: (s: Signal) => void;
  assign: () => void;
  editRootCause: () => void;
  editScope: () => void;
  addEvidence: () => void;
  createTask: () => void;
  transitionTask: (t: Task, next: 'in_progress' | 'done' | 'canceled') => void;
  addVersion: () => void;
  verify: () => void;
  close: () => void;
  merge: (sourceId: string) => void;
}

export function DetailView({
  incident, timeline, evidence, tasks, closeCheck, mergeCandidates, actions,
  highlightEvidence, highlightVersion
}: {
  incident: Incident;
  timeline: TimelineEvent[];
  evidence: Evidence[];
  tasks: Task[];
  closeCheck: CloseCheck;
  mergeCandidates: MergeCandidate[];
  actions: DetailActions;
  highlightEvidence?: string | null;
  highlightVersion?: string | null;
}) {
  const readOnly = incident.status === 'closed' || incident.status === 'merged';
  const topRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const versionsRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<HTMLDivElement>(null);

  const jump = (key: string) => {
    const map: Record<string, React.RefObject<HTMLDivElement | null>> = {
      scope: topRef,
      root_cause: topRef,
      ownership: topRef,
      signals: topRef,
      evidence: evidenceRef,
      tasks: tasksRef,
      verification: verifyRef,
      verification_after_change: versionsRef,
      versions: versionsRef
    };
    (map[key] ?? topRef).current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="main-inner">
      <IncidentHeader
        incident={incident}
        onAssignee={actions.assign}
        onRootCause={actions.editRootCause}
        onScope={actions.editScope}
        onClose={actions.close}
        onMerge={() => mergeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        closeReady={closeCheck.canClose}
        isMerged={readOnly}
      />
      {incident.mergedInto && (
        <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--violet) 35%, transparent)' }}>
          <div className="card-body" style={{ fontSize: 12 }}>
            该异常已合并至 <b>{incident.mergedInto}</b>，证据、信号、任务与版本已迁入目标异常。
            此处为只读留档，原始证据 ID 见合并记录；单条证据不会因合并而丢失。
          </div>
        </div>
      )}
      <BackfillBanner versions={incident.versions} />
      <div className="detail-grid">
        <div className="stack">
          <div ref={topRef} className="stack">
            <SignalPanel
              incident={incident}
              onAddSignal={actions.addSignal}
              onResolve={actions.resolveSignal}
              readOnly={readOnly}
            />
            <div className="facts-grid">
              <RootCauseCard incident={incident} onEdit={actions.editRootCause} readOnly={readOnly} />
              <ScopeCard incident={incident} onEdit={actions.editScope} readOnly={readOnly} />
            </div>
          </div>
          <div ref={tasksRef}>
            <TaskTable
              tasks={tasks}
              onTransition={actions.transitionTask}
              onCreate={actions.createTask}
              readOnly={readOnly}
            />
          </div>
          <div ref={versionsRef}>
            <VersionPanel
              incidentId={incident.id}
              versions={incident.versions}
              onAdd={actions.addVersion}
              readOnly={readOnly}
              highlightVersion={highlightVersion}
            />
          </div>
          <div ref={evidenceRef}>
            <EvidencePanel
              evidence={evidence}
              onAdd={actions.addEvidence}
              readOnly={readOnly}
              highlightId={highlightEvidence}
            />
          </div>
        </div>
        <div className="stack">
          <div ref={verifyRef}>
            <VerificationCard
              incident={incident}
              onVerify={actions.verify}
              readOnly={readOnly}
              evidenceCount={evidence.length}
            />
          </div>
          <CloseCheckPanel
            checks={closeCheck}
            canClose={closeCheck.canClose && !readOnly}
            onClose={actions.close}
            readOnly={readOnly}
            onJump={jump}
          />
          <Timeline events={timeline} />
          {!readOnly && (
            <div ref={mergeRef}>
              <MergePanel
                incident={incident}
                candidates={mergeCandidates}
                onMerge={actions.merge}
                readOnly={readOnly}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
