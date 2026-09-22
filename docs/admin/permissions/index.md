---
title: 권한 관리
sidebar: false
aside: false
outline: false
lastUpdated: false
editLink: false
footer: false
---

<script setup>
import { defineAsyncComponent } from 'vue'
const AccessManager = defineAsyncComponent(() => import('../../.vitepress/theme/access/AccessManager.vue'))
</script>

<ClientOnly>
  <AccessManager />
  <template #fallback><p>권한 정보를 불러오는 중입니다.</p></template>
</ClientOnly>
