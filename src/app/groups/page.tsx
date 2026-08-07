import type { Metadata } from 'next';
import { db, hasDatabase } from '@/db';
import { groups, users, groupMembers } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createGroup } from '@/app/actions';
import { Users, Plus } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Communities and Groups',
  description: 'Explore Hyper communities and find a group for the things you care about.',
  alternates: { canonical: '/groups' },
  openGraph: {
    title: 'Communities and Groups | Hyper',
    description: 'Explore Hyper communities and find a group for the things you care about.',
    url: '/groups',
  },
};

export default async function GroupsPage() {
  let allGroups: any[] = [];
  if (hasDatabase) {
    try {
      allGroups = await db.select().from(groups).orderBy(desc(groups.createdAt));
    } catch (err) {
      console.warn('[groups] DB query failed:', (err as Error)?.message);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="text-blue-600 shrink-0" /> Groups
        </h1>
        
        <form action={async (fd) => { 'use server'; await createGroup(fd); }} className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <input 
            name="name" 
            placeholder="Group Name" 
            required 
            className="border rounded px-3 py-2 text-sm w-full sm:w-56"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md font-semibold flex items-center justify-center gap-1 text-sm hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Create Group
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allGroups.map(group => (
          <div key={group.id} className="bg-white rounded-xl shadow overflow-hidden group border border-gray-100">
            <div className="h-32 bg-gradient-to-r from-blue-400 to-indigo-500 relative">
              {group.coverPhoto && <img src={group.coverPhoto} alt={`${group.name} cover`} className="w-full h-full object-cover" />}
            </div>
            <div className="p-4">
              <h3 className="font-bold text-xl mb-1">{group.name}</h3>
              <p className="text-gray-500 text-sm mb-4 line-clamp-2">{group.description || 'A community for shared interests.'}</p>
              <Link 
                href={`/groups/${group.id}`}
                className="block text-center w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg transition-colors"
              >
                Visit Group
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}