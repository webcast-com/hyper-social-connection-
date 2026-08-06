'use client';

import { useRef, useState } from 'react';
import { createPost, createStory } from '@/app/actions';
import { Image as ImageIcon, Video, Smile, Upload, Link2, LoaderCircle, Camera } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { uploadMediaFile } from '@/lib/upload';

type Media = { kind: 'image' | 'video'; url: string } | null;

export default function CreatePost({ user }: { user: any }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<Media>(null);
  const [postValue, setPostValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Story creation from the composer (device upload, no URL).
  const storyFileRef = useRef<HTMLInputElement>(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const [storyError, setStoryError] = useState('');

  const handleStoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStoryError('Please choose an image file for your story.');
      return;
    }

    setStoryError('');
    setStoryUploading(true);
    try {
      const media = await uploadMediaFile(file);
      if (media.kind !== 'image') throw new Error('Story must be an image.');
      await createStory(media.url);
    } catch (err: any) {
      setStoryError(err?.message || 'Upload failed');
    } finally {
      setStoryUploading(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setPostValue(prev => prev + emoji);
    setShowEmoji(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    setError('');
    setUploading(true);
    try {
      const media = await uploadMediaFile(file);
      setMedia({ kind: media.kind, url: media.url });
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const attachImageUrl = () => {
    const url = prompt('Enter image URL:');
    if (url) setMedia({ kind: 'image', url });
  };

  const attachVideoUrl = () => {
    const url = prompt('Enter video URL:');
    if (url) setMedia({ kind: 'video', url });
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
            if (uploading) return;
            const content = postValue.trim();
            if (!content && !media) return;
            formData.set('content', content);
            if (media?.kind === 'image') formData.set('imageUrl', media.url);
            if (media?.kind === 'video') formData.set('videoUrl', media.url);
            await createPost(formData);
            formRef.current?.reset();
            setPostValue('');
            setMedia(null);
            setError('');
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

          {/* Hidden file picker for real photo/video uploads */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload a photo or video"
          />

          {error && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          {uploading && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-3">
              <LoaderCircle className="w-4 h-4 animate-spin" />
              <span>Uploading media…</span>
            </div>
          )}

          {media && !uploading && (
            <div className="mt-2 relative">
              {media.kind === 'image' ? (
                <img src={media.url} alt="preview" className="rounded-lg max-h-48 object-cover" />
              ) : (
                <video
                  src={media.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="rounded-lg max-h-60 w-full bg-black"
                />
              )}
              <button
                type="button"
                onClick={() => setMedia(null)}
                className="absolute top-2 right-2 bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                aria-label="Remove attached media"
              >
                ✕
              </button>
            </div>
          )}
          <button type="submit" className="hidden">Post</button>
        </form>
      </div>
      <div className="border-t border-gray-200 mt-4 pt-3 flex">
        <div className="flex-1 relative">
          <button
            type="button"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="w-full flex items-center justify-center space-x-2 hover:bg-gray-100 p-2 rounded-lg text-gray-500 font-semibold"
            aria-haspopup="menu"
            aria-expanded={showAttachMenu}
          >
            <ImageIcon className="text-green-500 shrink-0" />
            <span className="whitespace-nowrap text-sm">Photo/video</span>
          </button>
          {showAttachMenu && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
              <button
                type="button"
                onClick={() => { setShowAttachMenu(false); fileRef.current?.click(); }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-100 text-sm font-medium text-gray-700"
              >
                <Upload className="w-4 h-4 text-blue-500" />
                <span>Upload photo or video</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowAttachMenu(false); attachImageUrl(); }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-100 text-sm font-medium text-gray-700"
              >
                <Link2 className="w-4 h-4 text-green-500" />
                <span>Paste image URL</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowAttachMenu(false); attachVideoUrl(); }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-100 text-sm font-medium text-gray-700"
              >
                <Video className="w-4 h-4 text-red-500" />
                <span>Paste video URL</span>
              </button>
            </div>
          )}
        </div>
        {/* Story — upload an image from the device (no URL) */}
        <div className="flex-1 relative">
          <input
            ref={storyFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleStoryFileChange}
            aria-label="Upload story image"
          />
          <button
            type="button"
            onClick={() => storyFileRef.current?.click()}
            disabled={storyUploading}
            className="w-full flex items-center justify-center space-x-2 hover:bg-gray-100 p-2 rounded-lg text-gray-500 font-semibold disabled:opacity-60"
          >
            {storyUploading ? (
              <LoaderCircle className="w-4 h-4 text-purple-500 animate-spin shrink-0" />
            ) : (
              <Camera className="text-purple-500 shrink-0" />
            )}
            <span className="whitespace-nowrap text-sm">{storyUploading ? 'Adding…' : 'Story'}</span>
          </button>
          {storyError && (
            <p className="text-xs text-red-600 text-center mt-1">{storyError}</p>
          )}
        </div>
        <button className="flex-1 flex items-center justify-center space-x-2 hover:bg-gray-100 p-2 rounded-lg text-gray-500 font-semibold">
          <Smile className="text-yellow-500 shrink-0" />
          <span className="whitespace-nowrap text-sm">Feeling/activity</span>
        </button>
      </div>
    </div>
  );
}
