/** Only the request origin and an explicitly configured external origin are trusted. */
export function isAllowedOrigin(request: Request, configuredOrigin?: string) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // CLI clients do not send a browser Origin header.
  if (origin === new URL(request.url).origin) return true;
  if (!configuredOrigin) return false;
  try {
    const allowed = new URL(configuredOrigin);
    return ['http:', 'https:'].includes(allowed.protocol) && origin === allowed.origin;
  } catch { return false; }
}
