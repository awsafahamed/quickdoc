import { isWebOriginAllowed } from '../src/web-origins';

describe('web origin policy', () => {
  it('allows loopback origins on arbitrary ports in development', () => {
    expect(isWebOriginAllowed('http://127.0.0.1:3030', [], false)).toBe(true);
    expect(isWebOriginAllowed('http://localhost:3003', [], false)).toBe(true);
  });

  it('does not allow unconfigured external origins in development', () => {
    expect(isWebOriginAllowed('https://untrusted.example', [], false)).toBe(false);
  });

  it('uses only configured origins in production', () => {
    expect(isWebOriginAllowed('https://rider.example', ['https://rider.example'], true)).toBe(true);
    expect(isWebOriginAllowed('http://localhost:3003', [], true)).toBe(false);
  });
});
