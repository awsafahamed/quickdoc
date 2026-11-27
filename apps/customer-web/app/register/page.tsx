'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFailureMessage, authResponseError } from '../auth-errors';

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('Enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (!/^\+94[0-9]{9}$/.test(phone.trim())) { setError('Enter a Sri Lanka phone number in +94 format.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!consent) { setError('Accept the Terms and Privacy Policy to continue.'); return; }

    setLoading(true);
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), password }),
      });
      if (!response.ok) {
        throw new Error(await authResponseError(response, 'Registration could not be completed.'));
      }
      const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { email: string } } };
      window.sessionStorage.setItem('print-attest-access-token', result.data.accessToken);
      window.localStorage.setItem('print-attest-refresh-token', result.data.refreshToken);
      window.localStorage.setItem('print-attest-session', JSON.stringify({ name: name.trim(), email: result.data.user.email, phone: phone.trim() }));
      router.push('/dashboard');
    } catch (caught) {
      setError(authFailureMessage(caught, 'Registration could not be completed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
      <section className="auth-panel auth-panel--register">
        <p className="section-label">Create customer account</p>
        <h1>Join QuickDoc.</h1>
        <p className="auth-copy">Manage printing, attestation, documents and deliveries from one account.</p>
        <form onSubmit={submit}>
          <label className="field-label">Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Kasun Perera" /></label>
          <label className="field-label">Email address<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" /></label>
          <label className="field-label">Sri Lanka phone number<div className="phone-field"><span>🇱🇰 +94</span><input autoComplete="tel" value={phone.replace(/^\+94/, '')} onChange={(event) => setPhone('+94' + event.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="70 123 4567" /></div></label>
          <label className="field-label">Password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          <label className="field-label">Confirm password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" /></label>
          <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to the Terms and Privacy Policy.</span></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button--primary auth-submit" type="submit" disabled={loading}>{loading ? 'Creating account…' : 'Create account'} <span>→</span></button>
        </form>
        <button className="auth-back" type="button" onClick={() => router.push('/login')}>Already have an account? Sign in</button>
      </section>
    </main>
  );
}
