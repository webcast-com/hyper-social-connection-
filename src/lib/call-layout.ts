/** Shared geometry for the participant cards. Media never supplies layout dimensions. */
export const CARD_ASPECT_RATIO = 16 / 9;
export const CARD_FOOTER_HEIGHT = 36;
export const CARD_GAP = 12;
export const GALLERY_PAGER_HEIGHT = 52;
export const GALLERY_SIDE_PAGER_WIDTH = 56;
const MAX_PAGE_SIZE = 9;
const MAX_COLUMNS = 4;
const MIN_CARD_WIDTH = 144;
const MIN_MEDIA_HEIGHT = 72;

export type ParticipantLayout = {
  columns: number;
  cardWidth: number;
  cardHeight: number;
  pageSize: number;
  pageCount: number;
  pager: 'bottom' | 'side';
};

/** Fit equal 16:9 media areas plus a separate name bar into the available rectangle. */
function fitCards(count: number, width: number, height: number) {
  let best = { columns: 1, cardWidth: 0, cardHeight: 0 };
  let bestArea = -1;
  for (let columns = 1; columns <= Math.min(count, MAX_COLUMNS); columns += 1) {
    const rows = Math.ceil(count / columns);
    const availableWidth = (width - CARD_GAP * (columns - 1)) / columns;
    const availableHeight = (height - CARD_GAP * (rows - 1)) / rows;
    const mediaHeight = Math.floor(Math.max(0, Math.min(
      availableHeight - CARD_FOOTER_HEIGHT,
      availableWidth / CARD_ASPECT_RATIO,
    )));
    const cardWidth = Math.floor(mediaHeight * CARD_ASPECT_RATIO);
    const cardHeight = Math.min(Math.max(0, availableHeight), mediaHeight + CARD_FOOTER_HEIGHT);
    const area = cardWidth * mediaHeight;
    if (area > bestArea) {
      bestArea = area;
      best = { columns, cardWidth, cardHeight };
    }
  }
  return best;
}

function isReadable(card: ReturnType<typeof fitCards>) {
  return card.cardWidth >= MIN_CARD_WIDTH && card.cardHeight - CARD_FOOTER_HEIGHT >= MIN_MEDIA_HEIGHT;
}

/**
 * Measure the gallery, not the browser: opening chat also changes the space.
 * Prefer one complete page; otherwise show the most cards that remain readable.
 * On short, wide stages the pager sits beside the cards, not below them. If no
 * readable solution exists, use the largest possible media area rather than
 * making cards even smaller just to meet an arbitrary pagination threshold.
 */
export function getParticipantLayout(count: number, width: number, height: number): ParticipantLayout {
  count = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  height = Number.isFinite(height) ? Math.max(0, Math.floor(height)) : 0;
  if (!count || !width || !height) {
    return { columns: 1, cardWidth: 0, cardHeight: 0, pageSize: 1, pageCount: Math.max(1, count), pager: 'bottom' };
  }

  const candidates: ParticipantLayout[] = [];
  if (count <= MAX_PAGE_SIZE) {
    const full: ParticipantLayout = { ...fitCards(count, width, height), pageSize: count, pageCount: 1, pager: 'bottom' };
    if (count === 1 || isReadable(full)) return full;
    if (full.cardWidth > 0) candidates.push(full);
  }

  const placements: ParticipantLayout['pager'][] = ['bottom'];
  // The side rail needs two 44px buttons, a 16px page label and two 4px gaps.
  if (height >= 112 && height <= 240 && width >= 400 && width >= height * 2) placements.push('side');
  for (const pager of placements) {
    const pageWidth = Math.max(0, width - (pager === 'side' ? GALLERY_SIDE_PAGER_WIDTH : 0));
    const pageHeight = Math.max(0, height - (pager === 'bottom' ? GALLERY_PAGER_HEIGHT : 0));
    for (let pageSize = Math.min(count - 1, MAX_PAGE_SIZE); pageSize >= 1; pageSize -= 1) {
      const card = fitCards(pageSize, pageWidth, pageHeight);
      // Zero-sized multi-card candidates can still overflow through their gaps.
      if (card.cardWidth > 0 || pageSize === 1) {
        candidates.push({ ...card, pageSize, pageCount: Math.ceil(count / pageSize), pager });
      }
    }
  }

  const readable = candidates.filter(isReadable);
  const choices = readable.length ? readable : candidates;
  const mediaArea = (card: ParticipantLayout) => card.cardWidth * Math.max(0, card.cardHeight - CARD_FOOTER_HEIGHT);
  choices.sort((a, b) => readable.length
    ? b.pageSize - a.pageSize || mediaArea(b) - mediaArea(a)
    : mediaArea(b) - mediaArea(a) || b.pageSize - a.pageSize);
  return choices[0];
}

/** Focus controls keep the gallery's 44px targets, without taxing the height of
 * a short landscape. Only the chosen card changes size; media stays mounted. */
export const FOCUS_CONTROLS_SIDE_WIDTH = 168;
export type FocusedParticipantLayout = {
  cardWidth: number;
  cardHeight: number;
  controls: 'bottom' | 'side';
};

export function getFocusedParticipantLayout(width: number, height: number, screen = false): FocusedParticipantLayout {
  width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  height = Number.isFinite(height) ? Math.max(0, Math.floor(height)) : 0;
  const controls = height >= 112 && height <= 240 && width >= 400 && width >= height * 2 ? 'side' : 'bottom';
  const availableWidth = Math.max(0, width - (controls === 'side' ? FOCUS_CONTROLS_SIDE_WIDTH : 0));
  const availableHeight = Math.max(0, height - (controls === 'bottom' ? GALLERY_PAGER_HEIGHT : 0));
  if (!availableWidth || !availableHeight) return { cardWidth: 0, cardHeight: 0, controls };
  // Presentation mode uses the whole available rectangle, so portrait or tall
  // shared windows aren't constrained by a camera's 16:9 frame. object-contain
  // fits the actual screen inside it; its intrinsic size never drives layout.
  const card = screen
    ? { cardWidth: availableWidth, cardHeight: availableHeight }
    : fitCards(1, availableWidth, availableHeight);
  return { cardWidth: card.cardWidth, cardHeight: card.cardHeight, controls };
}
