'use client';

import { useRef, useState } from 'react';
import { Clapperboard, ImagePlus, LoaderCircle, Plus, X } from 'lucide-react';
import { createStory, createStoryFromHighlight, getStoryHighlightClips } from '@/app/actions';
import { uploadMediaFile, type UploadProgressInfo } from '@/lib/upload';
import UploadProgress from './UploadProgress';
import StoryViewer from '@/components/StoryViewer';

type StoryClip = {
  id: string;
  eventId: string;
  title: string;
  thumbnail: string | null;
  mp4: string | null;
  duration: number | null;
  leagueName: string;
  eventName: string;
};

const mmss = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Stories row — create a photo story from device upload, or a video story from
 * a highlights-page clip under 1 minute. Clicking a story opens StoryViewer.
 */
export default function Stories({ user, stories = [] }: { user?: any; stories?: any[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState('');
  const [activeStory, setActiveStory] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [clips, setClips] = useState<StoryClip[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const [creatingClipId, setCreatingClipId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your story.');
      return;
    }

    setError('');
    setUploading(true);
    setProgress({ percent: 0, loaded: 0, total: file.size });
    try {
      const media = await uploadMediaFile(file, { onProgress: setProgress });
      if (media.kind !== 'image') throw new Error('Story must be an image.');
      await createStory(media.url);
      setShowPicker(false);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const openHighlights = async () => {
    setShowPicker(false);
    setShowHighlights(true);
    setLoadingClips(true);
    setError('');
    try {
      const result = await getStoryHighlightClips();
      setClips(Array.isArray(result) ? (result as StoryClip[]) : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load highlight clips.');
      setClips([]);
    } finally {
      setLoadingClips(false);
    }
  };

  const pickHighlight = async (clip: StoryClip) => {
    if (creatingClipId) return;
    setCreatingClipId(clip.id);
    setError('');
    try {
      const result = await createStoryFromHighlight(clip.id);
      if (!result?.ok) throw new Error(result?.error || 'Could not create story.');
      setShowHighlights(false);
    } catch (err: any) {
      setError(err?.message || 'Could not create story from highlight.');
    } finally {
      setCreatingClipId(null);
    }
  };

  return (
    <div>
      <div className="flex space-x-2 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory overscroll-x-contain">
        {user ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Upload story image"
            />
            <button
              type="button"
              onClick={() => { setError(''); setShowPicker(true); }}
              disabled={uploading || !!creatingClipId}
              aria-busy={uploading || !!creatingClipId}
              aria-label="Create story"
              className="relative h-44 w-24 sm:h-48 sm:w-28 min-w-[6rem] sm:min-w-[7rem] bg-white dark:bg-gray-800 rounded-2xl shadow-sm cursor-pointer overflow-hidden group snap-start shrink-0 border border-gray-100 dark:border-gray-700/60 transition-transform active:scale-95 disabled:opacity-70 disabled:cursor-wait"
            >
              <div className="h-3/4 overflow-hidden">
                <img
                  src={user.avatar || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167'}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  alt="My Avatar"
                />
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 p-1 rounded-full border-4 border-white dark:border-gray-800">
                {uploading || creatingClipId ? (
                  <LoaderCircle className="text-white w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="text-white w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </div>
              <div className="h-1/4 flex items-end justify-center pb-1">
                <span className="text-[11px] sm:text-xs font-bold text-gray-800 dark:text-gray-200 truncate px-1">
                  {uploading ? 'Uploading…' : creatingClipId ? 'Creating…' : 'Create story'}
                </span>
              </div>
            </button>
          </>
        ) : null}

        {stories.map((story, idx) => (
          <div
            key={story.id}
            onClick={() => setActiveStory(idx)}
            role="button"
            tabIndex={0}
            aria-label={`View story by ${story.user?.name || 'user'}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveStory(idx); } }}
            className="relative h-44 w-24 sm:h-48 sm:w-28 min-w-[6rem] sm:min-w-[7rem] rounded-2xl shadow-sm cursor-pointer overflow-hidden group snap-start shrink-0 border border-gray-100 dark:border-gray-700/60 transition-transform active:scale-95"
          >
            <img
              src={story.imageUrl}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              alt="Story"
            />
            {story.videoUrl ? (
              <div className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                Video
              </div>
            ) : null}
            <div className="absolute top-2 left-2 border-4 border-blue-600 rounded-full w-10 h-10 overflow-hidden">
              <img src={story.user?.avatar || ''} className="w-full h-full object-cover" alt={story.user?.name} />
            </div>
            <div className="absolute bottom-2 left-2 right-2">
              <span className="text-white text-[11px] sm:text-xs font-bold drop-shadow-md truncate block">{story.user?.name}</span>
            </div>
          </div>
        ))}
      </div>

      {uploading && progress && <UploadProgress info={progress} label="Uploading story…" />}
      {error && <p role="alert" className="text-sm text-red-600 mb-2 -mt-1">{error}</p>}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Create story</h2>
              <button type="button" onClick={() => setShowPicker(false)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { setShowPicker(false); fileRef.current?.click(); }}
                className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <ImagePlus className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">Photo story</div>
                  <div className="text-xs text-gray-500">Upload an image from your device</div>
                </div>
              </button>
              <button
                type="button"
                onClick={openHighlights}
                className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Clapperboard className="w-5 h-5 text-rose-600" />
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">Highlight clip</div>
                  <div className="text-xs text-gray-500">Use a highlights page video under 1 minute</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showHighlights && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl border border-gray-200 dark:border-gray-700 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Highlight clips under 1 minute</h2>
                <p className="text-xs text-gray-500">From your highlights page clips.</p>
              </div>
              <button type="button" onClick={() => setShowHighlights(false)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 min-h-0">
              {loadingClips ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <LoaderCircle className="w-4 h-4 animate-spin mr-2" /> Loading clips…
                </div>
              ) : clips.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No highlight clips under 1 minute are available right now.
                </div>
              ) : clips.map((clip) => (
                <button
                  key={`${clip.eventId}-${clip.id}`}
                  type="button"
                  disabled={!!creatingClipId}
                  onClick={() => pickHighlight(clip)}
                  className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-60"
                >
                  {clip.thumbnail ? (
                    <img src={clip.thumbnail} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0 bg-black" />
                  ) : (
                    <div className="w-24 h-14 rounded-lg bg-gray-200 dark:bg-gray-700 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{clip.title}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {clip.leagueName}{mmss(clip.duration) ? ` · ${mmss(clip.duration)}` : ''}
                    </div>
                  </div>
                  {creatingClipId === clip.id ? (
                    <LoaderCircle className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                  ) : (
                    <span className="text-xs font-semibold text-blue-600 shrink-0">Use</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeStory !== null && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          initialIndex={activeStory}
          onClose={() => setActiveStory(null)}
        />
      )}
    </div>
  );
}
