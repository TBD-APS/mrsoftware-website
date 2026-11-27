import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../commercial/server/application.mjs';
import { sendViaResend } from '../commercial/server/newsletter.mjs';
import { createCommercialHarness } from './helpers/commercial.mjs';

const base = '/api/backoffice/newsletter';
const envEnabled = { NEWSLETTER_SEND_ENABLED: 'true', NEWSLETTER_FROM_EMAIL: 'letters@example.test', NEWSLETTER_RESEND_API_KEY: 're_fixture' };
const draft = { subject: 'A safer route', language: 'en', body: 'A new test newsletter.\nDo not send without permission.' };
const optIn = (email = 'reader@example.test') => ({ email, consentAt: '2020-11-09', consentReference: 'Newsletter signup evidence 321', confirmed: true });

test('newsletter drafts, approval and export stay private and send fails closed', async t => {
  const app = await createCommercialHarness(t);
  assert.equal((await app.call('GET', base, undefined, { host: app.env.DEMO_HOST })).status, 404);
  assert.equal((await app.call('GET', base, undefined, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  assert.equal((await app.call('POST', base + '/campaigns', draft, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await app.call('POST', base + '/subscribers', { ...optIn(), confirmed: false })).status, 400);
  assert.equal((await app.call('POST', base + '/subscribers', { ...optIn(), consentAt: '2020-02-31' })).status, 400);
  assert.equal((await app.call('POST', base + '/subscribers', { ...optIn(), consentAt: '3026-02-01' })).status, 400);
  assert.equal((await app.call('POST', base + '/subscribers', optIn())).status, 201);
  assert.equal((await app.call('POST', base + '/subscribers', optIn('READER@example.test'))).status, 409);
  const created = (await app.call('POST', base + '/campaigns', draft)).body.item;
  const url = base + '/campaigns/' + created.id;
  assert.equal(created.status, 'draft');
  const approved = (await app.call('POST', url + '/approve', { revision: 1 })).body.item;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval.count, 1);
  assert.equal((await app.call('POST', url + '/send', { revision: 2, confirm: true })).status, 503);
  const exported = await app.request('GET', url + '/export');
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('Content-Disposition'), /^attachment/);
  const content = await exported.text();
  assert.match(content, /A safer route/);
  assert.doesNotMatch(content, /reader@example/);
  assert.equal((await app.call('PUT', url, { ...draft, revision: 1 })).status, 409);
  const edited = (await app.call('PUT', url, { ...draft, revision: 2, subject: 'Edited' })).body.item;
  assert.equal(edited.status, 'draft');
  assert.equal(edited.approval, null);
  const workspace = (await app.call('GET', base)).body;
  assert.equal(workspace.activeSubscribers, 1);
  assert.equal(workspace.sendingEnabled, false);
  assert.equal(Object.hasOwn(workspace.subscribers[0], 'token'), false);
});

test('approved send pins exact consented audience, prevents replay, and honours one-click suppression', async t => {
  const app = await createCommercialHarness(t);
  const env = { ...app.env, ...envEnabled };
  const requests = [];
  const service = createApplication({
    verifyIdentity: async () => ({ sub: 'fixture', email: 'william@example.test' }),
    newsletterSender: async (messages, options) => {
      requests.push({ messages, options });
      return messages.map((_, index) => 'fixture-' + index);
    },
  });
  const call = async (method, path, body, host = env.BACKOFFICE_HOST) => {
    const request = new Request('https://' + host + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { Origin: 'https://' + host, 'Content-Type': 'application/json', 'X-Requested-With': 'MRSoftware' } }) });
    const result = await service.fetch(request, env);
    return { status: result.status, body: await result.json() };
  };
  const add = async email => (await call('POST', base + '/subscribers', optIn(email))).body.subscriber;
  const suppressed = await add('suppress@example.test');
  const create = (await call('POST', base + '/campaigns', draft)).body.item;
  const route = base + '/campaigns/' + create.id;
  let approved = (await call('POST', route + '/approve', { revision: create.revision })).body.item;
  await call('POST', base + '/subscribers/' + suppressed.id + '/unsubscribe', {});
  await add('reader@example.test');
  assert.equal((await call('POST', route + '/send', { revision: approved.revision, confirm: true })).status, 409);
  const edited = (await call('PUT', route, { revision: approved.revision, ...draft })).body.item;
  approved = (await call('POST', route + '/approve', { revision: edited.revision })).body.item;
  assert.equal((await call('POST', route + '/send', { revision: approved.revision, confirm: false })).status, 409);
  const attempts = await Promise.all([1, 2].map(() => call('POST', route + '/send', { revision: approved.revision, confirm: true })));
  assert.deepEqual(attempts.map(item => item.status).sort(), [200, 409]);
  assert.equal(attempts.find(item => item.status === 200).body.item.status, 'accepted');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].messages.map(item => item.to), [['reader@example.test']]);
  const message = requests[0].messages[0];
  const link = message.headers['List-Unsubscribe'].slice(1, -1);
  assert.equal(message.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal(message.text.includes(link), true);
  assert.equal(link.includes('reader'), false);
  const landing = await service.fetch(new Request(link), env);
  assert.equal(landing.status, 200);
  assert.doesNotMatch(await landing.text(), /reader@example/);
  assert.equal((await call('GET', base)).body.activeSubscribers, 1);
  const wrongHost = new URL(link);
  wrongHost.host = env.BACKOFFICE_HOST;
  assert.equal((await service.fetch(new Request(wrongHost), env)).status, 404);
  const oneClick = () => service.fetch(new Request(link, { method: 'POST', body: new URLSearchParams({ 'List-Unsubscribe': 'One-Click' }) }), env);
  assert.equal((await oneClick()).status, 200);
  assert.equal((await oneClick()).status, 200);
  assert.equal((await call('GET', base)).body.activeSubscribers, 0);
  assert.equal((await call('POST', base + '/subscribers', optIn())).status, 409);
});

test('provider timeout becomes uncertain without exposing recipient or allowing automatic retry', async t => {
  const app = await createCommercialHarness(t);
  const env = { ...app.env, ...envEnabled };
  let attempts = 0;
  const service = createApplication({ verifyIdentity: async () => ({ sub: 'fixture', email: 'william@example.test' }), newsletterSender: async () => { attempts++; throw Error('PRIVATE reader@example.test token potentially accepted'); } });
  const post = async (route, body) => service.fetch(new Request('https://' + env.BACKOFFICE_HOST + route, { method: 'POST', headers: { Origin: 'https://' + env.BACKOFFICE_HOST, 'Content-Type': 'application/json', 'X-Requested-With': 'MRSoftware' }, body: JSON.stringify(body) }), env);
  await post(base + '/subscribers', optIn());
  const created = (await (await post(base + '/campaigns', draft)).json()).item;
  const url = base + '/campaigns/' + created.id;
  const approved = (await (await post(url + '/approve', { revision: created.revision })).json()).item;
  const result = await post(url + '/send', { revision: approved.revision, confirm: true });
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.match(text, /"status":"uncertain"/);
  assert.doesNotMatch(text, /PRIVATE|reader@example/);
  assert.equal((await post(url + '/send', { revision: JSON.parse(text).item.revision, confirm: true })).status, 409);
  assert.equal(attempts, 1);
});

test('Resend adapter uses fixed endpoint, opaque idempotency and no token in result', async () => {
  const actual = await sendViaResend([{ to: ['fixture@example.test'] }], { key: 're_fixture', id: 'campaign-uuid' }, async (url, request) => {
    assert.equal(url, 'https://api.resend.com/emails/batch');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers['Idempotency-Key'], 'mrsoftware-newsletter/campaign-uuid');
    assert.equal(request.headers.Authorization, 'Bearer re_fixture');
    return Response.json({ data: [{ id: 'provider-id' }] });
  });
  assert.deepEqual(actual, ['provider-id']);
  await assert.rejects(sendViaResend([{}], { key: 're_fixture', id: 'campaign-uuid' }, async () => Response.json({ data: [] })), /receipt is incomplete/);
});
