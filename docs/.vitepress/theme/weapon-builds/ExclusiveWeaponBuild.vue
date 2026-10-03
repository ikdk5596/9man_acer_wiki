<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'
import { access, canManagePosts, ensureAccess, useAccessSession } from '../access/client.mjs'
import {
  BUILD_GROUPS,
  EXCLUSIVE_WEAPONS,
  EXCLUSIVE_WEAPON_MAP,
  NORMAL_EQUIPMENT,
  NORMAL_EQUIPMENT_MAP,
} from './catalog.mjs'
import {
  emptyWeaponBuildState,
  loadWeaponBuilds,
  saveWeaponBuilds,
} from './client.mjs'

const props = defineProps({
  edit: { type: Boolean, default: false },
})

useAccessSession()

const builds = reactive(emptyWeaponBuildState())
const selectedWeaponId = ref('')
const selectedGroup = ref('core')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const updatedAt = ref(null)

const canEdit = computed(() => canManagePosts(access.role))

const selectedWeapon = computed(() =>
  EXCLUSIVE_WEAPON_MAP[selectedWeaponId.value] || null
)

const selectedBuild = computed(() =>
  selectedWeaponId.value ? builds[selectedWeaponId.value] : null
)

const configuredWeapons = computed(() =>
  EXCLUSIVE_WEAPONS.filter(weapon => hasBuild(weapon.id))
)

function groupLabel(key) {
  return BUILD_GROUPS.find(group => group.key === key)?.label || key
}

function equipmentFor(id) {
  return NORMAL_EQUIPMENT_MAP[id] || null
}

function equipmentList(build, key) {
  if (!build || !Array.isArray(build[key])) return []

  return build[key]
    .map(equipmentFor)
    .filter(Boolean)
}

function hasBuild(weaponId) {
  const build = builds[weaponId]

  return Boolean(
    build?.core?.length ||
    build?.recommended?.length ||
    build?.usable?.length
  )
}

function buildCount(weaponId) {
  const build = builds[weaponId]

  return (
    (build?.core?.length || 0) +
    (build?.recommended?.length || 0) +
    (build?.usable?.length || 0)
  )
}

function selectWeapon(weaponId) {
  selectedWeaponId.value =
    selectedWeaponId.value === weaponId ? '' : weaponId

  selectedGroup.value = 'core'
  error.value = ''
  notice.value = ''
}

function isUsed(equipmentId) {
  if (!selectedBuild.value) return false

  return BUILD_GROUPS.some(group =>
    selectedBuild.value[group.key]?.includes(equipmentId)
  )
}

function usedGroup(equipmentId) {
  if (!selectedBuild.value) return ''

  const group = BUILD_GROUPS.find(item =>
    selectedBuild.value[item.key]?.includes(equipmentId)
  )

  return group?.key || ''
}

function addEquipment(equipmentId) {
  if (!selectedBuild.value) return

  if (!Object.prototype.hasOwnProperty.call(NORMAL_EQUIPMENT_MAP, equipmentId)) {
    error.value = '등록할 수 없는 장비입니다.'
    return
  }

  if (isUsed(equipmentId)) {
    error.value = `이미 ${groupLabel(usedGroup(equipmentId))}에 등록된 장비입니다.`
    return
  }

  selectedBuild.value[selectedGroup.value].push(equipmentId)

  error.value = ''
  notice.value = ''
}

function removeEquipment(groupKey, equipmentId) {
  if (!selectedBuild.value) return

  const list = selectedBuild.value[groupKey]
  if (!Array.isArray(list)) return

  const index = list.indexOf(equipmentId)

  if (index >= 0) {
    list.splice(index, 1)
  }

  error.value = ''
  notice.value = ''
}
const draggingEquipmentId = ref('')
const draggingFromGroup = ref('')
const dragOverGroup = ref('')

function startEquipmentDrag(event, equipmentId, fromGroup = '') {
  if (!Object.prototype.hasOwnProperty.call(NORMAL_EQUIPMENT_MAP, equipmentId)) {
    event.preventDefault()
    return
  }

  draggingEquipmentId.value = equipmentId
  draggingFromGroup.value = fromGroup
  dragOverGroup.value = ''

  event.dataTransfer.effectAllowed = fromGroup ? 'move' : 'copy'
  event.dataTransfer.setData('text/plain', equipmentId)
}

function endEquipmentDrag() {
  draggingEquipmentId.value = ''
  draggingFromGroup.value = ''
  dragOverGroup.value = ''
}

function enterBuildGroup(groupKey) {
  if (!draggingEquipmentId.value) return
  dragOverGroup.value = groupKey
}

function leaveBuildGroup(event, groupKey) {
  if (event.currentTarget.contains(event.relatedTarget)) return

  if (dragOverGroup.value === groupKey) {
    dragOverGroup.value = ''
  }
}

function dropEquipment(groupKey) {
  const equipmentId = draggingEquipmentId.value
  const fromGroup = draggingFromGroup.value

  dragOverGroup.value = ''

  if (!selectedBuild.value || !equipmentId) {
    endEquipmentDrag()
    return
  }

  if (!Object.prototype.hasOwnProperty.call(NORMAL_EQUIPMENT_MAP, equipmentId)) {
    error.value = '등록할 수 없는 장비입니다.'
    endEquipmentDrag()
    return
  }

  if (!BUILD_GROUPS.some(group => group.key === groupKey)) {
    endEquipmentDrag()
    return
  }

  // 이미 배치된 장비를 같은 그룹에 다시 놓는 경우에는 아무것도 하지 않는다.
  if (fromGroup === groupKey) {
    endEquipmentDrag()
    return
  }

  if (fromGroup) {
    const source = selectedBuild.value[fromGroup]

    if (!Array.isArray(source)) {
      endEquipmentDrag()
      return
    }

    const sourceIndex = source.indexOf(equipmentId)

    if (sourceIndex < 0) {
      endEquipmentDrag()
      return
    }

    // 기존 그룹에서 다른 그룹으로 이동
    source.splice(sourceIndex, 1)
    selectedBuild.value[groupKey].push(equipmentId)
  } else {
    // 하단 일반장비 목록에서 새로 추가
    if (isUsed(equipmentId)) {
      error.value =
        `이미 ${groupLabel(usedGroup(equipmentId))}에 등록된 장비입니다.`

      endEquipmentDrag()
      return
    }

    selectedBuild.value[groupKey].push(equipmentId)
  }

  selectedGroup.value = groupKey
  error.value = ''
  notice.value = ''

  endEquipmentDrag()
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
  for (const weapon of EXCLUSIVE_WEAPONS) {
    const source = value?.[weapon.id] || {}

    builds[weapon.id].core.splice(
      0,
      builds[weapon.id].core.length,
      ...(source.core || [])
    )

    builds[weapon.id].recommended.splice(
      0,
      builds[weapon.id].recommended.length,
      ...(source.recommended || [])
    )

    builds[weapon.id].usable.splice(
      0,
      builds[weapon.id].usable.length,
      ...(source.usable || [])
    )
  }
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''

  try {
    const saved = await saveWeaponBuilds(builds)
    replaceState(saved)

    const result = await loadWeaponBuilds()
    replaceState(result.builds)
    updatedAt.value = result.updatedAt

    notice.value = '전용무기 추천 빌드를 저장했습니다.'
  } catch (cause) {
    error.value =
      cause?.message ||
      '전용무기 추천 빌드를 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await ensureAccess()

    const result = await loadWeaponBuilds()

    replaceState(result.builds)
    updatedAt.value = result.updatedAt
  } catch (cause) {
    error.value =
      cause?.message ||
      '전용무기 추천 빌드를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="weapon-build-board">
    <div class="board-heading">
      <div>
        <p class="kicker">EXCLUSIVE WEAPON BUILD</p>
        <h1>전용무기 추천 빌드</h1>
        <p class="description">
          전용무기별로 함께 사용할 일반장비를 코어 · 추천 · 쓸만함으로 구분합니다.
        </p>
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
      관리자 이상만 전용무기 추천 빌드를 수정할 수 있습니다.
    </p>

    <p v-if="error" class="message error" role="alert">
      {{ error }}
    </p>

    <p v-if="notice" class="message notice" role="status">
      {{ notice }}
    </p>

    <p v-if="loading" class="message">
      전용무기 추천 빌드를 불러오는 중...
    </p>

    <template v-else-if="edit">
      <div class="weapon-grid">
        <button
          v-for="weapon in EXCLUSIVE_WEAPONS"
          :key="weapon.id"
          type="button"
          class="weapon-card"
          :class="{ active: selectedWeaponId === weapon.id }"
          @click="selectWeapon(weapon.id)"
        >
          <img :src="withBase(weapon.image)" :alt="weapon.name">
          <strong>{{ weapon.name }}</strong>
          <small>
            {{ buildCount(weapon.id) ? `${buildCount(weapon.id)}개 등록` : '미등록' }}
          </small>
        </button>
      </div>

      <section v-if="selectedWeapon" class="build-editor">
        <div class="editor-weapon">
          <a :href="withBase(selectedWeapon.href)">
            <img :src="withBase(selectedWeapon.image)" :alt="selectedWeapon.name">
          </a>

          <div>
            <p>전용무기</p>
            <h2>{{ selectedWeapon.name }}</h2>
            <span>추천 일반장비 {{ buildCount(selectedWeapon.id) }}개</span>
          </div>
        </div>

        <div class="build-groups">
          <section
            v-for="group in BUILD_GROUPS"
            :key="group.key"
            class="build-group"
            :class="{
              active: selectedGroup === group.key,
              'drag-over': dragOverGroup === group.key,
            }"
            @dragenter.prevent="enterBuildGroup(group.key)"
            @dragover.prevent
            @dragleave="leaveBuildGroup($event, group.key)"
            @drop.prevent="dropEquipment(group.key)"
          >
            <button
              type="button"
              class="group-title"
              @click="selectedGroup = group.key"
            >
              <strong>{{ group.label }}</strong>
              <span>{{ selectedBuild[group.key].length }}개</span>
            </button>

            <div
              v-if="selectedBuild[group.key].length"
              class="selected-equipment"
            >
              <div
                v-for="equipment in equipmentList(selectedBuild, group.key)"
                :key="equipment.id"
                class="selected-equipment-card"
                draggable="true"
                @dragstart="startEquipmentDrag($event, equipment.id, group.key)"
                @dragend="endEquipmentDrag"
              >
                <img :src="withBase(equipment.image)" :alt="equipment.name">
                <span>{{ equipment.name }}</span>

                <button
                  type="button"
                  class="remove-button"
                  :aria-label="`${equipment.name} 제거`"
                  @click="removeEquipment(group.key, equipment.id)"
                >
                  ×
                </button>
              </div>
            </div>

            <p v-else class="empty-group">
              등록된 장비가 없습니다.
            </p>
          </section>
        </div>

        <div class="equipment-picker">
          <div class="picker-heading">
            <div>
              <strong>{{ groupLabel(selectedGroup) }} 장비 추가</strong>
              <span>일반장비를 선택하세요.</span>
            </div>
          </div>

          <div class="equipment-grid">
            <button
              v-for="equipment in NORMAL_EQUIPMENT"
              :key="equipment.id"
              type="button"
              class="equipment-option"
              :class="{ used: isUsed(equipment.id) }"
              :disabled="isUsed(equipment.id)"
              :draggable="!isUsed(equipment.id)"
              @dragstart="startEquipmentDrag($event, equipment.id)"
              @dragend="endEquipmentDrag"
              @click="addEquipment(equipment.id)"
            >
              <img :src="withBase(equipment.image)" :alt="equipment.name">
              <strong>{{ equipment.name }}</strong>

              <small v-if="isUsed(equipment.id)">
                {{ groupLabel(usedGroup(equipment.id)) }}
              </small>
              <small v-else>
                추가
              </small>
            </button>
          </div>
        </div>
      </section>

      <p v-else class="message">
        전용무기를 선택하면 추천 빌드 편집창이 열립니다.
      </p>
    </template>

    <template v-else>
      <p v-if="!configuredWeapons.length" class="message">
        아직 등록된 전용무기 추천 빌드가 없습니다.
      </p>

      <div v-else class="public-build-grid">
        <article
          v-for="weapon in configuredWeapons"
          :key="weapon.id"
          class="public-build-card"
        >
          <a
            class="public-weapon"
            :href="withBase(weapon.href)"
          >
            <img :src="withBase(weapon.image)" :alt="weapon.name">
            <strong>{{ weapon.name }}</strong>
            <span>전용무기</span>
          </a>

          <div class="public-groups">
            <section
              v-for="group in BUILD_GROUPS"
              :key="group.key"
              class="public-group"
            >
              <div class="public-group-title">
                <strong>{{ group.label }}</strong>
                <span>{{ builds[weapon.id][group.key].length }}</span>
              </div>

              <div
                v-if="builds[weapon.id][group.key].length"
                class="public-equipment-list"
              >
                <a
                  v-for="equipment in equipmentList(builds[weapon.id], group.key)"
                  :key="equipment.id"
                  :href="withBase(equipment.href)"
                  class="public-equipment"
                  :title="equipment.name"
                >
                  <img :src="withBase(equipment.image)" :alt="equipment.name">
                  <span>{{ equipment.name }}</span>
                </a>
              </div>

              <p v-else class="public-empty">
                -
              </p>
            </section>
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
.weapon-build-board {
  margin:18px 0 40px;
}

.board-heading {
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:20px;
  margin-bottom:22px;
}

.board-heading h1 {
  margin:0;
  border:0;
  font-size:32px;
}

.kicker {
  margin:0 0 4px !important;
  color:var(--vp-c-brand-1);
  font-size:12px;
  font-weight:800;
  letter-spacing:.12em;
}

.description {
  margin:6px 0 0 !important;
  color:var(--vp-c-text-2);
  font-size:13px;
}

.save-button {
  border:0;
  border-radius:9px;
  padding:10px 16px;
  background:var(--vp-c-brand-1);
  color:#fff;
  cursor:pointer;
  font-weight:700;
}

.save-button:disabled {
  opacity:.6;
  cursor:wait;
}

.message {
  padding:13px;
  border-radius:9px;
  background:var(--vp-c-bg-soft);
  color:var(--vp-c-text-2);
}

.message.error {
  background:var(--vp-c-danger-soft);
  color:var(--vp-c-danger-1);
}

.message.notice {
  background:var(--vp-c-success-soft);
  color:var(--vp-c-success-1);
}

.weapon-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(112px,1fr));
  gap:12px;
}

.weapon-card {
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:5px;
  min-width:0;
  border:1px solid var(--vp-c-divider);
  border-radius:12px;
  padding:10px 7px;
  background:var(--vp-c-bg-soft);
  color:var(--vp-c-text-1);
  cursor:pointer;
}

.weapon-card:hover,
.weapon-card.active {
  border-color:var(--vp-c-brand-1);
  background:var(--vp-c-brand-soft);
}

.weapon-card img {
  width:72px;
  height:72px;
  border-radius:10px;
  object-fit:cover;
}

.weapon-card strong {
  font-size:13px;
  text-align:center;
}

.weapon-card small {
  color:var(--vp-c-text-2);
  font-size:11px;
}

.build-editor {
  margin-top:22px;
  border:1px solid var(--vp-c-divider);
  border-radius:14px;
  padding:18px;
  background:var(--vp-c-bg-soft);
}

.editor-weapon {
  display:flex;
  align-items:center;
  gap:14px;
  margin-bottom:18px;
}

.editor-weapon img {
  width:88px;
  height:88px;
  border-radius:12px;
  object-fit:cover;
}

.editor-weapon p,
.editor-weapon h2 {
  margin:0 !important;
}

.editor-weapon p,
.editor-weapon span {
  color:var(--vp-c-text-2);
  font-size:12px;
}

.editor-weapon h2 {
  border:0;
  padding:2px 0;
  font-size:22px;
}

.build-groups {
  display:grid;
  gap:12px;
}

.build-group {
  overflow:hidden;
  border:1px solid var(--vp-c-divider);
  border-radius:12px;
  background:var(--vp-c-bg);
}

.build-group.active {
  border-color:var(--vp-c-brand-1);
}
.build-group.drag-over {
  border-color:var(--vp-c-brand-1);
  box-shadow:0 0 0 2px var(--vp-c-brand-soft);
  background:var(--vp-c-brand-soft);
}

.selected-equipment-card[draggable="true"] {
  cursor:grab;
}

.selected-equipment-card[draggable="true"]:active {
  cursor:grabbing;
}

.equipment-option[draggable="true"] {
  cursor:grab;
}

.equipment-option[draggable="true"]:active {
  cursor:grabbing;
}

.group-title {
  width:100%;
  display:flex;
  justify-content:space-between;
  align-items:center;
  border:0;
  padding:11px 13px;
  background:transparent;
  color:var(--vp-c-text-1);
  cursor:pointer;
}

.group-title strong {
  color:var(--vp-c-brand-1);
}

.group-title span {
  color:var(--vp-c-text-2);
  font-size:11px;
}

.selected-equipment {
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  padding:4px 12px 13px;
}

.selected-equipment-card {
  position:relative;
  width:76px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:4px;
}

.selected-equipment-card img {
  width:58px;
  height:58px;
  border-radius:9px;
  object-fit:cover;
}

.selected-equipment-card span {
  width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--vp-c-text-2);
  font-size:10px;
  text-align:center;
}

.remove-button {
  position:absolute;
  top:-5px;
  right:2px;
  width:21px;
  height:21px;
  display:grid;
  place-items:center;
  border:1px solid var(--vp-c-divider);
  border-radius:50%;
  padding:0;
  background:var(--vp-c-bg);
  color:var(--vp-c-danger-1);
  cursor:pointer;
  font-size:15px;
  line-height:1;
}

.empty-group {
  margin:0 !important;
  padding:4px 13px 13px;
  color:var(--vp-c-text-3);
  font-size:11px;
}

.equipment-picker {
  margin-top:18px;
  border-top:1px solid var(--vp-c-divider);
  padding-top:16px;
}

.picker-heading {
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:12px;
}

.picker-heading > div {
  display:flex;
  flex-direction:column;
  gap:2px;
}

.picker-heading span {
  color:var(--vp-c-text-2);
  font-size:11px;
}

.equipment-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(90px,1fr));
  gap:9px;
}

.equipment-option {
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:4px;
  min-width:0;
  border:1px solid var(--vp-c-divider);
  border-radius:10px;
  padding:8px 5px;
  background:var(--vp-c-bg);
  color:var(--vp-c-text-1);
  cursor:pointer;
}

.equipment-option:hover:not(:disabled) {
  border-color:var(--vp-c-brand-1);
  background:var(--vp-c-brand-soft);
}

.equipment-option.used {
  opacity:.45;
  cursor:not-allowed;
}

.equipment-option img {
  width:54px;
  height:54px;
  border-radius:8px;
  object-fit:cover;
}

.equipment-option strong {
  max-width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:11px;
}

.equipment-option small {
  color:var(--vp-c-text-2);
  font-size:9px;
}

.public-build-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
  gap:16px;
  align-items:start;
}

.public-build-card {
  overflow:hidden;
  border:1px solid var(--vp-c-divider);
  border-radius:14px;
  background:var(--vp-c-bg-soft);
}

.public-weapon {
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:5px;
  padding:16px 10px 13px;
  color:var(--vp-c-text-1);
  text-decoration:none;
}

.public-weapon:hover {
  background:var(--vp-c-brand-soft);
}

.public-weapon img {
  width:96px;
  height:96px;
  border-radius:12px;
  object-fit:cover;
}

.public-weapon strong {
  font-size:16px;
}

.public-weapon span {
  color:var(--vp-c-text-2);
  font-size:11px;
}

.public-groups {
  display:grid;
}

.public-group {
  border-top:1px solid var(--vp-c-divider);
  padding:11px 12px 13px;
}

.public-group-title {
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:9px;
}

.public-group-title strong {
  color:var(--vp-c-brand-1);
  font-size:13px;
}

.public-group-title span {
  color:var(--vp-c-text-3);
  font-size:10px;
}

.public-equipment-list {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}

.public-equipment {
  width:62px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:3px;
  color:var(--vp-c-text-1);
  text-decoration:none;
}

.public-equipment img {
  width:52px;
  height:52px;
  border-radius:8px;
  object-fit:cover;
}

.public-equipment span {
  width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--vp-c-text-2);
  font-size:9px;
  text-align:center;
}

.public-empty {
  margin:0 !important;
  color:var(--vp-c-text-3);
  font-size:11px;
}

.updated {
  margin-top:16px !important;
  color:var(--vp-c-text-2);
  font-size:12px;
  text-align:right;
}

@media (max-width:640px) {
  .board-heading {
    align-items:stretch;
    flex-direction:column;
  }

  .weapon-grid {
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:8px;
  }

  .weapon-card {
    padding:8px 4px;
  }

  .weapon-card img {
    width:60px;
    height:60px;
  }

  .build-editor {
    padding:12px;
  }

  .equipment-grid {
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:6px;
  }

  .equipment-option {
    padding:6px 3px;
  }

  .equipment-option img {
    width:46px;
    height:46px;
  }

  .public-build-grid {
    grid-template-columns:1fr;
  }
}
</style>