const localOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

export function isWebOriginAllowed(
  origin: string | undefined,
  configuredOrigins: readonly string[],
  isProduction: boolean,
): boolean {
  if (!origin || configuredOrigins.includes(origin)) return true;
  return !isProduction && localOrigin.test(origin);
}
