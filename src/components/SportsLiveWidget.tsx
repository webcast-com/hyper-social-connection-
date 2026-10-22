import { getSportsBoard } from '@/lib/sports';
import SportsScoresWidget from './SportsScoresWidget';

export default async function SportsLiveWidget() {
  return <SportsScoresWidget board={await getSportsBoard()} />;
}
