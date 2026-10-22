/** Optional, operator-supplied public contact; never invent a working inbox. */
export function getPrivacyContact(): string | null {
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return email && email.length <= 254 && /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) ? email : null;
}
