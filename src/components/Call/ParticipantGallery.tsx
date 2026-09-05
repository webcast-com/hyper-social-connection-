'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import {
  CARD_GAP, FOCUS_CONTROLS_SIDE_WIDTH, GALLERY_PAGER_HEIGHT, GALLERY_SIDE_PAGER_WIDTH,
  getFocusedParticipantLayout, getParticipantLayout,
} from '@/lib/call-layout';
import VideoTile, { type VideoTileProps } from './VideoTile';
import { useActiveSpeaker } from './useActiveSpeaker';
import styles from './ParticipantGallery.module.css';

export type ParticipantCard = Omit<VideoTileProps, 'onPin' | 'onFocusShare' | 'onSpeakerView' | 'pinned' | 'screenFocused' | 'followingSpeaker'> & { id: number; isLocal?: boolean };
type Focus = { kind: 'pinned' | 'screen'; participantId: number } | { kind: 'speaker' } | null;

export default function ParticipantGallery({ participants }: { participants: ParticipantCard[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const galleryButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLSelectElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [requestedPage, setRequestedPage] = useState(0);
  const [focus, setFocus] = useState<Focus>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const speakerId = useActiveSpeaker(participants, focus?.kind === 'speaker', () => {
    const container = containerRef.current;
    if (!container) return false;
    if ('showPopover' in HTMLElement.prototype && container.querySelector('[data-call-name-popover]:popover-open')) return true;
    if (container.querySelector('button:active')) return true;
    const picker = pickerRef.current;
    // Modern native pickers expose :open. Fall back to focus on older browsers
    // rather than changing a selection while the user is interacting with it.
    return Boolean(picker && (CSS.supports('selector(select:open)')
      ? picker.matches(':open') : document.activeElement === picker));
  }, () => {
    const active = document.activeElement;
    // The automatic switch hides the old tile, but must not lose keyboard
    // focus if its name button was focused. The gallery button never moves.
    if (active && containerRef.current?.contains(active) && active.closest('[data-participant-id]')) {
      galleryButtonRef.current?.focus();
    }
  });
  const requestedId = focus?.kind === 'speaker' ? speakerId : focus?.participantId;
  const focused = focus && participants.find((participant) => participant.id === requestedId && (
    focus.kind !== 'screen' || (participant.isSharing && !participant.audioOnly)
  ));
  if (focus && !focused) {
    // Clear an invalid manual choice. Speaker mode instead resolves a fallback
    // while any participants remain, without reviving an old pin/screen share.
    setFocus(null);
  }
  const activeFocus = focused && focus ? { kind: focus.kind, participantId: focused.id } : null;
  const focusOptions = activeFocus?.kind === 'screen'
    ? participants.filter((participant) => participant.isSharing && !participant.audioOnly)
    : participants;

  // Leave two pixels on each edge for the active-speaker ring.
  const layout = getParticipantLayout(participants.length, size.width - 4, size.height - 4);
  const focusedLayout = getFocusedParticipantLayout(size.width - 4, size.height - 4, activeFocus?.kind === 'screen');
  const page = Math.min(requestedPage, layout.pageCount - 1);
  const first = page * layout.pageSize;
  const visibleCount = activeFocus ? 1 : Math.min(layout.pageSize, participants.length - first);
  const columns = activeFocus ? 1 : Math.max(1, Math.min(layout.columns, visibleCount));
  const rows = Math.ceil(visibleCount / columns);
  const cardWidth = activeFocus ? focusedLayout.cardWidth : layout.cardWidth;
  const cardHeight = activeFocus ? focusedLayout.cardHeight : layout.cardHeight;
  const ready = size.width > 0 && size.height > 0;
  const sidePager = !activeFocus && layout.pageCount > 1 && layout.pager === 'side';
  const sideFocus = Boolean(activeFocus && focusedLayout.controls === 'side');

  const showGallery = () => {
    if (activeFocus) {
      const index = participants.findIndex((participant) => participant.id === activeFocus.participantId);
      if (index >= 0) setRequestedPage(Math.floor(index / layout.pageSize));
      // The invoker stays in the same DOM tree and will be on the returned page.
      containerRef.current?.querySelector<HTMLButtonElement>(
        `[data-participant-id="${activeFocus.participantId}"] [data-testid="participant-name"]`,
      )?.focus();
    }
    setFocus(null);
  };

  const followSpeaker = () => {
    setFocus({ kind: 'speaker' });
    // The invoking card may immediately become hidden; focus a stable control.
    queueMicrotask(() => galleryButtonRef.current?.focus());
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.gallery} ${sidePager ? styles.sidePager : ''} ${sideFocus ? styles.sideFocus : ''}`}
      data-testid="participant-gallery"
      data-view={activeFocus?.kind || 'gallery'}
      data-focus-participant={activeFocus?.participantId}
    >
      <div className={styles.viewport} data-testid="participant-viewport">
        <div
          role="list"
          aria-label="Call participants"
          className={styles.cards}
          style={{
            width: columns * cardWidth + (columns - 1) * CARD_GAP,
            height: rows * cardHeight + Math.max(0, rows - 1) * CARD_GAP,
            gap: CARD_GAP,
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          {participants.map(({ id, ...participant }, index) => (
            <div
              key={id}
              role="listitem"
              aria-posinset={index + 1}
              aria-setsize={participants.length}
              hidden={activeFocus ? id !== activeFocus.participantId : index < first || index >= first + layout.pageSize}
              className={styles.slot}
              style={{ width: cardWidth, height: cardHeight }}
              data-testid="participant-card"
              data-participant-id={id}
            >
              {/* Never move a tile into a different parent or duplicate a video
                  for focus mode. Hidden peers retain their original players,
                  streams and audio across paging, pinning and presentation. */}
              <VideoTile
                {...participant}
                pinned={activeFocus?.kind === 'pinned' && activeFocus.participantId === id}
                screenFocused={activeFocus?.kind === 'screen' && activeFocus.participantId === id}
                followingSpeaker={activeFocus?.kind === 'speaker'}
                onSpeakerView={() => activeFocus?.kind === 'speaker' ? showGallery() : followSpeaker()}
                onPin={() => activeFocus?.kind === 'pinned' && activeFocus.participantId === id
                  ? showGallery() : setFocus({ kind: 'pinned', participantId: id })}
                onFocusShare={() => activeFocus?.kind === 'screen' && activeFocus.participantId === id
                  ? showGallery() : setFocus({ kind: 'screen', participantId: id })}
              />
            </div>
          ))}
        </div>
      </div>
      {ready && activeFocus && (
        <div
          role="group"
          aria-label="Focused view controls"
          data-testid="focus-controls"
          className={`${styles.focusControls} ${!sideFocus && size.width < 420 ? styles.compactFocus : ''}`}
          style={{ height: sideFocus ? '100%' : GALLERY_PAGER_HEIGHT, width: sideFocus ? FOCUS_CONTROLS_SIDE_WIDTH : undefined }}
        >
          <button ref={galleryButtonRef} type="button" onClick={showGallery} aria-label="Back to gallery" title="Back to gallery">
            <LayoutGrid aria-hidden="true" /><span>Gallery</span>
          </button>
          <label className={styles.focusChoice}>
            <span className={styles.focusMode}>{activeFocus.kind === 'pinned' ? 'Pinned for you' : activeFocus.kind === 'screen' ? 'Screen focus' : 'Speaker view'}</span>
            <select
              ref={pickerRef}
              aria-label={activeFocus.kind === 'pinned' ? 'Pinned participant' : activeFocus.kind === 'screen' ? 'Shared screen' : 'Speaker selection'}
              title={activeFocus.kind === 'speaker' ? 'Follow speakers automatically, or pin a participant. Only changes your view.' : 'Only changes your view'}
              value={activeFocus.kind === 'speaker' ? 'automatic' : activeFocus.participantId}
              onChange={(event) => event.target.value === 'automatic'
                ? followSpeaker()
                : setFocus({ kind: activeFocus.kind === 'screen' ? 'screen' : 'pinned', participantId: Number(event.target.value) })}
              onKeyDown={(event) => {
                // Let Escape close a native picker without bubbling to the
                // call modal's leave shortcut, including after a selection.
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  if (activeFocus.kind === 'speaker') galleryButtonRef.current?.focus();
                }
              }}
            >
              {activeFocus.kind === 'speaker' && <option value="automatic">Automatic</option>}
              {focusOptions.map((participant) => <option key={participant.id} value={participant.id}>{activeFocus.kind === 'speaker' ? `Pin ${participant.label}` : participant.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {ready && !activeFocus && layout.pageCount > 1 && (
        <nav aria-label="Participant pages" className={styles.pagination} style={{ height: sidePager ? '100%' : GALLERY_PAGER_HEIGHT, width: sidePager ? GALLERY_SIDE_PAGER_WIDTH : undefined }}>
          <button type="button" aria-label="Previous participants" disabled={page === 0} onClick={() => setRequestedPage(page - 1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <span role="status" aria-live="polite" aria-atomic="true">
            <span aria-hidden="true">{sidePager ? `${page + 1}/${layout.pageCount}` : `${first + 1}–${first + visibleCount} of ${participants.length}`}</span>
            <span className={styles.screenReaderOnly}>Participants {first + 1} to {first + visibleCount} of {participants.length}. Page {page + 1} of {layout.pageCount}.</span>
          </span>
          <button type="button" aria-label="Next participants" disabled={page === layout.pageCount - 1} onClick={() => setRequestedPage(page + 1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
