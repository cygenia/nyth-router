import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import { listAvailableModels } from '../services/modelAvailability.js';
import { getRegistry, totalModelCount, totalProviderCount } from '../registry/providers.js';

const router = Router();
router.use(requireDashboard);

router.get('/management-center', (req, res) => {
  const available = listAvailableModels();
  const registry = getRegistry();
  const latestRegistryUpdate = Math.max(...registry.map((p) => Date.parse(p.updatedAt || 0) || 0), 0) || null;
  res.json({
    ok: true,
    now: new Date().toISOString(),
    greeting: buildGreeting(),
    availableModels: available.availableModels,
    availableProviders: available.availableProviders,
    connectedOauthAccounts: available.connectedOauthAccounts,
    totalProviders: totalProviderCount(),
    totalModels: totalModelCount(),
    modelProviders: available.providers.filter((p) => p.available).map((p) => ({
      id: p.id,
      name: p.name,
      authMode: p.authMode,
      accountCount: p.accountCount,
      modelCount: p.models.length,
      sampleModels: p.models.slice(0, 8).map((m) => ({ id: m.id, displayName: m.displayName, modelRef: m.modelRef })),
    })),
    updates: {
      status: 'watching',
      lastCheckedAt: new Date().toISOString(),
      message: 'Model registry can refresh from provider /models endpoints when a key or OAuth account is connected.',
      latestRegistryUpdate,
    },
  });
});

function buildGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Good morning. Your gateway is ready.';
  if (hour < 17) return 'Good afternoon. Routes and models are standing by.';
  return 'Good evening. Nyth Router is watching your model lanes.';
}

export default router;
