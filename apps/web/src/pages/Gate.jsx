import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, nextPath } from '../api.js';
import { useSession } from '../session.jsx';

function Screen({ children }) {
  return <main className="screen">{children}</main>;
}

export function Welcome() {
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session.status === 'loading') return <div className="loading">Milap</div>;
  if (session.status === 'ready') return <Navigate to={nextPath(session.me)} replace />;

  async function demo(email) {
    setBusy(true);
    setError('');
    try {
      const result = await api.login({ email, password: 'password123' });
      const me = await session.signIn(result.token);
      navigate(nextPath(me));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <p className="eyebrow">Matrimony</p>
      <h1 className="wordmark">Milap</h1>
      <p className="lede">Create a profile, confirm your email, and send interest only when you mean it.</p>
      {error ? <p className="banner">{error}</p> : null}
      <div className="stack">
        <Link className="btn" to="/register">Create an account</Link>
        <Link className="btn-line" to="/login">Sign in</Link>
        <button className="btn-ghost" type="button" disabled={busy} onClick={() => demo('ananya@milap.dev')}>Try as Ananya</button>
        <button className="btn-line" type="button" disabled={busy} onClick={() => demo('arjun@milap.dev')}>Try as Arjun</button>
      </div>
      <p className="muted">Demo profiles use the password password123. <Link to="/privacy">Privacy</Link></p>
    </Screen>
  );
}

export function Login() {
  const session = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login({ email, password });
      const me = await session.signIn(result.token);
      navigate(nextPath(me));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Link className="back" to="/">Back</Link>
      <h1>Sign in</h1>
      <form className="stack" onSubmit={onSubmit}>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required /></label>
        {error ? <p className="banner">{error}</p> : null}
        <button className="btn" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Screen>
  );
}

export function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.register({ email, password });
      navigate('/verify', { state: { email: result.email, devOtp: result.devOtp } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Link className="back" to="/">Back</Link>
      <h1>Create your account</h1>
      <p className="lede">Start with email. Identity verification comes before you can send interest.</p>
      <form className="stack" onSubmit={onSubmit}>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required /></label>
        {error ? <p className="banner">{error}</p> : null}
        <button className="btn" disabled={busy} type="submit">{busy ? 'Creating…' : 'Continue'}</button>
      </form>
    </Screen>
  );
}

export function Verify() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState(location.state?.devOtp || '');
  const [note, setNote] = useState(location.state?.devOtp ? `Development code: ${location.state.devOtp}` : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.verifyEmail({ email, code });
      const me = await session.signIn(result.token);
      navigate(nextPath(me));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const result = await api.resendOtp({ email });
      if (result.devOtp) {
        setCode(result.devOtp);
        setNote(`Development code: ${result.devOtp}`);
      } else {
        setNote('A new code was sent.');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Screen>
      <Link className="back" to="/register">Back</Link>
      <h1>Confirm your email</h1>
      <p className="lede">This proves you can read mail at that address. In production the code is emailed, not shown here.</p>
      <form className="stack" onSubmit={onSubmit}>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label>6-digit code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label>
        {note ? <p className="banner good">{note}</p> : null}
        {error ? <p className="banner">{error}</p> : null}
        <button className="btn" disabled={busy} type="submit">{busy ? 'Checking…' : 'Verify email'}</button>
        <button className="btn-line" type="button" onClick={resend}>Resend code</button>
      </form>
    </Screen>
  );
}

export function Privacy() {
  return (
    <Screen>
      <Link className="back" to="/">Back</Link>
      <h1>Privacy</h1>
      <div className="stack">
        <p>Milap stores your email, password hash, profile, interests, messages, and subscription status on the server you connect to.</p>
        <p>Phone numbers and email addresses of other members are returned only after a match, and only to a member with an active paid plan.</p>
        <p>Do not type an Aadhaar number into this app. A production deployment has to verify identity through a UIDAI-licensed provider or DigiLocker. This demo stores a verification reference, not a government ID number.</p>
        <p>This is not legal advice. A public launch needs a privacy policy reviewed for India, including consent, retention, and account deletion.</p>
      </div>
    </Screen>
  );
}
