export function apiOrigin() {
  const override = localStorage.getItem('milap.apiBase');
  if (override != null && override !== '') return override.replace(/\/$/, '');
  return String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
}

export function mediaUrl(urlPath) {
  if (!urlPath) return null;
  if (urlPath.startsWith('http')) return urlPath;
  return `${apiOrigin()}${urlPath}`;
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('milap.token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${apiOrigin()}${path}`, { ...options, headers, body });
  } catch {
    const error = new Error('The Milap server is not reachable.');
    error.status = 0;
    throw error;
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'Unexpected response from the server' };
    }
  }
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

export const api = {
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  verifyEmail: (body) => request('/api/auth/verify-email', { method: 'POST', body }),
  resendOtp: (body) => request('/api/auth/resend-otp', { method: 'POST', body }),
  me: () => request('/api/me'),
  saveProfile: (body) => request('/api/me/profile', { method: 'PUT', body }),
  savePreferences: (body) => request('/api/me/preferences', { method: 'PUT', body }),
  uploadPhoto: (file) => {
    const body = new FormData();
    body.append('photo', file);
    return request('/api/me/photo', { method: 'POST', body });
  },
  completeKyc: () => request('/api/me/kyc', { method: 'POST', body: {} }),
  discover: (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    }
    const query = search.toString();
    return request(`/api/discover${query ? `?${query}` : ''}`);
  },
  profile: (id) => request(`/api/profiles/${id}`),
  pass: (userId) => request('/api/passes', { method: 'POST', body: { userId } }),
  interests: () => request('/api/interests'),
  sendInterest: (toUserId) => request('/api/interests', { method: 'POST', body: { toUserId } }),
  respond: (id, action) => request(`/api/interests/${id}/respond`, { method: 'POST', body: { action } }),
  matches: () => request('/api/matches'),
  messages: (id) => request(`/api/matches/${id}/messages`),
  sendMessage: (id, body) => request(`/api/matches/${id}/messages`, { method: 'POST', body: { body } }),
  contact: (id) => request(`/api/matches/${id}/contact`),
  plans: () => request('/api/plans'),
  checkout: (plan) => request('/api/billing/checkout', { method: 'POST', body: { plan } }),
};

export function routeForError(error) {
  if (error?.code === 'PAYMENT_REQUIRED') return '/paywall';
  if (error?.code === 'KYC_REQUIRED' || error?.code === 'EMAIL_UNVERIFIED') return '/verify-identity';
  if (error?.code === 'PROFILE_REQUIRED') return '/onboarding';
  return null;
}

export function nextPath(me) {
  if (!me?.profile) return '/onboarding';
  return '/discover';
}
