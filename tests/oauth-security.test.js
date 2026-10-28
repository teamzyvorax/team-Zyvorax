import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { verifyOAuthState, verifiedGitHubEmail } from '../server/oauth-security.js';

const secret = 'test-only-secret-that-is-long-enough';
const state = jwt.sign({ provider: 'google', nonce: 'random-nonce' }, secret, { expiresIn: '10m' });

test('accepts matching signed OAuth state for the expected provider', () => {
  assert.equal(verifyOAuthState(state, state, 'google', secret).provider, 'google');
});
test('rejects missing or mismatched callback state', () => {
  assert.throws(() => verifyOAuthState(state, '', 'google', secret), /Invalid OAuth state/);
  assert.throws(() => verifyOAuthState(state, 'attacker-state', 'google', secret), /Invalid OAuth state/);
});
test('rejects state signed for another provider', () => {
  assert.throws(() => verifyOAuthState(state, state, 'github', secret), /Invalid OAuth state/);
});
test('rejects expired or invalid tokens', () => {
  const expired = jwt.sign({ provider: 'google' }, secret, { expiresIn: -1 });
  assert.throws(() => verifyOAuthState(expired, expired, 'google', secret));
});

test('selects only verified GitHub email addresses', () => {
  assert.equal(verifiedGitHubEmail([{email:'unverified@example.com',primary:true,verified:false}]), '');
  assert.equal(verifiedGitHubEmail([{email:'secondary@example.com',verified:true},{email:'primary@example.com',primary:true,verified:true}]), 'primary@example.com');
});
