import { createRoot } from 'react-dom/client';
import ParticipantGallery from '../../src/components/Call/ParticipantGallery';

export type LayoutScenario = {
  count: number;
  width: number;
  height: number;
  cameraOff: boolean;
  audioOnly: boolean;
  sharing: boolean;
  sharingIds: number[];
  speakerId: number;
  additionalSpeakers: number[];
  mutedIds: number[];
  disconnectedIds: number[];
  loading: boolean;
  badges: boolean;
  avatar: boolean;
};

declare global {
  interface Window {
    renderCallLayout: (scenario: Partial<LayoutScenario>) => void;
    savedCardVideos?: HTMLVideoElement[];
    savedCardStreams?: (MediaProvider | null)[];
    layoutIntervalCount: () => number;
    unmountCallLayout: () => void;
  }
}

// Count only fixture/app intervals, so speaker-mode cleanup is observable.
const activeIntervals = new Set<unknown>();
const originalSetInterval = window.setInterval.bind(window);
const originalClearInterval = window.clearInterval.bind(window);
window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
  const id = originalSetInterval(...args);
  activeIntervals.add(id);
  return id;
}) as typeof window.setInterval;
window.clearInterval = ((id) => {
  activeIntervals.delete(id);
  originalClearInterval(id);
}) as typeof window.clearInterval;
window.layoutIntervalCount = () => activeIntervals.size;

const root = createRoot(document.getElementById('root')!);
window.unmountCallLayout = () => root.unmount();
const streams = new Map<string, MediaStream>();
const audio = new AudioContext();
const oscillator = audio.createOscillator();
const gain = audio.createGain();
const destination = audio.createMediaStreamDestination();
gain.gain.value = 0.002;
oscillator.connect(gain).connect(destination);
oscillator.start();
void audio.resume();

function source(index: number): MediaStream {
  const formats = [[1280, 720], [720, 1280], [640, 480]];
  const [width, height] = formats[index % formats.length];
  const key = `${width}×${height}`;
  if (streams.has(key)) return streams.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const video = canvas.captureStream(10);
  let frame = 0;
  const draw = () => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#253b68');
    gradient.addColorStop(1, '#463266');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#9caed8';
    context.lineWidth = 8;
    context.strokeRect(10, 10, width - 20, height - 20);
    context.textAlign = 'center';
    context.fillStyle = '#ffffff';
    context.font = 'bold 40px Arial';
    context.fillText(`${width} × ${height}`, width / 2, height / 2);
    context.font = '24px Arial';
    context.fillText('Synthetic camera · layout test', width / 2, height / 2 + 42);
    context.fillStyle = frame++ % 2 ? '#8ba8e8' : '#c4b5fd';
    context.fillRect(20, 20, 24, 24);
  };
  draw();
  // Keep producing frames after the video elements attach, including portrait
  // streams. Network/peer simulation is deliberately outside these UI tests.
  setInterval(draw, 100);
  const stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  streams.set(key, stream);
  return stream;
}

const longName = 'Alexandra Wanjiru — Community events and accessibility coordinator (you)';
const names = [longName, 'Maya Patel', 'Jordan Kim', 'Sophie Chen', 'Marcus Lee', 'Amina Hassan'];
const avatar = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#4f46e5"/><text x="40" y="53" text-anchor="middle" fill="white" font-size="36">A</text></svg>')}`;
let scenario: LayoutScenario = { count: 3, width: 1118, height: 543, cameraOff: false, audioOnly: false, sharing: false, sharingIds: [], speakerId: 1, additionalSpeakers: [], mutedIds: [2, 4, 6, 8, 10, 12], disconnectedIds: [], loading: false, badges: false, avatar: false };

window.renderCallLayout = (update) => {
  scenario = { ...scenario, ...update };
  root.render(
    <div data-testid="layout-stage" style={{ width: scenario.width, height: scenario.height, display: 'flex', minWidth: 0, minHeight: 0 }}>
      <ParticipantGallery participants={Array.from({ length: scenario.count }, (_, index) => ({
        id: index + 1,
        isLocal: index === 0,
        label: names[index] || `Participant ${index + 1}`,
        stream: scenario.loading ? null : source(index),
        avatar: scenario.avatar ? avatar : null,
        mirror: index === 0,
        muted: index === 0,
        isMuted: scenario.mutedIds.includes(index + 1),
        isCameraOff: scenario.cameraOff,
        audioOnly: scenario.audioOnly,
        isSharing: (scenario.sharing && index === 0) || scenario.badges || scenario.sharingIds.includes(index + 1),
        handRaised: scenario.badges,
        speaking: index + 1 === scenario.speakerId || scenario.additionalSpeakers.includes(index + 1),
        connectionState: scenario.disconnectedIds.includes(index + 1) ? 'disconnected' : scenario.loading ? 'new' : 'connected',
      }))} />
    </div>,
  );
};
window.renderCallLayout({});
