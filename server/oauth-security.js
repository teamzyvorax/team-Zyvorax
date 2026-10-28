import jwt from 'jsonwebtoken';

// OAuth state must match the browser cookie and the callback query parameter.
// The signed token binds the flow to the expected provider and expires quickly.
export function verifyOAuthState(cookieState, queryState, provider, secret) {
  if (!cookieState || !queryState || cookieState !== queryState || !secret) {
    throw new Error('Invalid OAuth state');
  }
  const payload = jwt.verify(cookieState, secret);
  if (payload.provider !== provider) throw new Error('Invalid OAuth state');
  return payload;
}
