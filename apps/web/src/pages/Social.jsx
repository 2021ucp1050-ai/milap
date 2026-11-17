import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import { useGoToError } from '../guard.js';
import { colorFor, initials } from '../format.js';

function Face({ person }) {
  const photo = mediaUrl(person?.photoUrl);
  return (
    <div className="avatar" style={{ background: colorFor(person?.displayName || '') }}>
      {photo ? <img alt="" src={photo} /> : initials(person?.displayName || '')}
    </div>
  );
}

export function Interests() {
  const go = useGoToError();
  const [tab, setTab] = useState('received');
  const [data, setData] = useState({ received: [], sent: [] });
  const [error, setError] = useState('');

  async function load() {
    try {
      setData(await api.interests());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function respond(id, action) {
    setError('');
    try {
      await api.respond(id, action);
      await load();
    } catch (err) {
      setError(err.message);
      go(err);
    }
  }

  const items = data[tab] || [];
  return (
    <main className="screen with-tabs">
      <h2>Interest</h2>
      <div className="segment">
        <button type="button" className={tab === 'received' ? 'on' : ''} onClick={() => setTab('received')}>Received</button>
        <button type="button" className={tab === 'sent' ? 'on' : ''} onClick={() => setTab('sent')}>Sent</button>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      {items.length === 0 ? <p className="lede">Nothing here yet.</p> : null}
      {items.map((item) => (
        <div className="person" key={item.id}>
          <Face person={item.profile} />
          <div>
            <strong>{item.profile?.displayName}</strong>
            <span>{item.status} · {item.profile?.city}</span>
            {tab === 'received' && item.status === 'pending' ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-small" type="button" onClick={() => respond(item.id, 'accept')}>Accept</button>
                <button className="btn-line btn-small" type="button" onClick={() => respond(item.id, 'decline')}>Decline</button>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </main>
  );
}

export function Matches() {
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.matches().then((data) => setMatches(data.matches)).catch((err) => setError(err.message));
  }, []);

  return (
    <main className="screen with-tabs">
      <h2>Matches</h2>
      <p className="lede">A match is an interest that was accepted. Messages open from here.</p>
      {error ? <p className="banner">{error}</p> : null}
      {matches.length === 0 ? <p>No matches yet.</p> : null}
      {matches.map((match) => (
        <Link className="person" key={match.userId} to={`/chat/${match.userId}`}>
          <Face person={match.profile} />
          <div>
            <strong>{match.profile.displayName}</strong>
            <span>{match.lastMessage ? match.lastMessage.body : 'Say hello'}</span>
          </div>
        </Link>
      ))}
    </main>
  );
}

export function Chat() {
  const { id } = useParams();
  const go = useGoToError();
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [contact, setContact] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setThread(await api.messages(id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [id]);

  async function send(event) {
    event.preventDefault();
    setError('');
    try {
      await api.sendMessage(id, text);
      setText('');
      await load();
    } catch (err) {
      setError(err.message);
      go(err);
    }
  }

  async function showContact() {
    setError('');
    try {
      setContact(await api.contact(id));
    } catch (err) {
      setError(err.message);
      go(err);
    }
  }

  if (!thread) return <main className="screen">{error ? <p className="banner">{error}</p> : <p>Loading…</p>}</main>;

  return (
    <main className="screen">
      <div className="topbar">
        <Link className="back" to="/matches">Back</Link>
        <strong>{thread.profile.displayName}</strong>
        <button className="btn btn-small btn-line" type="button" onClick={showContact}>Contact</button>
      </div>
      {contact ? <p className="banner good">{contact.email}{contact.phone ? ` · ${contact.phone}` : ''}</p> : null}
      {error ? <p className="banner">{error}</p> : null}
      <div className="thread">
        {thread.messages.map((message) => (
          <div key={message.id} className={message.mine ? 'bubble mine' : 'bubble'}>{message.body}</div>
        ))}
      </div>
      {thread.canSend ? (
        <form className="composer" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" aria-label="Message" />
          <button className="btn btn-small" type="submit">Send</button>
        </form>
      ) : (
        <p className="banner">Reading is free. <Link to="/paywall">Premium</Link> lets you write and see contact details.</p>
      )}
    </main>
  );
}
