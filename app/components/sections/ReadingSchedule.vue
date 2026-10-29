<script setup lang="ts">
import type { ReadingDayKey, ReadingQueueKey } from '~/composables/useReadingSchedule'

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { queues, status, error, markRead, markAbsent, moveEntry, addEntry, removeEntry } = useReadingSchedule()
const { data: session, refresh: refreshSession } = useFetch('/api/auth/session', { default: () => ({ authenticated: false as const }) })
const loginUrl = '/api/auth/discord?returnTo=/lecturas'

const selectedDay = ref<ReadingDayKey>('wednesday')
const managerMode = ref(false)
const newAuthor = ref('')
const newWork = ref('')
const mutationError = ref('')
const busy = ref(false)
const sessionExpired = ref(false)

const day = computed(() => readingDays.find(item => item.key === selectedDay.value) ?? readingDays[0])
const currentQueue = computed(() => queues.value[day.value.queue])
const activeEntries = computed(() => currentQueue.value.filter(entry => !entry.paused))
const canManage = computed(() => session.value.authenticated)

watch(canManage, (value) => {
  if (value) sessionExpired.value = false
  else managerMode.value = false
})

const runAction = async (action: () => Promise<unknown>) => {
  mutationError.value = ''
  busy.value = true
  try {
    await action()
  } catch (error: any) {
    if ((error?.statusCode ?? error?.status) === 401) {
      managerMode.value = false
      sessionExpired.value = true
      await refreshSession()
      return
    }
    mutationError.value = error?.data?.message || error?.data?.statusMessage || 'No se pudo guardar el cambio.'
  } finally {
    busy.value = false
  }
}

const submitEntry = async () => {
  await runAction(() => addEntry(day.value.queue, newAuthor.value, newWork.value))
  if (!mutationError.value) {
    newAuthor.value = ''
    newWork.value = ''
  }
}

const queueLabel = (queue: ReadingQueueKey) => queue === 'professional' ? 'Lista profesional' : 'Lista comunitaria'
</script>

<template>
  <section id="lecturas" class="reading-section" :class="{ 'reading-section--compact': props.compact }">
    <div class="container">
      <div class="section-intro section-intro--split">
        <div>
          <span class="kicker">Ritual semanal</span>
          <h2>Tu turno para ser leído</h2>
          <p>Consulta el orden, confirma tu obra y llega a la llamada. Si no estás presente, recibes un strike y conservas tu lugar en la lista.</p>
        </div>
        <div class="rule-pill" aria-label="Regla de strikes">
          <span class="rule-pill__number">3</span>
          <span>strikes<br>máximo</span>
        </div>
      </div>

      <div class="schedule-shell">
        <div class="day-tabs" role="tablist" aria-label="Días de lectura">
          <button
            v-for="item in readingDays"
            :key="item.key"
            class="day-tab"
            :class="{ 'day-tab--active': selectedDay === item.key }"
            role="tab"
            :aria-selected="selectedDay === item.key"
            @click="selectedDay = item.key"
          >
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="queue-head">
          <div>
            <span class="queue-label">{{ queueLabel(day.queue) }}</span>
            <p>{{ day.note }}</p>
          </div>
          <button v-if="canManage" class="manager-toggle" :class="{ active: managerMode }" @click="managerMode = !managerMode">
            <span class="lock-icon" aria-hidden="true">{{ managerMode ? '×' : '↗' }}</span>
            {{ managerMode ? 'Cerrar gestión' : 'Gestionar lista' }}
          </button>
          <a v-else class="manager-toggle" :href="loginUrl"><span class="lock-icon" aria-hidden="true">↗</span>Acceso de gestión</a>
        </div>

        <p v-if="error" class="load-state load-state--error">No se pudo cargar la lista.</p>
        <p v-else-if="status === 'pending'" class="load-state">Cargando lista…</p>
        <p v-else-if="currentQueue.length === 0" class="load-state">Todavía no hay autores en esta lista.</p>
        <p v-if="mutationError" class="mutation-error" role="alert">{{ mutationError }}</p>
        <p v-if="sessionExpired" class="mutation-error" role="alert">
          Tu sesión expiró y el cambio no se guardó. <a :href="loginUrl">Volver a iniciar sesión</a>
        </p>

        <ol class="reading-list">
          <li
            v-for="(entry, index) in currentQueue"
            :key="entry.id"
            class="reading-row"
            :class="{ 'reading-row--next': !entry.paused && entry.id === activeEntries[0]?.id, 'reading-row--paused': entry.paused }"
          >
            <span class="position">{{ String(index + 1).padStart(2, '0') }}</span>
            <div class="author-info">
              <div class="author-line">
                <strong>{{ entry.author }}</strong>
                <span v-if="!entry.paused && entry.id === activeEntries[0]?.id" class="next-badge">Siguiente</span>
                <span v-if="entry.paused" class="paused-badge">En pausa</span>
              </div>
              <span>{{ entry.work || 'Obra por confirmar' }}</span>
            </div>
            <div class="strikes" :aria-label="`${entry.strikes} de 3 strikes`">
              <span v-for="strike in 3" :key="strike" :class="{ filled: strike <= entry.strikes }"></span>
              <small>{{ entry.strikes }}/3</small>
            </div>
            <div v-if="managerMode" class="row-actions">
              <button :disabled="busy || index === 0" aria-label="Subir en la lista" @click="runAction(() => moveEntry(entry.id, 'up'))">↑</button>
              <button :disabled="busy || index === currentQueue.length - 1" aria-label="Bajar en la lista" @click="runAction(() => moveEntry(entry.id, 'down'))">↓</button>
              <button class="action-read" :disabled="busy" @click="runAction(() => markRead(day.queue, entry.id))">Leído</button>
              <button :disabled="busy || entry.strikes >= 3" @click="runAction(() => markAbsent(day.queue, entry.id))">Ausente</button>
              <button class="action-remove" :disabled="busy" aria-label="Quitar autor" @click="runAction(() => removeEntry(day.queue, entry.id))">×</button>
            </div>
          </li>
        </ol>

        <form v-if="managerMode" class="add-author" @submit.prevent="submitEntry">
          <label>
            <span>Autor</span>
            <input v-model="newAuthor" required placeholder="Nombre en Discord">
          </label>
          <label>
            <span>Obra <em>opcional</em></span>
            <input v-model="newWork" placeholder="Título o capítulo">
          </label>
          <button type="submit" :disabled="busy">{{ busy ? 'Guardando…' : 'Añadir al final' }}</button>
        </form>

        <div class="queue-foot">
          <p><span aria-hidden="true">●</span> El título es orientativo: puedes presentar otro texto durante la sesión.</p>
          <NuxtLink v-if="props.compact" to="/lecturas">Abrir la lista completa <span>→</span></NuxtLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reading-section { padding: 7rem 0; background: var(--color-surface-soft); }
.reading-section--compact { padding-top: 6rem; }
.section-intro--split { display: flex; justify-content: space-between; align-items: end; gap: 2rem; }
.section-intro { max-width: 900px; margin-bottom: 2.5rem; }
.section-intro h2 { max-width: 680px; margin: .45rem 0 1rem; }
.section-intro p { max-width: 680px; color: var(--color-text-muted); font-size: 1.06rem; }
.kicker { color: var(--color-pink); font-family: var(--font-sans); font-size: .75rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.rule-pill { min-width: 150px; display: flex; gap: .7rem; align-items: center; padding: .8rem 1.1rem; border: 1px solid var(--color-border); border-radius: 999px; font-family: var(--font-sans); color: var(--color-text-muted); font-size: .72rem; line-height: 1.2; text-transform: uppercase; }
.rule-pill__number { color: var(--color-red); font: 700 2rem/1 var(--font-display); }
.schedule-shell { overflow: hidden; border: 1px solid var(--color-border); border-radius: 28px; background: var(--color-surface); box-shadow: var(--shadow-lg); }
.day-tabs { display: grid; grid-template-columns: repeat(3, 1fr); padding: .55rem; background: var(--color-ink); gap: .35rem; }
.day-tab { display: flex; justify-content: space-between; align-items: center; min-height: 58px; padding: .75rem 1.1rem; border: 0; border-radius: 18px; background: transparent; color: rgba(255,255,255,.62); font: 700 .92rem var(--font-sans); cursor: pointer; }
.day-tab strong { color: inherit; font-size: .76rem; }
.day-tab--active { background: var(--color-pink); color: white; box-shadow: 0 8px 24px rgba(229, 47, 107, .28); }
.queue-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.8rem 2rem 1.3rem; border-bottom: 1px solid var(--color-border-light); }
.queue-label { font: 800 .76rem var(--font-sans); letter-spacing: .12em; text-transform: uppercase; color: var(--color-ink); }
.queue-head p { margin-top: .25rem; color: var(--color-text-muted); font-size: .9rem; }
.manager-toggle { border: 1px solid var(--color-border); border-radius: 999px; background: transparent; color: var(--color-ink); padding: .65rem 1rem; font: 700 .78rem var(--font-sans); cursor: pointer; }
.manager-toggle:hover, .manager-toggle.active { border-color: var(--color-pink); color: var(--color-pink); }
.lock-icon { margin-right: .35rem; }
.load-state { padding: 2.5rem 2rem; color: var(--color-text-muted); font: .86rem var(--font-sans); text-align: center; }
.load-state--error, .mutation-error { color: var(--color-red); }
.mutation-error a { color: inherit; font-weight: 800; text-decoration: underline; }
.mutation-error { margin: 1rem 2rem 0; padding: .7rem 1rem; border-radius: 10px; background: var(--color-red-soft); font: .76rem var(--font-sans); }
.reading-list { list-style: none; padding: 0 2rem; }
.reading-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto auto; align-items: center; gap: 1rem; min-height: 92px; border-bottom: 1px solid var(--color-border-light); }
.reading-row--next { position: relative; }
.reading-row--next::before { content: ''; position: absolute; left: -2rem; width: 4px; height: 44px; border-radius: 0 4px 4px 0; background: var(--color-pink); }
.reading-row--paused { opacity: .48; }
.position { font: 600 1.05rem var(--font-display); color: var(--color-text-faint); }
.author-info { min-width: 0; }
.author-line { display: flex; align-items: center; gap: .65rem; }
.author-info strong { color: var(--color-ink); font: 700 1.07rem var(--font-sans); }
.author-info > span { display: block; margin-top: .2rem; color: var(--color-text-muted); font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.next-badge, .paused-badge { border-radius: 999px; padding: .2rem .5rem; background: var(--color-pink-soft); color: var(--color-pink); font: 800 .62rem var(--font-sans); letter-spacing: .07em; text-transform: uppercase; }
.paused-badge { color: var(--color-red); background: var(--color-red-soft); }
.strikes { display: flex; align-items: center; gap: .3rem; }
.strikes > span { width: 8px; height: 8px; border: 1px solid var(--color-border-strong); border-radius: 50%; }
.strikes > span.filled { background: var(--color-red); border-color: var(--color-red); }
.strikes small { margin-left: .25rem; color: var(--color-text-faint); font: 700 .7rem var(--font-sans); }
.row-actions { display: flex; gap: .4rem; }
.row-actions button, .add-author button { border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface); color: var(--color-ink); padding: .5rem .65rem; font: 700 .7rem var(--font-sans); cursor: pointer; }
.row-actions .action-read { background: var(--color-ink); color: white; border-color: var(--color-ink); }
.row-actions .action-remove { color: var(--color-red); }
.row-actions button:disabled { opacity: .35; cursor: not-allowed; }
.add-author { display: grid; grid-template-columns: 1fr 1fr auto; gap: .8rem; align-items: end; margin: 1rem 2rem; padding: 1rem; background: var(--color-surface-soft); border-radius: 16px; }
.add-author label span { display: block; margin: 0 0 .35rem .15rem; color: var(--color-text-muted); font: 700 .7rem var(--font-sans); }
.add-author em { font-weight: 500; }
.add-author input { width: 100%; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface); color: var(--color-text); padding: .7rem .8rem; font: .85rem var(--font-sans); }
.add-author button { height: 42px; background: var(--color-pink); color: white; border-color: var(--color-pink); }
.queue-foot { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.15rem 2rem; background: var(--color-surface-soft); color: var(--color-text-muted); font-size: .77rem; }
.queue-foot p span { color: var(--color-gold); margin-right: .35rem; }
.queue-foot a { color: var(--color-pink); font: 800 .76rem var(--font-sans); }
@media (max-width: 760px) {
  .reading-section { padding: 4.5rem 0; }
  .section-intro--split { align-items: flex-start; flex-direction: column; }
  .rule-pill { min-width: 0; }
  .day-tab { flex-direction: column; justify-content: center; gap: .2rem; padding: .65rem .25rem; }
  .queue-head { align-items: flex-start; padding: 1.25rem; }
  .queue-head p { max-width: 210px; }
  .manager-toggle { padding: .55rem .7rem; font-size: 0; }
  .manager-toggle .lock-icon { margin: 0; font-size: 1rem; }
  .reading-list { padding: 0 1rem; }
  .reading-row { grid-template-columns: 32px minmax(0, 1fr) auto; gap: .65rem; min-height: 90px; }
  .reading-row--next::before { left: -1rem; }
  .row-actions { grid-column: 2 / -1; padding-bottom: .75rem; }
  .add-author { grid-template-columns: 1fr; margin: 1rem; }
  .queue-foot { align-items: flex-start; flex-direction: column; padding: 1rem; }
}
</style>
