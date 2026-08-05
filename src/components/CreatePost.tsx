'use client';

import { useRef, useState } from 'react';
import { createPost } from '@/app/actions';
import { Image as ImageIcon, Video, Smile } from 'lucide-react';
import EmojiPicker from './EmojiPicker';

export default function CreatePost({ user }: { user: any }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [postValue, setPostValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  const handleEmojiSelect = (emoji: string) => {
    setPostValue(prev => prev + emoji);
    setShowEmoji(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex space-x-2">
        {user.avatar ? (
          <img src={user.avatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
            {user.name.charAt(0)}
          </div>
        )}
        <form 
          ref={formRef}
          action={async (formData) => {
            formData.set('content', postValue);
            if (imageUrl) formData.append('imageUrl', imageUrl);
            await createPost(formData);
            formRef.current?.reset();
            setPostValue('');
            setImageUrl('');
          }}
          className="flex-1 flex flex-col"
        >
          <div className="relative">
            <input
              name="content"
              type="hidden"
              value={postValue}
            />
            <input
              type="text"
              value={postValue}
              onChange={(e) => setPostValue(e.target.value)}
              placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`}
              className="bg-gray-100 rounded-full py-2 px-4 focus:outline-none w-full pr-10 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowEmoji(!showEmoji)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xl hover:bg-gray-200 rounded-full p-1"
              aria-label="Emoji picker"
            >
              😊
            </button>
            {showEmoji && (
              <div className="absolute top-12 left-0 z-30">
                <EmojiPicker onSelect={handleEmojiSelect} />
              </div>
            )}
          </div>
          {imageUrl && (
            <div className="mt-2 relative">
              <img src={imageUrl} alt="preview" className="rounded-lg max-h-48 object-cover" />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute top-2 right-2 bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>
          )}
          <button type="submit" className="hidden">Post</button>
        </form>
      </div>
      <div className="border-t border-gray-200 mt-4 pt-3 flex">
        <button
          onClick={() => {
            const url = prompt('Enter image URL:');
            if (url) setImageUrl(url);
          }}
          className="flex-1 flex items-center justify-center space-x-2 hover:bg-gray-100 p-2 rounded-lg text-gray-500 font-semibold"
        >
          <ImageIcon className="text-green-500" />
          <span>Photo/video</span>
        </button>
        <button className="flex-1 flex items-center justify-center space-x-2 hover:bg-gray-100 p-2 rounded-lg text-gray-500 font-semibold">
          <Smile className="text-yellow-500" />
          <span>Feeling/activity</span>
        </button>
      </div>
    </div>
  );
}