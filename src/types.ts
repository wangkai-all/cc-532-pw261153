export type SignalType = 'quality' | 'business' | 'latency';
export type IncidentStatus = 'triaged' | 'investigating' | 'fixing' | 'verified' | 'closed' | 'merged';
export type Severity = 'P0' | 'P1' | 'P2' | 'P3';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled';
export type VersionKind = 'discovery' | 'fix' | 'backfill' | 'mitigation';

export interface Signal {
  id: string;
  incidentId: string;
  type: SignalType;
  name: string;
  detail: string;
  value: number | null;
  threshold: number | null;
  window: string;
  firedAt: string;
  source: string;
  resolution: 'open' | 'resolved' | 'duplicate';
  duplicateOf?: string | null;
  resolvedAt?: string;
  originIncidentId?: string | null;
}

export interface TriggerInfo {
  types: SignalType[];
  coverage: string;
  missing: SignalType[];
  multiSignal: boolean;
  hasQualityOrLatency: boolean;
}

export interface AffectedScope {
  segments: string[];
  estimatedUsers: number;
  estimatedRevenue: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  confirmed: boolean;
  note: string;
}

export interface Verification {
  status: 'pending' | 'passed' | 'failed' | 'stale';
  method: string;
  checkedAt: string | null;
  checkedBy: string;
  evidenceId: string | null;
  note: string;
}

export interface Version {
  id: string;
  label: string;
  kind: VersionKind;
  createdAt: string;
  createdBy: string;
  snapshot: Record<string, number | string>;
  note: string;
  originIncidentId?: string | null;
  mergedFrom?: string;
}

export interface MergeRecord {
  sourceIncidentId?: string;
  sourceTitle?: string;
  targetIncidentId?: string;
  targetTitle?: string;
  mergedAt: string;
  mergedBy: string;
  evidenceIds: string[];
  signalIds?: string[];
  taskIds?: string[];
  versionIds?: string[];
  note: string;
}

export interface Incident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: Severity;
  rootCause: string;
  rootCauseCategory: string;
  signals: Signal[];
  affectedScope: AffectedScope;
  verification: Verification;
  owner: string | null;
  assignee: string | null;
  reporter: string;
  tags: string[];
  trigger?: TriggerInfo;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedInto: string | null;
  merges: MergeRecord[];
  versions: Version[];
  evidenceSnapshot?: string[];
}

export interface TimelineEvent {
  id: string;
  incidentId: string;
  kind: string;
  at: string;
  actor: string;
  title: string;
  body: string;
  refs: string[];
  meta: Record<string, unknown>;
}

export interface Evidence {
  id: string;
  incidentId: string;
  title: string;
  type: string;
  content: string;
  source: string;
  collectedBy: string;
  collectedAt: string;
  linkedSignalIds: string[];
  immutable: boolean;
  originIncidentId?: string | null;
}

export interface Task {
  id: string;
  incidentId: string;
  title: string;
  status: TaskStatus;
  priority: Severity;
  owner: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  canceledReason: string | null;
  result: string;
  originIncidentId?: string | null;
}

export interface CloseCheckItem {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface CloseCheck {
  canClose: boolean;
  blockers: { code: string; message: string }[];
  checks: CloseCheckItem[];
  evidenceCount: number;
  taskSummary: { total: number; done: number; canceled: number; pending: number };
}

export interface MergeCandidate {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: Severity;
  evidenceCount: number;
  signalCount: number;
  updatedAt: string;
}

export interface Bundle {
  incident: Incident;
  timeline: TimelineEvent[];
  evidence: Evidence[];
  tasks: Task[];
  closeCheck: CloseCheck;
  mergeCandidates: MergeCandidate[];
  mergedTarget: { id: string; title: string; status: IncidentStatus } | null;
}

export interface DiffRow {
  key: string;
  before: number | string | null;
  after: number | string | null;
  delta: number | null;
  change: 'same' | 'changed' | 'added' | 'removed';
  direction: 'up' | 'down' | 'flat' | null;
}

export interface VersionDiff {
  from: { id: string; label: string; kind: VersionKind; createdAt: string };
  to: { id: string; label: string; kind: VersionKind; createdAt: string };
  rows: DiffRow[];
  changedCount: number;
}

export interface AppState {
  incidents: Incident[];
  users: string[];
  teams: string[];
  currentUser: string;
  counts: { open: number; evidence: number; tasks: number };
}

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: unknown;
}
