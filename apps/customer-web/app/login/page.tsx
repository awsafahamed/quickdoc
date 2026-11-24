'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (method === 'phone') {
      if (!/^\+94[0-9\s-]{9,}$/.test(phone.trim()) && phone.trim() !== '+94') {
        setError('Enter a valid Sri Lanka mobile number after +94.');
        return;
      }
      if (!otpStep) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
        fetch(`${apiUrl}/auth/otp/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim() }) })
          .then((response) => {
            if (!response.ok) throw new Error('OTP request failed');
            setOtpStep(true);
            setError('');
          })
          .catch(() => setError('OTP service is unavailable. Try again when the API is connected.'));
        return;
      }
      if (!/^[0-9]{6}$/.test(otp)) {
        setError('Enter the 6-digit verification code.');
        return;
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      fetch(`${apiUrl}/auth/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim(), code: otp }) })
        .then(async (response) => {
          if (!response.ok) throw new Error('OTP verification failed');
          const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { email: string; roles: string[] } } };
          window.sessionStorage.setItem('print-attest-access-token', result.data.accessToken);
          window.localStorage.setItem('print-attest-refresh-token', result.data.refreshToken);
          window.localStorage.setItem('print-attest-session', JSON.stringify({ phone: phone.trim(), name: 'Customer', email: result.data.user.email }));
          router.push('/');
        })
        .catch(() => setError('The verification code is invalid or expired.'));
      return;
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) })
        .then(async (response) => {
          if (!response.ok) throw new Error('Login failed');
          const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { email: string; roles: string[] } } };
          window.sessionStorage.setItem('print-attest-access-token', result.data.accessToken);
          window.localStorage.setItem('print-attest-refresh-token', result.data.refreshToken);
          window.localStorage.setItem('print-attest-session', JSON.stringify({ phone: '', name: email.split('@')[0], email: result.data.user.email }));
          router.push('/');
        })
        .catch(() => setError('Email or password is incorrect.'));
      return;
    }
    window.localStorage.setItem('print-attest-session', JSON.stringify({
      phone: method === 'phone' ? phone.trim() : '',
      name: email ? email.split('@')[0] : 'Amar Khan',
      email: method === 'email' ? email.trim() : '',
    }));
    router.push('/');
  };

  const googleSignIn = () => {
    setError('Google sign-in is not configured. Add your OAuth client credentials to enable it.');
  };

  return (
    <main className="auth-page">
      <div className="auth-brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
      <section className="auth-panel">
        <p className="section-label">Customer access</p>
        <h1>{otpStep ? 'Verify your phone.' : 'Welcome back.'}</h1>
        <p className="auth-copy">{otpStep ? 'Enter the 6-digit code sent to your Sri Lanka number.' : 'Create or access your account using your preferred sign-in method.'}</p>
        {!otpStep && <div className="auth-social"><button type="button" onClick={googleSignIn}><span className="google-mark">G</span> Continue with Google</button></div>}
        {!otpStep && <div className="auth-divider"><span>or continue with</span></div>}
        {!otpStep && <div className="auth-tabs" role="tablist"><button type="button" className={method === 'phone' ? 'active' : ''} onClick={() => { setMethod('phone'); setError(''); }}>Phone</button><button type="button" className={method === 'email' ? 'active' : ''} onClick={() => { setMethod('email'); setError(''); }}>Email / Gmail</button></div>}
        <form onSubmit={submit}>
          {method === 'phone' && !otpStep && <label className="field-label">Sri Lanka phone number<div className="phone-field"><span>🇱🇰 +94</span><input autoComplete="tel" value={phone} onChange={(event) => { const value = event.target.value.replace(/^(\+94|94|0)/, '').replace(/\D/g, '').slice(0, 9); setPhone('+94' + value); setError(''); }} placeholder="70 123 4567" /></div></label>}
          {method === 'phone' && otpStep && <label className="field-label">Verification code<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="123456" /></label>}
          {method === 'email' && <><label className="field-label">Email address<input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} placeholder="you@gmail.com" /></label><label className="field-label">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="At least 8 characters" /></label></>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button--primary auth-submit" type="submit">{otpStep ? 'Verify & continue' : method === 'phone' ? 'Send verification code' : 'Sign in or create account'} <span>→</span></button>
          {otpStep && <button type="button" className="auth-back" onClick={() => { setOtpStep(false); setOtp(''); setError(''); }}>Change phone number</button>}
        </form>
        <p className="auth-legal">By continuing, you agree to our Terms and Privacy Policy.</p>
        <button className="auth-back" type="button" onClick={() => router.push('/register')}>New customer? Create an account</button>
      </section>
      <p className="auth-footer">Need help? Contact support</p>
    </main>
  );
}
