/**
 * Product rules for Milap.
 *
 * HTTP handlers stay thin. If a rule decides who can appear in search,
 * send interest, read a phone number, or hold a paid plan, it lives here.
 *
 * Identity is a status plus a provider reference. This module has no column
 * and no code path that stores an Aadhaar number.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { codesMatch, hashCode, hashPassword, newOtp, signJwt, verifyPassword } from './crypto.js';
import { many, one, run, transaction, uploadDir } from './db.js';
import { fail } from './errors.js';
import { devOtpAllowed, sendOtpEmail } from './mail.js';

export const FREE_INTEREST_LIMIT = 5;
const OTP_MINUTES = 10;

export const PLANS = {
  premium: {
    id: 'premium',
    name: 'Premium',
    amountPaise: 49900,
    periodDays: 30,
    perks: [
      'Unlimited interests',
      'Messages after a match',
      'Phone and email after a match',
    ],
  },
  premium_plus: {
    id: 'premium_plus',
    name: 'Premium Plus',
    amountPaise: 99900,
    periodDays: 30,
    perks: [
      'Everything in Premium',
      'Your profile is featured in Discover',
    ],
  },
};

const GENDERS = new Set(['woman', 'man', 'nonbinary']);
const LOOKING_FOR = new Set(['woman', 'man', 'nonbinary', 'any']);
const MARITAL = new Set(['never_married', 'divorced', 'widowed', 'separated']);

export function ageFromDob(dob, today = new Date()) {
  const [year, month, day] = String(dob).split('-').map(Number);
  if (!year || !month || !day) return null;
  let age = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  if (currentMonth < month || (currentMonth === month && today.getDate() < day)) age -= 1;
  return age;
}

export function formatHeight(cm) {
  if (!cm) return null;
  const inches = Math.round(Number(cm) / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function nowIso() {
  return new Date().toISOString();
}

function requireUser(userId) {
  const user = one('SELECT * FROM users WHERE id = ?', userId);
  if (!user) throw fail(401, 'Sign in required', 'AUTH');
  return user;
}

function profileRow(userId) {
  return one(
    `SELECT p.*, u.email_verified, u.kyc_status, u.kyc_provider, u.kyc_reference, u.email
     FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`,
    userId,
  );
}

export function activeSubscription(userId) {
  return one(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND status = 'active' AND current_period_end > ?
     ORDER BY created_at DESC LIMIT 1`,
    userId,
    nowIso(),
  );
}

export function planFor(userId) {
  return activeSubscription(userId)?.plan || 'free';
}

function interestsSent(userId) {
  return one('SELECT COUNT(*) AS n FROM interests WHERE from_user_id = ?', userId).n;
}

export function publicProfile(row, extras = {}) {
  const plan = row.plan || planFor(row.user_id);
  return {
    id: row.user_id,
    displayName: row.display_name,
    gender: row.gender,
    age: ageFromDob(row.date_of_birth),
    heightCm: row.height_cm,
    heightLabel: formatHeight(row.height_cm),
    city: row.city,
    state: row.state,
    religion: row.religion,
    motherTongue: row.mother_tongue,
    education: row.education,
    profession: row.profession,
    maritalStatus: row.marital_status,
    about: row.about,
    photoUrl: row.photo_path ? `/uploads/${path.basename(row.photo_path)}` : null,
    kycVerified: row.kyc_status === 'verified',
    featured: plan === 'premium_plus',
    ...extras,
  };
}

function presentPreferences(row) {
  if (!row) return null;
  return {
    lookingForGender: row.looking_for_gender,
    minAge: row.min_age,
    maxAge: row.max_age,
    religion: row.religion,
    city: row.city,
  };
}

function presentSubscription(userId) {
  const row = activeSubscription(userId);
  const plan = row?.plan || 'free';
  return {
    plan,
    status: row ? 'active' : 'free',
    activeUntil: row?.current_period_end || null,
    provider: row?.provider || null,
    interestLimit: plan === 'free' ? FREE_INTEREST_LIMIT : null,
    interestsSent: interestsSent(userId),
  };
}

export function getMe(userId) {
  const user = requireUser(userId);
  const profile = profileRow(userId);
  const preferences = one('SELECT * FROM preferences WHERE user_id = ?', userId);
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified),
    kyc: {
      status: user.kyc_status,
      provider: user.kyc_provider,
      reference: user.kyc_reference,
    },
    profile: profile
      ? {
          ...publicProfile(profile),
          dateOfBirth: profile.date_of_birth,
          phone: profile.phone,
        }
      : null,
    preferences: presentPreferences(preferences),
    subscription: presentSubscription(userId),
  };
}

function cleanEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 160) {
    throw fail(400, 'Enter a valid email address');
  }
  return value;
}

async function issueOtp(userId, email) {
  const code = newOtp();
  const expires = new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString();
  transaction(() => {
    run('UPDATE email_otps SET consumed = 1 WHERE user_id = ? AND consumed = 0', userId);
    run(
      'INSERT INTO email_otps (id, user_id, code_hash, expires_at, consumed) VALUES (?, ?, ?, ?, 0)',
      randomUUID(),
      userId,
      hashCode(code),
      expires,
    );
  });
  const delivery = await sendOtpEmail(email, code);
  return {
    delivered: delivery.delivered,
    devOtp: devOtpAllowed() && !delivery.delivered ? code : undefined,
  };
}

export async function registerUser({ email, password }) {
  const normalized = cleanEmail(email);
  if (String(password || '').length < 8 || String(password).length > 200) {
    throw fail(400, 'Use a password of at least 8 characters');
  }
  const existing = one('SELECT id, email_verified FROM users WHERE email = ?', normalized);
  if (existing) throw fail(409, 'An account with this email already exists. Sign in instead.');
  const id = randomUUID();
  run(
    `INSERT INTO users (id, email, password_hash, email_verified, kyc_status, created_at)
     VALUES (?, ?, ?, 0, 'unverified', ?)`,
    id,
    normalized,
    await hashPassword(password),
    nowIso(),
  );
  const otp = await issueOtp(id, normalized);
  return { email: normalized, ...otp };
}

export async function resendOtp({ email }) {
  const normalized = cleanEmail(email);
  const user = one('SELECT * FROM users WHERE email = ?', normalized);
  if (!user) throw fail(404, 'No account found for that email');
  if (user.email_verified) throw fail(400, 'This email is already verified. Sign in.');
  return { email: normalized, ...(await issueOtp(user.id, normalized)) };
}

export async function verifyEmail({ email, code }) {
  const normalized = cleanEmail(email);
  const user = one('SELECT * FROM users WHERE email = ?', normalized);
  if (!user) throw fail(400, 'That code is not valid');
  const otp = one(
    `SELECT * FROM email_otps
     WHERE user_id = ? AND consumed = 0
     ORDER BY expires_at DESC LIMIT 1`,
    user.id,
  );
  if (!otp || otp.expires_at < nowIso() || !codesMatch(String(code || ''), otp.code_hash)) {
    throw fail(400, 'That code is not valid or it has expired');
  }
  transaction(() => {
    run('UPDATE email_otps SET consumed = 1 WHERE id = ?', otp.id);
    run('UPDATE users SET email_verified = 1 WHERE id = ?', user.id);
  });
  return sessionFor(user.id, normalized);
}

export async function login({ email, password }) {
  const normalized = cleanEmail(email);
  const user = one('SELECT * FROM users WHERE email = ?', normalized);
  const valid = user ? await verifyPassword(String(password || ''), user.password_hash) : false;
  if (!user || !valid) throw fail(401, 'Email or password is incorrect', 'AUTH');
  return sessionFor(user.id, user.email);
}

function sessionFor(userId, email) {
  return {
    token: signJwt({ sub: userId, email }),
    me: getMe(userId),
  };
}

const BANNED_KEY = /(aadhaar|aadhar|uidai|^uid$)/i;

export function assertNoGovernmentId(body, { rejectTwelveDigits = false } = {}) {
  const walk = (value, key) => {
    if (key && BANNED_KEY.test(String(key).replace(/[\s-]/g, ''))) {
      throw fail(400, 'Do not send an Aadhaar or UIDAI number. Use a licensed KYC provider.', 'AADHAAR_REJECTED');
    }
    if (rejectTwelveDigits && typeof value === 'string' && /^\d{12}$/.test(value.trim())) {
      throw fail(400, 'Do not send an Aadhaar number to this server.', 'AADHAAR_REJECTED');
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  };
  walk(body, '');
}

function text(value, label, { min = 1, max = 80, required = true } = {}) {
  const cleaned = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned && !required) return null;
  if (cleaned.length < min || cleaned.length > max) {
    throw fail(400, `${label} must be ${min}-${max} characters`);
  }
  return cleaned;
}

function optionalChoice(value, label, allowed) {
  if (value == null || value === '') return null;
  const cleaned = String(value).trim();
  if (!allowed.includes(cleaned)) throw fail(400, `${label} is not a supported value`);
  return cleaned;
}

export function saveProfile(userId, input = {}) {
  requireUser(userId);
  assertNoGovernmentId(input);
  const displayName = text(input.displayName, 'Name', { min: 2, max: 80 });
  const gender = String(input.gender || '');
  if (!GENDERS.has(gender)) throw fail(400, 'Choose a gender');
  const dateOfBirth = String(input.dateOfBirth || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw fail(400, 'Enter a date of birth');
  const age = ageFromDob(dateOfBirth);
  if (age == null || age < 18 || age > 90) throw fail(400, 'You need to be 18 or older');
  const city = text(input.city, 'City', { max: 60 });
  const state = text(input.state, 'State', { max: 60 });
  const maritalStatus = String(input.maritalStatus || '');
  if (!MARITAL.has(maritalStatus)) throw fail(400, 'Choose a marital status');
  let heightCm = null;
  if (input.heightCm != null && input.heightCm !== '') {
    heightCm = Number(input.heightCm);
    if (!Number.isInteger(heightCm) || heightCm < 120 || heightCm > 230) {
      throw fail(400, 'Height should be between 120 and 230 cm');
    }
  }
  const phone = text(input.phone, 'Phone', { required: false, max: 16 });
  if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) throw fail(400, 'Enter a phone number with digits only');
  const about = text(input.about, 'About', { required: false, min: 0, max: 1000 });
  const record = {
    display_name: displayName,
    gender,
    date_of_birth: dateOfBirth,
    height_cm: heightCm,
    city,
    state,
    religion: text(input.religion, 'Religion', { required: false, max: 40 }),
    mother_tongue: text(input.motherTongue, 'Mother tongue', { required: false, max: 40 }),
    education: text(input.education, 'Education', { required: false, max: 60 }),
    profession: text(input.profession, 'Profession', { required: false, max: 80 }),
    marital_status: maritalStatus,
    about,
    phone,
  };
  const timestamp = nowIso();
  transaction(() => {
    const existing = one('SELECT user_id FROM profiles WHERE user_id = ?', userId);
    if (existing) {
      run(
        `UPDATE profiles SET
          display_name = ?, gender = ?, date_of_birth = ?, height_cm = ?, city = ?, state = ?,
          religion = ?, mother_tongue = ?, education = ?, profession = ?, marital_status = ?,
          about = ?, phone = ?, updated_at = ?
         WHERE user_id = ?`,
        record.display_name, record.gender, record.date_of_birth, record.height_cm, record.city,
        record.state, record.religion, record.mother_tongue, record.education, record.profession,
        record.marital_status, record.about, record.phone, timestamp, userId,
      );
    } else {
      run(
        `INSERT INTO profiles (
          user_id, display_name, gender, date_of_birth, height_cm, city, state, religion,
          mother_tongue, education, profession, marital_status, about, phone, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, record.display_name, record.gender, record.date_of_birth, record.height_cm,
        record.city, record.state, record.religion, record.mother_tongue, record.education,
        record.profession, record.marital_status, record.about, record.phone, timestamp, timestamp,
      );
    }
    if (!one('SELECT user_id FROM preferences WHERE user_id = ?', userId)) {
      const looking = gender === 'man' ? 'woman' : gender === 'woman' ? 'man' : 'any';
      run(
        `INSERT INTO preferences (user_id, looking_for_gender, min_age, max_age, religion, city)
         VALUES (?, ?, 24, 35, NULL, NULL)`,
        userId,
        looking,
      );
    }
  });
  return getMe(userId);
}

export function savePreferences(userId, input = {}) {
  if (!profileRow(userId)) throw fail(409, 'Create your profile first', 'PROFILE_REQUIRED');
  const looking = String(input.lookingForGender || '');
  if (!LOOKING_FOR.has(looking)) throw fail(400, 'Choose who you want to meet');
  const minAge = Number(input.minAge);
  const maxAge = Number(input.maxAge);
  if (!Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge < 18 || maxAge > 90 || minAge > maxAge) {
    throw fail(400, 'Age range must be between 18 and 90');
  }
  const religion = text(input.religion, 'Religion preference', { required: false, max: 40 });
  const city = text(input.city, 'City preference', { required: false, max: 60 });
  run(
    `INSERT INTO preferences (user_id, looking_for_gender, min_age, max_age, religion, city)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       looking_for_gender = excluded.looking_for_gender,
       min_age = excluded.min_age,
       max_age = excluded.max_age,
       religion = excluded.religion,
       city = excluded.city`,
    userId, looking, minAge, maxAge, religion, city,
  );
  return getMe(userId);
}

export function savePhoto(userId, filename) {
  if (!profileRow(userId)) throw fail(409, 'Create your profile first', 'PROFILE_REQUIRED');
  const previous = one('SELECT photo_path FROM profiles WHERE user_id = ?', userId);
  run('UPDATE profiles SET photo_path = ?, updated_at = ? WHERE user_id = ?', filename, nowIso(), userId);
  if (previous?.photo_path && previous.photo_path !== filename) {
    const oldPath = path.join(uploadDir(), path.basename(previous.photo_path));
    fs.promises.unlink(oldPath).catch(() => {});
  }
  return getMe(userId);
}

export function completeDemoKyc(userId, body = {}) {
  const user = requireUser(userId);
  assertNoGovernmentId(body, { rejectTwelveDigits: true });
  if (!user.email_verified) throw fail(403, 'Verify your email before identity verification', 'EMAIL_UNVERIFIED');
  if (user.kyc_status === 'verified') return getMe(userId);
  const reference = `KYC-${randomBytes(4).toString('hex').toUpperCase()}`;
  run(
    `UPDATE users SET kyc_status = 'verified', kyc_provider = 'demo', kyc_reference = ? WHERE id = ?`,
    reference,
    userId,
  );
  return getMe(userId);
}

function preferenceOf(userId) {
  const preferences = one('SELECT * FROM preferences WHERE user_id = ?', userId);
  if (!preferences) throw fail(409, 'Finish your profile to browse', 'PROFILE_REQUIRED');
  return preferences;
}

function scoreCandidate(viewer, candidate, plan) {
  let score = 45;
  const reasons = [];
  if (viewer.city && candidate.city.toLowerCase() === viewer.city.toLowerCase()) {
    score += 22;
    reasons.push('Same city');
  }
  if (viewer.religion && candidate.religion && viewer.religion.toLowerCase() === candidate.religion.toLowerCase()) {
    score += 14;
    reasons.push('Same religion');
  }
  if (viewer.mother_tongue && candidate.mother_tongue && viewer.mother_tongue.toLowerCase() === candidate.mother_tongue.toLowerCase()) {
    score += 10;
    reasons.push('Same mother tongue');
  }
  if (viewer.education && candidate.education && viewer.education.toLowerCase() === candidate.education.toLowerCase()) {
    score += 8;
    reasons.push('Similar education');
  }
  const age = ageFromDob(candidate.date_of_birth);
  const midpoint = (viewer.min_age + viewer.max_age) / 2;
  score += Math.max(0, 12 - Math.abs(age - midpoint));
  if (plan === 'premium_plus') {
    score += 18;
    reasons.push('Featured profile');
  }
  return { score: Math.min(99, Math.round(score)), reasons };
}

export function discover(userId, query = {}) {
  const viewerProfile = profileRow(userId);
  if (!viewerProfile) throw fail(409, 'Finish your profile to browse', 'PROFILE_REQUIRED');
  const saved = preferenceOf(userId);
  const looking = query.gender || saved.looking_for_gender;
  if (!LOOKING_FOR.has(looking)) throw fail(400, 'That filter is not supported');
  const minAge = query.minAge ? Number(query.minAge) : saved.min_age;
  const maxAge = query.maxAge ? Number(query.maxAge) : saved.max_age;
  if (!Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge > maxAge) {
    throw fail(400, 'Age filter is invalid');
  }
  const religion = query.religion === undefined ? saved.religion : (query.religion || null);
  const city = query.city === undefined ? saved.city : (query.city || null);

  const rows = many(
    `SELECT p.*, u.kyc_status,
        (SELECT s.plan FROM subscriptions s
         WHERE s.user_id = p.user_id AND s.status = 'active' AND s.current_period_end > ?
         ORDER BY s.created_at DESC LIMIT 1) AS plan
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id != ?
       AND u.email_verified = 1
       AND (? = 'any' OR p.gender = ?)
       AND (? IS NULL OR lower(p.religion) = lower(?))
       AND (? IS NULL OR lower(p.city) = lower(?))
       AND p.user_id NOT IN (SELECT passed_user_id FROM passes WHERE user_id = ?)
       AND p.user_id NOT IN (
         SELECT to_user_id FROM interests WHERE from_user_id = ?
         UNION
         SELECT from_user_id FROM interests WHERE to_user_id = ?
       )`,
    nowIso(),
    userId,
    looking, looking,
    religion, religion,
    city, city,
    userId,
    userId,
    userId,
  );

  const viewer = { ...viewerProfile, min_age: minAge, max_age: maxAge };
  const results = rows
    .filter((row) => {
      const age = ageFromDob(row.date_of_birth);
      return age >= minAge && age <= maxAge;
    })
    .map((row) => {
      const ranked = scoreCandidate(viewer, row, row.plan);
      return publicProfile(row, ranked);
    })
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

  return { results, subscription: presentSubscription(userId) };
}

export function getPublicProfile(viewerId, profileId) {
  if (!profileRow(viewerId)) throw fail(409, 'Finish your profile to browse', 'PROFILE_REQUIRED');
  const row = one(
    `SELECT p.*, u.kyc_status,
        (SELECT s.plan FROM subscriptions s
         WHERE s.user_id = p.user_id AND s.status = 'active' AND s.current_period_end > ?
         ORDER BY s.created_at DESC LIMIT 1) AS plan
     FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ?`,
    nowIso(),
    profileId,
  );
  if (!row) throw fail(404, 'Profile not found');
  const saved = preferenceOf(viewerId);
  const viewer = { ...profileRow(viewerId), min_age: saved.min_age, max_age: saved.max_age };
  const ranked = scoreCandidate(viewer, row, row.plan);
  return publicProfile(row, ranked);
}

export function passOn(userId, otherUserId) {
  if (!profileRow(userId)) throw fail(409, 'Finish your profile to browse', 'PROFILE_REQUIRED');
  if (!otherUserId) throw fail(400, 'Choose a profile');
  if (userId === otherUserId) throw fail(400, 'You cannot pass on your own profile');
  if (!one('SELECT user_id FROM profiles WHERE user_id = ?', otherUserId)) throw fail(404, 'Profile not found');
  run(
    `INSERT INTO passes (user_id, passed_user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, passed_user_id) DO NOTHING`,
    userId,
    otherUserId,
    nowIso(),
  );
  return { ok: true };
}

function assertCanApproach(user) {
  if (!user.email_verified) throw fail(403, 'Verify your email before sending interest', 'EMAIL_UNVERIFIED');
  if (user.kyc_status !== 'verified') {
    throw fail(403, 'Verify your identity before sending interest', 'KYC_REQUIRED');
  }
}

export function sendInterest(userId, toUserId) {
  const user = requireUser(userId);
  if (!profileRow(userId)) throw fail(409, 'Finish your profile first', 'PROFILE_REQUIRED');
  if (!one('SELECT user_id FROM profiles WHERE user_id = ?', toUserId)) throw fail(404, 'Profile not found');
  if (userId === toUserId) throw fail(400, 'You cannot send interest to yourself');
  assertCanApproach(user);

  const existing = one('SELECT * FROM interests WHERE from_user_id = ? AND to_user_id = ?', userId, toUserId);
  if (existing) throw fail(409, 'You already sent interest to this person');

  const reverse = one('SELECT * FROM interests WHERE from_user_id = ? AND to_user_id = ?', toUserId, userId);
  if (reverse?.status === 'pending') {
    run(`UPDATE interests SET status = 'accepted' WHERE id = ?`, reverse.id);
    return { matched: true, interestId: reverse.id };
  }
  if (reverse?.status === 'accepted') return { matched: true, interestId: reverse.id };

  if (planFor(userId) === 'free' && interestsSent(userId) >= FREE_INTEREST_LIMIT) {
    throw fail(402, `A free account can send ${FREE_INTEREST_LIMIT} interests. Upgrade to send more.`, 'PAYMENT_REQUIRED');
  }
  const id = randomUUID();
  run(
    `INSERT INTO interests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
    id, userId, toUserId, nowIso(),
  );
  return { matched: false, interestId: id };
}

function interestView(row, otherId) {
  const profile = profileRow(otherId);
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    profile: profile ? publicProfile(profile) : null,
  };
}

export function listInterests(userId) {
  const received = many(
    `SELECT * FROM interests WHERE to_user_id = ? ORDER BY created_at DESC`,
    userId,
  ).map((row) => interestView(row, row.from_user_id));
  const sent = many(
    `SELECT * FROM interests WHERE from_user_id = ? ORDER BY created_at DESC`,
    userId,
  ).map((row) => interestView(row, row.to_user_id));
  return { received, sent };
}

export function respondToInterest(userId, interestId, action) {
  const interest = one('SELECT * FROM interests WHERE id = ?', interestId);
  if (!interest) throw fail(404, 'Interest not found');
  if (interest.to_user_id !== userId) throw fail(403, 'Only the recipient can respond');
  if (interest.status !== 'pending') throw fail(409, 'This interest was already answered');
  if (action === 'decline') {
    run(`UPDATE interests SET status = 'declined' WHERE id = ?`, interest.id);
    return { matched: false, status: 'declined' };
  }
  if (action !== 'accept') throw fail(400, 'Respond with accept or decline');
  const user = requireUser(userId);
  assertCanApproach(user);
  run(`UPDATE interests SET status = 'accepted' WHERE id = ?`, interest.id);
  return { matched: true, status: 'accepted' };
}

function matchedInterest(userId, otherUserId) {
  return one(
    `SELECT * FROM interests
     WHERE status = 'accepted'
       AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`,
    userId, otherUserId, otherUserId, userId,
  );
}

function matchKey(a, b) {
  return [a, b].sort().join(':');
}

export function listMatches(userId) {
  const rows = many(
    `SELECT * FROM interests
     WHERE status = 'accepted' AND (from_user_id = ? OR to_user_id = ?)
     ORDER BY created_at DESC`,
    userId, userId,
  );
  return rows.map((row) => {
    const otherId = row.from_user_id === userId ? row.to_user_id : row.from_user_id;
    const key = matchKey(userId, otherId);
    const last = one(
      `SELECT body, created_at, sender_id FROM messages WHERE match_key = ? ORDER BY created_at DESC LIMIT 1`,
      key,
    );
    return {
      userId: otherId,
      matchedAt: row.created_at,
      profile: publicProfile(profileRow(otherId)),
      lastMessage: last ? { body: last.body, createdAt: last.created_at, mine: last.sender_id === userId } : null,
    };
  });
}

export function listMessages(userId, otherUserId) {
  if (!matchedInterest(userId, otherUserId)) throw fail(403, 'You can message someone after they accept', 'NOT_MATCHED');
  return {
    profile: publicProfile(profileRow(otherUserId)),
    messages: many(
      `SELECT id, sender_id, body, created_at FROM messages WHERE match_key = ? ORDER BY created_at ASC`,
      matchKey(userId, otherUserId),
    ).map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      mine: row.sender_id === userId,
    })),
    canSend: planFor(userId) !== 'free',
  };
}

export function sendMessage(userId, otherUserId, body) {
  if (!matchedInterest(userId, otherUserId)) throw fail(403, 'You can message someone after they accept', 'NOT_MATCHED');
  if (planFor(userId) === 'free') {
    throw fail(402, 'Premium lets you write after a match.', 'PAYMENT_REQUIRED');
  }
  const textBody = String(body || '').trim();
  if (!textBody || textBody.length > 2000) throw fail(400, 'Write a message under 2000 characters');
  const id = randomUUID();
  run(
    `INSERT INTO messages (id, match_key, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`,
    id, matchKey(userId, otherUserId), userId, textBody, nowIso(),
  );
  return { id, body: textBody, createdAt: nowIso(), mine: true };
}

export function revealContact(userId, otherUserId) {
  if (!matchedInterest(userId, otherUserId)) throw fail(403, 'Contact details open after a match', 'NOT_MATCHED');
  if (planFor(userId) === 'free') {
    throw fail(402, 'Premium shows contact details after a match.', 'PAYMENT_REQUIRED');
  }
  const other = requireUser(otherUserId);
  const profile = profileRow(otherUserId);
  return {
    displayName: profile.display_name,
    email: other.email,
    phone: profile.phone,
  };
}

export function listPlans() {
  return Object.values(PLANS);
}

function activateSubscription(userId, planId, provider, providerRef) {
  const plan = PLANS[planId];
  if (!plan) throw fail(400, 'Choose a plan');
  if (providerRef) {
    const existing = one('SELECT * FROM subscriptions WHERE provider = ? AND provider_ref = ?', provider, providerRef);
    if (existing) return existing;
  }
  const end = new Date(Date.now() + plan.periodDays * 24 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();
  transaction(() => {
    run(`UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'`, userId);
    run(
      `INSERT INTO subscriptions (id, user_id, plan, status, provider, provider_ref, current_period_end, created_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
      id, userId, planId, provider, providerRef, end, nowIso(),
    );
  });
  return one('SELECT * FROM subscriptions WHERE id = ?', id);
}

function demoBillingAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_BILLING === 'true';
}

export async function startCheckout(userId, planId) {
  requireUser(userId);
  const plan = PLANS[planId];
  if (!plan) throw fail(400, 'Choose a plan');
  const user = requireUser(userId);
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    if (!demoBillingAllowed()) throw fail(503, 'Payments are not configured yet');
    activateSubscription(userId, planId, 'demo', `demo:${userId}:${planId}`);
    return { mode: 'demo', subscription: presentSubscription(userId) };
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: plan.amountPaise,
      currency: 'INR',
      description: `Milap ${plan.name} for 30 days`,
      customer: { email: user.email },
      notify: { email: false, sms: false },
      reminder_enable: false,
      notes: { userId: String(userId), plan: plan.id },
      callback_url: process.env.PUBLIC_APP_URL || 'http://localhost:5173/account',
      callback_method: 'get',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(502, 'The payment provider rejected the checkout');
  return { mode: 'razorpay', url: payload.short_url, subscription: presentSubscription(userId) };
}

export function applyPaymentEvent(event) {
  const name = event?.event;
  const allowed = new Set(['payment.captured', 'payment_link.paid', 'subscription.charged']);
  if (!allowed.has(name)) return { ignored: true };
  const entity = event.payload?.payment?.entity
    || event.payload?.payment_link?.entity
    || event.payload?.subscription?.entity
    || {};
  const notes = entity.notes || {};
  const userId = notes.userId || notes.user_id;
  const plan = notes.plan;
  const providerRef = entity.id;
  if (!userId || !plan || !providerRef) return { ignored: true };
  if (!one('SELECT id FROM users WHERE id = ?', userId)) return { ignored: true };
  activateSubscription(userId, plan, 'razorpay', providerRef);
  return { ok: true };
}
