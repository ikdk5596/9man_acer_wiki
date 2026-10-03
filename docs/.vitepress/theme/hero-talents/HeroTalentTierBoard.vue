<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'
import { access, canManagePosts, ensureAccess, useAccessSession } from '../access/client.mjs'
import { HERO_TALENT_CATALOG, HERO_TALENT_MAP } from './catalog.mjs'
import { emptyTalentTierState, loadHeroTalentTiers, saveHeroTalentTiers } from './client.mjs'

const props = defineProps({
  edit: { type: Boolean, default: false },
})

useAccessSession()

const heroTiers = reactive(emptyTalentTierState())
const selectedHeroId = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const updatedAt = ref(null)

const canEdit = computed(() => canManagePosts(access.role))
const selectedHero = computed(() => HERO_TALENT_MAP.get(selectedHeroId.value) || null)
const selectedTiers = computed(() =>
  selectedHeroId.value ? heroTiers[selectedHeroId.value] : null
)

const rankedHeroes = computed(() =>
  HERO_TALENT_CATALOG.filter(hero => {
    const tiers = heroTiers[hero.id]
    return Boolean(tiers?.tier1 || tiers?.tier2 || tiers?.tier3)
  })
)

function talentFor(hero, id) {
  return hero?.advancedTalents.find(talent => talent.id === id) || null
}

function selectedTalentEntries(hero) {
  const tiers = heroTiers[hero.id]
  if (!tiers) return []

  return ['tier1', 'tier2', 'tier3']
    .map(key => ({
      key,
      talent: talentFor(hero, tiers[key]),
    }))
    .filter(item => item.talent)
}

function hasSelectedTalent(hero) {
  return selectedTalentEntries(hero).length > 0
}

function selectHero(heroId) {
  selectedHeroId.value = selectedHeroId.value === heroId ? '' : heroId
  error.value = ''
  notice.value = ''
}

function tierLabel(key) {
  if (key === 'tier1') return '1티어'
  if (key === 'tier2') return '2티어'
  return '3티어'
}

function isUsedByOtherTier(talentId, currentKey) {
  if (!selectedTiers.value || !talentId) return false

  return ['tier1', 'tier2', 'tier3'].some(
    key => key !== currentKey && selectedTiers.value[key] === talentId
  )
}

function changeTier(key, value) {
  if (!selectedTiers.value) return

  const id = String(value || '')

  if (id && isUsedByOtherTier(id, key)) {
    error.value = '같은 영웅에서 동일한 재능을 여러 티어에 중복 선택할 수 없습니다.'
    return
  }

  selectedTiers.value[key] = id
  error.value = ''
  notice.value = ''
}

function formattedDate(value) {
  return value instanceof Date
    ? new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(value)
    : ''
}

function replaceState(value) {
  for (const hero of HERO_TALENT_CATALOG) {
    const source = value?.[hero.id] || {}
    heroTiers[hero.id].tier1 = source.tier1 || ''
    heroTiers[hero.id].tier2 = source.tier2 || ''
    heroTiers[hero.id].tier3 = source.tier3 || ''
  }
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''

  try {
    const saved = await saveHeroTalentTiers(heroTiers)
    replaceState(saved)

    const result = await loadHeroTalentTiers()
    replaceState(result.heroes)
    updatedAt.value = result.updatedAt
    notice.value = '영웅 재능 티어를 저장했습니다.'
  } catch (cause) {
    error.value = cause?.message || '영웅 재능 티어를 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await ensureAccess()
    const result = await loadHeroTalentTiers()
    replaceState(result.heroes)
    updatedAt.value = result.updatedAt
  } catch (cause) {
    error.value = cause?.message || '영웅 재능 티어를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="hero-talent-board">
    <div class="board-heading">
      <div>
        <p class="kicker">HERO ADVANCED TALENT</p>
        <h1>영웅 재능 티어</h1>
        <p class="description">영웅별 고급 재능 중 1~3티어를 선정합니다.</p>
      </div>

      <button
        v-if="edit && canEdit"
        type="button"
        class="save-button"
        :disabled="saving || loading"
        @click="save"
      >
        {{ saving ? '저장 중...' : '전체 저장' }}
      </button>
    </div>

    <p v-if="edit && !loading && !canEdit" class="message error">
      관리자 이상만 영웅 재능 티어를 수정할 수 있습니다.
    </p>
    <p v-if="error" class="message error" role="alert">{{ error }}</p>
    <p v-if="notice" class="message notice" role="status">{{ notice }}</p>
    <p v-if="loading" class="message">영웅 재능 티어를 불러오는 중...</p>

    <template v-else-if="edit">
      <div class="hero-grid">
        <button
          v-for="hero in HERO_TALENT_CATALOG"
          :key="hero.id"
          type="button"
          class="hero-card"
          :class="{ active: selectedHeroId === hero.id }"
          @click="selectHero(hero.id)"
        >
          <img :src="withBase(hero.image)" :alt="hero.name">
          <strong>{{ hero.name }}</strong>
          <span>{{ hero.troop || '병종 미상' }}</span>
          <small>고급 재능 {{ hero.advancedTalents.length }}개</small>

          <div v-if="hasSelectedTalent(hero)" class="hero-card-tier-summary">
            <div
              v-for="item in selectedTalentEntries(hero)"
              :key="item.key"
              class="hero-card-tier-line"
            >
              <b>{{ tierLabel(item.key) }}</b>
              <span :title="item.talent.text">{{ item.talent.text }}</span>
            </div>
          </div>
        </button>
      </div>

      <section v-if="selectedHero" class="hero-editor">
        <div class="editor-hero">
          <a :href="withBase(selectedHero.href)">
            <img :src="withBase(selectedHero.image)" :alt="selectedHero.name">
          </a>
          <div>
            <p>{{ selectedHero.troop }}</p>
            <h2>{{ selectedHero.name }}</h2>
            <span>고급 재능 {{ selectedHero.advancedTalents.length }}개</span>
          </div>
        </div>

        <div class="tier-selects">
          <label
            v-for="key in ['tier1', 'tier2', 'tier3']"
            :key="key"
            class="tier-select-row"
          >
            <strong>{{ tierLabel(key) }}</strong>
            <select
              :value="selectedTiers[key]"
              @change="changeTier(key, $event.target.value)"
            >
              <option value="">선택 안 함</option>
              <option
                v-for="talent in selectedHero.advancedTalents"
                :key="talent.id"
                :value="talent.id"
                :disabled="isUsedByOtherTier(talent.id, key)"
              >
                {{ talent.text }}{{ talent.maxStacks > 1 ? ` (최대 ${talent.maxStacks}중첩)` : '' }}
              </option>
            </select>
          </label>
        </div>

        <div class="selected-preview">
          <article v-for="key in ['tier1', 'tier2', 'tier3']" :key="key">
            <b>{{ tierLabel(key) }}</b>
            <template v-if="talentFor(selectedHero, selectedTiers[key])">
              <strong>{{ talentFor(selectedHero, selectedTiers[key]).text }}</strong>
              <small v-if="talentFor(selectedHero, selectedTiers[key]).maxStacks > 1">
                최대 {{ talentFor(selectedHero, selectedTiers[key]).maxStacks }}중첩
              </small>
            </template>
            <span v-else>미선정</span>
          </article>
        </div>
      </section>

      <p v-else class="message">
        영웅 이미지를 선택하면 해당 영웅의 고급 재능 선택창이 열립니다.
      </p>
    </template>

    <template v-else>
      <p v-if="!rankedHeroes.length" class="message">
        아직 등록된 영웅 재능 티어가 없습니다.
      </p>

      <div v-else class="public-grid">
        <article
          v-for="hero in rankedHeroes"
          :key="hero.id"
          class="public-hero-card"
          :class="{ active: selectedHeroId === hero.id }"
        >
          <button
            type="button"
            class="public-hero-toggle"
            :aria-expanded="selectedHeroId === hero.id"
            @click="selectHero(hero.id)"
          >
            <img :src="withBase(hero.image)" :alt="hero.name">
            <strong>{{ hero.name }}</strong>
            <span>{{ hero.troop || '병종 미상' }}</span>
          </button>

          <div v-if="selectedHeroId === hero.id" class="public-card-tiers">
            <div
              v-for="item in selectedTalentEntries(hero)"
              :key="item.key"
              class="public-card-tier"
            >
              <b>{{ tierLabel(item.key) }}</b>
              <div>
                <strong>{{ item.talent.text }}</strong>
                <small v-if="item.talent.maxStacks > 1">
                  최대 {{ item.talent.maxStacks }}중첩
                </small>
              </div>
            </div>
          </div>
        </article>
      </div>
    </template>

    <p v-if="updatedAt" class="updated">
      마지막 수정: {{ formattedDate(updatedAt) }}
    </p>
  </section>
</template>

<style scoped>
.hero-talent-board { margin:18px 0 40px; }
.board-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px; }
.board-heading h1 { margin:0; border:0; font-size:32px; }
.kicker { margin:0 0 4px !important; color:var(--vp-c-brand-1); font-size:12px; font-weight:800; letter-spacing:.12em; }
.description { margin:6px 0 0 !important; color:var(--vp-c-text-2); font-size:13px; }
.save-button { border:0; border-radius:9px; padding:10px 16px; background:var(--vp-c-brand-1); color:#fff; cursor:pointer; font-weight:700; }
.save-button:disabled { opacity:.6; cursor:wait; }
.message { padding:13px; border-radius:9px; background:var(--vp-c-bg-soft); color:var(--vp-c-text-2); }
.message.error { background:var(--vp-c-danger-soft); color:var(--vp-c-danger-1); }
.message.notice { background:var(--vp-c-success-soft); color:var(--vp-c-success-1); }

.hero-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:12px; }
.hero-card { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:0; border:1px solid var(--vp-c-divider); border-radius:12px; padding:10px 7px; background:var(--vp-c-bg-soft); color:var(--vp-c-text-1); cursor:pointer; }
.hero-card:hover,.hero-card.active { border-color:var(--vp-c-brand-1); background:var(--vp-c-brand-soft); }
.hero-card img { width:72px; height:72px; border-radius:10px; object-fit:cover; }
.hero-card strong { font-size:13px; text-align:center; }
.hero-card span,.hero-card small { color:var(--vp-c-text-2); font-size:11px; text-align:center; }

.hero-card-tier-summary { width:100%; display:grid; gap:5px; margin-top:5px; padding-top:7px; border-top:1px solid var(--vp-c-divider); }
.hero-card-tier-line { width:100%; min-width:0; display:grid; grid-template-columns:34px minmax(0,1fr); gap:4px; align-items:start; text-align:left; }
.hero-card-tier-line b { color:var(--vp-c-brand-1); font-size:10px; line-height:1.35; }
.hero-card-tier-line span { min-width:0; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; color:var(--vp-c-text-2); font-size:10px; line-height:1.35; text-align:left; }

.hero-editor { margin-top:22px; border:1px solid var(--vp-c-divider); border-radius:14px; padding:18px; background:var(--vp-c-bg-soft); }
.editor-hero { display:flex; align-items:center; gap:14px; margin-bottom:18px; }
.editor-hero img { width:88px; height:88px; border-radius:12px; object-fit:cover; }
.editor-hero p,.editor-hero h2 { margin:0 !important; }
.editor-hero p,.editor-hero span { color:var(--vp-c-text-2); font-size:12px; }
.editor-hero h2 { border:0; padding:2px 0; font-size:22px; }

.tier-selects { display:grid; gap:10px; }
.tier-select-row { display:grid; grid-template-columns:72px 1fr; align-items:center; gap:10px; }
.tier-select-row strong { text-align:center; }
.tier-select-row select { width:100%; min-width:0; border:1px solid var(--vp-c-divider); border-radius:9px; padding:10px; background:var(--vp-c-bg); color:var(--vp-c-text-1); }

.selected-preview { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:16px; }
.selected-preview article { display:grid; gap:5px; border:1px solid var(--vp-c-divider); border-radius:10px; padding:12px; background:var(--vp-c-bg); }
.selected-preview b { color:var(--vp-c-brand-1); }
.selected-preview strong { font-size:13px; line-height:1.45; }
.selected-preview small,.selected-preview span { color:var(--vp-c-text-2); font-size:11px; }

.public-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; align-items:start; }
.public-hero-card { min-width:0; overflow:hidden; border:1px solid var(--vp-c-divider); border-radius:14px; background:var(--vp-c-bg-soft); }
.public-hero-card.active { border-color:var(--vp-c-brand-1); }
.public-hero-toggle { width:100%; display:flex; flex-direction:column; align-items:center; gap:5px; border:0; padding:12px 8px; background:transparent; color:var(--vp-c-text-1); cursor:pointer; }
.public-hero-toggle:hover { background:var(--vp-c-brand-soft); }
.public-hero-toggle img { width:88px; height:88px; border-radius:11px; object-fit:cover; }
.public-hero-toggle strong { font-size:14px; text-align:center; }
.public-hero-toggle span { color:var(--vp-c-text-2); font-size:11px; }
.public-card-tiers { display:grid; gap:8px; padding:0 10px 10px; }
.public-card-tier { display:grid; grid-template-columns:40px minmax(0,1fr); gap:7px; align-items:start; border-top:1px solid var(--vp-c-divider); padding-top:8px; }
.public-card-tier > b { color:var(--vp-c-brand-1); font-size:11px; }
.public-card-tier > div { min-width:0; display:grid; gap:3px; }
.public-card-tier strong { font-size:11px; line-height:1.45; font-weight:600; overflow-wrap:anywhere; }
.public-card-tier small { color:var(--vp-c-text-2); font-size:10px; }

.updated { margin-top:16px !important; color:var(--vp-c-text-2); font-size:12px; text-align:right; }

@media (max-width:640px) {
  .board-heading { align-items:stretch; flex-direction:column; }
  .hero-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
  .hero-card { padding:8px 4px; }
  .hero-card img { width:60px; height:60px; }
  .tier-select-row { grid-template-columns:1fr; gap:5px; }
  .tier-select-row strong { text-align:left; }
  .selected-preview { grid-template-columns:1fr; }
  .public-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
  .public-hero-toggle { padding:8px 4px; }
  .public-hero-toggle img { width:60px; height:60px; }
  .public-card-tiers { padding:0 7px 8px; gap:6px; }
  .public-card-tier { grid-template-columns:1fr; gap:3px; }
}
</style>
