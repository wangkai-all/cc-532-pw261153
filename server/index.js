import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApiError, addEvidence, addSignal, addVersion, assignIncident, closeCheck, closeIncident,
  createIncident, createTask, diffVersions, getIncidentBundle, listState, mergeCandidates,
  mergeIncidents, recordVerification, resolveSignal, updateRootCause, updateScope, updateTask
} from './domain.js';
import { db, persist, resetForTests } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json({ limit: '1mb' }));

const actorOf = (req) => req.get('x-actor') || db().currentUser;
const ok = (res, data) => res.json(data);

function wrap(handler) {
  return (req, res, next) => {
    try {
      handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

app.get('/api/state', wrap((req, res) => ok(res, listState())));

app.get('/api/incidents/:id', wrap((req, res) => ok(res, getIncidentBundle(req.params.id))));

app.post('/api/incidents', wrap((req, res) => {
  const incident = createIncident(req.body ?? {});
  res.status(201).json(incident);
}));

app.post('/api/incidents/:id/signals', wrap((req, res) => {
  ok(res, addSignal(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.post('/api/incidents/:id/signals/:signalId/resolve', wrap((req, res) => {
  ok(res, resolveSignal(req.params.id, req.params.signalId, actorOf(req)));
}));

app.patch('/api/incidents/:id/assignment', wrap((req, res) => {
  ok(res, assignIncident(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.patch('/api/incidents/:id/root-cause', wrap((req, res) => {
  ok(res, updateRootCause(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.patch('/api/incidents/:id/scope', wrap((req, res) => {
  ok(res, updateScope(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.post('/api/incidents/:id/evidence', wrap((req, res) => {
  res.status(201).json(addEvidence(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.post('/api/incidents/:id/tasks', wrap((req, res) => {
  res.status(201).json(createTask(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.patch('/api/tasks/:taskId', wrap((req, res) => {
  ok(res, updateTask(req.params.taskId, req.body ?? {}, actorOf(req)));
}));

app.post('/api/incidents/:id/versions', wrap((req, res) => {
  res.status(201).json(addVersion(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.get('/api/incidents/:id/versions/diff', wrap((req, res) => {
  const { a, b } = req.query;
  if (!a || !b) throw new ApiError(400, 'VALIDATION', '需要 a 和 b 两个版本 id');
  ok(res, diffVersions(req.params.id, String(a), String(b)));
}));

app.post('/api/incidents/:id/verification', wrap((req, res) => {
  ok(res, recordVerification(req.params.id, req.body ?? {}, actorOf(req)));
}));

app.get('/api/incidents/:id/close-check', wrap((req, res) => {
  ok(res, closeCheck(req.params.id));
}));

app.post('/api/incidents/:id/close', wrap((req, res) => {
  ok(res, closeIncident(req.params.id, actorOf(req), req.body ?? {}));
}));

app.get('/api/incidents/:id/merge-candidates', wrap((req, res) => {
  ok(res, mergeCandidates(req.params.id));
}));

app.post('/api/incidents/:id/merge', wrap((req, res) => {
  const sourceId = req.body?.sourceId;
  if (!sourceId) throw new ApiError(400, 'VALIDATION', '缺少 sourceId');
  ok(res, mergeIncidents(req.params.id, String(sourceId), actorOf(req), req.body ?? {}));
}));

app.post('/api/dev/reset', wrap((req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(403, 'FORBIDDEN', '生产环境禁止重置');
  }
  resetForTests();
  ok(res, { ok: true });
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  express.static(path.join(__dirname, '..', 'dist'))(req, res, () => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
});

app.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details ?? null });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法 JSON', code: 'BAD_JSON' });
  }
  console.error('[api]', err);
  return res.status(500).json({ error: '服务器内部错误', code: 'INTERNAL' });
});

const PORT = process.env.PORT || 5174;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`指标异常复盘工作台 API 已启动：http://localhost:${PORT}`);
  });
}
