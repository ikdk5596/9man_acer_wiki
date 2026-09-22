<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'
import { access, canManagePosts, ensureAccess, useAccessSession } from '../access/client.mjs'
import { catalogFor, TIER_KEYS } from './catalog.mjs'
import { emptyTiers, loadTierList, saveTierList } from './client.mjs'

const props = defineProps({
  kind: { type: String, required: true },
  edit: { type: Boolean, default: false },
})

useAccessSession()
const catalog = catalogFor(props.kind)
const itemMap = new Map(catalog.map(item => [item.id, item]))
const tiers = reactive(emptyTiers())
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const updatedAt = ref(null)
const dragging = ref('')

const title = computed(() => props.kind === 'soldiers' ? '병종별 등급' : '정책별 등급')
const canEdit = computed(() => canManagePosts(access.role))
const assigned = computed(() => new Set(TIER_KEYS.flatMap(tier => tiers[tier])))
const unclassified = computed(() => catalog.filter(item => !assigned.value.has(item.id)))
const hasRanks = computed(() => TIER_KEYS.some(tier => tiers[tier].length > 0))

function replaceTiers(value) {
  for (const tier of TIER_KEYS) tiers[tier].splice(0, tiers[tier].length, ...(value[tier] || []))
}

function removeEverywhere(id) {
  for (const tier of TIER_KEYS) {
    const index = tiers[tier].indexOf(id)
    if (index >= 0) tiers[tier].splice(index, 1)
  }
}

function move(id, target, index = null) {
  if (!props.edit || !canEdit.value || !itemMap.has(id)) return
  removeEverywhere(id)
  if (!TIER_KEYS.includes(target)) return
  const position = Number.isInteger(index) ? Math.max(0, Math.min(index, tiers[target].length)) : tiers[target].length
  tiers[target].splice(position, 0, id)
  notice.value = ''
}

function startDrag(event, id) {
  if (!props.edit || !canEdit.value) return
  dragging.value = id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', id)
}

function dropped(event, target, index = null) {
  const id = event.dataTransfer.getData('text/plain') || dragging.value
  move(id, target, index)
  dragging.value = ''
}

function itemFor(id) {
  return itemMap.get(id)
}

function formattedDate(value) {
  return value instanceof Date ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : ''
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    replaceTiers(await saveTierList(props.kind, tiers))
    const result = await loadTierList(props.kind)
    updatedAt.value = result.updatedAt
    notice.value = '등급표를 저장했습니다.'
  } catch (cause) {
    error.value = cause?.message || '등급표를 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await ensureAccess()
    const result = await loadTierList(props.kind)
    replaceTiers(result.tiers)
    updatedAt.value = result.updatedAt
  } catch (cause) {
    error.value = cause?.message || '등급표를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="tier-board">
    <div class="tier-heading">
      <div>
        <p class="tier-kicker">TIER LIST</p>
        <h1>{{ title }}</h1>
      </div>
      <button v-if="edit && canEdit" type="button" :disabled="saving || loading" @click="save">
        {{ saving ? '저장 중…' : '등급표 저장' }}
      </button>
    </div>

    <p v-if="edit && !loading && !canEdit" class="tier-error">관리자 이상만 등급표를 수정할 수 있습니다.</p>
    <p v-if="error" class="tier-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="tier-notice" role="status">{{ notice }}</p>
    <p v-if="loading" class="tier-empty">등급표를 불러오는 중…</p>
    <p v-else-if="!edit && !hasRanks" class="tier-empty">아직 등록된 등급표가 없습니다.</p>

    <div v-else class="tier-rows">
      <div
        v-for="tier in TIER_KEYS"
        :key="tier"
        class="tier-row"
        :class="`tier-${tier.toLowerCase()}`"
        @dragover.prevent
        @drop.prevent="dropped($event, tier)"
      >
        <strong class="tier-label">{{ tier }}</strong>
        <div class="tier-items">
          <article
            v-for="(id, index) in tiers[tier]"
            :key="id"
            class="tier-card"
            :class="{ dragging: dragging === id }"
            :draggable="edit && canEdit"
            @dragstart="startDrag($event, id)"
            @dragend="dragging = ''"
            @dragover.prevent
            @drop.stop.prevent="dropped($event, tier, index)"
          >
            <a :href="withBase(itemFor(id).href)">
              <img :src="withBase(itemFor(id).image)" :alt="itemFor(id).name">
              <span>{{ itemFor(id).name }}</span>
            </a>
            <select v-if="edit && canEdit" :value="tier" :aria-label="`${itemFor(id).name} 등급`" @change="move(id, $event.target.value)">
              <option value="">미분류</option>
              <option v-for="key in TIER_KEYS" :key="key" :value="key">{{ key }}</option>
            </select>
          </article>
          <span v-if="!tiers[tier].length" class="tier-placeholder">{{ edit ? '여기로 드래그' : '—' }}</span>
        </div>
      </div>
    </div>

    <section v-if="edit && canEdit && !loading" class="tier-unclassified" @dragover.prevent @drop.prevent="dropped($event, '')">
      <h2>미분류 <small>{{ unclassified.length }}개</small></h2>
      <p>이미지를 원하는 등급 칸으로 드래그하세요. 모바일에서는 선택 상자를 사용할 수 있습니다.</p>
      <div class="tier-pool">
        <article
          v-for="item in unclassified"
          :key="item.id"
          class="tier-card"
          draggable="true"
          @dragstart="startDrag($event, item.id)"
          @dragend="dragging = ''"
        >
          <a :href="withBase(item.href)">
            <img :src="withBase(item.image)" :alt="item.name">
            <span>{{ item.name }}</span>
          </a>
          <select value="" :aria-label="`${item.name} 등급`" @change="move(item.id, $event.target.value)">
            <option value="">미분류</option>
            <option v-for="key in TIER_KEYS" :key="key" :value="key">{{ key }}</option>
          </select>
        </article>
      </div>
    </section>

    <p v-if="updatedAt" class="tier-updated">마지막 수정: {{ formattedDate(updatedAt) }}</p>
  </section>
</template>

<style scoped>
.tier-board { margin: 18px 0 40px; }
.tier-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px; }
.tier-heading h1 { margin:0; border:0; font-size:32px; }
.tier-kicker { margin:0 0 4px !important; color:var(--vp-c-brand-1); font-size:12px; font-weight:800; letter-spacing:.12em; }
.tier-heading button { border:0; border-radius:9px; padding:10px 16px; background:var(--vp-c-brand-1); color:#fff; cursor:pointer; font-weight:700; }
.tier-heading button:disabled { cursor:wait; opacity:.6; }
.tier-rows { overflow:hidden; border:1px solid var(--vp-c-divider); border-radius:14px; }
.tier-row { display:grid; grid-template-columns:72px 1fr; min-height:118px; border-bottom:1px solid var(--vp-c-divider); }
.tier-row:last-child { border-bottom:0; }
.tier-label { display:grid; place-items:center; color:#1b1b1f; font-size:34px; }
.tier-s .tier-label { background:#ff7f7f; } .tier-a .tier-label { background:#ffbf7f; }
.tier-b .tier-label { background:#ffdf7f; } .tier-c .tier-label { background:#ffff7f; }
.tier-d .tier-label { background:#bfff7f; } .tier-e .tier-label { background:#7fffff; }
.tier-f .tier-label { background:#bf9fff; }
.tier-items,.tier-pool { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px; background:var(--vp-c-bg-soft); }
.tier-card { width:88px; padding:7px; border:1px solid var(--vp-c-divider); border-radius:10px; background:var(--vp-c-bg); box-shadow:var(--vp-shadow-1); text-align:center; }
.tier-card.dragging { opacity:.4; }
.tier-card a { display:grid; gap:5px; color:var(--vp-c-text-1); font-size:12px; font-weight:700; line-height:1.25; text-decoration:none; }
.tier-card img { width:72px; height:72px; margin:auto; border-radius:8px; object-fit:cover; }
.tier-card select { width:100%; margin-top:7px; padding:4px; border:1px solid var(--vp-c-divider); border-radius:6px; background:var(--vp-c-bg); color:var(--vp-c-text-1); }
.tier-placeholder { color:var(--vp-c-text-3); font-size:13px; }
.tier-unclassified { margin-top:24px; padding:18px; border:1px dashed var(--vp-c-divider); border-radius:14px; }
.tier-unclassified h2 { margin:0; border:0; font-size:20px; }
.tier-unclassified h2 small { color:var(--vp-c-text-2); font-size:13px; }
.tier-unclassified > p { color:var(--vp-c-text-2); font-size:13px; }
.tier-pool { padding:0; background:transparent; }
.tier-error,.tier-notice,.tier-empty { padding:13px; border-radius:9px; }
.tier-error { background:var(--vp-c-danger-soft); color:var(--vp-c-danger-1); }
.tier-notice { background:var(--vp-c-success-soft); color:var(--vp-c-success-1); }
.tier-empty { background:var(--vp-c-bg-soft); color:var(--vp-c-text-2); }
.tier-updated { margin-top:16px !important; color:var(--vp-c-text-2); font-size:12px; text-align:right; }
@media (max-width:640px) {
  .tier-heading { align-items:stretch; flex-direction:column; }
  .tier-row { grid-template-columns:48px 1fr; min-height:96px; }
  .tier-label { font-size:25px; }
  .tier-card { width:76px; }
  .tier-card img { width:60px; height:60px; }
}
</style>
