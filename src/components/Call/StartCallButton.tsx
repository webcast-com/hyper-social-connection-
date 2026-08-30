'use client';

import { useState } from 'react';
import { Video } from 'lucide-react';
import { CallModal } from './CallModal';

type Viewer = { id: number; name: string; avatar: string | null } | null;

/**
 * Client wrapper so the server-rendered group page can offer a "Start Call"
 * button without becoming a client component. It owns the open state and
 * hands it to `CallModal`.
 */
export function StartCallButton({
  groupId,
  groupName,
  viewer,
}: {
  groupId: number;
  groupName: string;
  viewer: Viewer;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <Video className="h-4 w-4" aria-hidden="true" /> Start Call
      </button>
      {/* Mounted only while open so the modal's state resets between calls. */}
      {isOpen && (
        <CallModal
          groupId={groupId}
          groupName={groupName}
          viewer={viewer}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
        />
      )}
    </>
  );
}

export default StartCallButton;
