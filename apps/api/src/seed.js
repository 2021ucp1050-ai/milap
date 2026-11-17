import { randomUUID } from 'node:crypto';
import { hashPassword } from './crypto.js';
import { one, run, transaction } from './db.js';

const PASSWORD = 'password123';

const PEOPLE = [
  ['ananya@milap.dev', 'Ananya Sharma', 'woman', '1998-03-14', 163, 'Bengaluru', 'Karnataka', 'Hindu', 'Kannada', "Master's", 'Software engineer', 'I like Cubbon Park, filter coffee, and someone who is kind to their parents.'],
  ['meera@milap.dev', 'Meera Iyer', 'woman', '1999-11-02', 160, 'Chennai', 'Tamil Nadu', 'Hindu', 'Tamil', "Bachelor's", 'Product designer', 'I design for a living and cook when I am avoiding a deadline.'],
  ['fatima@milap.dev', 'Fatima Khan', 'woman', '2000-01-20', 158, 'Hyderabad', 'Telangana', 'Muslim', 'Urdu', 'Professional', 'Doctor', 'Resident doctor. I want a partner who understands odd hours.'],
  ['gurleen@milap.dev', 'Gurleen Kaur', 'woman', '1996-07-09', 168, 'Chandigarh', 'Chandigarh', 'Sikh', 'Punjabi', "Bachelor's", 'Architect', 'I care about buildings, Sunday langar, and a calm home.'],
  ['rhea@milap.dev', 'Rhea D Souza', 'woman', '1997-05-18', 165, 'Mumbai', 'Maharashtra', 'Christian', 'English', "Master's", 'Journalist', 'I report on cities. I am looking for curiosity more than a checklist.'],
  ['arjun@milap.dev', 'Arjun Mehta', 'man', '1996-04-12', 178, 'Pune', 'Maharashtra', 'Hindu', 'Hindi', "Master's", 'Product manager', 'I read too much, run sometimes, and want a partnership that is a team.'],
  ['kabir@milap.dev', 'Kabir Ahmed', 'man', '1994-09-30', 175, 'Delhi', 'Delhi', 'Muslim', 'Urdu', 'Professional', 'Lawyer', 'Court days are long. Evenings are for food and an actual conversation.'],
  ['rohan@milap.dev', 'Rohan Pereira', 'man', '1998-12-01', 180, 'Goa', 'Goa', 'Christian', 'Konkani', "Bachelor's", 'Chef', 'I cook for a restaurant and for people I like. Mumbai is fine, Goa is home.'],
  ['vikram@milap.dev', 'Vikram Singh', 'man', '1993-02-22', 182, 'Jaipur', 'Rajasthan', 'Hindu', 'Hindi', "Master's", 'Civil servant', 'Posted in Jaipur. Family matters to me, and so does having a life outside work.'],
  ['aditya@milap.dev', 'Aditya Nair', 'man', '1999-08-08', 172, 'Kochi', 'Kerala', 'Hindu', 'Malayalam', "Master's", 'Data scientist', 'I like the rain, old films, and someone who will tell me when I am wrong.'],
  ['neel@milap.dev', 'Neel Banerjee', 'man', '1997-06-15', 176, 'Kolkata', 'West Bengal', 'Hindu', 'Bengali', "Master's", 'Economist', 'Adda, football, and a person who has their own ambitions.'],
];

export async function seed() {
  if (one('SELECT id FROM users WHERE email = ?', 'ananya@milap.dev')) return;
  const passwordHash = await hashPassword(PASSWORD);
  const created = new Date().toISOString();
  transaction(() => {
    for (const person of PEOPLE) {
      const [email, name, gender, dob, height, city, state, religion, tongue, education, profession, about] = person;
      const id = randomUUID();
      run(
        `INSERT INTO users (id, email, password_hash, email_verified, kyc_status, kyc_provider, kyc_reference, created_at)
         VALUES (?, ?, ?, 1, 'verified', 'seed', ?, ?)`,
        id, email, passwordHash, `SEED-${name.split(' ')[0].toUpperCase()}`, created,
      );
      run(
        `INSERT INTO profiles (
          user_id, display_name, gender, date_of_birth, height_cm, city, state, religion,
          mother_tongue, education, profession, marital_status, about, phone, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'never_married', ?, ?, ?, ?)`,
        id, name, gender, dob, height, city, state, religion, tongue, education, profession, about,
        `98${String(Math.floor(10000000 + Math.random() * 89999999))}`, created, created,
      );
      const looking = gender === 'woman' ? 'man' : 'woman';
      run(
        `INSERT INTO preferences (user_id, looking_for_gender, min_age, max_age, religion, city)
         VALUES (?, ?, 24, 36, NULL, NULL)`,
        id, looking,
      );
      if (email === 'kabir@milap.dev') {
        const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        run(
          `INSERT INTO subscriptions (id, user_id, plan, status, provider, provider_ref, current_period_end, created_at)
           VALUES (?, ?, 'premium_plus', 'active', 'seed', ?, ?, ?)`,
          randomUUID(), id, `seed:${email}`, end, created,
        );
      }
    }
  });
}
