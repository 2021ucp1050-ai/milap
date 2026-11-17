import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { EDUCATIONS, GENDERS, MARITAL, RELIGIONS } from '../format.js';
import { useSession } from '../session.jsx';

const EMPTY = {
  displayName: '',
  gender: 'woman',
  dateOfBirth: '',
  heightCm: '',
  city: '',
  state: '',
  religion: '',
  motherTongue: '',
  education: '',
  profession: '',
  maritalStatus: 'never_married',
  about: '',
  phone: '',
};

function profileFromMe(me) {
  const profile = me?.profile;
  if (!profile) return EMPTY;
  return {
    displayName: profile.displayName || '',
    gender: profile.gender || 'woman',
    dateOfBirth: profile.dateOfBirth || '',
    heightCm: profile.heightCm || '',
    city: profile.city || '',
    state: profile.state || '',
    religion: profile.religion || '',
    motherTongue: profile.motherTongue || '',
    education: profile.education || '',
    profession: profile.profession || '',
    maritalStatus: profile.maritalStatus || 'never_married',
    about: profile.about || '',
    phone: profile.phone || '',
  };
}

function Choices({ value, options, onChange }) {
  return (
    <div className="choice-row">
      {options.map(([key, label]) => (
        <button key={key} type="button" className={value === key ? 'choice on' : 'choice'} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}

function ProfileFields({ form, setForm }) {
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  return (
    <div className="stack">
      <label>Name<input value={form.displayName} onChange={set('displayName')} required /></label>
      <label>Gender<Choices value={form.gender} options={GENDERS} onChange={(gender) => setForm({ ...form, gender })} /></label>
      <label>Date of birth<input value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" required /></label>
      <label>Height (cm)<input value={form.heightCm} onChange={set('heightCm')} inputMode="numeric" placeholder="165" /></label>
      <div className="row">
        <label className="grow">City<input value={form.city} onChange={set('city')} required /></label>
        <label className="grow">State<input value={form.state} onChange={set('state')} required /></label>
      </div>
      <label>Marital status
        <select value={form.maritalStatus} onChange={set('maritalStatus')}>
          {MARITAL.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label>Religion
        <select value={form.religion} onChange={set('religion')}>
          <option value="">Prefer not to say</option>
          {RELIGIONS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>Mother tongue<input value={form.motherTongue} onChange={set('motherTongue')} /></label>
      <label>Education
        <select value={form.education} onChange={set('education')}>
          <option value="">Select</option>
          {EDUCATIONS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>Profession<input value={form.profession} onChange={set('profession')} /></label>
      <label>About you<textarea value={form.about} onChange={set('about')} maxLength={1000} /></label>
      <label>Phone, shown only after a match<input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="98xxxxxxxx" /></label>
    </div>
  );
}

export function Onboarding() {
  const session = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => profileFromMe(session.me));
  const [prefs, setPrefs] = useState({
    lookingForGender: session.me?.preferences?.lookingForGender || (form.gender === 'man' ? 'woman' : 'man'),
    minAge: session.me?.preferences?.minAge || 24,
    maxAge: session.me?.preferences?.maxAge || 35,
    religion: session.me?.preferences?.religion || '',
    city: session.me?.preferences?.city || '',
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.saveProfile({ ...form, heightCm: form.heightCm ? Number(form.heightCm) : null });
      await api.savePreferences({
        ...prefs,
        minAge: Number(prefs.minAge),
        maxAge: Number(prefs.maxAge),
      });
      await session.refresh();
      navigate('/verify-identity');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <p className="eyebrow">Your profile</p>
      <h1>{step === 0 ? 'Who you are' : 'Who you want to meet'}</h1>
      <div className="steps" aria-hidden="true"><i className="on" /><i className={step === 1 ? 'on' : ''} /></div>
      {step === 0 ? (
        <form className="stack" onSubmit={(event) => { event.preventDefault(); setStep(1); }}>
          <ProfileFields form={form} setForm={setForm} />
          <button className="btn" type="submit">Continue</button>
        </form>
      ) : (
        <form className="stack" onSubmit={save}>
          <label>Looking for
            <Choices
              value={prefs.lookingForGender}
              options={[...GENDERS, ['any', 'Anyone']]}
              onChange={(lookingForGender) => setPrefs({ ...prefs, lookingForGender })}
            />
          </label>
          <div className="row">
            <label className="grow">Minimum age<input value={prefs.minAge} onChange={(e) => setPrefs({ ...prefs, minAge: e.target.value })} inputMode="numeric" required /></label>
            <label className="grow">Maximum age<input value={prefs.maxAge} onChange={(e) => setPrefs({ ...prefs, maxAge: e.target.value })} inputMode="numeric" required /></label>
          </div>
          <label>Religion, optional
            <select value={prefs.religion} onChange={(e) => setPrefs({ ...prefs, religion: e.target.value })}>
              <option value="">Any</option>
              {RELIGIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>City, optional<input value={prefs.city} onChange={(e) => setPrefs({ ...prefs, city: e.target.value })} placeholder="Any city if left blank" /></label>
          {error ? <p className="banner">{error}</p> : null}
          <button className="btn" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save profile'}</button>
          <button className="btn-line" type="button" onClick={() => setStep(0)}>Back</button>
        </form>
      )}
    </main>
  );
}

export function EditProfile() {
  const session = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => profileFromMe(session.me));
  const [prefs, setPrefs] = useState({
    lookingForGender: session.me?.preferences?.lookingForGender || 'any',
    minAge: session.me?.preferences?.minAge || 24,
    maxAge: session.me?.preferences?.maxAge || 35,
    religion: session.me?.preferences?.religion || '',
    city: session.me?.preferences?.city || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.saveProfile({ ...form, heightCm: form.heightCm ? Number(form.heightCm) : null });
      await api.savePreferences({ ...prefs, minAge: Number(prefs.minAge), maxAge: Number(prefs.maxAge) });
      if (event.target.photo?.files?.[0]) await api.uploadPhoto(event.target.photo.files[0]);
      await session.refresh();
      navigate('/account');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <Link className="back" to="/account">Back</Link>
      <h1>Edit profile</h1>
      <form className="stack" onSubmit={onSubmit}>
        <label>Photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        <ProfileFields form={form} setForm={setForm} />
        <label>Looking for
          <Choices value={prefs.lookingForGender} options={[...GENDERS, ['any', 'Anyone']]} onChange={(lookingForGender) => setPrefs({ ...prefs, lookingForGender })} />
        </label>
        <div className="row">
          <label className="grow">Minimum age<input value={prefs.minAge} onChange={(e) => setPrefs({ ...prefs, minAge: e.target.value })} inputMode="numeric" /></label>
          <label className="grow">Maximum age<input value={prefs.maxAge} onChange={(e) => setPrefs({ ...prefs, maxAge: e.target.value })} inputMode="numeric" /></label>
        </div>
        {error ? <p className="banner">{error}</p> : null}
        <button className="btn" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </main>
  );
}
