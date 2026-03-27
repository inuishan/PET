import { describe, expect, it, vi } from 'vitest';

import {
  createHouseholdSetup,
  createNeedsHouseholdState,
  joinHouseholdSetup,
  loadHouseholdState,
  normalizeDisplayName,
  normalizeHouseholdInviteCode,
  normalizeHouseholdName,
  type HouseholdClient,
} from './household-session';

function createQueryMock(data: unknown, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data,
    error,
  });
  const eq = vi.fn(() => ({
    eq,
    maybeSingle,
  }));
  const select = vi.fn(() => ({
    eq,
    maybeSingle,
  }));

  return {
    eq,
    maybeSingle,
    select,
  };
}

describe('normalizeHouseholdName', () => {
  it('trims the submitted household name', () => {
    expect(normalizeHouseholdName('  Sharma Household  ')).toBe('Sharma Household');
  });
});

describe('normalizeDisplayName', () => {
  it('returns null for a blank display name', () => {
    expect(normalizeDisplayName('   ')).toBeNull();
  });
});

describe('normalizeHouseholdInviteCode', () => {
  it('strips separators and uppercases invite codes', () => {
    expect(normalizeHouseholdInviteCode('  ab12-cd34  ')).toBe('AB12CD34');
  });
});

describe('loadHouseholdState', () => {
  it('returns needs_household when the user has no membership yet', async () => {
    const membershipQuery = createQueryMock(null);
    const client: HouseholdClient = {
      from: vi.fn(() => ({
        select: membershipQuery.select,
      })),
      rpc: vi.fn(),
    };

    await expect(loadHouseholdState(client, '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8')).resolves.toEqual(
      createNeedsHouseholdState()
    );
  });

  it('loads the household details and owner invite for an owner session', async () => {
    const membershipQuery = createQueryMock({
      display_name: 'Ishan',
      household_id: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
      role: 'owner',
    });
    const householdQuery = createQueryMock({
      name: 'Sharma Household',
    });
    const client: HouseholdClient = {
      from: vi.fn((table) => ({
        select: table === 'household_members' ? membershipQuery.select : householdQuery.select,
      })),
      rpc: vi.fn().mockResolvedValue({
        data: {
          householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
          inviteCode: 'AB12CD34EF56',
          inviteExpiresAt: '2026-04-03T10:00:00.000Z',
        },
        error: null,
      }),
    };

    await expect(loadHouseholdState(client, '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9')).resolves.toEqual({
      displayName: 'Ishan',
      householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
      householdName: 'Sharma Household',
      inviteCode: 'AB12CD34EF56',
      inviteExpiresAt: '2026-04-03T10:00:00.000Z',
      role: 'owner',
      status: 'ready',
    });
  });

  it('does not request an invite for non-owner members', async () => {
    const membershipQuery = createQueryMock({
      display_name: 'Spouse',
      household_id: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
      role: 'member',
    });
    const householdQuery = createQueryMock({
      name: 'Sharma Household',
    });
    const rpc = vi.fn();
    const client: HouseholdClient = {
      from: vi.fn((table) => ({
        select: table === 'household_members' ? membershipQuery.select : householdQuery.select,
      })),
      rpc,
    };

    await expect(loadHouseholdState(client, '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9')).resolves.toEqual({
      displayName: 'Spouse',
      householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
      householdName: 'Sharma Household',
      inviteCode: null,
      inviteExpiresAt: null,
      role: 'member',
      status: 'ready',
    });

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('createHouseholdSetup', () => {
  it('calls the create household RPC with normalized values', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        displayName: 'Ishan',
        householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
        householdName: 'Sharma Household',
        inviteCode: 'AB12CD34EF56',
        inviteExpiresAt: '2026-04-03T10:00:00.000Z',
        role: 'owner',
        status: 'ready',
      },
      error: null,
    });
    const client: HouseholdClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      createHouseholdSetup(client, {
        displayName: ' Ishan ',
        householdName: ' Sharma Household ',
      })
    ).resolves.toMatchObject({
      householdName: 'Sharma Household',
      role: 'owner',
      status: 'ready',
    });

    expect(rpc).toHaveBeenCalledWith('create_household_with_owner', {
      household_name: 'Sharma Household',
      owner_display_name: 'Ishan',
    });
  });
});

describe('joinHouseholdSetup', () => {
  it('normalizes the invite code before calling the join RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        displayName: 'Spouse',
        householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
        householdName: 'Sharma Household',
        inviteCode: null,
        inviteExpiresAt: null,
        role: 'member',
        status: 'ready',
      },
      error: null,
    });
    const client: HouseholdClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      joinHouseholdSetup(client, {
        displayName: ' Spouse ',
        inviteCode: ' ab12-cd34-ef56 ',
      })
    ).resolves.toMatchObject({
      role: 'member',
      status: 'ready',
    });

    expect(rpc).toHaveBeenCalledWith('join_household_with_invite', {
      invite_code: 'AB12CD34EF56',
      member_display_name: 'Spouse',
    });
  });
});
