'use client';

import { useRef, useState } from 'react';
import { Plus, LoaderCircle } from 'lucide-react';
import { createStory } from '@/app/actions';
import { uploadMediaFile } from '@/lib/upload';

/**
 * Stories row — the "Create story" card uploads an image from the device
 * (no URL entry) and posts it as a 24h story via the existing action.
 */
export default function Stories({ user, stories = [] }: { user: any; stories?: any[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your story.');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const media = await uploadMediaFile(file);
      if (media.kind !== 'image') throw new Error('Story must be an image.');
      await createStory(media.url);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex space-x-2 overflow-x-auto pb-4 scrollbar-hide snap-x snap-proximity">
        {/* Create Story — uploads an image from the device */}
        <div
          onClick={() => fileRef.current?.click()}
          className="relative h-48 w-28 min-w-[7rem] bg-white rounded-xl shadow cursor-pointer overflow-hidden group snap-start"
          role="button"
          tabIndex={0}
          aria-label="Create story"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload story image"
          />
          <div className="h-3/4 overflow-hidden">
            <img
              src={user.avatar || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167'}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              alt="My Avatar"
            />
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 p-1 rounded-full border-4 border-white">
            {uploading ? (
              <LoaderCircle className="text-white w-5 h-5 animate-spin" />
            ) : (
              <Plus className="text-white w-5 h-5" />
            )}
          </div>
          <div className="h-1/4 flex items-end justify-center pb-1">
            <span className="text-xs font-bold">{uploading ? 'Uploading…' : 'Create story'}</span>
          </div>
        </div>

        {/* Actual Stories */}
        {stories.map((story) => (
          <div
            key={story.id}
            className="relative h-48 w-28 min-w-[7rem] rounded-xl shadow cursor-pointer overflow-hidden group snap-start"
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
      {error && (
        <p className="text-sm text-red-600 mb-2 -mt-1">{error}</p>
      )}
    </div>
  );
}
