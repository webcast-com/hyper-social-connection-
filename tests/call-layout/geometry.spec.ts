import { expect, test } from '@playwright/test';
import { FOCUS_CONTROLS_SIDE_WIDTH, getFocusedParticipantLayout, CARD_ASPECT_RATIO, CARD_FOOTER_HEIGHT, CARD_GAP, GALLERY_PAGER_HEIGHT, GALLERY_SIDE_PAGER_WIDTH, getParticipantLayout } from '../../src/lib/call-layout';

test('the best-fit geometry stays finite and inside the container across boundary sizes and counts', () => {
  for (const width of [0, 1, 80, 144, 317, 343, 776, 1118, 1920]) {
    for (const height of [0, 1, 36, 52, 100, 174, 270, 543, 1080]) {
      for (const count of [0, 1, 2, 3, 4, 6, 9, 10, 12, 50]) {
        const layout = getParticipantLayout(count, width, height);
        for (const value of [layout.columns, layout.cardWidth, layout.cardHeight, layout.pageSize, layout.pageCount]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }
        expect(layout.pageSize).toBeGreaterThanOrEqual(1);
        expect(layout.pageSize).toBeLessThanOrEqual(9);
        expect(layout.pageCount).toBeGreaterThanOrEqual(1);
        expect(layout.columns).toBeGreaterThanOrEqual(1);
        expect(layout.columns).toBeLessThanOrEqual(4);
        expect(layout.pageCount * layout.pageSize).toBeGreaterThanOrEqual(count);
        const visible = Math.min(count, layout.pageSize);
        const columns = Math.min(visible, layout.columns);
        const rows = Math.ceil(visible / layout.columns);
        expect(columns * layout.cardWidth + Math.max(0, columns - 1) * CARD_GAP).toBeLessThanOrEqual(Math.max(0, width - (layout.pageCount > 1 && layout.pager === 'side' ? GALLERY_SIDE_PAGER_WIDTH : 0)));
        expect(rows * layout.cardHeight + Math.max(0, rows - 1) * CARD_GAP).toBeLessThanOrEqual(Math.max(0, height - (layout.pageCount > 1 && layout.pager === 'bottom' ? GALLERY_PAGER_HEIGHT : 0)));
        if (layout.cardWidth > 0) expect(Math.abs(layout.cardWidth - (layout.cardHeight - CARD_FOOTER_HEIGHT) * CARD_ASPECT_RATIO)).toBeLessThan(2);
      }
    }
  }
});

test('invalid and fractional measurements normalize without invalid CSS values', () => {
  for (const input of [NaN, Infinity, -Infinity, -20]) {
    expect(getParticipantLayout(input, 500, 300)).toEqual(getParticipantLayout(0, 500, 300));
    expect(getParticipantLayout(6, input, 300)).toEqual(getParticipantLayout(6, 0, 300));
    expect(getParticipantLayout(6, 500, input)).toEqual(getParticipantLayout(6, 500, 0));
  }
  expect(getParticipantLayout(3.9, 500.9, 300.9)).toEqual(getParticipantLayout(3, 500, 300));
});

test('common desktop rooms fit in one page, while short landscapes reserve room for paging', () => {
  for (const count of [1, 2, 3, 4, 6]) {
    const desktop = getParticipantLayout(count, 1118, 543);
    expect(desktop.pageSize).toBe(count);
    expect(desktop.pageCount).toBe(1);
    expect(desktop.cardWidth).toBeGreaterThanOrEqual(300);
    expect(desktop.cardHeight).toBeLessThanOrEqual(543);
  }
  const landscape = getParticipantLayout(6, 776, 174);
  expect(landscape.pageCount).toBeGreaterThan(1);
  expect(landscape.cardWidth).toBeGreaterThanOrEqual(144);
  expect(landscape.pager).toBe('side');
  expect(landscape.cardHeight).toBeLessThanOrEqual(174);
  const tinyLandscape = getParticipantLayout(3, 540, 113);
  expect(tinyLandscape.pageCount).toBe(1);
  expect(tinyLandscape.cardWidth).toBeGreaterThanOrEqual(128);
  const tinyGroup = getParticipantLayout(6, 540, 113);
  expect(tinyGroup.pager).toBe('side');
  expect(tinyGroup.cardWidth).toBeGreaterThanOrEqual(128);
});


test('focused camera and screen layouts reserve complete controls and stay bounded', () => {
  for (const width of [0, 1, 80, 144, 320, 400, 544, 776, 1118]) {
    for (const height of [0, 1, 36, 112, 117, 174, 240, 270, 543]) {
      for (const screen of [false, true]) {
        const layout = getFocusedParticipantLayout(width, height, screen);
        const availableWidth = Math.max(0, width - (layout.controls === 'side' ? FOCUS_CONTROLS_SIDE_WIDTH : 0));
        const availableHeight = Math.max(0, height - (layout.controls === 'bottom' ? GALLERY_PAGER_HEIGHT : 0));
        expect(Number.isFinite(layout.cardWidth) && Number.isFinite(layout.cardHeight)).toBe(true);
        expect(layout.cardWidth).toBeGreaterThanOrEqual(0);
        expect(layout.cardHeight).toBeGreaterThanOrEqual(0);
        expect(layout.cardWidth).toBeLessThanOrEqual(availableWidth);
        expect(layout.cardHeight).toBeLessThanOrEqual(availableHeight);
        if (!screen && layout.cardWidth > 0) expect(Math.abs(layout.cardWidth - (layout.cardHeight - CARD_FOOTER_HEIGHT) * CARD_ASPECT_RATIO)).toBeLessThan(2);
        if (screen && availableWidth && availableHeight) expect([layout.cardWidth, layout.cardHeight]).toEqual([availableWidth, availableHeight]);
      }
    }
  }
  expect(getFocusedParticipantLayout(NaN, Infinity)).toEqual(getFocusedParticipantLayout(0, 0));
});
