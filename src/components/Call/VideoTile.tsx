'use client';

import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { AudioLines, ChevronDown, Hand, LoaderCircle, Maximize2, Mic, MicOff, MonitorUp, Pin, PinOff, X } from 'lucide-react';
import { CARD_FOOTER_HEIGHT } from '@/lib/call-layout';
import styles from './VideoTile.module.css';

export type VideoTileProps = {
  stream: MediaStream | null;
  mirror?: boolean;
  muted?: boolean;
  label: string;
  avatar: string | null;
  speaking?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSharing?: boolean;
  handRaised?: boolean;
  connectionState?: RTCPeerConnectionState;
  audioOnly?: boolean;
  pinned?: boolean;
  screenFocused?: boolean;
  followingSpeaker?: boolean;
  onSpeakerView?: () => void;
  onPin?: () => void;
  onFocusShare?: () => void;
};

export default function VideoTile({
  stream, mirror, muted, label, avatar, speaking, isMuted, isCameraOff,
  isSharing, handRaised, connectionState, audioOnly, pinned, screenFocused, followingSpeaker, onSpeakerView, onPin, onFocusShare,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const closeNameRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nameId = useId();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);

  const hasVideo = Boolean(stream?.getVideoTracks().length) && !audioOnly && (!isCameraOff || isSharing);
  const visiblySpeaking = Boolean(speaking && !isMuted);
  const connecting = connectionState === 'new' || connectionState === 'connecting';
  const interrupted = connectionState === 'disconnected' || connectionState === 'failed';
  const chooseView = (action: () => void) => {
    popoverRef.current?.hidePopover();
    action();
  };

  return (
    <div
      role="group"
      aria-label={label}
      data-pinned={pinned || undefined}
      data-speaking={visiblySpeaking || undefined}
      className={`${styles.card} ${visiblySpeaking ? styles.speaking : ''}`}
      style={{ '--participant-footer-height': `${CARD_FOOTER_HEIGHT}px` } as CSSProperties}
    >
      <div className={styles.media} data-testid="participant-media">
        {/* Keep one element, including on camera toggles and hidden gallery
            pages, so resizing/rearranging cards never interrupts remote audio. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          aria-label={isSharing ? `Screen shared by ${label}` : `Video of ${label}`}
          className={`${styles.video} ${isSharing ? styles.screen : ''} ${mirror && !isSharing ? styles.mirrored : ''} ${hasVideo ? '' : styles.hiddenVideo}`}
        />
        {!hasVideo && (
          <div className={styles.placeholder}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" data-testid="participant-avatar" className={styles.avatar} />
            ) : (
              <div className={`${styles.avatar} ${styles.initial}`} data-testid="participant-avatar" aria-hidden="true">
                {label?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
        )}

        {(connecting || interrupted) && (
          <div className={styles.connection} role="status">
            {connecting && <LoaderCircle className={styles.spinner} aria-hidden="true" />}
            <span>{connecting ? 'Connecting…' : connectionState === 'failed' ? 'Connection lost' : 'Connection interrupted'}</span>
          </div>
        )}
      </div>

      {/* The name has its own row rather than covering the shared screen.
          Native popovers escape the card's clipping and work with touch/keys;
          title + the full accessible name remain useful fallbacks. */}
      <div className={styles.footer}>
        <button
          ref={nameButtonRef}
          type="button"
          popoverTarget={nameId}
          title={`${label} — participant options`}
          aria-label={`Show full name and options for ${label}. Microphone ${isMuted ? 'muted' : 'on'}.`}
          className={styles.nameButton}
          data-testid="participant-name"
        >
          {isMuted ? (
            <MicOff className={styles.muted} aria-label="Muted" />
          ) : (
            <Mic className={styles.unmuted} aria-label="Microphone on" />
          )}
          <span className={styles.name}>{label}</span>
          {pinned ? <Pin aria-hidden="true" className={styles.pinnedIcon} /> : onPin ? <ChevronDown aria-hidden="true" className={styles.optionsIcon} /> : null}
        </button>
        <div className={styles.badges}>
          {handRaised && (
            <span className={`${styles.badge} ${styles.hand}`} role="img" aria-label="Hand raised" title="Hand raised">
              <Hand aria-hidden="true" /> <span className={styles.badgeText}>Hand raised</span>
            </span>
          )}
          {isSharing && (
            onFocusShare && !audioOnly ? (
              <button
                type="button"
                onClick={onFocusShare}
                className={`${styles.badge} ${styles.sharing} ${styles.shareAction}`}
                aria-label={screenFocused ? `Return to gallery from ${label}'s screen` : `Focus screen shared by ${label}`}
                title={screenFocused ? 'Return to gallery' : 'Focus shared screen — only changes your view'}
                data-testid="focus-share"
              >
                <MonitorUp aria-hidden="true" /> <span className={styles.badgeText}>Sharing</span>
                {!screenFocused && <Maximize2 aria-hidden="true" className={styles.shareExpand} />}
              </button>
            ) : (
              <span className={`${styles.badge} ${styles.sharing}`} role="img" aria-label="Sharing screen" title="Sharing screen">
                <MonitorUp aria-hidden="true" /> <span className={styles.badgeText}>Sharing</span>
              </span>
            )
          )}
        </div>
      </div>
      <div
        ref={popoverRef}
        id={nameId}
        popover="auto"
        data-call-name-popover
        role="dialog"
        aria-label="Participant name"
        className={styles.namePopover}
        onToggle={(event) => {
          if (event.currentTarget.matches(':popover-open')) closeNameRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.hidePopover();
            nameButtonRef.current?.focus();
          }
        }}
      >
        <div className={styles.popoverHeader}>
          <span>Participant</span>
          <button ref={closeNameRef} type="button" popoverTarget={nameId} popoverTargetAction="hide" aria-label="Close participant name">
            <X aria-hidden="true" />
          </button>
        </div>
        <p>{label}</p>
        {onPin && (
          <div className={styles.viewActions}>
            <button type="button" data-testid="participant-pin" onClick={() => chooseView(onPin)} aria-label={pinned ? `Unpin ${label}` : `Pin ${label} for me`}>
              {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
              {pinned ? 'Unpin participant' : 'Pin participant'}
            </button>
            {isSharing && !audioOnly && onFocusShare && (
              <button type="button" onClick={() => chooseView(onFocusShare)}>
                <Maximize2 aria-hidden="true" />{screenFocused ? 'Back to gallery' : 'Focus shared screen'}
              </button>
            )}
            {onSpeakerView && (
              <button type="button" onClick={() => chooseView(onSpeakerView)}>
                <AudioLines aria-hidden="true" />{followingSpeaker ? 'Back to gallery' : 'Follow active speaker'}
              </button>
            )}
            <small>Changes only your view, not the call.</small>
          </div>
        )}
      </div>
    </div>
  );
}
