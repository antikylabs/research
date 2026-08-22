import { describe, expect, it } from 'vitest';

import { createStudioSessionState, reduceStudioSession } from './session.ts';

describe('render studio session', () => {
  it('changes model, environment, renderer, and controls independently', () => {
    let state = createStudioSessionState('bundled:lantern');
    state = reduceStudioSession(state, { type: 'select-model', modelId: 'file:rover' });
    state = reduceStudioSession(state, { type: 'select-environment', environmentId: 'beach' });
    state = reduceStudioSession(state, { type: 'select-approach', approachId: 'raytrace' });
    state = reduceStudioSession(state, {
      type: 'update-settings',
      settings: {
        ...state.settings,
        style: 'graphic',
        depthOfField: { enabled: true, focusDistance: 42, aperture: 1.6 },
        lighting: { timeOfDay: 1.5, moonEnabled: false },
      },
    });

    expect(state).toMatchObject({
      selectedModelId: 'file:rover',
      environmentId: 'beach',
      approachId: 'raytrace',
      settings: {
        style: 'graphic',
        depthOfField: { enabled: true, focusDistance: 42, aperture: 1.6 },
        lighting: { timeOfDay: 1.5, moonEnabled: false },
      },
    });
  });

  it('preserves every selection and control across pipeline reloads', () => {
    let state = createStudioSessionState('bundled:shrine');
    state = reduceStudioSession(state, { type: 'select-environment', environmentId: 'forest' });
    state = reduceStudioSession(state, { type: 'select-approach', approachId: 'instances' });
    state = reduceStudioSession(state, {
      type: 'update-settings',
      settings: { ...state.settings, exposure: 1.8, materialVariation: 0.7 },
    });
    const beforeReload = state;

    state = reduceStudioSession(state, { type: 'reload-renderer' });
    state = reduceStudioSession(state, { type: 'reload-renderer' });

    expect(state.rendererGeneration).toBe(2);
    expect({ ...state, rendererGeneration: beforeReload.rendererGeneration }).toEqual(beforeReload);
  });
});
