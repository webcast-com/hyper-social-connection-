'use client';

import ShareSheet, { type ShareSubject } from './ShareSheet';
import { absoluteShareUrl, postPath, messageTextFromPost } from '@/lib/share';
import {
  shareContentToFeed,
  shareContentToMessage,
  sharePostToFeed,
  sharePostToMessage,
} from '@/app/share-actions';

/**
 * The share sheet for the things that are not a profile. One sheet, the one the
 * profile page opens (`ShareSheet`); these only say what is being shared and how
 * it reaches a feed or an inbox.
 */

const snippet = (text: string, max = 120) => {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** What the sheet shows for a member's post. */
export function postShareSubject(post: any): ShareSubject {
  const author = post.user?.name || 'Someone';
  // A bare repost says nothing of its own, so the sheet shows what it carries.
  const own = post.content && post.content !== '🔁 Reposted' ? post.content : '';
  const text = snippet(own || post.repostOf?.content || '');
  const picture = post.imageUrl || post.repostOf?.imageUrl || null;
  return {
    noun: 'post',
    title: text || `${author}'s post`,
    subtitle: `${author} · post`,
    image: picture || post.user?.avatar || null,
    imageShape: picture ? 'square' : 'round',
    link: postPath(post.id),
    text: `Check out this post by ${author} on Hyper`,
    feedHint: 'Reposts it to your followers, with your note above it if you add one.',
  };
}

/**
 * Share a member's post. To a feed or a group it is a repost — the original
 * shown inside yours, its author told — which is what the post's old share
 * dialog did; sent to someone, it is the post's link in a message.
 */
export function SharePostSheet({
  post,
  canShareInternally = true,
  onClose,
}: {
  post: any;
  canShareInternally?: boolean;
  onClose: () => void;
}) {
  return (
    <ShareSheet
      subject={postShareSubject(post)}
      canShareInternally={canShareInternally}
      onClose={onClose}
      shareToFeed={(message, groupId) => sharePostToFeed(post.id, { message, groupId })}
      sendTo={(receiverId, note) => sharePostToMessage(post.id, receiverId, note)}
    />
  );
}

/**
 * Share something that has no post of its own — a league clip, a match in the
 * feed, a prediction. `compose` writes the post about it from the member's note,
 * the way each card's own Share always did; sent to someone, that same text
 * goes as a message, with the link added when the text does not already carry it.
 */
export function ShareContentSheet({
  subject,
  compose,
  canShareInternally = true,
  onClose,
}: {
  subject: ShareSubject;
  compose: (note: string) => string;
  canShareInternally?: boolean;
  onClose: () => void;
}) {
  const withLink = (text: string) => {
    const link = absoluteShareUrl(typeof window === 'undefined' ? '' : window.location.origin, subject.link);
    const body = messageTextFromPost(text);
    return body.includes(link) ? body : `${body}\n${link}`;
  };
  return (
    <ShareSheet
      subject={subject}
      canShareInternally={canShareInternally}
      onClose={onClose}
      shareToFeed={(message, groupId) => shareContentToFeed(compose(message), { groupId })}
      sendTo={(receiverId, note) => shareContentToMessage(receiverId, withLink(compose(note)))}
    />
  );
}
