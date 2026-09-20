import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '9만 에이커 위키',
  description: '9만 에이커(90,000 Acres) — HUNTERS 연맹의 Diablo2 제작 게임 정보 위키',
  lang: 'ko-KR',
  base: '/9man_acer_wiki/',
  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/9man_acer_wiki/favicon.svg' }],
  ],

  themeConfig: {
    nav: [
      { text: '홈', link: '/' },
      { text: '정책 도감', link: '/policies/' },
      { text: '병사 도감', link: '/soldiers/' },
    ],

    sidebar: {
      '/policies/': [
        {
          text: '정책 도감',
          items: [
            { text: '개요 및 전체 목록', link: '/policies/' },
          ],
        },
      ],
      '/soldiers/': [
        {
          text: '병사 도감',
          items: [
            { text: '전체 목록', link: '/soldiers/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ikdk5596/9man_acer_wiki' },
    ],

    search: {
      provider: 'local',
    },

    outline: {
      label: '이 페이지 목차',
    },

    docFooter: {
      prev: '이전 페이지',
      next: '다음 페이지',
    },

    lastUpdatedText: '마지막 업데이트',
  },
})
