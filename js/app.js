// ============================================================
// Anime Tracker v2.1 - Auth + nombre + categorías auto + Jikan
// ============================================================

const { createClient } = supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let animes = [];
let categories = [];
let currentEditId = null;
let currentUser = null;
let isSaving = false;
let authMode = 'login';

// Mapeo de géneros Jikan → nuestras categorías
const GENRE_MAP = {
  'Action': 'Acción',
  'Adventure': 'Acción',
  'Comedy': 'Comedia',
  'Drama': 'Seinen',
  'Ecchi': 'Hentai',
  'Erotica': 'Hentai',
  'Fantasy': 'Isekai',
  'Hentai': 'Hentai',
  'Horror': 'Horror',
  'Mecha': 'Mecha',
  'Romance': 'Romance',
  'School': 'Slice of Life',
  'Sci-Fi': 'Mecha',
  'Slice of Life': 'Slice of Life',
  'Sports': 'Deportes',
  'Supernatural': 'Horror',
  'Suspense': 'Seinen',
  'Boys Love': 'Otros',
  'Girls Love': 'Otros',
  'Gourmet': 'Slice of Life',
  'Award Winning': 'Otros',
};

function pickCategory(genres, isHentai) {
  if (isHentai) return 'Hentai';
  if (!genres || !genres.length) return 'Sin categoría';
  for (const g of genres) {
    const mapped = GENRE_MAP[g.name] || GENRE_MAP[g];
    if (mapped) return mapped;
  }
  // fallback por nombre parcial
  const names = genres.map(g => (g.name || g || '').toLowerCase()).join(' ');
  if (names.includes('shounen') || names.includes('shonen')) return 'Shonen';
  if (names.includes('seinen')) return 'Seinen';
  if (names.includes('shoujo') || names.includes('shojo')) return 'Shojo';
  if (names.includes('isekai')) return 'Isekai';
  return 'Otros';
}

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

function getDisplayName() {
  const meta = currentUser?.user_metadata || {};
  return meta.display_name || meta.full_name || meta.name || null;
}

function updateGreeting() {
  const name = getDisplayName();
  const el = document.getElementById('userGreeting');
  if (el) el.textContent = name ? `Hola, ${name}` : 'Hola';
}

// ========== Auth ==========
function showAuth() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  updateGreeting();
}

function setAuthMode(mode) {
  authMode = mode;
  const loginBtn = document.getElementById('tabLogin');
  const signupBtn = document.getElementById('tabSignup');
  const submit = document.getElementById('authSubmit');
  const nameField = document.getElementById('nameField');
  if (mode === 'login') {
    loginBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-purple/20 text-accent-purple border border-accent-purple/30';
    signupBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition';
    submit.textContent = 'Entrar';
    nameField.classList.add('hidden');
  } else {
    signupBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-purple/20 text-accent-purple border border-accent-purple/30';
    loginBtn.className = 'flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition';
    submit.textContent = 'Crear cuenta';
    nameField.classList.remove('hidden');
  }
  document.getElementById('authError').classList.add('hidden');
}

document.getElementById('tabLogin').addEventListener('click', () => setAuthMode('login'));
document.getElementById('tabSignup').addEventListener('click', () => setAuthMode('signup'));

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName')?.value.trim() || '';
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
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { display_name: name || email.split('@')[0] } }
      });
      if (error) throw error;
      if (data.user && !data.session) {
        errEl.textContent = 'Revisa tu email para confirmar la cuenta (o desactiva confirmación en Supabase → Auth → Settings).';
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
  if (!confirm('¿Cerrar sesión?')) return;
  await sb.auth.signOut();
  currentUser = null;
  animes = [];
  showAuth();
});

// Profile
document.getElementById('btnProfile')?.addEventListener('click', () => {
  document.getElementById('profileName').value = getDisplayName() || '';
  document.getElementById('profileModal').classList.add('open');
});
document.getElementById('profileClose')?.addEventListener('click', () => {
  document.getElementById('profileModal').classList.remove('open');
});
document.getElementById('profileModal')?.addEventListener('click', e => {
  if (e.target.id === 'profileModal') document.getElementById('profileModal').classList.remove('open');
});
document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
  const name = document.getElementById('profileName').value.trim();
  if (!name) { toast('Escribe un nombre', '❌'); return; }
  const { data, error } = await sb.auth.updateUser({ data: { display_name: name } });
  if (error) { toast(error.message, '❌'); return; }
  currentUser = data.user;
  updateGreeting();
  document.getElementById('profileModal').classList.remove('open');
  toast('Nombre actualizado');
});

// ========== Jikan (portadas + categorías + datos) ==========
async function fetchJikan(title) {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=3`,
      { headers: { 'User-Agent': 'AnimeTracker/2.1' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || !data.data.length) return null;

    // Mejor match: título más parecido
    const q = title.toLowerCase();
    let best = data.data[0];
    for (const a of data.data) {
      const t = (a.title || '').toLowerCase();
      const te = (a.title_english || '').toLowerCase();
      if (t === q || te === q || t.includes(q) || q.includes(t.split(' ')[0])) {
        best = a;
        break;
      }
    }

    const genres = best.genres || [];
    const themes = best.themes || [];
    const demographics = best.demographics || [];
    const allGenres = [...genres, ...themes, ...demographics];

    const isHentai = allGenres.some(g =>
      ['Hentai', 'Erotica', 'Ecchi'].includes(g.name)
    ) || (best.rating || '').toLowerCase().includes('rx');

    return {
      cover_url: best.images?.jpg?.large_image_url || best.images?.jpg?.image_url || null,
      mal_id: best.mal_id,
      synopsis: best.synopsis ? best.synopsis.slice(0, 600) : null,
      score: best.score,
      episodes: best.episodes,
      year: best.year || best.aired?.prop?.from?.year || null,
      type: best.type,
      category: pickCategory(allGenres, isHentai),
      is_hentai: isHentai,
      genres: allGenres.map(g => g.name).join(', '),
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
  // Siempre enriquecer si es nuevo o no tiene portada
  if (!payload.id || !payload._skipJikan) {
    const jikan = await fetchJikan(payload.title);
    if (jikan) {
      extra = {
        cover_url: jikan.cover_url,
        mal_id: jikan.mal_id,
        synopsis: jikan.synopsis,
        score: jikan.score,
        episodes: jikan.episodes,
        year: jikan.year,
        type: jikan.type,
      };
      // Categoría automática solo si no eligió una o es "Sin categoría"
      if (!payload.category || payload.category === 'Sin categoría') {
        extra.category = jikan.category;
      }
      if (jikan.is_hentai && payload.is_hentai === undefined) {
        extra.is_hentai = true;
      }
    }
  }

  const row = {
    title: payload.title,
    category: extra.category || payload.category || 'Sin categoría',
    is_hentai: payload.is_hentai ?? extra.is_hentai ?? false,
    rating: Number(payload.rating) || 0,
    notes: payload.notes || null,
    user_id: currentUser.id,
    ...extra,
  };

  // No sobrescribir cover si ya tenía y no trajimos nueva
  if (payload.id && !extra.cover_url) {
    delete row.cover_url;
    delete row.mal_id;
    delete row.synopsis;
    delete row.score;
    delete row.episodes;
    delete row.year;
    delete row.type;
  }

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
  const missing = animes.filter(a => !a.cover_url || a.category === 'Sin categoría').slice(0, 15);
  if (missing.length === 0) {
    toast('Todo está actualizado', '✨');
    return;
  }
  toast(`Enriqueciendo ${missing.length} animes...`, '🖼️');
  let updated = 0;
  for (const a of missing) {
    try {
      await new Promise(r => setTimeout(r, 500));
      const jikan = await fetchJikan(a.title);
      if (!jikan) continue;
      const patch = {};
      if (!a.cover_url && jikan.cover_url) patch.cover_url = jikan.cover_url;
      if (jikan.mal_id) patch.mal_id = jikan.mal_id;
      if (!a.synopsis && jikan.synopsis) patch.synopsis = jikan.synopsis;
      if (a.score == null && jikan.score != null) patch.score = jikan.score;
      if (!a.episodes && jikan.episodes) patch.episodes = jikan.episodes;
      if (!a.year && jikan.year) patch.year = jikan.year;
      if (!a.type && jikan.type) patch.type = jikan.type;
      if ((!a.category || a.category === 'Sin categoría') && jikan.category) {
        patch.category = jikan.category;
      }
      if (jikan.is_hentai && !a.is_hentai) patch.is_hentai = true;

      if (Object.keys(patch).length) {
        const { error } = await sb.from('animes').update(patch).eq('id', a.id).eq('user_id', currentUser.id);
        if (!error) updated++;
      }
    } catch (_) {}
  }
  toast(`Actualizados ${updated} animes (portadas + categorías)`, '✨');
  await loadData();
}

// ========== Bulk Import (con Jikan opcional) ==========
async function doImport() {
  const text = document.getElementById('importText').value.trim();
  if (!text) { toast('Pega al menos un título', '❌'); return; }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const defaultCat = document.getElementById('importCategory').value || 'Sin categoría';
  const progress = document.getElementById('importProgress');
  const status = document.getElementById('importStatus');
  const bar = document.getElementById('importBar');
  const btn = document.getElementById('btnDoImport');

  progress.classList.remove('hidden');
  btn.disabled = true;
  let ok = 0, skip = 0, fail = 0;

  for (let i = 0; i < lines.length; i++) {
    let title = lines[i].replace(/^\d+[:.\-\)]\s*/, '').trim();
    let isHentai = false;
    if (/\([hH]\)\s*$/.test(title)) {
      isHentai = true;
      title = title.replace(/\s*\([hH]\)\s*$/, '').trim();
    }
    if (!title) continue;

    status.textContent = `Importando ${i + 1}/${lines.length}: ${title.slice(0, 35)}...`;
    bar.style.width = `${Math.round(((i + 1) / lines.length) * 100)}%`;

    try {
      if (animes.some(a => a.title.toLowerCase() === title.toLowerCase())) {
        skip++;
        continue;
      }

      // Insert rápido sin Jikan (luego el botón 🖼️ enriquece)
      const { error } = await sb.from('animes').insert({
        title,
        category: isHentai ? 'Hentai' : defaultCat,
        is_hentai: isHentai,
        rating: 0,
        user_id: currentUser.id,
      });
      if (error) {
        if (error.code === '23505') skip++;
        else fail++;
      } else ok++;
    } catch {
      fail++;
    }
    if (i % 8 === 0) await new Promise(r => setTimeout(r, 30));
  }

  btn.disabled = false;
  progress.classList.add('hidden');
  toast(`Importados: ${ok} · Omitidos: ${skip} · Errores: ${fail}`, '📥');
  document.getElementById('importModal').classList.remove('open');
  document.getElementById('importText').value = '';
  await loadData();

  if (ok > 0) {
    toast('Pulsa 🖼️ para cargar portadas y categorías automáticas', '💡');
  }
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
    document.getElementById('profileModal')?.classList.remove('open');
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
