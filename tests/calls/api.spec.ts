import { test, expect } from './fixtures';

test('call creation and listing preserve creator and audio-only type', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  const response = await host.context.request.post('/api/group-calls', {
    data: { groupId, callType: 'audio', title: 'Audio regression' },
  });
  expect(response.status()).toBe(201);
  const { call } = await response.json();
  expect(call).toMatchObject({ callType: 'audio', creator: { id: host.id, name: host.name }, participantCount: 0 });
  const list = await guest.context.request.get(`/api/group-calls?groupId=${groupId}&active=true`);
  expect((await list.json()).calls).toEqual([expect.objectContaining({ id: call.id, callType: 'audio', creator: { id: host.id, name: host.name, avatar: null } })]);
});

test('only authenticated group members can access a call; only participants can signal or chat', async ({ actors, request }) => {
  const { host, guest, outsider, groupId } = actors;
  expect((await request.get(`/api/group-calls?groupId=${groupId}`)).status()).toBe(401);
  expect((await outsider.context.request.post('/api/group-calls', { data: { groupId } })).status()).toBe(403);
  const { call } = await (await host.context.request.post('/api/group-calls', { data: { groupId } })).json();
  const participantURL = `/api/group-calls/participants?callId=${call.id}`;
  for (const endpoint of [participantURL, `/api/group-calls/signal?callId=${call.id}`, `/api/group-calls/chat?callId=${call.id}`]) {
    expect((await request.get(endpoint)).status()).toBe(401);
    expect((await outsider.context.request.get(endpoint)).status()).toBe(403);
  }
  expect((await outsider.context.request.post(participantURL)).status()).toBe(403);
  expect((await guest.context.request.get(`/api/group-calls/signal?callId=${call.id}`)).status()).toBe(403);
  expect((await guest.context.request.get(`/api/group-calls/chat?callId=${call.id}`)).status()).toBe(403);
  expect((await guest.context.request.post('/api/group-calls/signal', { data: { callId: call.id, kind: 'join', payload: '' } })).status()).toBe(403);
  expect((await guest.context.request.post('/api/group-calls/chat', { data: { callId: call.id, body: 'Not joined' } })).status()).toBe(403);
  expect((await guest.context.request.patch(participantURL, { data: {} })).status()).toBe(403);
  expect((await guest.context.request.post(participantURL)).status()).toBe(200);
  expect((await guest.context.request.post('/api/group-calls/chat', { data: { callId: call.id, body: 'Now joined' } })).status()).toBe(201);
  expect((await guest.context.request.post('/api/group-calls/signal', { data: { callId: call.id, kind: 'join', payload: '' } })).status()).toBe(201);
  expect((await guest.context.request.delete(`/api/group-calls?callId=${call.id}`)).status()).toBe(403);
});

test('ending a call returns 410 on every live endpoint and rejects late joins', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  const { call } = await (await host.context.request.post('/api/group-calls', { data: { groupId } })).json();
  const participants = `/api/group-calls/participants?callId=${call.id}`;
  await guest.context.request.post(participants);
  expect((await host.context.request.delete(`/api/group-calls?callId=${call.id}`)).status()).toBe(200);
  for (const endpoint of [participants, `/api/group-calls/signal?callId=${call.id}`, `/api/group-calls/chat?callId=${call.id}`]) {
    expect((await guest.context.request.get(endpoint)).status()).toBe(410);
  }
  expect((await guest.context.request.post(participants)).status()).toBe(410);
  expect((await guest.context.request.patch(participants, { data: {} })).status()).toBe(410);
  expect((await guest.context.request.post('/api/group-calls/signal', { data: { callId: call.id, kind: 'join', payload: '' } })).status()).toBe(410);
  expect((await guest.context.request.post('/api/group-calls/chat', { data: { callId: call.id, body: 'Late message' } })).status()).toBe(410);
});

test('rejoin resets media state and does not replay old negotiation messages', async ({ actors }) => {
  const { host, guest, groupId } = actors;
  const { call } = await (await host.context.request.post('/api/group-calls', { data: { groupId } })).json();
  const participants = `/api/group-calls/participants?callId=${call.id}`;
  await host.context.request.post(participants);
  await guest.context.request.post(participants);
  await guest.context.request.patch(participants, { data: { isMuted: true, isCameraOff: true, isSharing: true, handRaised: true } });
  const oldSignal = await host.context.request.post('/api/group-calls/signal', {
    data: { callId: call.id, toId: guest.id, kind: 'ice', payload: JSON.stringify({ candidate: 'candidate:old', sdpMid: '0', sdpMLineIndex: 0 }) },
  });
  expect(oldSignal.status()).toBe(201);
  const rejoin = await guest.context.request.post(participants);
  const data = await rejoin.json();
  expect(data.lastSignalId).toBeGreaterThanOrEqual((await oldSignal.json()).id);
  expect(data.participants.find((participant: { userId: number }) => participant.userId === guest.id)).toMatchObject({
    isMuted: false, isCameraOff: false, isSharing: false, handRaisedAt: null,
  });
  const signals = await guest.context.request.get(`/api/group-calls/signal?callId=${call.id}`);
  expect((await signals.json()).signals).toEqual([]);
  expect((await guest.context.request.post(`${participants}&beacon=leave`)).status()).toBe(200);
  const remaining = await (await host.context.request.get(participants)).json();
  expect(remaining.participants.map((participant: { userId: number }) => participant.userId)).toEqual([host.id]);
});

test('malformed bodies and invalid destinations return 400, not a crash or broadcast', async ({ actors }) => {
  const { host, groupId } = actors;
  for (const endpoint of ['/api/group-calls', '/api/group-calls/signal', '/api/group-calls/chat']) {
    for (const body of ['null', '[]', 'true']) {
      const response = await host.context.request.post(endpoint, { data: body, headers: { 'Content-Type': 'application/json' } });
      expect(response.status(), `${endpoint}: ${body}`).toBe(400);
    }
  }
  const { call } = await (await host.context.request.post('/api/group-calls', { data: { groupId } })).json();
  await host.context.request.post(`/api/group-calls/participants?callId=${call.id}`);
  const signal = { callId: call.id, kind: 'ice', payload: JSON.stringify({ candidate: 'candidate:test', sdpMid: '0' }) };
  for (const toId of ['invalid', true, -1, 1.5, null]) {
    expect((await host.context.request.post('/api/group-calls/signal', { data: { ...signal, toId } })).status()).toBe(400);
  }
});
