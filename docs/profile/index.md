---
title: 개인 프로필
sidebar: false
aside: false
outline: false
lastUpdated: false
editLink: false
footer: false
---

<script setup>
import { defineAsyncComponent } from 'vue'
const ProfilePage = defineAsyncComponent(() => import('../.vitepress/theme/profile/ProfilePage.vue'))
</script>

<ClientOnly>
  <ProfilePage />
  <template #fallback><p>개인 프로필을 불러오는 중입니다.</p></template>
</ClientOnly>
