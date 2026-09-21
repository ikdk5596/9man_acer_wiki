---
title: 개인공략
sidebar: false
aside: false
outline: false
lastUpdated: false
editLink: false
footer: false
---

<script setup>
import { defineAsyncComponent } from 'vue'
const GuideBoard = defineAsyncComponent(() => import('../.vitepress/theme/guides/GuideBoard.vue'))
</script>

<ClientOnly>
  <GuideBoard />
  <template #fallback><p>개인공략을 불러오는 중입니다.</p></template>
</ClientOnly>
