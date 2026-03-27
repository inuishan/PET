import { describe, expect, it } from 'vitest';

import { createMockCoreProductState, getCategoryById } from './core-product-state';

describe('createMockCoreProductState', () => {
  it('returns a coherent sample household dataset for the review flows', () => {
    const state = createMockCoreProductState();

    expect(state.transactions).toHaveLength(6);
    expect(state.categories).toHaveLength(7);
    expect(state.parserProfiles).toHaveLength(3);
    expect(state.notificationPreferences).toHaveLength(3);
    expect(state.sync.pendingStatementCount).toBe(1);
  });
});

describe('getCategoryById', () => {
  it('returns the matching category metadata when a valid id is supplied', () => {
    const state = createMockCoreProductState();

    expect(getCategoryById(state.categories, 'shopping')).toMatchObject({
      id: 'shopping',
      name: 'Shopping',
    });
  });

  it('throws for an unknown category id', () => {
    const state = createMockCoreProductState();

    expect(() => getCategoryById(state.categories, 'unknown-category')).toThrow(
      'Unknown category: unknown-category'
    );
  });
});
