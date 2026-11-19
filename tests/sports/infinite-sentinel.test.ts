import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';

/**
 * The end-of-list marker where the browser cannot observe scrolling.
 *
 * jsdom has no IntersectionObserver, and this file installs no stand-in, so the
 * marker is in exactly that position here. (`feed-tabs.test.ts` and
 * `highlights-page.test.ts` cover the scrolling path with a stand-in.) Without
 * a way to notice the reader arriving, the rest of the list must still be
 * reachable, so the marker becomes a plain button.
 */

async function mountSentinel(props: Record<string, unknown>) {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const InfiniteSentinel = (await import('../../src/components/InfiniteSentinel')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: Record<string, unknown>) => act(async () => {
    root.render(React.createElement(InfiniteSentinel as never, next as never, React.createElement('p', null, 'Loading more…')));
  });
  await render(props);
  return {
    container,
    render,
    button: () => container.querySelector('button') as any,
    click: (element: any) => act(async () => { element.click(); }),
    unmount: async () => { await act(() => root.unmount()); container.remove(); await mounted.unmount(); },
  };
}

test('with no IntersectionObserver the marker is a button that asks for more', async () => {
  assert.equal(typeof (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver, 'undefined');
  let asked = 0;
  const view = await mountSentinel({ watch: 24, onReach: () => { asked += 1; }, fallbackLabel: 'Show 4 more' });
  try {
    const button = view.button();
    assert.ok(button, 'a plain control stands in for the scroll');
    assert.equal(button.textContent.trim(), 'Show 4 more');
    assert.equal(button.getAttribute('type'), 'button');
    assert.ok(!view.container.textContent!.includes('Loading more'), 'it does not claim to be loading on its own');
    await view.click(button);
    await view.click(button);
    assert.equal(asked, 2, 'each press asks once');
  } finally {
    await view.unmount();
  }
});

test('the button is disabled while the caller has paused loading', async () => {
  let asked = 0;
  const props = { watch: 24, onReach: () => { asked += 1; }, fallbackLabel: 'Show more clips' };
  const view = await mountSentinel({ ...props, enabled: false });
  try {
    assert.equal(view.button().disabled, true);
    await view.click(view.button());
    assert.equal(asked, 0, 'a request in flight is not doubled');
    await view.render({ ...props, enabled: true });
    assert.equal(view.button().disabled, false);
    await view.click(view.button());
    assert.equal(asked, 1);
  } finally {
    await view.unmount();
  }
});
