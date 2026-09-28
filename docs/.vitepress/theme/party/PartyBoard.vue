<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { session, useGuideSession } from '../guides/client.mjs'
import { access, canManagePosts, useAccessSession } from '../access/client.mjs'
import { SOLDIERS } from '../tiers/catalog.mjs'
import {
  applyToParty,
  cancelMyApplication,
  createParty,
  getMyApplication,
  koreaToday,
  listApplications,
  listParties,
  setApplicationStatus,
  updateMyApplication,
} from './client.mjs'

useGuideSession()
useAccessSession()

const parties = ref([])
const loading = ref(true)
const busy = ref(false)
const errorText = ref('')
const noticeText = ref('')

const showCreate = ref(false)
const selectedParty = ref(null)
const modalMode = ref('apply')
const myApplication = ref(null)
const applications = ref([])
const applicationsLoading = ref(false)

const partyForm = reactive({
  name: '',
  type: 'rank',
  departureDate: koreaToday(),
  capacity: 5,
  description: '',
})

const applicationForm = reactive({
  gameNickname: '',
  gameUid: '',
  rank: '',
  primaryTroop: '',
  secondaryTroop: '',
  battleTime: '',
  note: '',
})

const loggedIn = computed(() => Boolean(session.uid))

const canManageSelectedParty = computed(() =>
  Boolean(
    selectedParty.value &&
    session.uid &&
    (
      selectedParty.value.leaderId === session.uid ||
      canManagePosts(access.role)
    )
  )
)

const selectedFull = computed(() => {
  if (!selectedParty.value) return false

  return Number(selectedParty.value.approvedCount || 0) >=
    Number(selectedParty.value.capacity || 0)
})

const applicationStatusLabel = computed(() => {
  const status = myApplication.value?.status

  if (status === 'pending') return '승인 대기'
  if (status === 'approved') return '승인됨'
  if (status === 'rejected') return '거절됨'

  return ''
})

function partyTypeLabel(type) {
  return type === 'rank' ? '랭' : '자유'
}

function statusLabel(status) {
  if (status === 'pending') return '승인 대기'
  if (status === 'approved') return '승인'
  if (status === 'rejected') return '거절'
  return status || '-'
}

function clearMessages() {
  errorText.value = ''
  noticeText.value = ''
}

function errorMessage(error) {
  return error?.message || String(error || '처리 중 오류가 발생했습니다.')
}

function resetApplicationForm() {
  applicationForm.gameNickname = ''
  applicationForm.gameUid = ''
  applicationForm.rank = ''
  applicationForm.primaryTroop = ''
  applicationForm.secondaryTroop = ''
  applicationForm.battleTime = ''
  applicationForm.note = ''
}

function fillApplicationForm(application) {
  applicationForm.gameNickname = application?.gameNickname || ''
  applicationForm.gameUid = application?.gameUid || ''
  applicationForm.rank = application?.rank || ''
  applicationForm.primaryTroop = application?.primaryTroop || ''
  applicationForm.secondaryTroop = application?.secondaryTroop || ''
  applicationForm.battleTime = application?.battleTime || ''
  applicationForm.note = application?.note || ''
}

async function refreshParties() {
  loading.value = true
  clearMessages()

  try {
    parties.value = await listParties()

    if (selectedParty.value) {
      const refreshed = parties.value.find(
        party => party.id === selectedParty.value.id
      )

      if (refreshed) {
        selectedParty.value = refreshed
      } else {
        selectedParty.value = null
        myApplication.value = null
        applications.value = []
      }
    }
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function submitParty() {
  if (!loggedIn.value) {
    errorText.value = '로그인이 필요합니다.'
    return
  }

  busy.value = true
  clearMessages()

  try {
    await createParty(partyForm)

    partyForm.name = ''
    partyForm.type = 'rank'
    partyForm.departureDate = koreaToday()
    partyForm.capacity = 5
    partyForm.description = ''

    showCreate.value = false
    noticeText.value = '파티 모집글을 등록했습니다.'

    await refreshParties()
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}

async function openParty(party, mode = 'apply') {
  clearMessages()
  selectedParty.value = party
  modalMode.value = mode
  myApplication.value = null
  applications.value = []
  resetApplicationForm()

  if (!loggedIn.value) return

  try {
    const canManage =
      party.leaderId === session.uid || canManagePosts(access.role)

    if (mode === 'manage' && canManage) {
      await refreshApplications()
      return
    }

    if (party.leaderId === session.uid) {
      await refreshApplications()
      return
    }

    const application = await getMyApplication(party.id)
    myApplication.value = application

    if (application) {
      fillApplicationForm(application)
    }
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

function closeParty() {
  selectedParty.value = null
  modalMode.value = 'apply'
  myApplication.value = null
  applications.value = []
  resetApplicationForm()
  clearMessages()
}

async function submitApplication() {
  if (!selectedParty.value) return

  if (!loggedIn.value) {
    errorText.value = '로그인이 필요합니다.'
    return
  }

  if (selectedFull.value && !myApplication.value) {
    errorText.value = '모집이 완료된 파티입니다.'
    return
  }

  busy.value = true
  clearMessages()

  try {
    if (myApplication.value) {
      if (myApplication.value.status !== 'pending') {
        throw new Error('승인 대기 상태의 신청만 수정할 수 있습니다.')
      }

      await updateMyApplication(
        selectedParty.value.id,
        applicationForm
      )

      noticeText.value = '신청 정보를 수정했습니다.'
    } else {
      await applyToParty(
        selectedParty.value.id,
        applicationForm
      )

      noticeText.value = '파티 신청이 완료되었습니다.'
    }

    myApplication.value = await getMyApplication(
      selectedParty.value.id
    )

    fillApplicationForm(myApplication.value)
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}

async function cancelApplication() {
  if (!selectedParty.value || !myApplication.value) return

  if (myApplication.value.status !== 'pending') {
    errorText.value = '승인 대기 상태의 신청만 취소할 수 있습니다.'
    return
  }

  if (!window.confirm('파티 신청을 취소하시겠습니까?')) return

  busy.value = true
  clearMessages()

  try {
    await cancelMyApplication(selectedParty.value.id)

    myApplication.value = null
    resetApplicationForm()
    noticeText.value = '파티 신청을 취소했습니다.'
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}

async function refreshApplications() {
  if (!selectedParty.value) return

  applicationsLoading.value = true

  try {
    applications.value = await listApplications(
      selectedParty.value.id
    )
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    applicationsLoading.value = false
  }
}

async function changeApplicationStatus(application, status) {
  if (!selectedParty.value) return

  busy.value = true
  clearMessages()

  try {
    await setApplicationStatus(
      selectedParty.value.id,
      application.applicantId,
      status
    )

    noticeText.value =
      status === 'approved'
        ? '신청을 승인했습니다.'
        : status === 'rejected'
          ? '신청을 거절했습니다.'
          : '신청 상태를 변경했습니다.'

    await Promise.all([
      refreshApplications(),
      refreshParties(),
    ])
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}

onMounted(refreshParties)
</script>

<template>
  <div class="party-board">
    <div class="party-toolbar">
      <div>
        <strong>파티 모집</strong>
        <p class="party-help">
          오늘 이후 출발하는 파티만 표시됩니다.
        </p>
      </div>

      <button
        v-if="loggedIn"
        class="party-button primary"
        type="button"
        @click="showCreate = !showCreate"
      >
        {{ showCreate ? '작성 닫기' : '파티 모집하기' }}
      </button>
    </div>

    <p v-if="!loggedIn" class="party-info">
      파티 모집글 조회는 가능하며, 모집글 작성과 파티 신청은 로그인 후 이용할 수 있습니다.
    </p>

    <p v-if="errorText" class="party-message error">
      {{ errorText }}
    </p>

    <p v-if="noticeText" class="party-message success">
      {{ noticeText }}
    </p>

    <form
      v-if="showCreate && loggedIn"
      class="party-panel party-form"
      @submit.prevent="submitParty"
    >
      <h3>파티 모집글 작성</h3>

      <label>
        <span>파티이름</span>
        <input
          v-model.trim="partyForm.name"
          maxlength="60"
          required
          placeholder="파티이름"
        >
      </label>

      <div class="party-form-grid">
        <label>
          <span>파티타입</span>
          <select v-model="partyForm.type">
            <option value="rank">랭</option>
            <option value="free">자유</option>
          </select>
        </label>

        <label>
          <span>출발날짜</span>
          <input
            v-model="partyForm.departureDate"
            type="date"
            :min="koreaToday()"
            required
          >
        </label>

        <label>
          <span>모집인원</span>
          <input
            v-model.number="partyForm.capacity"
            type="number"
            min="1"
            max="40"
            required
          >
        </label>
      </div>

      <label>
        <span>간단소개글</span>
        <textarea
          v-model.trim="partyForm.description"
          maxlength="1000"
          rows="4"
          placeholder="파티에 대한 간단한 소개를 입력해 주세요."
        />
      </label>

      <div class="party-actions">
        <button
          class="party-button primary"
          type="submit"
          :disabled="busy"
        >
          등록
        </button>
      </div>
    </form>

    <div class="party-list">
      <p v-if="loading" class="party-empty">
        파티 목록을 불러오는 중입니다.
      </p>

      <p
        v-else-if="parties.length === 0"
        class="party-empty"
      >
        현재 모집 중인 파티가 없습니다.
      </p>

      <article
        v-for="party in parties"
        v-else
        :key="party.id"
        class="party-row"
      >
        <button
          class="party-row-main"
          type="button"
          @click="openParty(party)"
        >
          <span class="party-row-title">
            [{{ partyTypeLabel(party.type) }}/{{ party.departureDate }}]
            {{ party.name }}
          </span>

          <span class="party-count">
            ({{ Number(party.approvedCount || 0) }}/{{ party.capacity }})
          </span>
        </button>

        <div class="party-row-actions">
          <button
            v-if="party.leaderId !== session.uid"
            class="party-button"
            :class="{
              primary:
                Number(party.approvedCount || 0) < Number(party.capacity || 0)
            }"
            type="button"
            :disabled="
              Number(party.approvedCount || 0) >= Number(party.capacity || 0)
            "
            @click="openParty(party, 'apply')"
          >
            {{
              Number(party.approvedCount || 0) >= Number(party.capacity || 0)
                ? '모집완료'
                : '신청'
            }}
          </button>

          <button
            v-if="
              party.leaderId === session.uid ||
              canManagePosts(access.role)
            "
            class="party-button primary"
            type="button"
            @click="openParty(party, 'manage')"
          >
            관리
          </button>
        </div>
      </article>
    </div>

    <div
      v-if="selectedParty"
      class="party-modal-backdrop"
      @click.self="closeParty"
    >
      <section class="party-modal">
        <div class="party-modal-header">
          <div>
            <h2>{{ selectedParty.name }}</h2>
            <p>
              [{{ partyTypeLabel(selectedParty.type) }}/{{ selectedParty.departureDate }}]
              승인 {{ Number(selectedParty.approvedCount || 0) }}/{{ selectedParty.capacity }}명
            </p>
          </div>

          <button
            class="party-close"
            type="button"
            aria-label="닫기"
            @click="closeParty"
          >
            ×
          </button>
        </div>

        <dl class="party-summary">
          <div>
            <dt>파티장</dt>
            <dd>{{ selectedParty.leaderName || '-' }}</dd>
          </div>

          <div>
            <dt>출발일</dt>
            <dd>{{ selectedParty.departureDate }}</dd>
          </div>

          <div>
            <dt>파티타입</dt>
            <dd>{{ partyTypeLabel(selectedParty.type) }}</dd>
          </div>

          <div>
            <dt>모집현황</dt>
            <dd>
              {{ Number(selectedParty.approvedCount || 0) }}/{{ selectedParty.capacity }}
            </dd>
          </div>
        </dl>

        <div
          v-if="selectedParty.description"
          class="party-description"
        >
          {{ selectedParty.description }}
        </div>

        <template v-if="modalMode === 'manage' && canManageSelectedParty">
          <div class="party-section-title">
            <h3>신청자 관리</h3>

            <button
              class="party-button small"
              type="button"
              :disabled="applicationsLoading"
              @click="refreshApplications"
            >
              새로고침
            </button>
          </div>

          <p
            v-if="applicationsLoading"
            class="party-empty"
          >
            신청자를 불러오는 중입니다.
          </p>

          <p
            v-else-if="applications.length === 0"
            class="party-empty"
          >
            아직 신청자가 없습니다.
          </p>

          <div
            v-for="application in applications"
            v-else
            :key="application.id"
            class="party-application-card"
          >
            <div class="party-application-head">
              <strong>{{ application.gameNickname }}</strong>

              <span
                class="party-status"
                :class="`status-${application.status}`"
              >
                {{ statusLabel(application.status) }}
              </span>
            </div>

            <dl class="party-application-data">
              <div>
                <dt>게임 UID</dt>
                <dd>{{ application.gameUid }}</dd>
              </div>

              <div>
                <dt>랭크</dt>
                <dd>{{ application.rank }}</dd>
              </div>

              <div>
                <dt>1병종</dt>
                <dd>{{ application.primaryTroop }}</dd>
              </div>

              <div>
                <dt>2병종</dt>
                <dd>{{ application.secondaryTroop || '-' }}</dd>
              </div>

              <div>
                <dt>전투참여 시간</dt>
                <dd>{{ application.battleTime }}</dd>
              </div>

              <div>
                <dt>비고</dt>
                <dd>{{ application.note || '-' }}</dd>
              </div>
            </dl>

            <div class="party-actions">
              <button
                v-if="application.status !== 'approved'"
                class="party-button primary"
                type="button"
                :disabled="busy || selectedFull"
                @click="changeApplicationStatus(application, 'approved')"
              >
                승인
              </button>

              <button
                v-if="application.status !== 'rejected'"
                class="party-button danger"
                type="button"
                :disabled="busy"
                @click="changeApplicationStatus(application, 'rejected')"
              >
                거절
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="loggedIn">
          <div
            v-if="myApplication"
            class="party-current-status"
          >
            현재 신청상태:
            <strong>{{ applicationStatusLabel }}</strong>
          </div>

          <p
            v-if="selectedFull && !myApplication"
            class="party-info"
          >
            모집이 완료된 파티입니다.
          </p>

          <form
            v-else-if="
              !myApplication ||
              myApplication.status === 'pending'
            "
            class="party-form"
            @submit.prevent="submitApplication"
          >
            <h3>
              {{ myApplication ? '신청 정보 수정' : '파티 신청' }}
            </h3>

            <div class="party-form-grid">
              <label>
                <span>실제 게임 닉네임</span>
                <input
                  v-model.trim="applicationForm.gameNickname"
                  maxlength="30"
                  required
                >
              </label>

              <label>
                <span>게임 UID</span>
                <input
                  v-model.trim="applicationForm.gameUid"
                  maxlength="50"
                  required
                  autocomplete="off"
                >
              </label>

              <label>
                <span>랭크</span>
                <input
                  v-model.trim="applicationForm.rank"
                  maxlength="30"
                  required
                >
              </label>

              <label>
                <span>1병종</span>
                <select
                  v-model="applicationForm.primaryTroop"
                  required
                >
                  <option value="" disabled>
                    선택
                  </option>

                  <option
                    v-for="soldier in SOLDIERS"
                    :key="soldier.id"
                    :value="soldier.name"
                  >
                    {{ soldier.name }}
                  </option>
                </select>
              </label>

              <label>
                <span>2병종</span>
                <select v-model="applicationForm.secondaryTroop">
                  <option value="">
                    없음
                  </option>

                  <option
                    v-for="soldier in SOLDIERS"
                    :key="soldier.id"
                    :value="soldier.name"
                  >
                    {{ soldier.name }}
                  </option>
                </select>
              </label>

              <label>
                <span>전투참여 시간</span>
                <input
                  v-model.trim="applicationForm.battleTime"
                  maxlength="100"
                  required
                  placeholder="예: 평일 20:00~24:00"
                >
              </label>
            </div>

            <label>
              <span>비고</span>
              <textarea
                v-model.trim="applicationForm.note"
                maxlength="500"
                rows="3"
                placeholder="추가로 전달할 내용을 입력해 주세요."
              />
            </label>

            <div class="party-actions">
              <button
                class="party-button primary"
                type="submit"
                :disabled="busy"
              >
                {{ myApplication ? '수정' : '신청' }}
              </button>

              <button
                v-if="myApplication?.status === 'pending'"
                class="party-button danger"
                type="button"
                :disabled="busy"
                @click="cancelApplication"
              >
                신청취소
              </button>
            </div>
          </form>

          <p
            v-else-if="myApplication?.status === 'approved'"
            class="party-info"
          >
            파티장이 신청을 승인했습니다.
          </p>

          <p
            v-else-if="myApplication?.status === 'rejected'"
            class="party-info"
          >
            파티장이 신청을 거절했습니다.
          </p>
        </template>

        <p v-else class="party-info">
          파티 신청은 로그인 후 이용할 수 있습니다.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.party-board {
  margin-top: 24px;
}

.party-toolbar,
.party-section-title,
.party-modal-header,
.party-application-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.party-toolbar {
  margin-bottom: 18px;
}

.party-toolbar strong {
  font-size: 20px;
}

.party-help,
.party-modal-header p {
  margin: 4px 0 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.party-panel,
.party-modal,
.party-application-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.party-panel {
  margin: 18px 0;
  padding: 20px;
}

.party-form h3 {
  margin-top: 0;
}

.party-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 600;
}

.party-form input,
.party-form select,
.party-form textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 9px 11px;
  font: inherit;
}

.party-form textarea {
  resize: vertical;
}

.party-form-grid,
.party-summary,
.party-application-data {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.party-button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 7px 12px;
  cursor: pointer;
  font-weight: 600;
}

.party-button.primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.party-button.danger {
  border-color: var(--vp-c-danger-1);
  color: var(--vp-c-danger-1);
}

.party-button.small {
  padding: 5px 9px;
  font-size: 13px;
}

.party-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.party-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.party-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.party-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 10px 0;
}

.party-row-main {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-1);
  padding: 4px 0;
  text-align: left;
  cursor: pointer;
}

.party-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.party-count {
  flex: none;
  color: var(--vp-c-text-2);
}

.party-message,
.party-info,
.party-empty,
.party-current-status {
  border-radius: 8px;
  padding: 10px 12px;
}

.party-message.error {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}

.party-message.success {
  background: var(--vp-c-tip-soft);
  color: var(--vp-c-tip-1);
}

.party-info,
.party-empty,
.party-current-status {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.party-modal-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.55);
  padding: 48px 16px;
}

.party-modal {
  width: min(760px, 100%);
  padding: 22px;
  background: var(--vp-c-bg);
}

.party-modal-header h2 {
  margin: 0;
}

.party-close {
  flex: none;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 30px;
  line-height: 1;
  cursor: pointer;
}

.party-summary {
  margin: 20px 0;
}

.party-summary div,
.party-application-data div {
  min-width: 0;
}

.party-summary dt,
.party-application-data dt {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.party-summary dd,
.party-application-data dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}

.party-description {
  margin: 16px 0 24px;
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 16px 0;
  white-space: pre-wrap;
}

.party-section-title {
  margin: 22px 0 12px;
}

.party-section-title h3 {
  margin: 0;
}

.party-application-card {
  margin: 12px 0;
  padding: 16px;
}

.party-application-data {
  margin: 14px 0;
}

.party-status {
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--vp-c-bg);
  font-size: 12px;
  font-weight: 700;
}

.status-approved {
  color: var(--vp-c-tip-1);
}

.status-rejected {
  color: var(--vp-c-danger-1);
}

.status-pending {
  color: var(--vp-c-warning-1);
}

@media (max-width: 640px) {
  .party-toolbar,
  .party-row {
    align-items: stretch;
  }

  .party-toolbar {
    flex-direction: column;
  }

  .party-row {
    flex-direction: column;
  }

  .party-row-main {
    width: 100%;
  }

  .party-row > .party-button {
    width: 100%;
  }

  .party-form-grid,
  .party-summary,
  .party-application-data {
    grid-template-columns: 1fr;
  }

  .party-modal-backdrop {
    padding: 16px 8px;
  }

  .party-modal {
    padding: 16px;
  }
}
</style>
