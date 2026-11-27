'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    if (!token) { setError('This reset link is invalid. Request a new one.'); return; }
    setBusy(true);
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? 'This reset link is invalid or expired. Request a new one.');
      }
      setComplete(true);
    } catch (reason) {
      setError(reason instanceof TypeError
        ? 'Could not reach the password reset service. Try again later.'
        : reason instanceof Error ? reason.message : 'Password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <div className="auth-brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
    <section className="auth-panel">
      <p className="section-label">Account recovery</p>
      <h1>{complete ? 'Password updated.' : 'Choose a new password.'}</h1>
      <p className="auth-copy">{complete ? 'Your password has been changed. Sign in with your new password.' : 'Choose a password with at least 8 characters.'}</p>
      {complete ? <Link className="button button--primary auth-submit" href="/login">Go to sign in <span>→</span></Link> : <form onSubmit={(event) => void submit(event)}>
        <label className="field-label">New password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} /></label>
        <label className="field-label">Confirm new password<input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(''); }} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button--primary auth-submit" type="submit" disabled={busy || !token}>{busy ? 'Saving…' : 'Update password'} <span>→</span></button>
      </form>}
      {!complete && <Link className="auth-back" href="/forgot-password">Request another reset link</Link>}
    </section>
    <p className="auth-footer">Reset links are single-use and expire after 30 minutes.</p>
  </main>;
}
