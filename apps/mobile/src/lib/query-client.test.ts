import { describe, expect, it } from 'vitest';

import { createAppQueryClient } from './query-client';

describe('createAppQueryClient', () => {
  it('configures sensible mobile defaults for queries and mutations', () => {
    const client = createAppQueryClient();

    expect(client.getDefaultOptions().queries).toMatchObject({
      gcTime: 1000 * 60 * 30,
      retry: 1,
      staleTime: 1000 * 60,
    });

    expect(client.getDefaultOptions().mutations).toMatchObject({
      retry: 0,
    });
  });
});
