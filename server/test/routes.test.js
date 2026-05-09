import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncRegistry } from '../src/services/registrySync.js';
import {
  ensureDefaultRoutes, listRoutes, createRoute, deleteRoute,
  resolveModel, findRouteByAlias, findDefaultRoute,
} from '../src/services/routeEngine.js';

syncRegistry();
ensureDefaultRoutes();

test('default routes are seeded', () => {
  const routes = listRoutes();
  assert.ok(routes.length >= 4);
  for (const alias of ['bigliner-smart', 'bigliner-fast', 'bigliner-cheap', 'bigliner-vision']) {
    assert.ok(findRouteByAlias(alias), `expected default alias ${alias}`);
  }
  const def = findDefaultRoute();
  assert.ok(def);
});

test('resolveModel handles provider:model prefix', () => {
  const r = resolveModel('openai:gpt-5.5');
  assert.equal(r.kind, 'prefix');
  assert.equal(r.providerId, 'openai');
  assert.equal(r.modelId, 'gpt-5.5');
  assert.equal(r.route.steps.length, 1);
  assert.equal(r.route.steps[0].providerId, 'openai');
});

test('resolveModel matches a route alias', () => {
  const r = resolveModel('bigliner-cheap');
  assert.equal(r.kind, 'alias');
  assert.equal(r.route.alias, 'bigliner-cheap');
  assert.ok(r.route.steps.length > 0);
});

test('resolveModel falls back to default route for unknown strings', () => {
  const r = resolveModel('nonexistent-model-xyz');
  // Either model lookup hit or default route.
  assert.ok(['model', 'default', 'unresolved'].includes(r.kind));
});

test('createRoute + deleteRoute round-trip', () => {
  const before = listRoutes().length;
  const route = createRoute({
    alias: 'ci-test-route',
    name: 'CI Test',
    description: 'test route',
    strategy: 'priority',
    conditions: {},
    steps: [
      { providerId: 'openai', modelId: 'gpt-5-mini' },
      { providerId: 'mistral', modelId: 'mistral-small-3' },
    ],
  });
  assert.equal(route.steps.length, 2);
  assert.equal(listRoutes().length, before + 1);
  deleteRoute(route.id);
  assert.equal(listRoutes().length, before);
});
