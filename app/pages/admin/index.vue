<script setup lang="ts">
interface AdminText {
  id: string
  title: string
  author: string
  distinction: 'winner' | 'finalist' | 'honorable_mention'
  status: 'draft' | 'published'
}

interface AdminContest {
  id: string
  slug: string
  title: string
  theme: string
  description: string
  status: 'open' | 'judging' | 'closed'
  deadline: string
  prize: string
  monthNumber: number
  year: number
  rulesUrl?: string
  discordUrl?: string
  published: boolean
  texts?: AdminText[]
}

const { data: session, status: sessionStatus } = useFetch('/api/auth/session', {
  default: () => ({ authenticated: false as const }),
})
const contests = ref<AdminContest[]>([])
const loadingContests = ref(false)
const message = ref('')
const failure = ref('')

const today = new Date()
const contestForm = reactive({
  title: '', slug: '', theme: '', description: '', status: 'open', deadline: '', prize: '',
  month: today.getMonth() + 1, year: today.getFullYear(), rulesUrl: '', discordUrl: '', published: false,
})
const textForm = reactive({
  contestId: '', distinction: 'winner', title: '', authorName: '', bodyMarkdown: '',
  discordThreadUrl: '', status: 'draft',
})

const loadContests = async () => {
  if (!session.value.authenticated) return
  loadingContests.value = true
  try {
    contests.value = await $fetch<AdminContest[]>('/api/admin/contests')
    if (!textForm.contestId && contests.value[0]) textForm.contestId = contests.value[0].id
  } catch (error: any) {
    failure.value = error?.data?.message || error?.data?.statusMessage || 'No se pudieron cargar los concursos.'
  } finally {
    loadingContests.value = false
  }
}

watch(() => session.value.authenticated, authenticated => { if (authenticated) loadContests() }, { immediate: true })

const run = async (action: () => Promise<unknown>, success: string) => {
  failure.value = ''
  message.value = ''
  try {
    await action()
    message.value = success
    await loadContests()
  } catch (error: any) {
    failure.value = error?.data?.message || error?.data?.statusMessage || 'No se pudo guardar.'
  }
}

const createContest = () => run(async () => {
  await $fetch('/api/contests', { method: 'POST', body: contestForm })
  Object.assign(contestForm, {
    title: '', slug: '', theme: '', description: '', status: 'open', deadline: '', prize: '',
    month: today.getMonth() + 1, year: today.getFullYear(), rulesUrl: '', discordUrl: '', published: false,
  })
}, 'Concurso guardado.')

const createText = () => run(async () => {
  if (!textForm.contestId) throw new Error('Selecciona un concurso.')
  await $fetch(`/api/contests/${textForm.contestId}/texts`, { method: 'POST', body: textForm })
  Object.assign(textForm, {
    contestId: textForm.contestId, distinction: 'winner', title: '', authorName: '',
    bodyMarkdown: '', discordThreadUrl: '', status: 'draft',
  })
}, 'Texto guardado.')

const deleteText = (id: string) => run(
  () => $fetch(`/api/texts/${id}`, { method: 'DELETE' }),
  'Texto eliminado.',
)

const toggleContest = (contest: AdminContest) => run(
  () => $fetch(`/api/contests/${contest.id}`, {
    method: 'PATCH',
    body: {
      slug: contest.slug,
      title: contest.title,
      theme: contest.theme,
      description: contest.description,
      status: contest.status,
      deadline: contest.deadline,
      prize: contest.prize,
      month: contest.monthNumber,
      year: contest.year,
      rulesUrl: contest.rulesUrl,
      discordUrl: contest.discordUrl,
      published: !contest.published,
    },
  }),
  contest.published ? 'Concurso ocultado.' : 'Concurso publicado.',
)

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/')
}

useSeoMeta({ title: 'Gestión — Los Escritores Olvidados', robots: 'noindex, nofollow' })
</script>

<template>
  <main class="admin-page">
    <div class="container">
      <div v-if="sessionStatus === 'pending'" class="auth-card">Comprobando sesión…</div>

      <section v-else-if="!session.authenticated" class="auth-card">
        <span>Acceso restringido</span>
        <h1>Gestión editorial</h1>
        <p>Inicia sesión con una cuenta que tenga el rol de administrador o lector oficial.</p>
        <a href="/api/auth/discord?returnTo=/admin">Acceder con Discord <span>↗</span></a>
      </section>

      <template v-else>
        <header class="admin-header">
          <div><span>Panel autorizado</span><h1>Gestión editorial</h1><p>{{ session.user.displayName }} · {{ session.role === 'admin' ? 'Administrador' : 'Lector oficial' }}</p></div>
          <button @click="logout">Cerrar sesión</button>
        </header>

        <p v-if="message" class="notice notice--success">{{ message }}</p>
        <p v-if="failure" class="notice notice--error">{{ failure }}</p>

        <div class="admin-grid">
          <section v-if="session.role === 'admin'" class="admin-card">
            <div class="card-heading"><span>01</span><div><h2>Crear concurso</h2><p>Los concursos no aparecen públicamente hasta marcar “Publicado”.</p></div></div>
            <form @submit.prevent="createContest">
              <div class="field-pair"><label>Título<input v-model="contestForm.title" required></label><label>Slug<input v-model="contestForm.slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></label></div>
              <div class="field-pair"><label>Tema<input v-model="contestForm.theme" required></label><label>Estado<select v-model="contestForm.status"><option value="open">Abierto</option><option value="judging">En evaluación</option><option value="closed">Cerrado</option></select></label></div>
              <label>Descripción<textarea v-model="contestForm.description" rows="3"></textarea></label>
              <div class="field-pair"><label>Mes<input v-model.number="contestForm.month" type="number" min="1" max="12" required></label><label>Año<input v-model.number="contestForm.year" type="number" min="2020" max="2200" required></label></div>
              <div class="field-pair"><label>Fecha límite<input v-model="contestForm.deadline" type="date"></label><label>Premio<input v-model="contestForm.prize"></label></div>
              <div class="field-pair"><label>Enlace de reglas<input v-model="contestForm.rulesUrl" type="url"></label><label>Enlace de Discord<input v-model="contestForm.discordUrl" type="url"></label></div>
              <label class="checkbox"><input v-model="contestForm.published" type="checkbox"> Publicar concurso</label>
              <button type="submit" class="primary">Guardar concurso</button>
            </form>
          </section>

          <section class="admin-card">
            <div class="card-heading"><span>{{ session.role === 'admin' ? '02' : '01' }}</span><div><h2>Publicar texto seleccionado</h2><p>Un ganador, dos finalistas y hasta dos menciones por concurso.</p></div></div>
            <p v-if="!loadingContests && contests.length === 0" class="empty-admin">Primero debe existir un concurso.</p>
            <form v-else @submit.prevent="createText">
              <label>Concurso<select v-model="textForm.contestId" required><option disabled value="">Selecciona</option><option v-for="contest in contests" :key="contest.id" :value="contest.id">{{ contest.title }}</option></select></label>
              <div class="field-pair"><label>Distinción<select v-model="textForm.distinction"><option value="winner">Ganador</option><option value="finalist">Finalista</option><option value="honorable_mention">Mención honorífica</option></select></label><label>Publicación<select v-model="textForm.status"><option value="draft">Borrador</option><option value="published">Publicado</option></select></label></div>
              <div class="field-pair"><label>Título<input v-model="textForm.title" required></label><label>Autor<input v-model="textForm.authorName" required></label></div>
              <label>Texto<textarea v-model="textForm.bodyMarkdown" rows="14" required></textarea></label>
              <label>Hilo original de Discord <small>opcional</small><input v-model="textForm.discordThreadUrl" type="url"></label>
              <button type="submit" class="primary">Guardar texto</button>
            </form>
          </section>
        </div>

        <section class="admin-card archive-card">
          <div class="card-heading"><span>03</span><div><h2>Contenido guardado</h2><p>Borradores y publicaciones reales de la base de datos.</p></div></div>
          <p v-if="loadingContests">Cargando…</p>
          <p v-else-if="contests.length === 0" class="empty-admin">No hay contenido.</p>
          <article v-for="contest in contests" v-else :key="contest.id" class="saved-contest">
            <div>
              <span class="saved-title"><strong>{{ contest.title }}</strong><small>{{ contest.theme }} · {{ contest.published ? 'Publicado' : 'No publicado' }}</small></span>
              <button v-if="session.role === 'admin'" class="visibility-button" @click="toggleContest(contest)">{{ contest.published ? 'Ocultar' : 'Publicar' }}</button>
            </div>
            <ul v-if="contest.texts?.length">
              <li v-for="text in contest.texts" :key="text.id"><span><strong>{{ text.title }}</strong> · {{ text.author }} · {{ text.status }}</span><button @click="deleteText(text.id)">Eliminar</button></li>
            </ul>
            <p v-else>Sin textos.</p>
          </article>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.admin-page { min-height: 75vh; padding: 5rem 0 7rem; background: var(--color-surface-soft); }
.auth-card { max-width: 620px; margin: 5rem auto; padding: 3rem; border: 1px solid var(--color-border); border-radius: 24px; background: var(--color-surface); text-align: center; box-shadow: var(--shadow-lg); }
.auth-card > span, .admin-header span { color: var(--color-pink); font: 800 .7rem var(--font-sans); letter-spacing: .13em; text-transform: uppercase; }
.auth-card h1 { margin: .7rem 0 1rem; font-size: clamp(2.2rem, 6vw, 4rem); }
.auth-card p { color: var(--color-text-muted); }
.auth-card a { display: inline-flex; gap: .5rem; margin-top: 1.5rem; border-radius: 99px; background: var(--color-pink); color: white; padding: .8rem 1.15rem; font: 800 .8rem var(--font-sans); }
.admin-header { display: flex; justify-content: space-between; align-items: end; gap: 2rem; margin-bottom: 2.5rem; }
.admin-header h1 { margin-top: .4rem; font-size: clamp(2.5rem, 6vw, 4.5rem); }
.admin-header p { color: var(--color-text-muted); font: .8rem var(--font-sans); }
.admin-header button { border: 1px solid var(--color-border); border-radius: 99px; background: transparent; color: var(--color-text-muted); padding: .65rem 1rem; cursor: pointer; }
.admin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
.admin-card { padding: 1.5rem; border: 1px solid var(--color-border); border-radius: 22px; background: var(--color-surface); box-shadow: var(--shadow-sm); }
.card-heading { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
.card-heading > span { color: var(--color-pink); font: 800 .7rem var(--font-sans); }
.card-heading h2 { font-size: 1.45rem; }
.card-heading p { margin-top: .35rem; color: var(--color-text-muted); font-size: .77rem; }
form { display: flex; flex-direction: column; gap: .9rem; }
.field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
label { color: var(--color-text-muted); font: 700 .7rem var(--font-sans); }
label small { font-weight: 400; }
input, select, textarea { width: 100%; margin-top: .35rem; border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-background); color: var(--color-text); padding: .65rem .75rem; font: .82rem var(--font-sans); }
textarea { resize: vertical; line-height: 1.5; }
.checkbox { display: flex; align-items: center; gap: .5rem; }
.checkbox input { width: auto; margin: 0; }
.primary { align-self: flex-start; border: 0; border-radius: 99px; background: var(--color-pink); color: white; padding: .75rem 1.1rem; font: 800 .76rem var(--font-sans); cursor: pointer; }
.notice { margin-bottom: 1.5rem; padding: .8rem 1rem; border-radius: 10px; font: .78rem var(--font-sans); }
.notice--success { background: #ddf7e8; color: #157548; }
.notice--error { background: var(--color-red-soft); color: var(--color-red); }
.archive-card { margin-top: 1.5rem; }
.saved-contest { padding: 1rem 0; border-top: 1px solid var(--color-border-light); }
.saved-contest > div { display: flex; justify-content: space-between; gap: 1rem; }
.saved-contest > div strong { color: var(--color-ink); }
.saved-contest > div span, .saved-contest > p { color: var(--color-text-faint); font: .7rem var(--font-sans); }
.saved-title { display: flex; flex-direction: column; }
.saved-title small { margin-top: .2rem; font-size: .68rem; }
.visibility-button { border: 1px solid var(--color-border); border-radius: 99px; background: transparent; color: var(--color-pink); padding: .4rem .7rem; font: 800 .67rem var(--font-sans); cursor: pointer; }
.saved-contest ul { margin-top: .7rem; list-style: none; }
.saved-contest li { display: flex; justify-content: space-between; gap: 1rem; padding: .45rem 0; color: var(--color-text-muted); font: .74rem var(--font-sans); }
.saved-contest li button { border: 0; background: transparent; color: var(--color-red); cursor: pointer; }
.empty-admin { padding: 1.5rem 0; color: var(--color-text-muted); }
@media (max-width: 850px) { .admin-grid { grid-template-columns: 1fr; } }
@media (max-width: 580px) { .admin-page { padding-top: 3rem; } .admin-header { align-items: flex-start; flex-direction: column; } .field-pair { grid-template-columns: 1fr; } .auth-card { padding: 2rem 1.3rem; } }
</style>
