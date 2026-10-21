import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import CreatePost from '../../src/components/CreatePost';
import UploadProgress from '../../src/components/UploadProgress';
import Stories from '../../src/components/Stories';
import MessageInput from '../../src/components/MessageInput';
import AvatarField from '../../src/components/AvatarField';
import CoverPhotoField from '../../src/components/CoverPhotoField';
import GroupCoverField from '../../src/components/GroupCoverField';
import ProfilePictureUpload from '../../src/components/ProfilePictureUpload';
import CoverPhotoUpload from '../../src/components/CoverPhotoUpload';

export type Scenario = 'post' | 'composer-story' | 'progress' | 'stories' | 'message' | 'avatar-field' | 'cover-field' | 'group-cover' | 'profile' | 'cover' | 'profile-header';
declare global {
  interface Window { renderUploads: (scenario: Scenario, initial?: boolean) => void }
}
const image = '/uploads/old.png';
function Fixture({ scenario, initial }: { scenario: Scenario; initial: boolean }) {
  const [cover, setCover] = useState(initial ? image : '');
  const user = { id: 1, name: 'Test User', avatar: initial ? image : '', coverPhoto: initial ? image : '' };
  if (scenario === 'progress') return <div className="w-36"><UploadProgress info={{ percent: 62, loaded: 162529280, total: 262144000 }} label="Uploading video…" /></div>;
  if (scenario === 'post' || scenario === 'composer-story') return <CreatePost user={user} />;
  if (scenario === 'stories') return <Stories user={user} />;
  if (scenario === 'message') return <MessageInput receiverId={2} />;
  if (scenario === 'profile') return <><ProfilePictureUpload user={user} editable /><p data-testid="following-content">Profile name</p></>;
  if (scenario === 'cover') return <CoverPhotoUpload user={user} editable />;
  if (scenario === 'profile-header') return <><CoverPhotoUpload user={user} editable /><div className="px-4 -mt-16 relative z-10"><ProfilePictureUpload user={user} editable /><p>Profile name</p></div></>;
  return <form>
    {scenario === 'avatar-field' && <AvatarField fieldName="avatar" userName={user.name} initialUrl={initial ? image : ''} />}
    {scenario === 'cover-field' && <CoverPhotoField fieldName="coverPhoto" userName={user.name} initialUrl={initial ? image : ''} />}
    {scenario === 'group-cover' && <><GroupCoverField value={cover} onChange={setCover} /><input name="coverPhoto" type="hidden" value={cover} /></>}
  </form>;
}
window.uploadActions = [];
window.failUploadAction = false;
const root = createRoot(document.getElementById('root')!);
let key = 0;
window.renderUploads = (scenario, initial = false) => root.render(<Fixture key={++key} scenario={scenario} initial={initial} />);
