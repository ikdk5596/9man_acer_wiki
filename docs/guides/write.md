---
title: 공략 글쓰기
sidebar: false
aside: false
outline: false
lastUpdated: false
editLink: false
footer: false
---

<script setup>
import { defineAsyncComponent } from 'vue'
const GuideEditor = defineAsyncComponent(() => import('../.vitepress/theme/guides/GuideEditor.vue'))
</script>

<ClientOnly>
  <GuideEditor />
  <template #fallback><p>글쓰기 화면을 불러오는 중입니다.</p></template>
</ClientOnly>
