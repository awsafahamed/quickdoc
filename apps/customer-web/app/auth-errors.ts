export async function authResponseError(
  response: Response,
  fallback: string,
  unauthorizedMessage?: string,
): Promise<string> {
  if (response.status === 401 && unauthorizedMessage) return unauthorizedMessage;

  try {
    const body = await response.json() as { message?: string | string[]; error?: string };
    const message = body.message ?? body.error;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    return fallback;
  }
  return fallback;
}

export function authFailureMessage(reason: unknown, fallback: string): string {
  if (reason instanceof TypeError) {
    return 'Could not reach QuickDoc. Check your connection and try again.';
  }
  return reason instanceof Error ? reason.message : fallback;
}
