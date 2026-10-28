import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStarterFiles, localAssistantReply, safeAppName } from '../server/platform-core.js';
test('slug is URL-safe and bounded',()=>{assert.equal(safeAppName('My App! 2026'),'my-app-2026');assert.equal(safeAppName('!!!'),'zyvora-app');assert.match(safeAppName('x'.repeat(80)),/^[a-z0-9-]{1,48}$/)});
test('starter files escape prompt and provide README',()=>{const f=buildStarterFiles({name:'<script>x</script>',prompt:'Page <img src=x onerror=alert(1)>',template:'landing'});assert.ok(f['index.html'].startsWith('<!doctype html>'));assert.ok(f['index.html'].includes('&lt;script&gt;'));assert.ok(!f['index.html'].includes('<img src=x'));assert.ok(f['README.md'].startsWith('# <script>'))});
test('templates default safely',()=>{assert.match(buildStarterFiles({name:'Docs',prompt:'Create docs',template:'docs'})['index.html'],/DOCUMENTATION/);assert.match(buildStarterFiles({name:'X',prompt:'Create site',template:'bad'})['index.html'],/A NEW DIGITAL EXPERIENCE/)});
test('local assistant gives honest deployment steps',()=>{const r=localAssistantReply('How do I deploy?');assert.match(r,/VERCEL_TOKEN/);assert.match(r,/verify/i);assert.doesNotMatch(r,/successfully deployed/i)});
