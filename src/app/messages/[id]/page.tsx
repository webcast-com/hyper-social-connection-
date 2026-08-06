import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { users, messages } from '@/db/schema';
import { eq, or, and, asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sendMessage } from '@/app/actions';
import MessageInput from '@/components/MessageInput';

export default async function MessageDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white max-w-6xl mx-auto mt-4 rounded-lg shadow overflow-hidden">
      <div className="w-1/3 border-r border-gray-200 overflow-y-auto hidden md:block">
        <div className="p-4 border-b border-gray-200 font-bold text-xl">Chats</div>
        <div className="p-2 space-y-1">
          {allUsers.filter(u => u.id !== viewer.id).map(u => (
            <Link key={u.id} href={`/messages/${u.id}`} className={`flex items-center space-x-3 p-3 rounded-lg transition-colors cursor-pointer ${u.id === receiverId ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              {u.avatar ? (
                <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {u.name.charAt(0)}
                </div>
              )}
              <div className="font-semibold">{u.name}</div>
            </Link>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center space-x-3">
          {receiver.avatar ? (
            <img src={receiver.avatar} alt={receiver.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
              {receiver.name.charAt(0)}
            </div>
          )}
          <div className="font-bold text-lg">{receiver.name}</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 flex flex-col">
          {chatMessages.length === 0 && (
            <div className="text-center text-gray-500 mt-10">No messages yet. Send a message to start the conversation!</div>
          )}
          {chatMessages.map(msg => {
            const isMe = msg.senderId === viewer.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                  {msg.content}
                </div>
              </div>
            );
          })}
        </div>

        <MessageInput receiverId={receiverId} />
      </div>
    </div>
  );
}