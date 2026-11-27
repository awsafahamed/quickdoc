'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/auth/password/reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? 'Password reset is temporarily unavailable. Try again later.');
      }
      setMessage('If an account uses this email, password reset instructions are on the way.');
    } catch (reason) {
      setError(reason instanceof TypeError
        ? 'Could not reach the password reset service. Try again later.'
        : reason instanceof Error ? reason.message : 'Password reset could not be requested.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <div className="auth-brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
    <section className="auth-panel">
      <p className="section-label">Account recovery</p>
      <h1>Reset your password.</h1>
      <p className="auth-copy">Enter the email address on your account. We will send a secure link if it exists.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field-label">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setMessage(''); }} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
        <button className="button button--primary auth-submit" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <span>→</span></button>
      </form>
      <Link className="auth-back" href="/login">Back to sign in</Link>
    </section>
    <p className="auth-footer">Reset links expire after 30 minutes.</p>
  </main>;
}
