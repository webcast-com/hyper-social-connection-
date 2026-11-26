'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SportsPrediction } from '@/lib/sports';
import { predictionToTip } from '@/lib/goaledge-tip';
import { TipCard } from '@/components/goaledge/TipCard';
import { TipDetailPanel } from '@/components/goaledge/TipDetailPanel';
import { OddsCompareModal } from '@/components/goaledge/OddsCompareModal';
import { ShareModal } from '@/components/goaledge/ShareModal';
import { toast } from '@/lib/toast';

export default function SportsPredictionFeedCard({
  prediction,
}: {
  prediction: SportsPrediction;
  currentUser?: any;
}) {
  const tip = useMemo(() => predictionToTip(prediction), [prediction]);

  const [inSlip, setInSlip] = useState(false);
  const [tipVote, setTipVote] = useState<'up' | 'down' | undefined>(undefined);
  const [stakeCalcOpen, setStakeCalcOpen] = useState(false);
  const [calcStake, setCalcStake] = useState('100');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const onCopy = useCallback(async () => {
    const text = `${tip.homeTeam} vs ${tip.awayTeam} — ${tip.prediction} @ ${tip.odds} (${tip.confidence}% confidence)`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Tip copied');
    } catch {
      toast.error('Could not copy tip');
    }
  }, [tip]);

  const onVote = useCallback((dir: 'up' | 'down') => {
    setTipVote((prev) => (prev === dir ? undefined : dir));
  }, []);

  const betSlipIds = useMemo(() => new Set(inSlip ? [tip.id] : []), [inSlip, tip.id]);

  return (
    <>
      <TipCard
        tip={tip}
        onView={() => setDetailOpen(true)}
        onAddToSlip={() => setInSlip((prev) => !prev)}
        inSlip={inSlip}
        onCopy={() => void onCopy()}
        tipVote={tipVote}
        onVote={onVote}
        stakeCalcOpen={stakeCalcOpen}
        onToggleCalc={() => setStakeCalcOpen((prev) => !prev)}
        calcStake={calcStake}
        onCalcStakeChange={setCalcStake}
        isBookmarked={isBookmarked}
        onToggleBookmark={() => setIsBookmarked((prev) => !prev)}
        oddsComparison={tip.oddsComparison ?? null}
        onCompare={() => setCompareOpen(true)}
      />

      {detailOpen && (
        <TipDetailPanel
          tip={tip}
          betSlipIds={betSlipIds}
          isPremium={false}
          onClose={() => setDetailOpen(false)}
          onAddToSlip={() => setInSlip((prev) => !prev)}
          onCopy={() => void onCopy()}
          onShare={() => setShareOpen(true)}
          isBookmarked={isBookmarked}
          onToggleBookmark={() => setIsBookmarked((prev) => !prev)}
          onUpgrade={() => toast.info('Premium is not available in this build.')}
          allTips={[tip]}
        />
      )}

      <OddsCompareModal
        tip={compareOpen ? tip : null}
        onClose={() => setCompareOpen(false)}
        comparison={tip.oddsComparison ?? null}
      />

      <ShareModal
        open={shareOpen}
        tip={shareOpen ? tip : null}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
