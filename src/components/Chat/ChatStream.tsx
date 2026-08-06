'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/db/supabase';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export type ChatUser = { id: number; name: string; avatar: string | null };
export type ChatMessage = {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
  user?: ChatUser | null;
};

/**
 * Live message thread for a 1:1 conversation.
 *
 * Subscribes to Supabase Realtime (postgres_changes on `messages`) and appends
 * new messages as they arrive. When Supabase is not configured (offline/demo
 * mode) it simply renders the server-provided messages — the existing server
 * actions still persist and refresh the page.
 */
export default function ChatStream({
  viewerId,
  otherId,
  initialMessages,
  usersById,
}: {
  viewerId: number;
  otherId: number;
  initialMessages: ChatMessage[];
  usersById: Record<number, ChatUser | undefined>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<number>>(new Set(initialMessages.map((m) => m.id)));

  // Keep in sync with server re-renders (e.g. after a server-action send).
  useEffect(() => {
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = initialMessages.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return prev;
      known.forEach((id) => seenIds.current.add(id));
      return [...prev, ...fresh].sort((a, b) => a.id - b.id);
    });
  }, [initialMessages]);

  // Scroll to the newest message when the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const append = (row: any) => {
      if (!row) return;
      const senderId = Number(row.sender_id);
      const receiverId = Number(row.receiver_id);
      const isConversation =
        (senderId === viewerId && receiverId === otherId) ||
        (senderId === otherId && receiverId === viewerId);
      if (!isConversation) return;
      if (seenIds.current.has(Number(row.id))) return;
      seenIds.current.add(Number(row.id));

      const message: ChatMessage = {
        id: Number(row.id),
        senderId,
        receiverId,
        content: String(row.content ?? ''),
        createdAt: row.created_at,
        user: usersById[senderId],
      };
      setMessages((prev) => [...prev, message]);
    };

    // Subscribe to inserts involving this user; filter to this conversation.
    const channel = supabase
      .channel(`dm-${Math.min(viewerId, otherId)}-${Math.max(viewerId, otherId)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${viewerId}` },
        (payload) => append(payload.new),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${viewerId}` },
        (payload) => append(payload.new),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerId, otherId, usersById]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 flex flex-col">
      {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-10">
          No messages yet. Send a message to start the conversation!
        </div>
      )}
      {messages.map((msg) => {
        const isMe = msg.senderId === viewerId;
        return (
          <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${
                isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              <div
                className={`text-[10px] mt-1 ${
                  isMe ? 'text-blue-200' : 'text-gray-500'
                }`}
                suppressHydrationWarning
              >
                {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : ''}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
