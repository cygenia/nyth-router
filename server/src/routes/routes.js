import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as routeEngine from '../services/routeEngine.js';

const router = Router();

router.use(requireDashboard);

router.get('/', (req, res) => {
  res.json({ ok: true, routes: routeEngine.listRoutes(), strategies: routeEngine.STRATEGIES });
});

router.post('/', (req, res) => {
  const created = routeEngine.createRoute(req.body || {});
  res.status(201).json({ ok: true, route: created });
});

router.get('/:id', (req, res) => {
  const route = routeEngine.getRoute(req.params.id);
  if (!route) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, route });
});

router.patch('/:id', (req, res) => {
  const updated = routeEngine.updateRoute(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, route: updated });
});

router.delete('/:id', (req, res) => {
  routeEngine.deleteRoute(req.params.id);
  res.json({ ok: true });
});

router.post('/simulate', (req, res) => {
  const model = String(req.body?.model || '');
  const decision = routeEngine.resolveModel(model);
  res.json({ ok: true, decision });
});

export default router;
