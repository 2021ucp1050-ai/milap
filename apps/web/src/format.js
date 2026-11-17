export const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Parsi', 'Other', 'Prefer not to say'];
export const EDUCATIONS = ['High school', 'Diploma', "Bachelor's", "Master's", 'Doctorate', 'Professional'];
export const MARITAL = [
  ['never_married', 'Never married'],
  ['divorced', 'Divorced'],
  ['widowed', 'Widowed'],
  ['separated', 'Separated'],
];
export const GENDERS = [
  ['woman', 'Woman'],
  ['man', 'Man'],
  ['nonbinary', 'Non-binary'],
];

export function labelMarital(value) {
  return MARITAL.find(([key]) => key === value)?.[1] || value;
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

const COLORS = ['#7a2430', '#8c6840', '#1d4e46', '#3d3a66', '#6b3d2c'];

export function colorFor(name = '') {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function rupees(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}
