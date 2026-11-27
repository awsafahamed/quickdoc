'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFailureMessage, authResponseError } from '../auth-errors';

export default function LoginPage() {
  const router = useRouter();
  const googleCodeAttempted = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const googleCode = url.searchParams.get('google_code');
    const googleError = url.searchParams.get('google_error');
    if (!googleCode && !googleError) return;

    url.searchParams.delete('google_code');
    url.searchParams.delete('google_error');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    if (googleError) {
      setError('Google sign-in could not be completed. Please try again.');
      return;
    }
    if (!googleCode || googleCodeAttempted.current) return;
    googleCodeAttempted.current = true;

    const exchange = async () => {
      try {
        const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
        const response = await fetch(`${apiUrl}/auth/oauth/google/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: googleCode }),
        });
        if (!response.ok) {
          throw new Error(await authResponseError(response, 'Google sign-in code is invalid or expired.'));
        }
        const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { email: string } } };
        window.sessionStorage.setItem('print-attest-access-token', result.data.accessToken);
        window.localStorage.setItem('print-attest-refresh-token', result.data.refreshToken);
        window.localStorage.setItem('print-attest-session', JSON.stringify({ phone: '', name: result.data.user.email.split('@')[0], email: result.data.user.email }));
        router.replace('/dashboard');
      } catch (caught) {
        setError(authFailureMessage(caught, 'Google sign-in could not be completed.'));
      }
    };
    void exchange();
  }, [router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    try {
      setSubmitting(true);
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        throw new Error(await authResponseError(response, 'Sign-in could not be completed.', 'Email or password is incorrect.'));
      }
      const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { email: string } } };
      window.sessionStorage.setItem('print-attest-access-token', result.data.accessToken);
      window.localStorage.setItem('print-attest-refresh-token', result.data.refreshToken);
      window.localStorage.setItem('print-attest-session', JSON.stringify({ phone: '', name: email.split('@')[0], email: result.data.user.email }));
      router.push('/dashboard');
    } catch (caught) {
      setError(authFailureMessage(caught, 'Sign-in could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
      <section className="auth-panel">
        <p className="section-label">Customer access</p>
        <h1>Welcome back.</h1>
        <p className="auth-copy">Sign in with your email address and password.</p>
        <div className="auth-social">
          <button type="button" onClick={() => {
            const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
            window.location.assign(`${apiUrl}/auth/oauth/google`);
          }}>
            <span className="google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>
        </div>
        <div className="auth-divider"><span>or sign in with email</span></div>
        <form onSubmit={submit}>
          <label className="field-label">Email address<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} placeholder="you@gmail.com" /></label>
          <label className="field-label">Password<input type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Your password" /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button--primary auth-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <span>→</span></button>
        </form>
        <button className="auth-back" type="button" onClick={() => router.push('/forgot-password')}>Forgot password?</button>
        <p className="auth-legal">By continuing, you agree to our Terms and Privacy Policy.</p>
        <button className="auth-back" type="button" onClick={() => router.push('/register')}>New customer? Create an account</button>
      </section>
      <p className="auth-footer">Need help? Contact support</p>
    </main>
  );
}
