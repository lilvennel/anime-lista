# 🍥 Anime Tracker

Lista personal de animes vistos. Interfaz moderna, dark mode, integración con **MyAnimeList** (Jikan) para portadas y datos, y base de datos en **Supabase**.

Hosteado idealmente en **Cloudflare Pages** (estático + CDN global).

---

## Stack

- Frontend: HTML + Tailwind (CDN) + vanilla JS
- Base de datos: Supabase (Postgres)
- Portadas / datos: [Jikan API](https://jikan.moe/) (MyAnimeList no oficial)
- Hosting: Cloudflare Pages (o cualquier static host)

---

## 1. Configurar Supabase (obligatorio)

1. Entra a tu proyecto: https://supabase.com/dashboard
2. Ve a **SQL Editor** → **New query**
3. Copia y pega todo el contenido de `supabase-schema.sql`
4. Ejecuta (Run)
5. Verifica en **Table Editor** que existan las tablas `animes` y `categories`

Las políticas RLS están configuradas para acceso público con la **anon key** (ideal para uso personal). Si más adelante quieres privacidad, agrega Supabase Auth y ajusta las policies.

La configuración de Supabase ya está en `js/config.js` con tus credenciales.

---

## 2. Probar en local

Puedes abrir `index.html` directamente, o mejor:

```bash
npx serve .
# o
python -m http.server 3000
```

Abre http://localhost:3000

---

## 3. Subir a GitHub

```bash
cd anime-tracker
git init
git add .
git commit -m "Anime Tracker listo con Supabase"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/anime-tracker.git
git push -u origin main
```

---

## 4. Hostear en Cloudflare Pages

1. Entra a [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Selecciona el repositorio `anime-tracker`
3. Configuración de build:
   - **Framework preset**: None
   - **Build command**: (dejar vacío)
   - **Build output directory**: `/`  (o `.`)
4. **Save and Deploy**
5. En unos segundos tendrás una URL tipo `https://anime-tracker-xxx.pages.dev`

Opcional: agrega un dominio custom en **Custom domains**.

---

## Funcionalidades

- ✅ Agregar / editar / eliminar animes
- ✅ Filtro por categoría, búsqueda y hentai/normal
- ✅ Portadas automáticas vía Jikan al crear
- ✅ Botón 🖼️ para rellenar portadas faltantes
- ✅ Rating personal (0-10) + score de MAL
- ✅ Notas y datos extra (episodios, año, tipo, sinopsis)
- ✅ Diseño responsive y dark theme pulido

---

## Estructura

```
anime-tracker/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js      ← URL + anon key de Supabase
│   └── app.js
├── supabase-schema.sql
└── README.md
```

---

## Notas de seguridad

- La **anon key** es pública por diseño (va en el frontend).
- Las políticas RLS actuales permiten lectura y escritura a cualquiera que tenga la key.
- Para uso personal está bien. Si publicas el link, cualquiera podrá modificar tu lista.
- Para hacerlo privado: implementa Supabase Auth (email/password o magic link) y cambia las policies a `auth.uid() IS NOT NULL`.

---

Hecho con ❤️ para trackear animes.
