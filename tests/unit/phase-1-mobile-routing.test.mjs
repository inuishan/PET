import assert from 'node:assert/strict';
import test from 'node:test';

import { getDefaultAuthenticatedHref, getProtectedRedirect } from '../../apps/mobile/src/features/auth/auth-routing.ts';

test('Phase 1 routing sends signed-out users to sign-in and householdless users to onboarding', () => {
  assert.equal(
    getProtectedRedirect({
      authStatus: 'signed_out',
      group: 'tabs',
      householdStatus: 'needs_household',
    }),
    '/(auth)/sign-in',
  );

  assert.equal(
    getProtectedRedirect({
      authStatus: 'signed_in',
      group: 'tabs',
      householdStatus: 'needs_household',
    }),
    '/(onboarding)/household',
  );
});

test('Phase 1 routing keeps ready household members on the product tabs', () => {
  assert.equal(
    getProtectedRedirect({
      authStatus: 'signed_in',
      group: 'tabs',
      householdStatus: 'ready',
    }),
    null,
  );

  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: 'signed_in',
      householdStatus: 'ready',
    }),
    '/(tabs)',
  );
});
