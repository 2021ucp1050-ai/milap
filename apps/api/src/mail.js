export async function sendOtpEmail(email, code) {
  if (!process.env.SMTP_HOST) return { delivered: false };
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'Milap <no-reply@localhost>',
    to: email,
    subject: 'Your Milap verification code',
    text: `Your Milap verification code is ${code}. It expires in 10 minutes.`,
  });
  return { delivered: true };
}

export function devOtpAllowed() {
  if (process.env.ALLOW_DEV_OTP === 'true') return true;
  if (process.env.ALLOW_DEV_OTP === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}
