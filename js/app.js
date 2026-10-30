const { createClient } = supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let animes = [], categories = [], currentEditId = null, currentUser = null;
let isSaving = false, authMode = 'login', viewMode = 'grid', favOnly = false;
let searchTimer = null;

const STATUS_LABEL = {
  watching: 'Viendo', completed: 'Completado', on_hold: 'En pausa',
  dropped: 'Abandonado', plan_to_watch: 'Planeo ver'
};
const STATUS_COLOR = {
  watching: 'bg-green-500/80', completed: 'bg-blue-500/80', on_hold: 'bg-yellow-500/80',
  dropped: 'bg-red-500/70', plan_to_watch: 'bg-gray-500/80'
};
const GENRE_MAP = {
  Action:'Acción', Adventure:'Acción', Comedy:'Comedia', Drama:'Seinen', Ecchi:'Hentai',
  Erotica:'Hentai', Fantasy:'Isekai', Hentai:'Hentai', Horror:'Horror', Mecha:'Mecha',
  Romance:'Romance', School:'Slice of Life', 'Sci-Fi':'Mecha', 'Slice of Life':'Slice of Life',
  Sports:'Deportes', Supernatural:'Horror', Suspense:'Seinen'
};

function toast(msg, icon='✅') {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = icon;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}
function esc(s){ if(s==null)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function stars(r){ if(!r||r<=0)return''; const f=Math.min(5,Math.round(Number(r)/2)); return '★'.repeat(f)+'☆'.repeat(5-f); }
function getName(){ const m=currentUser?.user_metadata||{}; return m.display_name||m.full_name||m.name||null; }
function updateGreeting(){ const el=document.getElementById('userGreeting'); if(el) el.textContent = getName() ? `Hola, ${getName()}` : 'Hola'; }
function pickCategory(genres, isH) {
  if (isH) return 'Hentai';
  if (!genres?.length) return 'Sin categoría';
  for (const g of genres) { const m = GENRE_MAP[g.name||g]; if (m) return m; }
  return 'Otros';
}
function openM(id){ document.getElementById(id).classList.add('open'); }
function closeM(id){ document.getElementById(id).classList.remove('open'); }

// ===== Auth =====
function showAuth(){ document.getElementById('authScreen').classList.remove('hidden'); document.getElementById('app').classList.add('hidden'); }
function showApp(){ document.getElementById('authScreen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); updateGreeting(); }

function setAuthMode(mode){
  authMode=mode;
  const L=document.getElementById('tabLogin'), S=document.getElementById('tabSignup'), B=document.getElementById('authSubmit'), N=document.getElementById('nameField');
  if(mode==='login'){ L.className='flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-purple/20 text-accent-purple border border-accent-purple/30'; S.className='flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition'; B.textContent='Entrar'; N.classList.add('hidden'); }
  else { S.className='flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-purple/20 text-accent-purple border border-accent-purple/30'; L.className='flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition'; B.textContent='Crear cuenta'; N.classList.remove('hidden'); }
  document.getElementById('authError').classList.add('hidden');
}
document.getElementById('tabLogin').onclick=()=>setAuthMode('login');
document.getElementById('tabSignup').onclick=()=>setAuthMode('signup');

document.getElementById('authForm').onsubmit=async e=>{
  e.preventDefault();
  const email=document.getElementById('authEmail').value.trim();
  const password=document.getElementById('authPassword').value;
  const name=document.getElementById('authName')?.value.trim()||'';
  const err=document.getElementById('authError'), btn=document.getElementById('authSubmit');
  err.classList.add('hidden'); btn.disabled=true; btn.textContent='Espera...';
  try{
    if(authMode==='login'){
      const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error)throw error; currentUser=data.user;
    } else {
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name||email.split('@')[0]}}});
      if(error)throw error;
      if(data.user&&!data.session){ err.textContent='Revisa tu email o desactiva confirmación en Supabase Auth → Settings'; err.classList.remove('hidden'); btn.disabled=false; btn.textContent='Crear cuenta'; return; }
      currentUser=data.user;
    }
    showApp(); await loadData();
  }catch(ex){ err.textContent=ex.message||'Error'; err.classList.remove('hidden'); }
  finally{ btn.disabled=false; btn.textContent=authMode==='login'?'Entrar':'Crear cuenta'; }
};

document.getElementById('btnLogout').onclick=async()=>{ if(!confirm('¿Cerrar sesión?'))return; await sb.auth.signOut(); currentUser=null; animes=[]; showAuth(); };

// Profile
document.getElementById('btnProfile').onclick=()=>{ document.getElementById('profileName').value=getName()||''; openM('profileModal'); };
document.getElementById('profileClose').onclick=()=>closeM('profileModal');
document.getElementById('btnSaveProfile').onclick=async()=>{
  const name=document.getElementById('profileName').value.trim(); if(!name)return toast('Escribe un nombre','❌');
  const {data,error}=await sb.auth.updateUser({data:{display_name:name}}); if(error)return toast(error.message,'❌');
  currentUser=data.user; updateGreeting(); closeM('profileModal'); toast('Nombre actualizado');
};

// Theme
document.getElementById('btnTheme').onclick=()=>{
  const html=document.documentElement;
  const dark=html.classList.toggle('dark');
  localStorage.setItem('theme', dark?'dark':'light');
  document.getElementById('btnTheme').textContent=dark?'🌙':'☀️';
  document.body.classList.toggle('bg-dark-950', dark);
  document.body.classList.toggle('bg-gray-100', !dark);
  document.body.classList.toggle('text-gray-100', dark);
  document.body.classList.toggle('text-gray-900', !dark);
};
(function initTheme(){ const t=localStorage.getItem('theme')||'dark'; if(t==='light'){ document.documentElement.classList.remove('dark'); document.getElementById('btnTheme').textContent='☀️'; document.body.classList.remove('bg-dark-950','text-gray-100'); document.body.classList.add('bg-gray-100','text-gray-900'); } })();

// ===== Jikan =====
async function fetchJikan(title){
  try{
    const res=await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=5`,{headers:{'User-Agent':'AnimeTracker/3.0'}});
    if(!res.ok)return null;
    const data=await res.json(); if(!data.data?.length)return null;
    const q=title.toLowerCase();
    let best=data.data[0];
    for(const a of data.data){ const t=(a.title||'').toLowerCase(), te=(a.title_english||'').toLowerCase(); if(t===q||te===q||t.includes(q)||q.includes(t.split(' ')[0])){best=a;break;} }
    const genres=[...(best.genres||[]),...(best.themes||[]),...(best.demographics||[])];
    const isH=genres.some(g=>['Hentai','Erotica'].includes(g.name))||(best.rating||'').toLowerCase().includes('rx');
    return {
      cover_url: best.images?.jpg?.large_image_url||best.images?.jpg?.image_url||null,
      mal_id: best.mal_id, synopsis: best.synopsis?.slice(0,600)||null, score: best.score,
      episodes: best.episodes, year: best.year||best.aired?.prop?.from?.year||null, type: best.type,
      category: pickCategory(genres,isH), is_hentai: isH,
      title_english: best.title_english||null, title_japanese: best.title_japanese||null,
      raw: best
    };
  }catch{return null;}
}

async function searchJikanSuggest(q){
  if(!q||q.length<3)return[];
  try{
    const res=await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=6`,{headers:{'User-Agent':'AnimeTracker/3.0'}});
    if(!res.ok)return[];
    const data=await res.json();
    return (data.data||[]).map(a=>({
      title:a.title, title_english:a.title_english, cover:a.images?.jpg?.image_url,
      score:a.score, year:a.year, type:a.type, mal_id:a.mal_id
    }));
  }catch{return[];}
}

// ===== Data =====
async function loadData(){
  if(!currentUser)return;
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('animeGrid').innerHTML='';
  document.getElementById('animeList').innerHTML='';
  try{
    const [ar,cr]=await Promise.all([
      sb.from('animes').select('*').eq('user_id',currentUser.id).order('title',{ascending:true}),
      sb.from('categories').select('*').order('name',{ascending:true})
    ]);
    if(ar.error)throw ar.error; if(cr.error)throw cr.error;
    animes=ar.data||[]; categories=cr.data||[];
    renderCategories(); renderAll();
  }catch(err){
    document.getElementById('loadingState').innerHTML=`<p class="text-red-400">${esc(err.message)}</p><p class="text-gray-500 text-xs mt-2">Ejecuta supabase-schema-v2.sql y v3.sql</p>`;
  }
}

async function saveAnime(p){
  let extra={};
  if(!p.id){
    const j=await fetchJikan(p.title);
    if(j){
      extra={cover_url:j.cover_url,mal_id:j.mal_id,synopsis:j.synopsis,score:j.score,episodes:j.episodes,year:j.year,type:j.type,title_english:j.title_english,title_japanese:j.title_japanese};
      if(!p.category||p.category==='Sin categoría')extra.category=j.category;
      if(j.is_hentai)extra.is_hentai=true;
    }
  }
  const row={
    title:p.title, category:extra.category||p.category||'Sin categoría',
    is_hentai:!!p.is_hentai, rating:Number(p.rating)||0, notes:p.notes||null,
    status:p.status||'completed', is_favorite:!!p.is_favorite,
    episodes_watched:Number(p.episodes_watched)||0, finished_at:p.finished_at||null,
    tags:p.tags||'', user_id:currentUser.id, ...extra
  };
  if(p.id){
    // don't overwrite cover on edit unless missing logic
    delete row.cover_url; delete row.mal_id; delete row.synopsis; delete row.score;
    delete row.episodes; delete row.year; delete row.type; delete row.title_english; delete row.title_japanese;
    if(extra.category && (!p.category||p.category==='Sin categoría')) row.category=extra.category;
    const {error}=await sb.from('animes').update(row).eq('id',p.id).eq('user_id',currentUser.id); if(error)throw error;
  } else {
    const {error}=await sb.from('animes').insert(row); if(error){ if(error.code==='23505')throw new Error('Ya existe ese título'); throw error; }
  }
}

async function deleteAnime(id){
  const {error}=await sb.from('animes').delete().eq('id',id).eq('user_id',currentUser.id); if(error)throw error;
}

async function toggleFavorite(id){
  const a=animes.find(x=>x.id===id); if(!a)return;
  const {error}=await sb.from('animes').update({is_favorite:!a.is_favorite}).eq('id',id).eq('user_id',currentUser.id);
  if(error)return toast(error.message,'❌');
  a.is_favorite=!a.is_favorite; renderAll(); toast(a.is_favorite?'Añadido a favoritos':'Quitado de favoritos','★');
}

async function refreshMissing(){
  const missing=animes.filter(a=>!a.cover_url||!a.category||a.category==='Sin categoría').slice(0,12);
  if(!missing.length)return toast('Todo actualizado','✨');
  toast(`Enriqueciendo ${missing.length}...`,'🖼️');
  let n=0;
  for(const a of missing){
    await new Promise(r=>setTimeout(r,500));
    const j=await fetchJikan(a.title); if(!j)continue;
    const patch={};
    if(!a.cover_url&&j.cover_url)patch.cover_url=j.cover_url;
    if(j.mal_id)patch.mal_id=j.mal_id;
    if(!a.synopsis&&j.synopsis)patch.synopsis=j.synopsis;
    if(a.score==null&&j.score!=null)patch.score=j.score;
    if(!a.episodes&&j.episodes)patch.episodes=j.episodes;
    if(!a.year&&j.year)patch.year=j.year;
    if(!a.type&&j.type)patch.type=j.type;
    if((!a.category||a.category==='Sin categoría')&&j.category)patch.category=j.category;
    if(j.is_hentai&&!a.is_hentai)patch.is_hentai=true;
    if(j.title_english)patch.title_english=j.title_english;
    if(j.title_japanese)patch.title_japanese=j.title_japanese;
    if(Object.keys(patch).length){ const {error}=await sb.from('animes').update(patch).eq('id',a.id).eq('user_id',currentUser.id); if(!error)n++; }
  }
  toast(`Actualizados ${n}`,'✨'); await loadData();
}

// ===== Import / Export =====
async function doImportText(){
  const text=document.getElementById('importText').value.trim(); if(!text)return toast('Pega títulos','❌');
  // JSON?
  if(text.startsWith('[')||text.startsWith('{')){
    try{
      const data=JSON.parse(text);
      const list=Array.isArray(data)?data:(data.animes||[]);
      return await importJsonList(list);
    }catch{ toast('JSON inválido','❌'); return; }
  }
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const cat=document.getElementById('importCategory').value||'Sin categoría';
  const status=document.getElementById('importStatus').value||'completed';
  const prog=document.getElementById('importProgress'), st=document.getElementById('importStatusText'), bar=document.getElementById('importBar'), btn=document.getElementById('btnDoImport');
  prog.classList.remove('hidden'); btn.disabled=true;
  let ok=0,skip=0,fail=0;
  for(let i=0;i<lines.length;i++){
    let title=lines[i].replace(/^\d+[:.\-\)]\s*/,'').trim();
    let isH=/\([hH]\)\s*$/.test(title); if(isH)title=title.replace(/\s*\([hH]\)\s*$/,'').trim();
    if(!title)continue;
    st.textContent=`${i+1}/${lines.length}: ${title.slice(0,30)}`; bar.style.width=`${((i+1)/lines.length)*100}%`;
    try{
      if(animes.some(a=>a.title.toLowerCase()===title.toLowerCase())){skip++;continue;}
      const {error}=await sb.from('animes').insert({title,category:isH?'Hentai':cat,is_hentai:isH,status,rating:0,user_id:currentUser.id});
      if(error){ if(error.code==='23505')skip++; else fail++; } else ok++;
    }catch{fail++;}
  }
  btn.disabled=false; prog.classList.add('hidden');
  toast(`OK ${ok} · Skip ${skip} · Err ${fail}`,'📥'); closeM('importModal'); document.getElementById('importText').value=''; await loadData();
  if(ok)toast('Pulsa 🖼️ para portadas y categorías','💡');
}

async function importJsonList(list){
  let ok=0,skip=0;
  for(const item of list){
    const title=item.title; if(!title)continue;
    if(animes.some(a=>a.title.toLowerCase()===title.toLowerCase())){skip++;continue;}
    const row={
      title, category:item.category||'Sin categoría', is_hentai:!!item.is_hentai, rating:item.rating||0,
      notes:item.notes||null, status:item.status||'completed', is_favorite:!!item.is_favorite,
      episodes_watched:item.episodes_watched||0, finished_at:item.finished_at||null, tags:item.tags||'',
      cover_url:item.cover_url||null, mal_id:item.mal_id||null, synopsis:item.synopsis||null,
      score:item.score||null, episodes:item.episodes||null, year:item.year||null, type:item.type||null,
      user_id:currentUser.id
    };
    const {error}=await sb.from('animes').insert(row);
    if(!error)ok++; else skip++;
  }
  toast(`Importados ${ok}, omitidos ${skip}`,'📥'); closeM('importModal'); await loadData();
}

function exportJson(){
  const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(), animes},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`anime-tracker-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  toast('Backup descargado','📤');
}

// ===== Render =====
function renderCategories(){
  const f=document.getElementById('categoryFilter'), form=document.getElementById('formCategory'), imp=document.getElementById('importCategory');
  const cur=f.value; f.innerHTML='<option value="">Categoría</option>'; form.innerHTML=''; imp.innerHTML='';
  categories.forEach(c=>{ const l=`${c.icon||''} ${c.name}`.trim(); f.innerHTML+=`<option value="${esc(c.name)}">${esc(l)}</option>`; form.innerHTML+=`<option value="${esc(c.name)}">${esc(l)}</option>`; imp.innerHTML+=`<option value="${esc(c.name)}">${esc(l)}</option>`; });
  if(cur)f.value=cur;
}

function getFiltered(){
  const q=document.getElementById('searchInput').value.toLowerCase().trim();
  const cat=document.getElementById('categoryFilter').value;
  const st=document.getElementById('statusFilter').value;
  const h=document.getElementById('hentaiFilter').value;
  const sort=document.getElementById('sortBy').value;
  let list=animes.filter(a=>{
    if(q&&!a.title.toLowerCase().includes(q)&&!(a.title_english||'').toLowerCase().includes(q)&&!(a.tags||'').toLowerCase().includes(q))return false;
    if(cat&&a.category!==cat)return false;
    if(st&&(a.status||'completed')!==st)return false;
    if(h==='true'&&!a.is_hentai)return false;
    if(h==='false'&&a.is_hentai)return false;
    if(favOnly&&!a.is_favorite)return false;
    return true;
  });
  list.sort((a,b)=>{
    if(sort==='rating')return(b.rating||0)-(a.rating||0);
    if(sort==='score')return(b.score||0)-(a.score||0);
    if(sort==='year')return(b.year||0)-(a.year||0);
    if(sort==='created_at')return new Date(b.created_at||0)-new Date(a.created_at||0);
    if(sort==='status')return (a.status||'').localeCompare(b.status||'');
    return (a.title||'').localeCompare(b.title||'','es',{sensitivity:'base'});
  });
  return list;
}

function renderStatsBar(){
  document.getElementById('statTotal').textContent=animes.length;
  document.getElementById('statWatching').textContent=animes.filter(a=>(a.status||'')==='watching').length;
  document.getElementById('statCompleted').textContent=animes.filter(a=>(a.status||'completed')==='completed').length;
  document.getElementById('statFav').textContent=animes.filter(a=>a.is_favorite).length;
  document.getElementById('statHentai').textContent=animes.filter(a=>a.is_hentai).length;
  const eps=animes.reduce((s,a)=>s+(Number(a.episodes_watched)||Number(a.episodes)||0),0);
  document.getElementById('statHours').textContent=Math.round(eps*24/60)+'h';
}

function renderContinue(){
  const watching=animes.filter(a=>(a.status||'')==='watching');
  const sec=document.getElementById('continueSection'), row=document.getElementById('continueRow');
  if(!watching.length){ sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  row.innerHTML=watching.map(a=>`
    <div class="shrink-0 w-28 cursor-pointer group" data-id="${a.id}">
      <div class="aspect-[2/3] rounded-lg overflow-hidden bg-dark-700 border border-dark-600 relative">
        ${a.cover_url?`<img src="${esc(a.cover_url)}" class="w-full h-full object-cover" loading="lazy"/>`:'<div class="flex items-center justify-center h-full text-2xl">🎬</div>'}
        <div class="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-center py-0.5">${a.episodes_watched||0}/${a.episodes||'?'}</div>
      </div>
      <p class="text-[11px] mt-1 line-clamp-2 text-gray-300 group-hover:text-white">${esc(a.title)}</p>
    </div>
  `).join('');
  row.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openEdit(Number(el.dataset.id)));
}

function cardHTML(a){
  const st=a.status||'completed';
  const cover=a.cover_url
    ?`<img src="${esc(a.cover_url)}" alt="" class="cover" loading="lazy" onerror="this.parentElement.querySelector('.fb')?.classList.remove('hidden');this.remove()"/><div class="cover-placeholder fb hidden">🎬</div>`
    :`<div class="cover-placeholder">🎬</div>`;
  return `<article class="anime-card" data-id="${a.id}">
    ${cover}
    <span class="badge ${STATUS_COLOR[st]||'bg-gray-600'} text-white">${STATUS_LABEL[st]||st}</span>
    ${a.is_favorite?'<span class="absolute top-2 left-2 text-amber-400 text-sm drop-shadow">★</span>':''}
    ${a.is_hentai?'<span class="badge badge-hentai" style="top:1.75rem">H</span>':''}
    <div class="info">
      <h3 class="title">${esc(a.title)}</h3>
      ${a.rating>0?`<div class="rating-stars">${stars(a.rating)}</div>`:''}
      ${a.category&&a.category!=='Sin categoría'?`<div class="text-[10px] text-gray-400 mt-0.5">${esc(a.category)}</div>`:''}
    </div>
  </article>`;
}

function listRowHTML(a){
  const st=a.status||'completed';
  return `<div class="flex items-center gap-3 bg-dark-800/50 border border-dark-600/40 rounded-xl px-3 py-2 hover:bg-dark-700/50 cursor-pointer transition" data-id="${a.id}">
    <div class="w-10 h-14 rounded overflow-hidden bg-dark-700 shrink-0">
      ${a.cover_url?`<img src="${esc(a.cover_url)}" class="w-full h-full object-cover" loading="lazy"/>`:'<div class="flex items-center justify-center h-full text-sm">🎬</div>'}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-sm truncate">${esc(a.title)}</span>
        ${a.is_favorite?'<span class="text-amber-400 text-xs">★</span>':''}
        ${a.is_hentai?'<span class="text-[10px] bg-red-500/80 text-white px-1 rounded">H</span>':''}
      </div>
      <div class="text-xs text-gray-500 flex flex-wrap gap-2 mt-0.5">
        <span class="px-1.5 rounded ${STATUS_COLOR[st]} text-white text-[10px]">${STATUS_LABEL[st]}</span>
        ${a.category?`<span>${esc(a.category)}</span>`:''}
        ${a.year?`<span>${a.year}</span>`:''}
        ${a.score?`<span>MAL ${a.score}</span>`:''}
        ${a.rating>0?`<span class="text-amber-400">${a.rating}/10</span>`:''}
      </div>
    </div>
    <button class="fav-btn text-lg px-2 ${a.is_favorite?'text-amber-400':'text-gray-600 hover:text-amber-400'}" data-fav="${a.id}">★</button>
  </div>`;
}

function renderAll(){
  document.getElementById('loadingState').classList.add('hidden');
  renderStatsBar(); renderContinue();
  const filtered=getFiltered();
  const grid=document.getElementById('animeGrid'), list=document.getElementById('animeList'), empty=document.getElementById('emptyState');
  if(!filtered.length){ grid.innerHTML=''; list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  if(viewMode==='grid'){
    grid.classList.remove('hidden'); list.classList.add('hidden');
    grid.innerHTML=filtered.map(cardHTML).join('');
    grid.querySelectorAll('.anime-card').forEach(c=>c.onclick=()=>openEdit(Number(c.dataset.id)));
  } else {
    list.classList.remove('hidden'); grid.classList.add('hidden');
    list.innerHTML=filtered.map(listRowHTML).join('');
    list.querySelectorAll('[data-id]').forEach(el=>{
      el.onclick=e=>{ if(e.target.closest('.fav-btn'))return; openEdit(Number(el.dataset.id)); };
    });
    list.querySelectorAll('.fav-btn').forEach(b=>b.onclick=e=>{ e.stopPropagation(); toggleFavorite(Number(b.dataset.fav)); });
  }
}

function renderStatsModal(){
  const byCat={}, byYear={}, byStatus={};
  let hours=0;
  animes.forEach(a=>{
    byCat[a.category||'Sin categoría']=(byCat[a.category||'Sin categoría']||0)+1;
    if(a.year)byYear[a.year]=(byYear[a.year]||0)+1;
    const st=a.status||'completed'; byStatus[st]=(byStatus[st]||0)+1;
    hours+=(Number(a.episodes_watched)||Number(a.episodes)||0)*24/60;
  });
  const topCat=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const topYear=Object.entries(byYear).sort((a,b)=>b[0]-a[0]).slice(0,10);
  document.getElementById('statsContent').innerHTML=`
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-dark-900/50 rounded-xl p-3"><div class="text-2xl font-bold text-accent-cyan">${animes.length}</div><div class="text-gray-500 text-xs">Total animes</div></div>
      <div class="bg-dark-900/50 rounded-xl p-3"><div class="text-2xl font-bold text-purple-300">${Math.round(hours)}h</div><div class="text-gray-500 text-xs">Horas estimadas</div></div>
      <div class="bg-dark-900/50 rounded-xl p-3"><div class="text-2xl font-bold text-amber-400">${animes.filter(a=>a.is_favorite).length}</div><div class="text-gray-500 text-xs">Favoritos</div></div>
      <div class="bg-dark-900/50 rounded-xl p-3"><div class="text-2xl font-bold text-green-400">${animes.filter(a=>a.status==='watching').length}</div><div class="text-gray-500 text-xs">Viendo ahora</div></div>
    </div>
    <div><h3 class="font-semibold mb-2 text-gray-300">Por estado</h3>
      ${Object.entries(byStatus).map(([k,v])=>`<div class="flex justify-between py-1 border-b border-dark-600/40"><span>${STATUS_LABEL[k]||k}</span><span class="font-medium">${v}</span></div>`).join('')}
    </div>
    <div><h3 class="font-semibold mb-2 text-gray-300">Por categoría</h3>
      ${topCat.map(([k,v])=>`<div class="flex justify-between py-1 border-b border-dark-600/40"><span>${esc(k)}</span><span class="font-medium">${v}</span></div>`).join('')||'<p class="text-gray-500">—</p>'}
    </div>
    <div><h3 class="font-semibold mb-2 text-gray-300">Por año</h3>
      ${topYear.map(([k,v])=>`<div class="flex justify-between py-1 border-b border-dark-600/40"><span>${k}</span><span class="font-medium">${v}</span></div>`).join('')||'<p class="text-gray-500">—</p>'}
    </div>
  `;
  openM('statsModal');
}

// ===== Modal add/edit =====
function openAdd(){
  currentEditId=null;
  document.getElementById('modalTitle').textContent='Agregar anime';
  document.getElementById('animeForm').reset();
  document.getElementById('animeId').value='';
  document.getElementById('formStatus').value='completed';
  document.getElementById('btnDelete').classList.add('hidden');
  document.getElementById('malInfo').classList.add('hidden');
  document.getElementById('searchSuggestions').classList.add('hidden');
  openM('modal'); document.getElementById('formTitle').focus();
}
function openEdit(id){
  const a=animes.find(x=>x.id===id); if(!a)return;
  currentEditId=id;
  document.getElementById('modalTitle').textContent='Editar anime';
  document.getElementById('animeId').value=id;
  document.getElementById('formTitle').value=a.title;
  document.getElementById('formCategory').value=a.category||'Sin categoría';
  document.getElementById('formStatus').value=a.status||'completed';
  document.getElementById('formRating').value=a.rating||'';
  document.getElementById('formEpsWatched').value=a.episodes_watched||'';
  document.getElementById('formFinished').value=a.finished_at||'';
  document.getElementById('formTags').value=a.tags||'';
  document.getElementById('formHentai').checked=!!a.is_hentai;
  document.getElementById('formFavorite').checked=!!a.is_favorite;
  document.getElementById('formNotes').value=a.notes||'';
  document.getElementById('btnDelete').classList.remove('hidden');
  document.getElementById('searchSuggestions').classList.add('hidden');
  if(a.score||a.episodes||a.year||a.synopsis){
    document.getElementById('malInfo').classList.remove('hidden');
    document.getElementById('infoScore').textContent=a.score??'—';
    document.getElementById('infoEpisodes').textContent=a.episodes??'—';
    document.getElementById('infoYear').textContent=a.year??'—';
    document.getElementById('infoType').textContent=a.type||'—';
    document.getElementById('infoSynopsis').textContent=a.synopsis||'';
  } else document.getElementById('malInfo').classList.add('hidden');
  openM('modal');
}

// Suggest on type
document.getElementById('formTitle').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  const q=document.getElementById('formTitle').value.trim();
  const box=document.getElementById('searchSuggestions');
  if(q.length<3||currentEditId){ box.classList.add('hidden'); return; }
  searchTimer=setTimeout(async()=>{
    const items=await searchJikanSuggest(q);
    if(!items.length){ box.classList.add('hidden'); return; }
    box.innerHTML=items.map(it=>`
      <button type="button" class="w-full flex items-center gap-3 px-3 py-2 hover:bg-dark-600 text-left transition suggest-item"
        data-title="${esc(it.title)}">
        ${it.cover?`<img src="${esc(it.cover)}" class="w-8 h-11 object-cover rounded"/>`:'<div class="w-8 h-11 bg-dark-600 rounded"></div>'}
        <div class="min-w-0"><div class="text-sm font-medium truncate">${esc(it.title)}</div>
        <div class="text-[11px] text-gray-500">${it.type||''} ${it.year||''} ${it.score?`· ${it.score}`:''}</div></div>
      </button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.suggest-item').forEach(b=>b.onclick=()=>{
      document.getElementById('formTitle').value=b.dataset.title;
      box.classList.add('hidden');
    });
  },400);
});
document.addEventListener('click',e=>{ if(!e.target.closest('#formTitle')&&!e.target.closest('#searchSuggestions')) document.getElementById('searchSuggestions').classList.add('hidden'); });

// Events
document.getElementById('btnAdd').onclick=openAdd;
document.getElementById('btnEmptyAdd')?.addEventListener('click',openAdd);
document.getElementById('btnImport').onclick=()=>openM('importModal');
document.getElementById('btnEmptyImport')?.addEventListener('click',()=>openM('importModal'));
document.getElementById('btnExport').onclick=exportJson;
document.getElementById('btnRefreshCovers').onclick=refreshMissing;
document.getElementById('btnStats').onclick=renderStatsModal;
document.getElementById('modalClose').onclick=()=>closeM('modal');
document.getElementById('importClose').onclick=()=>closeM('importModal');
document.getElementById('statsClose').onclick=()=>closeM('statsModal');
document.getElementById('btnDoImport').onclick=doImportText;
document.getElementById('importJsonFile').onchange=async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  try{ const text=await f.text(); const data=JSON.parse(text); await importJsonList(Array.isArray(data)?data:data.animes||[]); }
  catch{ toast('Archivo JSON inválido','❌'); }
};

document.getElementById('btnViewGrid').onclick=()=>{ viewMode='grid'; document.getElementById('btnViewGrid').className='px-2.5 py-2 rounded-xl bg-accent-purple/20 border border-accent-purple/30 text-accent-purple text-sm'; document.getElementById('btnViewList').className='px-2.5 py-2 rounded-xl bg-dark-800/80 border border-dark-600/80 text-gray-400 text-sm'; renderAll(); };
document.getElementById('btnViewList').onclick=()=>{ viewMode='list'; document.getElementById('btnViewList').className='px-2.5 py-2 rounded-xl bg-accent-purple/20 border border-accent-purple/30 text-accent-purple text-sm'; document.getElementById('btnViewGrid').className='px-2.5 py-2 rounded-xl bg-dark-800/80 border border-dark-600/80 text-gray-400 text-sm'; renderAll(); };
document.getElementById('btnFavOnly').onclick=()=>{ favOnly=!favOnly; document.getElementById('btnFavOnly').classList.toggle('text-amber-400',favOnly); document.getElementById('btnFavOnly').classList.toggle('border-amber-400/40',favOnly); renderAll(); };

['searchInput','categoryFilter','statusFilter','hentaiFilter','sortBy'].forEach(id=>{
  document.getElementById(id).addEventListener('input',renderAll);
  document.getElementById(id).addEventListener('change',renderAll);
});

document.getElementById('animeForm').onsubmit=async e=>{
  e.preventDefault(); if(isSaving)return; isSaving=true;
  const btn=document.getElementById('btnSave'); const o=btn.textContent; btn.textContent='Guardando...'; btn.disabled=true;
  const data={
    id:currentEditId, title:document.getElementById('formTitle').value.trim(),
    category:document.getElementById('formCategory').value, status:document.getElementById('formStatus').value,
    rating:Number(document.getElementById('formRating').value)||0,
    episodes_watched:Number(document.getElementById('formEpsWatched').value)||0,
    finished_at:document.getElementById('formFinished').value||null,
    tags:document.getElementById('formTags').value.trim(),
    is_hentai:document.getElementById('formHentai').checked,
    is_favorite:document.getElementById('formFavorite').checked,
    notes:document.getElementById('formNotes').value.trim()
  };
  try{ await saveAnime(data); toast(currentEditId?'Actualizado':'Agregado'); closeM('modal'); await loadData(); }
  catch(err){ toast(err.message||'Error','❌'); }
  finally{ isSaving=false; btn.textContent=o; btn.disabled=false; }
};

document.getElementById('btnDelete').onclick=async()=>{
  if(!currentEditId||!confirm('¿Eliminar?'))return;
  try{ await deleteAnime(currentEditId); toast('Eliminado'); closeM('modal'); await loadData(); }
  catch(err){ toast(err.message,'❌'); }
};

document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeM('modal'); closeM('importModal'); closeM('statsModal'); closeM('profileModal'); }});

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(session?.user){ currentUser=session.user; showApp(); await loadData(); }
  else showAuth();
  sb.auth.onAuthStateChange((_e,s)=>{ if(s?.user){ currentUser=s.user; showApp(); loadData(); } else { currentUser=null; showAuth(); } });
}
init();
