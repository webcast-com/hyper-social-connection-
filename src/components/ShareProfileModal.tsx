'use client';

import { useRouter } from 'next/navigation';
import ShareSheet from './ShareSheet';
import { defaultShareText, profilePath } from '@/lib/share';
import { recordProfileShare, shareProfileToFeed, shareProfileToMessage } from '@/app/share-actions';

type Profile = {
  id: number;
  name: string;
  username?: string | null;
  avatar?: string | null;
  bio?: string | null;
};

/**
 * Share a profile: the share sheet, with a profile in it. Sharing to a feed or
 * a group posts a profile card; sending it puts the link in a message; copied
 * links and hand-offs to other networks are counted on the profile.
 */
export default function ShareProfileModal({
  profile,
  canShareInternally = true,
  onClose,
}: {
  profile: Profile;
  canShareInternally?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <ShareSheet
      subject={{
        noun: 'profile',
        title: profile.name,
        subtitle: profile.username ? `@${profile.username}` : null,
        image: profile.avatar ?? null,
        imageShape: 'round',
        link: profilePath(profile.id, profile.username),
        text: defaultShareText(profile.name),
        feedHint: 'Posts a profile card your followers will see.',
      }}
      canShareInternally={canShareInternally}
      onClose={onClose}
      shareToFeed={(message, groupId) => shareProfileToFeed(profile.id, { message, groupId })}
      sendTo={(receiverId, note) => shareProfileToMessage(profile.id, receiverId, note)}
      record={(channel) => void recordProfileShare(profile.id, channel)}
      onShared={() => router.refresh()}
    />
  );
}
