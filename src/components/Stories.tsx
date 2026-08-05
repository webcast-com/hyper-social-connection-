'use client';

import { Plus } from 'lucide-react';
import { createStory } from '@/app/actions';

export default function Stories({ user, stories = [] }: { user: any; stories?: any[] }) {
  const handleAddStory = async () => {
    const url = prompt('Enter an image URL for your story:');
    if (url) {
      await createStory(url);
    }
  };

  return (
    <div className="flex space-x-2 overflow-x-auto pb-4 scrollbar-hide">
      {/* Create Story */}
      <div 
        onClick={handleAddStory}
        className="relative h-48 w-28 min-w-[7rem] bg-white rounded-xl shadow cursor-pointer overflow-hidden group"
      >
        <div className="h-3/4 overflow-hidden">
          <img 
            src={user.avatar || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167'} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            alt="My Avatar"
          />
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 p-1 rounded-full border-4 border-white">
          <Plus className="text-white w-5 h-5" />
        </div>
        <div className="h-1/4 flex items-end justify-center pb-1">
          <span className="text-xs font-bold">Create story</span>
        </div>
      </div>

      {/* Actual Stories */}
      {stories.map((story) => (
        <div 
          key={story.id} 
          className="relative h-48 w-28 min-w-[7rem] rounded-xl shadow cursor-pointer overflow-hidden group"
        >
          <img 
            src={story.imageUrl} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            alt="Story"
          />
          <div className="absolute top-2 left-2 border-4 border-blue-600 rounded-full w-10 h-10 overflow-hidden">
            <img src={story.user?.avatar || ''} className="w-full h-full object-cover" alt={story.user?.name} />
          </div>
          <div className="absolute bottom-2 left-2 right-2">
            <span className="text-white text-xs font-bold drop-shadow-md truncate block">{story.user?.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}