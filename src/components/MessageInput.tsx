'use client';

import { useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import EmojiPicker from '@/components/EmojiPicker';
import UploadProgress from '@/components/UploadProgress';
import { sendMessage } from '@/app/actions';
import { uploadMediaFile, type UploadProgressInfo } from '@/lib/upload';

type Media = { kind: 'image' | 'video'; url: string } | null;

export default function MessageInput({ receiverId }: { receiverId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [messageValue, setMessageValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [media, setMedia] = useState<Media>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState('');

  const handleEmojiSelect = (emoji: string) => {
    setMessageValue((prev) => prev + emoji);
    setShowEmoji(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setUploading(true);
    setProgress({ percent: 0, loaded: 0, total: file.size });
    try {
      const uploaded = await uploadMediaFile(file, { onProgress: setProgress });
      setMedia({ kind: uploaded.kind, url: uploaded.url });
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const canSend = !uploading && (!!messageValue.trim() || !!media);

  return (
    <form
      action={async (formData) => {
        if (uploading) return;
        const content = messageValue.trim();
        if (!content && !media) return;
        formData.set('content', content);
        if (media?.kind === 'image') formData.set('imageUrl', media.url);
        if (media?.kind === 'video') formData.set('videoUrl', media.url);
        await sendMessage(receiverId, formData);
        setMessageValue('');
        setMedia(null);
        setError('');
      }}
      className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
    >
      {error && (
        <div className="mb-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {uploading && progress && (
        <UploadProgress
          info={progress}
          label={progress.total > 5 * 1024 * 1024 ? 'Uploading video…' : 'Uploading attachment…'}
        />
      )}

      {media && !uploading && (
        <div className="mb-2 relative inline-block max-w-xs">
          {media.kind === 'image' ? (
            <img src={media.url} alt="attachment preview" className="max-h-36 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
          ) : (
            <video src={media.url} controls playsInline preload="metadata" className="max-h-40 rounded-xl bg-black" />
          )}
          <button
            type="button"
            onClick={() => setMedia(null)}
            className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
            aria-label="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex space-x-2 relative">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Attach a photo or video"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-200 flex items-center justify-center transition-colors disabled:opacity-50"
          aria-label="Attach photo or video"
          title="Attach photo or video"
        >
          {uploading ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
        </button>
        <div className="flex-1 flex items-center gap-1 relative">
          <input
            type="hidden"
            name="content"
            value={messageValue}
          />
          <input
            type="text"
            value={messageValue}
            onChange={(e) => setMessageValue(e.target.value)}
            placeholder={media ? 'Add a caption…' : 'Type a message... 😎'}
            className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full p-1"
            aria-label="Emoji picker"
          >
            😊
          </button>
          {showEmoji && (
            <div className="absolute bottom-14 left-0 z-20">
              <EmojiPicker onSelect={handleEmojiSelect} />
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSend}
          className="bg-blue-600 text-white rounded-full p-3 w-11 h-11 flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40"
          aria-label="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.517 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
