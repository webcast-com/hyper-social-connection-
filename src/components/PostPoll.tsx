'use client';

import { useState } from 'react';
import { votePoll } from '@/app/actions';
import { CheckCircle2, BarChart2, Check, Clock } from 'lucide-react';

export type PollOption = {
  id: number;
  text: string;
  votesCount: number;
};

export type PollData = {
  id: number;
  question?: string | null;
  expiresAt?: Date | string | null;
  options: PollOption[];
  userVotedOptionId?: number | null;
  totalVotes?: number;
};

export default function PostPoll({
  poll,
  currentUser,
}: {
  poll: PollData;
  currentUser?: any;
}) {
  const [selectedOption, setSelectedOption] = useState<number | null>(
    poll.userVotedOptionId || null
  );
  const [votedOptionId, setVotedOptionId] = useState<number | null>(
    poll.userVotedOptionId || null
  );
  const [options, setOptions] = useState<PollOption[]>(poll.options || []);
  const [isVoting, setIsVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(!!poll.userVotedOptionId);

  // Capture the mount time once so render stays pure (lint: react-hooks/purity).
  const [mountedAt] = useState(() => Date.now());
  const isExpired = poll.expiresAt ? new Date(poll.expiresAt).getTime() < mountedAt : false;
  const showResults = hasVoted || isExpired;

  const totalVotes = options.reduce((sum, opt) => sum + (opt.votesCount || 0), 0);

  const handleVote = async (optionId: number) => {
    if (isVoting || isExpired) return;
    setIsVoting(true);

    const prevVoted = votedOptionId;
    setVotedOptionId(optionId);
    setHasVoted(true);

    // Optimistically update counts
    setOptions((prev) =>
      prev.map((opt) => {
        let count = opt.votesCount || 0;
        if (prevVoted === opt.id) count = Math.max(0, count - 1);
        if (opt.id === optionId) count += 1;
        return { ...opt, votesCount: count };
      })
    );

    try {
      await votePoll(poll.id, optionId);
    } catch {
      // Revert if failed
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="my-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700/80 select-none">
      <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-1.5 text-blue-600 dark:text-blue-400">
          <BarChart2 className="w-4 h-4" />
          <span>Interactive Poll</span>
        </div>
        <div className="flex items-center space-x-1">
          <Clock className="w-3.5 h-3.5" />
          <span>{isExpired ? 'Final Results' : 'Voting Open'}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {options.map((option) => {
          const isSelected = votedOptionId === option.id;
          const percentage = totalVotes > 0 ? Math.round(((option.votesCount || 0) / totalVotes) * 100) : 0;

          if (showResults) {
            return (
              <div
                key={option.id}
                onClick={() => !isExpired && handleVote(option.id)}
                className={`relative overflow-hidden rounded-xl border p-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-900/20 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                }`}
              >
                {/* Animated Percentage Bar Background */}
                <div
                  style={{ width: `${percentage}%` }}
                  className={`absolute top-0 bottom-0 left-0 transition-all duration-700 ease-out ${
                    isSelected
                      ? 'bg-blue-500/20 dark:bg-blue-600/30'
                      : 'bg-gray-200/60 dark:bg-gray-700/50'
                  }`}
                />

                <div className="relative z-10 flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2 font-medium text-gray-900 dark:text-gray-100 min-w-0 pr-2">
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 stroke-[3]" />
                    )}
                    <span className="truncate">{option.text}</span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-mono">
                      {option.votesCount || 0} {option.votesCount === 1 ? 'vote' : 'votes'}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white font-mono text-sm">
                      {percentage}%
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleVote(option.id)}
              disabled={isVoting}
              className="w-full text-left p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 bg-white dark:bg-gray-800 transition-all flex items-center justify-between group shadow-sm"
            >
              <span className="font-medium text-sm text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {option.text}
              </span>
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 group-hover:border-blue-500 transition-colors flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200/60 dark:border-gray-700/60">
        <span>
          {totalVotes} {totalVotes === 1 ? 'total vote' : 'total votes'}
        </span>
        {hasVoted && !isExpired && (
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            Click another option to change vote
          </span>
        )}
      </div>
    </div>
  );
}
