import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { users, messages } from '@/db/schema';
import { eq, or, and, asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MessageInput from '@/components/MessageInput';
import ChatStream, { type ChatMessage, type ChatUser } from '@/components/Chat/ChatStream';

export const metadata: Metadata = {
  title: 'Conversation',
  description: 'Private conversation on Hyper.',
  robots: { index: false, follow: false },
};

export default async function MessageDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer() || { id: 0 } as any;
  const { id } = await params;

  const receiverId = parseInt(id);
  let allUsers: any[] = [];
  let receiver: any = null;
  let chatMessages: any[] = [];
  if (hasDatabase) {
    try {
      allUsers = await db.select().from(users);
      const receiverRes = await db.select().from(users).where(eq(users.id, receiverId));
      if (receiverRes.length === 0) redirect('/messages');
      receiver = receiverRes[0];

      chatMessages = await db.select().from(messages).where(
        or(
          and(eq(messages.senderId, viewer.id), eq(messages.receiverId, receiverId)),
          and(eq(messages.senderId, receiverId), eq(messages.receiverId, viewer.id))
        )
      ).orderBy(asc(messages.createdAt));
    } catch (err) {
      console.warn('[messages:id] DB query failed:', (err as Error)?.message);
      allUsers = [viewer];
      receiver = { id: receiverId, name: 'Demo User', avatar: null };
    }
  } else {
    allUsers = [viewer];
    receiver = { id: receiverId, name: 'Demo User', avatar: null };
  }

  const usersById: Record<number, ChatUser | undefined> = Object.fromEntries(
    allUsers.map((u) => [u.id, { id: u.id, name: u.name, avatar: u.avatar || null }]),
  );
  const streamMessages: ChatMessage[] = chatMessages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    receiverId: m.receiverId,
    content: m.content,
    createdAt: m.createdAt,
    user: usersById[m.senderId],
  }));

  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-3.5rem)] bg-white max-w-6xl mx-auto md:mt-4 rounded-lg shadow overflow-hidden">
      <div className="w-1/3 border-r border-gray-200 overflow-y-auto hidden md:block">
        <div className="p-4 border-b border-gray-200 font-bold text-xl">Chats</div>
        <div className="p-2 space-y-1">
          {allUsers.filter(u => u.id !== viewer.id).map(u => (
            <Link key={u.id} href={`/messages/${u.id}`} className={`flex items-center space-x-3 p-3 rounded-lg transition-colors cursor-pointer ${u.id === receiverId ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              {u.avatar ? (
                <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {u.name.charAt(0)}
                </div>
              )}
              <div className="font-semibold min-w-0">
                <span className="block truncate">{u.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center space-x-3">
          <Link
            href="/messages"
            className="md:hidden p-1 -ml-1 hover:bg-gray-100 rounded-full shrink-0"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          {receiver.avatar ? (
            <img src={receiver.avatar} alt={receiver.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
              {receiver.name.charAt(0)}
            </div>
          )}
          <div className="font-bold text-lg min-w-0">
            <span className="block truncate">{receiver.name}</span>
          </div>
        </div>

        <ChatStream
          viewerId={viewer.id}
          otherId={receiverId}
          initialMessages={streamMessages}
          usersById={usersById}
        />

        <MessageInput receiverId={receiverId} />
      </div>
    </div>
  );
}