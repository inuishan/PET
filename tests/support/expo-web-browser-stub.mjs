export async function openAuthSessionAsync() {
  return {
    type: 'dismiss',
    url: null,
  };
}

export function maybeCompleteAuthSession() {
  return undefined;
}
