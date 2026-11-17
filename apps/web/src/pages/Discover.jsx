import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import { useGoToError } from '../guard.js';
import { colorFor, initials, labelMarital } from '../format.js';
import { useSession } from '../session.jsx';

function Portrait({ person }) {
  const photo = mediaUrl(person.photoUrl);
  return (
    <div className="portrait" style={{ background: colorFor(person.displayName) }}>
      {photo ? <img src={photo} alt="" /> : initials(person.displayName)}
    </div>
  );
}

function Facts({ person }) {
  return (
    <p className="meta">
      {[person.age && `${person.age}`, person.heightLabel, person.city, person.state].filter(Boolean).join(' · ')}
      <br />
      {[person.profession, person.education, person.religion].filter(Boolean).join(' · ')}
    </p>
  );
}

export function Discover() {
  const session = useSession();
  const go = useGoToError();
  const [filters, setFilters] = useState({
    minAge: session.me?.preferences?.minAge || 24,
    maxAge: session.me?.preferences?.maxAge || 35,
    city: '',
    religion: '',
  });
  const [people, setPeople] = useState([]);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [openFilters, setOpenFilters] = useState(false);

  async function load(next = filters) {
    setError('');
    try {
      const data = await api.discover(next);
      setPeople(data.results);
      setUsage(data.subscription);
    } catch (err) {
      setError(err.message);
      go(err);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const person = people[0];

  async function act(kind) {
    if (!person) return;
    setNote('');
    try {
      if (kind === 'pass') {
        await api.pass(person.id);
      } else {
        const result = await api.sendInterest(person.id);
        setNote(result.matched ? `You and ${person.displayName} matched.` : `Interest sent to ${person.displayName}.`);
        if (result.matched) setUsage((current) => current);
      }
      setPeople((current) => current.slice(1));
      const me = await session.refresh();
      setUsage(me?.subscription || null);
    } catch (err) {
      setError(err.message);
      go(err);
    }
  }

  return (
    <main className="screen with-tabs">
      <div className="topbar">
        <h2>Discover</h2>
        <button className="btn btn-small btn-line" type="button" onClick={() => setOpenFilters((value) => !value)}>Filters</button>
      </div>
      {!session.me.emailVerified || session.me.kyc.status !== 'verified' ? (
        <p className="banner">Verify email and identity before you can send interest. <Link to="/verify-identity">Verify</Link></p>
      ) : null}
      {usage?.interestLimit ? <p className="muted">{usage.interestsSent} of {usage.interestLimit} free interests used.</p> : null}
      {openFilters ? (
        <form className="stack" onSubmit={(event) => { event.preventDefault(); load(); }}>
          <div className="row">
            <label className="grow">Min age<input value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} /></label>
            <label className="grow">Max age<input value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} /></label>
          </div>
          <label>City<input value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} placeholder="Any" /></label>
          <label>Religion<input value={filters.religion} onChange={(e) => setFilters({ ...filters, religion: e.target.value })} placeholder="Any" /></label>
          <button className="btn" type="submit">Apply</button>
        </form>
      ) : null}
      {error ? <p className="banner">{error}</p> : null}
      {note ? <p className="banner good">{note}</p> : null}
      {person ? (
        <article className="card">
          <Portrait person={person} />
          <div className="card-body">
            {person.featured ? <p className="eyebrow">Featured</p> : null}
            <h2>{person.displayName}</h2>
            <Facts person={person} />
            <p>{person.about}</p>
            <div className="chips">
              {person.reasons?.map((reason) => <span className="chip" key={reason}>{reason}</span>)}
              <span className="chip">Match {person.score}</span>
            </div>
            <div className="actions">
              <button className="btn-line" type="button" onClick={() => act('pass')}>Not now</button>
              <button className="btn" type="button" onClick={() => act('interest')}>Send interest</button>
            </div>
            <p><Link to={`/profile/${person.id}`}>Full profile</Link></p>
          </div>
        </article>
      ) : (
        <p className="lede">No one else matches these filters. Widen the age range or clear the city.</p>
      )}
    </main>
  );
}

export function ProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const go = useGoToError();
  const [person, setPerson] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.profile(id).then(setPerson).catch((err) => setError(err.message));
  }, [id]);

  async function interest() {
    try {
      const result = await api.sendInterest(id);
      navigate(result.matched ? '/matches' : '/interests');
    } catch (err) {
      setError(err.message);
      go(err);
    }
  }

  if (!person) {
    return <main className="screen">{error ? <p className="banner">{error}</p> : <p>Loading profile…</p>}</main>;
  }

  return (
    <main className="screen">
      <button className="back" type="button" onClick={() => navigate(-1)}>Back</button>
      <article className="card">
        <Portrait person={person} />
        <div className="card-body">
          <h1>{person.displayName}</h1>
          <Facts person={person} />
          <p>{person.about}</p>
          <div className="chips">
            <span className="chip">{labelMarital(person.maritalStatus)}</span>
            {person.motherTongue ? <span className="chip">{person.motherTongue}</span> : null}
            {person.kycVerified ? <span className="chip">Identity verified</span> : null}
            {person.reasons?.map((reason) => <span className="chip" key={reason}>{reason}</span>)}
          </div>
          {error ? <p className="banner">{error}</p> : null}
          <div className="actions">
            <button className="btn" type="button" onClick={interest}>Send interest</button>
          </div>
        </div>
      </article>
    </main>
  );
}
