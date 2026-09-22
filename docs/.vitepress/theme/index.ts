import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import AuthStatus from './AuthStatus.vue'
import DetailCommunity from './detail-community/DetailCommunity.vue'
import TierBoard from './tiers/TierBoard.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DetailCommunity', DetailCommunity)
    app.component('TierBoard', TierBoard)
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(AuthStatus),
      'nav-screen-content-after': () => h(AuthStatus, { mobile: true }),
    })
  },
} satisfies Theme