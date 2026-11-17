/**
 * The picture an installed Hyper app opens on.
 *
 * A phone's own launch screen can only show the app icon, so this takes over
 * the moment the page is there: the community-and-scores artwork with the
 * wordmark and tagline, for a little over a second, then it fades out.
 *
 * It is `display: none` unless `LAUNCH_SCREEN_SCRIPT` marks the document, which
 * it does once per launch and only for an installed app - a browser tab never
 * shows it and never downloads the artwork (both images are CSS backgrounds,
 * which are not fetched for an element that is not displayed).
 */
export default function LaunchScreen() {
  return (
    <div className="launch-screen" aria-hidden="true">
      <div className="launch-screen__art" style={{ backgroundImage: 'url(/hyper-community.webp)' }} />
      <div className="launch-screen__shade" />
      <div className="launch-screen__copy">
        <div className="launch-screen__logo" style={{ backgroundImage: 'url(/logo-wordmark-white.svg)' }} />
        <p className="launch-screen__tagline">
          The Sports Community Platform for <span>Athletes, Fans, Clubs &amp; Organizers</span>
        </p>
      </div>
    </div>
  );
}

/** How long the mark stays on the document: the hold plus the fade in globals.css. */
const LAUNCH_SCREEN_MS = 2100;

/**
 * Runs in <head>, before the first paint. An installed app (standalone,
 * fullscreen or minimal-ui; `navigator.standalone` on iOS) gets the launch
 * screen once per launch: `sessionStorage` lasts as long as the app's window,
 * so a refresh or a full-page navigation does not replay it.
 */
export const LAUNCH_SCREEN_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia,a=navigator.standalone===true||(m&&(m('(display-mode: standalone)').matches||m('(display-mode: fullscreen)').matches||m('(display-mode: minimal-ui)').matches));if(!a||sessionStorage.getItem('hyper:launched'))return;sessionStorage.setItem('hyper:launched','1');d.setAttribute('data-launch','');setTimeout(function(){d.removeAttribute('data-launch')},${LAUNCH_SCREEN_MS})}catch(e){}})();`;
