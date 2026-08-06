import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function Messages() {
  const viewer = await getViewer();

  let allUsers: any[] = [];
  if (hasDatabase) {
    try {
      allUsers = await db.select().from(users);
    } catch (err) {
      console.warn('[messages] DB query failed:', (err as Error)?.message);
      allUsers = [viewer];
    }
  } else {
    allUsers = [viewer];
  }
  
  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white max-w-6xl mx-auto mt-4 rounded-lg shadow overflow-hidden">
      <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 font-bold text-xl">Chats</div>
        <div className="p-2 space-y-1">
          {allUsers.filter(u => u.id !== viewer.id).map(u => (
            <Link key={u.id} href={`/messages/${u.id}`} className="flex items-center space-x-3 p-3 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
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
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        Select a user to start chatting
      </div>
    </div>
  );
}