// ============================================================
// Anime Tracker - App principal (Supabase + Jikan)
// ============================================================

const { createClient } = supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let animes = [];
let categories = [];
let currentEditId = null;
let isSaving = false;

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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function starsFromRating(r) {
  if (!r || r <= 0) return '';
  const full = Math.min(5, Math.round(Number(r) / 2));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ========== Jikan helpers ==========
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
  try {
    const [animesRes, catsRes] = await Promise.all([
      sb.from('animes').select('*').order('title', { ascending: true }),
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
      <div class="text-red-400 font-medium">Error al conectar con Supabase</div>
      <p class="text-gray-500 text-sm mt-2 max-w-md mx-auto">
        ${escapeHtml(err.message || 'Revisa que las tablas existan y las políticas RLS estén activas.')}
      </p>
      <p class="text-gray-600 text-xs mt-3">Ejecuta el archivo <code class="bg-dark-700 px-1 rounded">supabase-schema.sql</code> en el SQL Editor de Supabase.</p>
    `;
  }
}

async function saveAnime(payload) {
  // Enrich with Jikan if new or missing cover
  let extra = {};
  if (!payload.id || !payload.cover_url) {
    const jikan = await fetchJikan(payload.title);
    if (jikan) extra = jikan;
  }

  const row = {
    title: payload.title,
    category: payload.category || 'Sin categoría',
    is_hentai: !!payload.is_hentai,
    rating: Number(payload.rating) || 0,
    notes: payload.notes || null,
    ...extra,
  };

  if (payload.id) {
    const { error } = await sb.from('animes').update(row).eq('id', payload.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('animes').insert(row);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe un anime con ese título');
      throw error;
    }
  }
}

async function deleteAnime(id) {
  const { error } = await sb.from('animes').delete().eq('id', id);
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
      await new Promise(r => setTimeout(r, 450)); // rate limit ~2 req/s
      const jikan = await fetchJikan(a.title);
      if (jikan?.cover_url) {
        const { error } = await sb
          .from('animes')
          .update({
            cover_url: jikan.cover_url,
            mal_id: jikan.mal_id,
            synopsis: a.synopsis || jikan.synopsis,
            score: a.score ?? jikan.score,
            episodes: a.episodes ?? jikan.episodes,
            year: a.year ?? jikan.year,
            type: a.type || jikan.type,
          })
          .eq('id', a.id);
        if (!error) updated++;
      }
    } catch (_) {
      // skip
    }
  }

  toast(`Actualizadas ${updated} de ${missing.length} portadas`, '✨');
  await loadData();
}

// ========== Render ==========
function renderCategories() {
  const filter = document.getElementById('categoryFilter');
  const form = document.getElementById('formCategory');
  const current = filter.value;

  filter.innerHTML = '<option value="">Todas las categorías</option>';
  form.innerHTML = '';

  categories.forEach(c => {
    const label = `${c.icon || ''} ${c.name}`.trim();
    filter.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(label)}</option>`;
    form.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(label)}</option>`;
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

  // Stats
  document.getElementById('statTotal').textContent = animes.length;
  document.getElementById('statHentai').textContent = animes.filter(a => a.is_hentai).length;
  document.getElementById('statWithCover').textContent = animes.filter(a => a.cover_url).length;

  const rated = animes.filter(a => a.rating > 0);
  const avg = rated.length
    ? (rated.reduce((s, a) => s + Number(a.rating), 0) / rated.length).toFixed(1)
    : '—';
  document.getElementById('statAvgRating').textContent = avg;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = filtered
    .map(a => {
      const cover = a.cover_url
        ? `<img src="${escapeHtml(a.cover_url)}" alt="${escapeHtml(a.title)}" class="cover" loading="lazy" decoding="async"
             onerror="this.parentElement.querySelector('.cover-fallback')?.classList.remove('hidden'); this.remove();" />
           <div class="cover-placeholder cover-fallback hidden">🎬</div>`
        : `<div class="cover-placeholder">🎬</div>`;

      const hentaiBadge = a.is_hentai
        ? `<span class="badge badge-hentai">H</span>`
        : '';
      const catBadge =
        a.category && a.category !== 'Sin categoría'
          ? `<span class="badge badge-category">${escapeHtml(a.category)}</span>`
          : '';
      const stars = a.rating > 0
        ? `<div class="rating-stars" title="${a.rating}/10">${starsFromRating(a.rating)}</div>`
        : '';

      return `
        <article class="anime-card animate-fade-in" data-id="${a.id}" title="${escapeHtml(a.title)}">
          ${cover}
          ${hentaiBadge}
          ${catBadge}
          <div class="info">
            <h3 class="title">${escapeHtml(a.title)}</h3>
            ${stars}
          </div>
        </article>`;
    })
    .join('');

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

  // MAL info
  const hasMal = a.score || a.episodes || a.year || a.synopsis;
  if (hasMal) {
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

// ========== Events ==========
document.getElementById('btnAdd').addEventListener('click', openAdd);
document.getElementById('btnEmptyAdd')?.addEventListener('click', openAdd);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});
document.getElementById('btnRefreshCovers').addEventListener('click', refreshMissingCovers);

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

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Init
loadData();
