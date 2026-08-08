'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/db/supabase';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Check, CheckCheck, Smile, Heart, ThumbsUp, Flame } from 'lucide-react';

export type ChatUser = { id: number; name: string; avatar: string | null };
export type ChatMessage = {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
  user?: ChatUser | null;
};

const QUICK_REACTIONS = ['❤️', '👍', '😂', '🔥', '👏'];

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
  const [reactions, setReactions] = useState<Record<number, string[]>>({});
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<number>>(new Set(initialMessages.map((m) => m.id)));

  // Keep in sync with server re-renders
  useEffect(() => {
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = initialMessages.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return prev;
      known.forEach((id) => seenIds.current.add(id));
      return [...prev, ...fresh].sort((a, b) => a.id - b.id);
    });
  }, [initialMessages]);

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

  const addReaction = (msgId: number, emoji: string) => {
    setReactions((prev) => {
      const current = prev[msgId] || [];
      const updated = current.includes(emoji) ? current.filter((e) => e !== emoji) : [...current, emoji];
      return { ...prev, [msgId]: updated };
    });
    setActiveReactionMsgId(null);
  };

  const otherUser = usersById[otherId];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/60 flex flex-col">
      {/* Active status indicator banner */}
      <div className="text-center my-1">
        <span className="inline-flex items-center space-x-1.5 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span>Chatting with {otherUser?.name || 'User'} · End-to-end encrypted</span>
        </span>
      </div>

      {messages.length === 0 && (
        <div className="text-center text-gray-500 dark:text-gray-400 mt-16 space-y-2">
          <div className="text-4xl">💬</div>
          <div className="font-semibold text-gray-700 dark:text-gray-200">No messages yet</div>
          <p className="text-xs">Say hello to {otherUser?.name || 'your contact'} to start the conversation!</p>
        </div>
      )}

      {messages.map((msg) => {
        const isMe = msg.senderId === viewerId;
        const msgReactions = reactions[msg.id] || [];

        return (
          <div
            key={msg.id}
            className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start'}`}
            onMouseLeave={() => {
              if (activeReactionMsgId === msg.id) setActiveReactionMsgId(null);
            }}
          >
            <div className="flex items-end space-x-2 max-w-xs md:max-w-md">
              {!isMe && msg.user && (
                <div className="shrink-0 mb-1">
                  {msg.user.avatar ? (
                    <img src={msg.user.avatar} alt="sender" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {msg.user.name.charAt(0)}
                    </div>
                  )}
                </div>
              )}

              <div className="relative">
                <div
                  className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <div
                    className={`text-[10px] mt-1 flex items-center justify-end space-x-1 ${
                      isMe ? 'text-blue-200' : 'text-gray-400'
                    }`}
                    suppressHydrationWarning
                  >
                    <span>
                      {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : 'Now'}
                    </span>
                    {isMe && <CheckCheck className="w-3 h-3 text-blue-200 ml-0.5 inline" />}
                  </div>
                </div>

                {/* Reaction badge attached below message */}
                {msgReactions.length > 0 && (
                  <div
                    className={`absolute -bottom-2.5 ${
                      isMe ? 'right-2' : 'left-2'
                    } bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-1.5 py-0.5 shadow-sm text-xs flex items-center space-x-0.5 z-10`}
                  >
                    {msgReactions.map((r, i) => (
                      <span key={i}>{r}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Reaction trigger icon on hover */}
              <button
                type="button"
                onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label="React with emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>

            {/* Floating quick reactions bar */}
            {activeReactionMsgId === msg.id && (
              <div
                className={`absolute bottom-full mb-1 ${
                  isMe ? 'right-0' : 'left-0'
                } bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-1 shadow-lg flex items-center space-x-1.5 z-20 animate-fade-in`}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addReaction(msg.id, emoji)}
                    className="hover:scale-125 transition-transform text-base p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
