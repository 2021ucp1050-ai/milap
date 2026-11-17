import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useSession } from './session.jsx';
import { Welcome, Login, Register, Verify, Privacy } from './pages/Gate.jsx';
import { Onboarding, EditProfile } from './pages/Onboarding.jsx';
import { Discover, ProfilePage } from './pages/Discover.jsx';
import { Interests, Matches, Chat } from './pages/Social.jsx';
import { Account, Paywall, Identity } from './pages/Account.jsx';

function Loading() {
  return <div className="loading">Milap</div>;
}

function RequireAuth() {
  const session = useSession();
  if (session.status === 'loading') return <Loading />;
  if (session.status !== 'ready') return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireProfile() {
  const session = useSession();
  if (!session.me?.profile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function Icon({ name }) {
  const paths = {
    discover: 'M8 4h8v16H8z M4 8h4v8H4z M16 8h4v8h-4z',
    interests: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z',
    matches: 'M5 8h14M5 12h10M5 16h8',
    account: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8a7 7 0 0 1 14 0',
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={paths[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shell() {
  return (
    <>
      <Outlet />
      <nav className="tabs">
        <NavLink to="/discover"><Icon name="discover" />Discover</NavLink>
        <NavLink to="/interests"><Icon name="interests" />Interest</NavLink>
        <NavLink to="/matches"><Icon name="matches" />Matches</NavLink>
        <NavLink to="/account"><Icon name="account" />Account</NavLink>
      </nav>
    </>
  );
}

export function App() {
  return (
    <div className="stage">
      <div className="phone">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/verify-identity" element={<Identity />} />
            <Route element={<RequireProfile />}>
              <Route element={<Shell />}>
                <Route path="/discover" element={<Discover />} />
                <Route path="/interests" element={<Interests />} />
                <Route path="/matches" element={<Matches />} />
                <Route path="/account" element={<Account />} />
              </Route>
              <Route path="/profile/:id" element={<ProfilePage />} />
              <Route path="/chat/:id" element={<Chat />} />
              <Route path="/paywall" element={<Paywall />} />
              <Route path="/edit" element={<EditProfile />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
