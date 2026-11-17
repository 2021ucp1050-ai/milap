import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiOrigin } from '../api.js';
import { rupees } from '../format.js';
import { useSession } from '../session.jsx';

export function Account() {
  const session = useSession();
  const me = session.me;
  const [server, setServer] = useState(localStorage.getItem('milap.apiBase') || '');
  const [saved, setSaved] = useState('');

  function saveServer(event) {
    event.preventDefault();
    const value = server.trim();
    if (value) localStorage.setItem('milap.apiBase', value);
    else localStorage.removeItem('milap.apiBase');
    setSaved('Saved. Reload if requests still go to the old server.');
  }

  return (
    <main className="screen with-tabs">
      <h2>{me.profile?.displayName || 'Account'}</h2>
      <p className="muted">{me.email}</p>
      <div className="check"><span>Email</span><strong>{me.emailVerified ? 'Verified' : 'Not verified'}</strong></div>
      <div className="check"><span>Identity</span><strong>{me.kyc.status === 'verified' ? me.kyc.reference : 'Not verified'}</strong></div>
      <div className="check"><span>Plan</span><strong>{me.subscription.plan.replace('_', ' ')}</strong></div>
      {me.subscription.activeUntil ? <p className="muted">Active until {new Date(me.subscription.activeUntil).toLocaleDateString('en-IN')}</p> : null}
      <div className="stack" style={{ marginTop: 16 }}>
        <Link className="btn-line" to="/edit">Edit profile</Link>
        <Link className="btn-line" to="/verify-identity">Verification</Link>
        <Link className="btn" to="/paywall">Plans</Link>
        <button className="btn-ghost" type="button" onClick={session.signOut}>Log out</button>
      </div>
      <h2 style={{ marginTop: 28, fontSize: 22 }}>Install on a phone</h2>
      <p className="lede">In Safari or Chrome, open the browser menu and choose Add to Home Screen. The icon opens Milap without the browser bar.</p>
      <form className="stack" onSubmit={saveServer}>
        <label>API server, only if the app is not served with the API
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder={apiOrigin() || 'Same server as this site'} />
        </label>
        {saved ? <p className="banner good">{saved}</p> : null}
        <button className="btn-line" type="submit">Save server</button>
      </form>
      <p><Link to="/privacy">Privacy</Link></p>
    </main>
  );
}

export function Paywall() {
  const session = useSession();
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.plans().then((data) => setPlans(data.plans)).catch((err) => setError(err.message));
  }, []);

  async function buy(plan) {
    setBusy(plan);
    setError('');
    try {
      const result = await api.checkout(plan);
      if (result.mode === 'razorpay' && result.url) {
        window.location.href = result.url;
        return;
      }
      await session.refresh();
      setNote(`Your ${result.subscription.plan.replace('_', ' ')} plan is active for 30 days.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="screen">
      <Link className="back" to="/account">Back</Link>
      <p className="eyebrow">Subscription</p>
      <h1>Write after you match</h1>
      <p className="lede">A free account can browse and send 5 interests. A paid plan lasts 30 days. The server, not the app, decides what that plan unlocks.</p>
      {session.me.subscription.plan !== 'free' ? <p className="banner good">Current plan: {session.me.subscription.plan.replaceAll('_', ' ')}</p> : null}
      {error ? <p className="banner">{error}</p> : null}
      {note ? <p className="banner good">{note}</p> : null}
      <div className="stack">
        {plans.map((plan) => (
          <article className="plan" key={plan.id}>
            <strong>{plan.name}</strong>
            <div className="price">{rupees(plan.amountPaise)} <span className="muted">/ 30 days</span></div>
            <ul>{plan.perks.map((perk) => <li key={perk}>{perk}</li>)}</ul>
            <button className="btn" type="button" disabled={busy === plan.id} onClick={() => buy(plan.id)}>
              {busy === plan.id ? 'Working…' : 'Continue'}
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}

export function Identity() {
  const session = useSession();
  const me = session.me;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function verifyEmail(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.verifyEmail({ email: me.email, code });
      await session.signIn(result.token);
      setNote('Email verified.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const result = await api.resendOtp({ email: me.email });
      setNote(result.devOtp ? `Development code: ${result.devOtp}` : 'A new code was sent.');
      if (result.devOtp) setCode(result.devOtp);
    } catch (err) {
      setError(err.message);
    }
  }

  async function verifyIdentity() {
    setBusy(true);
    setError('');
    try {
      await api.completeKyc();
      await session.refresh();
      setNote('Identity reference saved. No government ID number was sent.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <Link className="back" to={me.profile ? '/discover' : '/onboarding'}>Back</Link>
      <p className="eyebrow">Verification</p>
      <h1>Confirm it is you</h1>
      <p className="lede">Email proves the mailbox is yours. Aadhaar, in a real launch, has to be checked by a UIDAI-licensed agency or DigiLocker. This app never asks for the number, and the server rejects it.</p>
      <div className="check"><span>Email</span><strong>{me.emailVerified ? 'Verified' : 'Needed'}</strong></div>
      <div className="check"><span>Identity</span><strong>{me.kyc.status === 'verified' ? me.kyc.reference : 'Needed'}</strong></div>
      {error ? <p className="banner">{error}</p> : null}
      {note ? <p className="banner good">{note}</p> : null}
      {!me.emailVerified ? (
        <form className="stack" onSubmit={verifyEmail}>
          <label>Code for {me.email}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required /></label>
          <button className="btn" disabled={busy} type="submit">Verify email</button>
          <button className="btn-line" type="button" onClick={resend}>Email me a code</button>
        </form>
      ) : null}
      {me.emailVerified && me.kyc.status !== 'verified' ? (
        <button className="btn" type="button" disabled={busy} onClick={verifyIdentity}>Complete demo identity check</button>
      ) : null}
      {me.profile && me.kyc.status === 'verified' ? <Link className="btn" to="/discover">Go to Discover</Link> : null}
    </main>
  );
}
