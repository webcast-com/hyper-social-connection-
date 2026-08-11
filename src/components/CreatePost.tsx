'use client';

import { useRef, useState } from 'react';
import { createPost, createStory } from '@/app/actions';
import {
  Image as ImageIcon,
  Video,
  Smile,
  Upload,
  Link2,
  LoaderCircle,
  Camera,
  BarChart2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import LinkPreviewCard from './LinkPreviewCard';
import { uploadMediaFile } from '@/lib/upload';
import { extractUrls } from '@/lib/link-preview';

type Media = { kind: 'image' | 'video'; url: string } | null;

export default function CreatePost({ user, groupId }: { user: any; groupId?: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<Media>(null);
  const [postValue, setPostValue] = useState('');
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Poll state
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDuration, setPollDuration] = useState('1');

  // Story creation from the composer
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
      const mediaRes = await uploadMediaFile(file);
      if (mediaRes.kind !== 'image') throw new Error('Story must be an image.');
      await createStory(mediaRes.url);
    } catch (err: any) {
      setStoryError(err?.message || 'Upload failed');
    } finally {
      setStoryUploading(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setPostValue((prev) => prev + emoji);
    setShowEmoji(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setUploading(true);
    try {
      const mediaRes = await uploadMediaFile(file);
      setMedia({ kind: mediaRes.kind, url: mediaRes.url });
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

  const handleAddPollOption = () => {
    if (pollOptions.length < 4) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handlePollOptionChange = (index: number, value: string) => {
    const next = [...pollOptions];
    next[index] = value;
    setPollOptions(next);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-4 mb-4">
      <div className="flex space-x-3">
        {user?.avatar ? (
          <img src={user.avatar} alt="avatar" className="w-10 h-10 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700 shrink-0" />
        ) : (
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm">
            {user?.name?.charAt(0) || 'U'}
          </div>
        )}

        <form
          ref={formRef}
          action={async (formData) => {
            if (uploading) return;
            const content = postValue.trim();
            if (!content && !media && !showPoll) return;

            formData.set('content', content);
            if (media?.kind === 'image') formData.set('imageUrl', media.url);
            if (media?.kind === 'video') formData.set('videoUrl', media.url);
            // Posting inside a group scopes the post to it (server re-checks membership).
            if (groupId) formData.set('groupId', String(groupId));

            if (showPoll) {
              const validOptions = pollOptions.filter((o) => o.trim().length > 0);
              if (validOptions.length < 2) {
                setError('A poll must have at least 2 non-empty options.');
                return;
              }
              formData.set('hasPoll', 'true');
              formData.set('pollOption1', pollOptions[0] || '');
              formData.set('pollOption2', pollOptions[1] || '');
              if (pollOptions[2]) formData.set('pollOption3', pollOptions[2]);
              if (pollOptions[3]) formData.set('pollOption4', pollOptions[3]);
              formData.set('pollDurationDays', pollDuration);
            }

            await createPost(formData);
            formRef.current?.reset();
            setPostValue('');
            setMedia(null);
            setShowPoll(false);
            setPollOptions(['', '']);
            setError('');
          }}
          className="flex-1 flex flex-col"
        >
          <div className="relative">
            <input name="content" type="hidden" value={postValue} />
            <input
              type="text"
              value={postValue}
              onChange={(e) => setPostValue(e.target.value)}
              placeholder={`What's on your mind, ${user?.name ? user.name.split(' ')[0] : 'there'}?`}
              className="bg-gray-100 dark:bg-gray-700/70 text-gray-900 dark:text-gray-100 rounded-full py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowEmoji(!showEmoji)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-lg hover:scale-110 transition-transform p-1 rounded-full"
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
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {uploading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl px-3 py-2.5">
              <LoaderCircle className="w-4 h-4 animate-spin text-blue-500" />
              <span>Uploading media…</span>
            </div>
          )}

          {media && !uploading && (
            <div className="mt-3 relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              {media.kind === 'image' ? (
                <img src={media.url} alt="preview" className="max-h-48 w-full object-cover" />
              ) : (
                <video src={media.url} controls playsInline preload="metadata" className="max-h-60 w-full bg-black" />
              )}
              <button
                type="button"
                onClick={() => setMedia(null)}
                className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors"
                aria-label="Remove attached media"
              >
                ✕
              </button>
            </div>
          )}

          {/* Live Link Preview Unfurler */}
          {!media && !uploading && extractUrls(postValue).length > 0 && extractUrls(postValue)[0] !== dismissedUrl && (
            <div className="mt-2">
              <LinkPreviewCard
                url={extractUrls(postValue)[0]}
                onRemove={() => setDismissedUrl(extractUrls(postValue)[0])}
              />
            </div>
          )}

          {/* Poll Builder Card inside Composer */}
          {showPoll && (
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
                  <BarChart2 className="w-4 h-4" />
                  <span>Create a Poll</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPoll(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close poll creator"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}${idx < 2 ? ' (required)' : ' (optional)'}`}
                      required={idx < 2}
                      maxLength={50}
                      className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-gray-100"
                    />
                    {idx >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePollOption(idx)}
                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                        aria-label="Delete option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                {pollOptions.length < 4 && (
                  <button
                    type="button"
                    onClick={handleAddPollOption}
                    className="inline-flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add option</span>
                  </button>
                )}

                <div className="flex items-center space-x-2 ml-auto text-xs text-gray-500">
                  <span>Duration:</span>
                  <select
                    value={pollDuration}
                    onChange={(e) => setPollDuration(e.target.value)}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="1">24 Hours</option>
                    <option value="3">3 Days</option>
                    <option value="7">7 Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={uploading || (!postValue.trim() && !media && !showPoll)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-5 rounded-full shadow-sm transition-colors disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </form>
      </div>

      {/* Composer Action Buttons Bar */}
      <div className="border-t border-gray-100 dark:border-gray-700/60 mt-3 pt-3 flex items-center justify-between text-xs">
        {/* Photo / Video Button */}
        <div className="flex-1 relative">
          <button
            type="button"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="w-full flex items-center justify-center space-x-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 p-2 rounded-xl text-gray-600 dark:text-gray-300 font-semibold transition-colors"
            aria-haspopup="menu"
            aria-expanded={showAttachMenu}
          >
            <ImageIcon className="text-green-500 w-4 h-4 shrink-0" />
            <span className="truncate hidden min-[420px]:inline">Photo/video</span>
          </button>

          {showAttachMenu && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-30 overflow-hidden animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  fileRef.current?.click();
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 text-left"
              >
                <Upload className="w-4 h-4 text-blue-500" />
                <span>Upload from device</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  attachImageUrl();
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 text-left"
              >
                <Link2 className="w-4 h-4 text-green-500" />
                <span>Paste image URL</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  attachVideoUrl();
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 text-left"
              >
                <Video className="w-4 h-4 text-red-500" />
                <span>Paste video URL</span>
              </button>
            </div>
          )}
        </div>

        {/* Poll Button */}
        <div className="flex-1">
          <button
            type="button"
            onClick={() => setShowPoll(!showPoll)}
            className={`w-full flex items-center justify-center space-x-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 p-2 rounded-xl font-semibold transition-colors ${
              showPoll ? 'text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-900/30' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <BarChart2 className="text-blue-500 w-4 h-4 shrink-0" />
            <span className="truncate hidden min-[420px]:inline">Poll</span>
          </button>
        </div>

        {/* Story Upload Button */}
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
            className="w-full flex items-center justify-center space-x-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 p-2 rounded-xl text-gray-600 dark:text-gray-300 font-semibold disabled:opacity-60 transition-colors"
          >
            {storyUploading ? (
              <LoaderCircle className="w-4 h-4 text-purple-500 animate-spin shrink-0" />
            ) : (
              <Camera className="text-purple-500 w-4 h-4 shrink-0" />
            )}
            <span className="truncate hidden min-[420px]:inline">{storyUploading ? 'Adding…' : 'Story'}</span>
          </button>
        </div>

        {/* Feelings / Activity Button */}
        <button
          type="button"
          onClick={() => setShowEmoji(!showEmoji)}
          className="flex-1 flex items-center justify-center space-x-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 p-2 rounded-xl text-gray-600 dark:text-gray-300 font-semibold transition-colors"
        >
          <Smile className="text-yellow-500 w-4 h-4 shrink-0" />
          <span className="truncate hidden min-[420px]:inline">Feeling</span>
        </button>
      </div>

      {storyError && (
        <p className="text-xs text-red-600 text-center mt-2">{storyError}</p>
      )}
    </div>
  );
}
