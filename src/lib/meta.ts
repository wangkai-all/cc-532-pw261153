import type { IncidentStatus, Severity, SignalType, TaskStatus, VersionKind } from '../types';

export const SIGNAL_META: Record<SignalType, { label: string; color: string; short: string }> = {
  quality: { label: '质量信号', color: 'var(--series-1)', short: '质量' },
  business: { label: '业务信号', color: 'var(--series-2)', short: '业务' },
  latency: { label: '延迟信号', color: 'var(--series-3)', short: '延迟' }
};

export const STATUS_META: Record<IncidentStatus, { label: string; tone: string }> = {
  triaged: { label: '待分派', tone: 'neutral' },
  investigating: { label: '排查中', tone: 'info' },
  fixing: { label: '修复中', tone: 'warning' },
  verified: { label: '已验证', tone: 'good' },
  closed: { label: '已关闭', tone: 'muted' },
  merged: { label: '已合并', tone: 'violet' }
};

export const TASK_META: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: '待开始', tone: 'neutral' },
  in_progress: { label: '进行中', tone: 'info' },
  done: { label: '已完成', tone: 'good' },
  canceled: { label: '已取消', tone: 'muted' }
};

export const VERSION_META: Record<VersionKind, { label: string; tone: string }> = {
  discovery: { label: '发现基线', tone: 'neutral' },
  mitigation: { label: '临时缓解', tone: 'info' },
  fix: { label: '修复', tone: 'good' },
  backfill: { label: '数据回补', tone: 'violet' }
};

export const CATEGORY_LABEL: Record<string, string> = {
  upstream_dependency: '上游依赖',
  instrumentation: '埋点 / 数据质量',
  capacity: '容量 / 资源',
  code_defect: '代码缺陷',
  config: '配置变更',
  business_campaign: '业务活动',
  unknown: '未分类'
};

export const SEVERITY_TONE: Record<Severity, string> = {
  P0: 'critical',
  P1: 'critical',
  P2: 'warning',
  P3: 'neutral'
};

export const EVENT_META: Record<string, { label: string; icon: string }> = {
  detection: { label: '触发', icon: 'radar' },
  signal: { label: '信号', icon: 'activity' },
  duplicate_alert: { label: '重复告警', icon: 'copy' },
  signal_resolved: { label: '信号恢复', icon: 'check' },
  assignment: { label: '分派', icon: 'user' },
  root_cause: { label: '根因', icon: 'target' },
  scope: { label: '影响范围', icon: 'scan' },
  evidence: { label: '证据', icon: 'file' },
  task: { label: '任务', icon: 'list' },
  task_cancel: { label: '任务取消', icon: 'x' },
  version: { label: '版本', icon: 'layers' },
  backfill: { label: '数据回补', icon: 'database' },
  verification: { label: '验证', icon: 'shield' },
  merge: { label: '合并', icon: 'git-merge' },
  close: { label: '关闭', icon: 'lock' }
};

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (Math.abs(diffMin) < 1) return '刚刚';
  if (diffMin > 0 && diffMin < 60) return `${diffMin} 分钟前`;
  if (diffMin >= 60 && diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小时前`;
  if (diffMin >= 60 * 24 && diffMin < 60 * 24 * 7) return `${Math.floor(diffMin / 1440)} 天前`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtFull(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { hour12: false });
}

export function fmtNum(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  return Math.abs(v) >= 1000 ? v.toLocaleString('zh-CN') : String(v);
}

export function fmtCompact(n: number): string {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)} 亿`;
  if (n >= 1_0000) return `${(n / 1_0000).toFixed(n >= 100_0000 ? 0 : 1)} 万`;
  return n.toLocaleString('zh-CN');
}

/** 时间轴刻度：为信号序列提供统一的窗口跨度 */
export function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}
