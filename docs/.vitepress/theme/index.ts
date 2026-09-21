import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import AuthStatus from './AuthStatus.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(AuthStatus),
      'nav-screen-content-after': () => h(AuthStatus, { mobile: true }),
    })
  },
} satisfies Theme