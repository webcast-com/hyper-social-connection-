'use client';

import { useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ThumbsUp, MessageCircle, Share2, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import EmojiPicker from './EmojiPicker';
import { toggleLike, createComment } from '@/app/actions';

export default function Post({ post, currentUser }: { post: any, currentUser: any }) {
  const [showComments, setShowComments] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [commentValue, setCommentValue] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  
  const isLiked = post.likes.some((l: any) => l.userId === currentUser.id);

  const handleEmojiSelect = (emoji: string) => {
    setCommentValue(prev => prev + emoji);
    setShowEmoji(false);
  };

  return (
    <div className="bg-white rounded-lg shadow mb-4">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Link href={`/profile/${post.user.id}`}>
            {post.user.avatar ? (
              <img src={post.user.avatar} alt={post.user.name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                {post.user.name.charAt(0)}
              </div>
            )}
          </Link>
          <div>
            <Link href={`/profile/${post.user.id}`} className="font-semibold hover:underline">
              {post.user.name}
            </Link>
            <div className="text-xs text-gray-500" suppressHydrationWarning>
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </div>
          </div>
        </div>
        <button className="p-2 hover:bg-gray-100 rounded-full">
          <MoreHorizontal className="text-gray-500" />
        </button>
      </div>

      <div className="px-4 pb-2 text-gray-800 whitespace-pre-wrap break-words">{post.content}</div>
      {post.imageUrl && (
        <img src={post.imageUrl} alt="Post image" className="w-full object-contain max-h-[500px] border-y border-gray-100" />
      )}
      {post.videoUrl && (
        <video
          src={post.videoUrl}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-[500px] bg-black border-y border-gray-100"
        />
      )}

      <div className="px-4 py-2 flex items-center justify-between text-gray-500 text-sm border-b border-gray-200">
        <div className="flex items-center space-x-1">
          <div className="bg-blue-500 rounded-full p-1">
            <ThumbsUp className="w-3 h-3 text-white" />
          </div>
          <span>{post.likes.length}</span>
        </div>
        <div className="flex space-x-3 cursor-pointer" onClick={() => setShowComments(!showComments)}>
          <span>{post.comments.length} comments</span>
        </div>
      </div>

      <div className="px-2 py-1 flex items-center justify-between">
        <form action={toggleLike.bind(null, post.id)} className="flex-1">
          <button type="submit" className={`w-full flex items-center justify-center space-x-2 p-2 rounded-lg hover:bg-gray-100 font-semibold ${isLiked ? 'text-blue-600' : 'text-gray-500'}`}>
            <ThumbsUp className="w-5 h-5" />
            <span>Like</span>
          </button>
        </form>
        <button onClick={() => setShowComments(!showComments)} className="flex-1 flex items-center justify-center space-x-2 p-2 rounded-lg hover:bg-gray-100 text-gray-500 font-semibold">
          <MessageCircle className="w-5 h-5" />
          <span>Comment</span>
        </button>
        <button className="flex-1 flex items-center justify-center space-x-2 p-2 rounded-lg hover:bg-gray-100 text-gray-500 font-semibold">
          <Share2 className="w-5 h-5" />
          <span>Share</span>
        </button>
      </div>

      {showComments && (
        <div className="px-4 pb-4 border-t border-gray-200 pt-3">
          <div className="space-y-3 mb-3">
            {post.comments.map((comment: any) => (
              <div key={comment.id} className="flex space-x-2">
                <Link href={`/profile/${comment.user.id}`}>
                  {comment.user.avatar ? (
                    <img src={comment.user.avatar} alt={comment.user.name} className="w-8 h-8 rounded-full object-cover mt-1" />
                  ) : (
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mt-1 text-sm">
                      {comment.user.name.charAt(0)}
                    </div>
                  )}
                </Link>
                <div className="min-w-0">
                  <div className="bg-gray-100 rounded-2xl px-3 py-2">
                    <Link href={`/profile/${comment.user.id}`} className="font-semibold text-sm hover:underline">
                      {comment.user.name}
                    </Link>
                    <div className="text-sm break-words">{comment.content}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 ml-2" suppressHydrationWarning>
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex space-x-2 relative">
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                {currentUser.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 relative">
              <form 
                ref={formRef}
                action={async (formData) => {
                  formData.set('content', commentValue || formData.get('content') as string);
                  await createComment(post.id, formData);
                  formRef.current?.reset();
                  setCommentValue('');
                }}
                className="flex-1 flex items-center gap-1"
              >
                <input
                  name="content"
                  type="hidden"
                  value={commentValue}
                />
                <input
                  type="text"
                  value={commentValue}
                  onChange={(e) => setCommentValue(e.target.value)}
                  placeholder="Write a comment..."
                  className="bg-gray-100 rounded-full py-2 px-4 focus:outline-none w-full text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowEmoji(!showEmoji)}
                  className="text-xl hover:bg-gray-200 rounded-full p-1"
                  aria-label="Emoji picker"
                >
                  😊
                </button>
              </form>
              {showEmoji && (
                <div className="absolute bottom-12 left-0 z-20">
                  <EmojiPicker onSelect={handleEmojiSelect} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
