import jwt from 'jsonwebtoken';

// OAuth state must match the browser cookie and callback query parameter.
export function verifyOAuthState(cookieState, queryState, provider, secret) {
  if (!cookieState || !queryState || cookieState !== queryState || !secret) throw new Error('Invalid OAuth state');
  const payload = jwt.verify(cookieState, secret);
  if (payload.provider !== provider) throw new Error('Invalid OAuth state');
  return payload;
}

// Never trust the public profile email; select only an explicitly verified email from GitHub's email API.
export function verifiedGitHubEmail(emails) {
  if (!Array.isArray(emails)) return '';
  return emails.find(item => item?.primary === true && item?.verified === true)?.email
    || emails.find(item => item?.verified === true)?.email
    || '';
}
