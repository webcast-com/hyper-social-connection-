'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Bookmark, User as UserIcon } from 'lucide-react';
import { requestSavedSection, savedPostsHref } from '@/lib/saved-section';

/**
 * The avatar in the header, as a menu.
 *
 * It used to be a plain link to your profile. It now opens two destinations —
 * your profile, and the posts you saved — because the Saved section is a part of
 * the profile that nothing else pointed at, and on a phone the avatar is the only
 * route to the profile at all (the bottom bar has no Profile tab).
 *
 * `pathname` comes from the header, which already reads it: a navigation closes
 * the menu, whichever control caused it.
 */
export default function ProfileMenu({ user, pathname }: { user: { id: number | string; name?: string | null; avatar?: string | null }; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // A menu opened on one page does not follow the member to the next.
  if (open && openedAt !== pathname) setOpen(false);

  const items = () => [...(container.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus moves into the menu, as it does for any menu button.
    container.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' && event.target === trigger.current) {
        event.preventDefault();
        setOpenedAt(pathname);
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at < 0 ? list.length - 1 : at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
  };

  const itemClass = 'flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 focus:outline-none';

  return (
    <div
      ref={container}
      className="relative ml-1"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Tabbing out of the menu closes it; a click inside it does not.
        if (open && event.relatedTarget && !container.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setOpenedAt(pathname);
          setOpen(!open);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Profile menu"
        title="Profile menu"
        className="block rounded-full hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt=""
            className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-gray-800 ring-2 ring-blue-400 hover:ring-blue-600 transition-all shadow-sm"
          />
        ) : (
          <span aria-hidden="true" className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-blue-400 hover:ring-blue-600 transition-all shadow-sm">
            {user.name?.charAt(0) || 'U'}
          </span>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Profile menu"
          className="absolute right-0 top-full mt-3.5 w-52 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          {user.name && (
            <p className="truncate border-b border-gray-100 px-4 pb-2 pt-1 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {user.name}
            </p>
          )}
          <Link role="menuitem" href={`/profile/${user.id}`} onClick={() => setOpen(false)} className={itemClass}>
            <UserIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span>Your profile</span>
          </Link>
          <Link
            role="menuitem"
            href={savedPostsHref(user.id)}
            onClick={() => {
              setOpen(false);
              // The link selects the section; this puts it in front of the member.
              requestSavedSection();
            }}
            className={itemClass}
          >
            <Bookmark aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span>Saved</span>
          </Link>
        </div>
      )}
    </div>
  );
}
