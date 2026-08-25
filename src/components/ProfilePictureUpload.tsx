'use client';

import { useRef, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { updateAvatar } from '@/app/actions';
import { uploadMediaFile, type UploadProgressInfo } from '@/lib/upload';
import UploadProgress from './UploadProgress';

export default function ProfilePictureUpload({
  user,
  editable = false,
}: {
  user: any;
  editable?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string>(user.avatar || '');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your profile picture.');
      return;
    }

    setError('');
    setUploading(true);
    setProgress({ percent: 0, loaded: 0, total: file.size });
    try {
      const media = await uploadMediaFile(file, { onProgress: setProgress });
      if (media.kind !== 'image') throw new Error('Profile picture must be an image.');
      setAvatar(media.url); // optimistic preview
      await updateAvatar(media.url); // persist + revalidate
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="relative w-36 h-36">
      <div className="w-36 h-36 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden">
        {avatar ? (
          <img src={avatar} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-5xl text-white font-bold">
            {user.name.charAt(0)}
          </div>
        )}
      </div>

      {editable && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload profile picture"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Change profile picture"
            aria-label="Change profile picture"
            className="absolute bottom-1 right-1 w-10 h-10 bg-gray-200 hover:bg-gray-300 rounded-full border-2 border-white shadow flex items-center justify-center text-gray-700 transition-colors disabled:opacity-70"
          >
            {uploading ? (
              <LoaderCircle className="w-5 h-5 animate-spin" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </button>
          {uploading && progress && (
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-64">
              <UploadProgress info={progress} label="Uploading photo…" />
            </div>
          )}
          {error && (
            <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 w-64 text-center text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
