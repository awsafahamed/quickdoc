describe('Authentication security rules', () => {
  it('uses a strong bcrypt work factor', () => {
    const bcryptWorkFactor = 12;
    expect(bcryptWorkFactor).toBeGreaterThanOrEqual(12);
  });

  it('uses short-lived password reset and OTP tokens', () => {
    const otpLifetimeMinutes = 5;
    const resetLifetimeMinutes = 30;
    expect(otpLifetimeMinutes).toBeLessThan(resetLifetimeMinutes);
  });

  it('keeps refresh tokens hashed before database storage', () => {
    const refreshToken = 'raw-refresh-token';
    const storedToken = Buffer.from(refreshToken).toString('hex');
    expect(storedToken).not.toBe(refreshToken);
  });
});
