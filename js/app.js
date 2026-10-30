// ============================================================
// Anime Tracker v2 - Auth + Lista por usuario + Import masivo
// ============================================================

const { createClient } = supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let animes = [];
let categories = [];
let currentEditId = null;
let currentUser = null;
let isSaving = false;
let authMode = 'login'; // 'login' | 'signup'

// ========== Utils ==========
function toast(msg, icon = '✅') {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = icon;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function starsFromRating(r) {
  if (!r || r <= 0) return '';
  const full = Math.min(5, Math.round(Number(r) / 2));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ========== Auth ==========
function showAuth() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userEmail').textContent = currentUser?.email || '—';
}

function setAuthMode(mode) {
  authMode = mode;
  const loginBtn = document.getElementById('tabLogin');
  const signupBtn = document.getElementById('tabSignup');
  const submit = document.getElementById('authSubmit');
  if (mode === 'login') {
    loginBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-purple/20 text-accent-purple border border-accent-purple/30';
    signupBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition';
    submit.textContent = 'Entrar';
  } else {
    signupBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-purple/20 text-accent-purple border border-accent-purple/30';
    loginBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition';
    submit.textContent = 'Crear cuenta';
  }
  document.getElementById('authError').classList.add('hidden');
}

document.getElementById('tabLogin').addEventListener('click', () => setAuthMode('login'));
document.getElementById('tabSignup').addEventListener('click', () => setAuthMode('signup'));

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  const btn = document.getElementById('authSubmit');
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Espera...';

  try {
    if (authMode === 'login') {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user && !data.session) {
        errEl.textContent = 'Revisa tu email para confirmar la cuenta (o desactiva confirmación en Supabase).';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Crear cuenta';
        return;
      }
      currentUser = data.user;
    }
    showApp();
    await loadData();
  } catch (err) {
    errEl.textContent = err.message || 'Error de autenticación';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Entrar' : 'Crear cuenta';
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  await sb.auth.signOut();
  currentUser = null;
  animes = [];
  showAuth();
});

// ========== Jikan ==========
async function fetchJikan(title) {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
      { headers: { 'User-Agent': 'AnimeTracker/2.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || !data.data[0]) return null;
    const a = data.data[0];
    return {
      cover_url: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
      mal_id: a.mal_id,
      synopsis: a.synopsis ? a.synopsis.slice(0, 600) : null,
      score: a.score,
      episodes: a.episodes,
      year: a.year || a.aired?.prop?.from?.year || null,
      type: a.type,
    };
  } catch {
    return null;
  }
}

// ========== Data ==========
async function loadData() {
  if (!currentUser) return;
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('animeGrid').innerHTML = '';

  try {
    const [animesRes, catsRes] = await Promise.all([
      sb.from('animes').select('*').eq('user_id', currentUser.id).order('title', { ascending: true }),
      sb.from('categories').select('*').order('name', { ascending: true }),
    ]);
    if (animesRes.error) throw animesRes.error;
    if (catsRes.error) throw catsRes.error;
    animes = animesRes.data || [];
    categories = catsRes.data || [];
    renderCategories();
    renderGrid();
  } catch (err) {
    console.error(err);
    document.getElementById('loadingState').innerHTML = `
      <div class="text-red-400 font-medium">Error al cargar</div>
      <p class="text-gray-500 text-sm mt-2 max-w-md mx-auto">${escapeHtml(err.message)}</p>
      <p class="text-gray-600 text-xs mt-3">¿Ejecutaste supabase-schema-v2.sql?</p>
    `;
  }
}

async function saveAnime(payload) {
  let extra = {};
  if (!payload.id) {
    const jikan = await fetchJikan(payload.title);
    if (jikan) extra = jikan;
  }
  const row = {
    title: payload.title,
    category: payload.category || 'Sin categoría',
    is_hentai: !!payload.is_hentai,
    rating: Number(payload.rating) || 0,
    notes: payload.notes || null,
    user_id: currentUser.id,
    ...extra,
  };
  if (payload.id) {
    const { error } = await sb.from('animes').update(row).eq('id', payload.id).eq('user_id', currentUser.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('animes').insert(row);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe un anime con ese título en tu lista');
      throw error;
    }
  }
}

async function deleteAnime(id) {
  const { error } = await sb.from('animes').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) throw error;
}

async function refreshMissingCovers() {
  const missing = animes.filter(a => !a.cover_url).slice(0, 12);
  if (missing.length === 0) {
    toast('Todas las portadas están listas', '✨');
    return;
  }
  toast(`Actualizando ${missing.length} portadas...`, '🖼️');
  let updated = 0;
  for (const a of missing) {
    try {
      await new Promise(r => setTimeout(r, 450));
      const jikan = await fetchJikan(a.title);
      if (jikan?.cover_url) {
        const { error } = await sb.from('animes').update({
          cover_url: jikan.cover_url,
          mal_id: jikan.mal_id,
          synopsis: a.synopsis || jikan.synopsis,
          score: a.score ?? jikan.score,
          episodes: a.episodes ?? jikan.episodes,
          year: a.year ?? jikan.year,
          type: a.type || jikan.type,
        }).eq('id', a.id).eq('user_id', currentUser.id);
        if (!error) updated++;
      }
    } catch (_) {}
  }
  toast(`Actualizadas ${updated} de ${missing.length} portadas`, '✨');
  await loadData();
}

// ========== Bulk Import ==========
async function doImport() {
  const text = document.getElementById('importText').value.trim();
  if (!text) {
    toast('Pega al menos un título', '❌');
    return;
  }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const category = document.getElementById('importCategory').value || 'Sin categoría';
  const progress = document.getElementById('importProgress');
  const status = document.getElementById('importStatus');
  const bar = document.getElementById('importBar');
  const btn = document.getElementById('btnDoImport');

  progress.classList.remove('hidden');
  btn.disabled = true;
  let ok = 0, skip = 0, fail = 0;

  for (let i = 0; i < lines.length; i++) {
    let title = lines[i];
    // Quitar numeración tipo "1: Title" o "1. Title"
    title = title.replace(/^\d+[:.\-\)]\s*/, '').trim();
    let isHentai = false;
    if (/\(h\)\s*$/i.test(title) || /\(H\)\s*$/.test(title)) {
      isHentai = true;
      title = title.replace(/\s*\([hH]\)\s*$/, '').trim();
    }
    if (!title) continue;

    status.textContent = `Importando ${i + 1}/${lines.length}: ${title.slice(0, 30)}...`;
    bar.style.width = `${Math.round(((i + 1) / lines.length) * 100)}%`;

    try {
      // Check if already exists for this user
      const exists = animes.some(a => a.title.toLowerCase() === title.toLowerCase());
      if (exists) {
        skip++;
        continue;
      }
      // Insert without waiting for Jikan to speed up (covers later with 🖼️)
      const { error } = await sb.from('animes').insert({
        title,
        category,
        is_hentai: isHentai,
        rating: 0,
        user_id: currentUser.id,
      });
      if (error) {
        if (error.code === '23505') skip++;
        else fail++;
      } else {
        ok++;
      }
    } catch {
      fail++;
    }
    // Pequeña pausa para no saturar
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 50));
  }

  btn.disabled = false;
  progress.classList.add('hidden');
  toast(`Importados: ${ok} · Omitidos: ${skip} · Errores: ${fail}`, '📥');
  document.getElementById('importModal').classList.remove('open');
  document.getElementById('importText').value = '';
  await loadData();
}

// ========== Render ==========
function renderCategories() {
  const filter = document.getElementById('categoryFilter');
  const form = document.getElementById('formCategory');
  const imp = document.getElementById('importCategory');
  const current = filter.value;
  filter.innerHTML = '<option value="">Todas</option>';
  form.innerHTML = '';
  imp.innerHTML = '';
  categories.forEach(c => {
    const label = `${c.icon || ''} ${c.name}`.trim();
    filter.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(label)}</option>`;
    form.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(label)}</option>`;
    imp.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(label)}</option>`;
  });
  if (current) filter.value = current;
}

function getFiltered() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const cat = document.getElementById('categoryFilter').value;
  const hentai = document.getElementById('hentaiFilter').value;
  return animes.filter(a => {
    if (q && !a.title.toLowerCase().includes(q)) return false;
    if (cat && a.category !== cat) return false;
    if (hentai === 'true' && !a.is_hentai) return false;
    if (hentai === 'false' && a.is_hentai) return false;
    return true;
  });
}

function renderGrid() {
  const grid = document.getElementById('animeGrid');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');
  loading.classList.add('hidden');
  const filtered = getFiltered();

  document.getElementById('statTotal').textContent = animes.length;
  document.getElementById('statHentai').textContent = animes.filter(a => a.is_hentai).length;
  document.getElementById('statWithCover').textContent = animes.filter(a => a.cover_url).length;
  const rated = animes.filter(a => a.rating > 0);
  document.getElementById('statAvgRating').textContent = rated.length
    ? (rated.reduce((s, a) => s + Number(a.rating), 0) / rated.length).toFixed(1)
    : '—';

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map(a => {
    const cover = a.cover_url
      ? `<img src="${escapeHtml(a.cover_url)}" alt="${escapeHtml(a.title)}" class="cover" loading="lazy" decoding="async"
           onerror="this.parentElement.querySelector('.cover-fallback')?.classList.remove('hidden'); this.remove();" />
         <div class="cover-placeholder cover-fallback hidden">🎬</div>`
      : `<div class="cover-placeholder">🎬</div>`;
    const hentaiBadge = a.is_hentai ? `<span class="badge badge-hentai">H</span>` : '';
    const catBadge = a.category && a.category !== 'Sin categoría'
      ? `<span class="badge badge-category">${escapeHtml(a.category)}</span>` : '';
    const stars = a.rating > 0
      ? `<div class="rating-stars" title="${a.rating}/10">${starsFromRating(a.rating)}</div>` : '';
    return `
      <article class="anime-card animate-fade-in" data-id="${a.id}" title="${escapeHtml(a.title)}">
        ${cover}${hentaiBadge}${catBadge}
        <div class="info"><h3 class="title">${escapeHtml(a.title)}</h3>${stars}</div>
      </article>`;
  }).join('');

  grid.querySelectorAll('.anime-card').forEach(card => {
    card.addEventListener('click', () => openEdit(Number(card.dataset.id)));
  });
}

// ========== Modal ==========
function openAdd() {
  currentEditId = null;
  document.getElementById('modalTitle').textContent = 'Agregar anime';
  document.getElementById('animeForm').reset();
  document.getElementById('animeId').value = '';
  document.getElementById('btnDelete').classList.add('hidden');
  document.getElementById('malInfo').classList.add('hidden');
  document.getElementById('modal').classList.add('open');
  document.getElementById('formTitle').focus();
}

function openEdit(id) {
  const a = animes.find(x => x.id === id);
  if (!a) return;
  currentEditId = id;
  document.getElementById('modalTitle').textContent = 'Editar anime';
  document.getElementById('animeId').value = id;
  document.getElementById('formTitle').value = a.title;
  document.getElementById('formCategory').value = a.category || 'Sin categoría';
  document.getElementById('formRating').value = a.rating || '';
  document.getElementById('formHentai').checked = !!a.is_hentai;
  document.getElementById('formNotes').value = a.notes || '';
  document.getElementById('btnDelete').classList.remove('hidden');
  if (a.score || a.episodes || a.year || a.synopsis) {
    document.getElementById('malInfo').classList.remove('hidden');
    document.getElementById('infoScore').textContent = a.score ? `${a.score}` : '—';
    document.getElementById('infoEpisodes').textContent = a.episodes ?? '—';
    document.getElementById('infoYear').textContent = a.year ?? '—';
    document.getElementById('infoType').textContent = a.type || '—';
    document.getElementById('infoSynopsis').textContent = a.synopsis || '';
  } else {
    document.getElementById('malInfo').classList.add('hidden');
  }
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

function openImport() {
  document.getElementById('importModal').classList.add('open');
  document.getElementById('importText').focus();
}

function closeImport() {
  document.getElementById('importModal').classList.remove('open');
}

// ========== Events ==========
document.getElementById('btnAdd').addEventListener('click', openAdd);
document.getElementById('btnEmptyAdd')?.addEventListener('click', openAdd);
document.getElementById('btnImport').addEventListener('click', openImport);
document.getElementById('btnEmptyImport')?.addEventListener('click', openImport);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('importClose').addEventListener('click', closeImport);
document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.getElementById('importModal').addEventListener('click', e => { if (e.target.id === 'importModal') closeImport(); });
document.getElementById('btnRefreshCovers').addEventListener('click', refreshMissingCovers);
document.getElementById('btnDoImport').addEventListener('click', doImport);

document.getElementById('searchInput').addEventListener('input', renderGrid);
document.getElementById('categoryFilter').addEventListener('change', renderGrid);
document.getElementById('hentaiFilter').addEventListener('change', renderGrid);

document.getElementById('animeForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (isSaving) return;
  isSaving = true;
  const btn = document.getElementById('btnSave');
  const original = btn.textContent;
  btn.textContent = 'Guardando...';
  btn.disabled = true;
  const data = {
    id: currentEditId,
    title: document.getElementById('formTitle').value.trim(),
    category: document.getElementById('formCategory').value,
    rating: Number(document.getElementById('formRating').value) || 0,
    is_hentai: document.getElementById('formHentai').checked,
    notes: document.getElementById('formNotes').value.trim(),
  };
  try {
    await saveAnime(data);
    toast(currentEditId ? 'Anime actualizado' : 'Anime agregado');
    closeModal();
    await loadData();
  } catch (err) {
    toast(err.message || 'Error al guardar', '❌');
  } finally {
    isSaving = false;
    btn.textContent = original;
    btn.disabled = false;
  }
});

document.getElementById('btnDelete').addEventListener('click', async () => {
  if (!currentEditId || !confirm('¿Eliminar este anime de tu lista?')) return;
  try {
    await deleteAnime(currentEditId);
    toast('Anime eliminado');
    closeModal();
    await loadData();
  } catch (err) {
    toast(err.message || 'Error al eliminar', '❌');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeImport();
  }
});

// ========== Init ==========
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showApp();
    await loadData();
  } else {
    showAuth();
  }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      currentUser = session.user;
      showApp();
      loadData();
    } else {
      currentUser = null;
      showAuth();
    }
  });
}

init();
