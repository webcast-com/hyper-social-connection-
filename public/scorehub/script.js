const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const toast = (message) => { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),2400); };

$('#menuToggle').addEventListener('click',()=>$('#mainNav').classList.toggle('open'));
$$('.main-nav a').forEach(a=>a.addEventListener('click',()=>$('#mainNav').classList.remove('open')));
$('#themeToggle').addEventListener('click',()=>{document.body.classList.toggle('light-mode');$('#themeToggle').textContent=document.body.classList.contains('light-mode')?'☀':'☾';});
$('#watchLive').addEventListener('click',()=>toast('Live streaming links will appear here when connected to a broadcaster.'));
$$('.star').forEach(star=>star.addEventListener('click',()=>{star.classList.toggle('favorited');star.textContent=star.classList.contains('favorited')?'★':'☆';star.closest('.match-card').dataset.favorite=star.classList.contains('favorited')?'yes':'no';toast(star.classList.contains('favorited')?'Match added to favorites':'Match removed from favorites');}));
$$('.match-actions button:not(.star)').forEach(btn=>btn.addEventListener('click',()=>toast('Match details selected — connect a live sports API for full data.')));
$$('.filter').forEach(btn=>{if(btn.id==='sortBtn')return;btn.addEventListener('click',()=>{ $$('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const filter=btn.dataset.filter;$$('.match-card').forEach(card=>{card.hidden=filter==='all'?false:filter==='favorites'?card.dataset.favorite!=='yes':card.dataset.status!==filter;});});});
$('#sortBtn').addEventListener('click',()=>toast('Filters: Live matches, competition, and kickoff time.'));
$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){const q=e.target.value.trim().toLowerCase();let found=0;$$('.match-card').forEach(card=>{const show=!q||card.textContent.toLowerCase().includes(q);card.hidden=!show;if(show)found++;});toast(q?(found?`${found} matching match${found===1?'':'es'} found`:'No matches found'):'Showing all matches');}});
$$('.league-tabs button').forEach(btn=>btn.addEventListener('click',()=>{$$('.league-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');toast(`${btn.textContent} standings selected — connect API data to update table.`);}));
$$('.sport-nav a').forEach(a=>a.addEventListener('click',()=>{ $$('.sport-nav a').forEach(b=>b.classList.remove('selected'));a.classList.add('selected'); }));
$$('.hero-arrow').forEach(btn=>btn.addEventListener('click',()=>toast('Featured match carousel is ready for live match data.')));
$$('.news-card').forEach(card=>card.addEventListener('click',()=>{card.classList.toggle('expanded');if(card.classList.contains('expanded'))toast(card.querySelector('h3').textContent);}));
