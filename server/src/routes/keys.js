import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as vault from '../services/keyVault.js';

const router = Router();

router.use(requireDashboard);

router.get('/', (req, res) => {
  res.json({ ok: true, keys: vault.listKeys() });
});

router.post('/', (req, res) => {
  try {
    const item = vault.addKey(req.body || {});
    res.status(201).json({ ok: true, key: item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const updated = vault.updateKey(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, key: updated });
});

router.delete('/:id', (req, res) => {
  vault.deleteKey(req.params.id);
  res.json({ ok: true });
});

export default router;
