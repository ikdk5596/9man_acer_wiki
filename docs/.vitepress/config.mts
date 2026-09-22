import { defineConfig } from 'vitepress'
import heroes from '../../scripts/data/heroes.json'
import soldierNames from '../../scripts/data/soldier_names.json'

// Keep the existing GitHub Pages build available during the Hosting migration.
const base = process.env.WIKI_BASE || '/9man_acer_wiki/'
// Unfinished guides are available only through an explicit local opt-in.
const includeGuides = process.env.WIKI_GUIDES === '1'
const heroGroups = [...new Set(heroes.map(hero => hero.troop))].map(troop => ({
  text: Object.values(soldierNames).find(entry => entry.heroTroop === troop)?.name ?? troop,
  collapsed: true,
  items: heroes.filter(hero => hero.troop === troop).map(hero => ({
    text: hero.name,
    link: `/hero/${hero.name.trim().replace(/\s+/g, '_')}`,
  })),
}))

export default defineConfig({
  title: '9만 에이커 위키',
  description: '9만 에이커(90,000 Acres) — HUNTERS 연맹의 Diablo2 제작 게임 정보 위키',
  lang: 'ko-KR',
  base,
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['talents/**', ...(includeGuides ? [] : ['guides/**'])],

  transformPageData(pageData) {
    if (!includeGuides && pageData.relativePath === 'index.md') {
      pageData.frontmatter.features = pageData.frontmatter.features?.filter(
        (feature: { link?: string }) => !feature.link?.startsWith('/guides/'),
      )
    }
  },

  head: [
    ['link', { rel: 'icon', href: `${base}favicon.svg` }],
  ],

  themeConfig: {
    nav: [
      { text: '홈', link: '/' },
      { text: '정책 도감', link: '/policies/' },
      { text: '병사 도감', link: '/soldiers/' },
      { text: '장비 도감', link: '/equipment/' },
      { text: '영웅 도감', link: '/hero/' },
      { text: '\uB4F1\uAE09\uD45C', items: [
        { text: '\uBCD1\uC885\uBCC4 \uB4F1\uAE09', link: '/tiers/soldiers/' },
        { text: '\uC815\uCC45\uBCC4 \uB4F1\uAE09', link: '/tiers/policies/' },
      ] },
      ...(includeGuides ? [{ text: '\uAC1C\uC778\uACF5\uB7B5', link: '/guides/' }] : []),
    ],

    sidebar: {
      '/equipment/': [
        { text: '장비 도감', items: [{ text: '전체 장비 목록', link: '/equipment/' }] },
        {
          text: '대장간 Lv.1',
          collapsed: true,
          items: [
            { text: '치료검', link: '/equipment/치료검' },
            { text: '회심검', link: '/equipment/회심검' },
            { text: '유성추', link: '/equipment/유성추' },
            { text: '쌍도끼', link: '/equipment/쌍도끼' },
            { text: '월아도', link: '/equipment/월아도' },
            { text: '용연검', link: '/equipment/용연검' },
          ],
        },
        {
          text: '대장간 Lv.3',
          collapsed: true,
          items: [
            { text: '사슬갑옷', link: '/equipment/사슬갑옷' },
            { text: '술 조롱박', link: '/equipment/술_조롱박' },
            { text: '피해 반사 갑옷', link: '/equipment/피해_반사_갑옷' },
            { text: '구리 방패', link: '/equipment/구리_방패' },
            { text: '황월', link: '/equipment/황월' },
            { text: '무쇠 방패', link: '/equipment/무쇠_방패' },
          ],
        },
        {
          text: '대장간 Lv.5',
          collapsed: true,
          items: [
            { text: '흡혈검', link: '/equipment/흡혈검' },
            { text: '환도', link: '/equipment/환도' },
            { text: '흑요석 갑옷', link: '/equipment/흑요석_갑옷' },
            { text: '명광 갑옷', link: '/equipment/명광_갑옷' },
            { text: '백참도', link: '/equipment/백참도' },
          ],
        },
        {
          text: '대장간 Lv.7',
          collapsed: true,
          items: [
            { text: '다트', link: '/equipment/다트' },
            { text: '덩쿨 방패', link: '/equipment/덩쿨_방패' },
            { text: '낭아봉', link: '/equipment/낭아봉' },
            { text: '군기', link: '/equipment/군기' },
            { text: '건곤도', link: '/equipment/건곤도' },
            { text: '태양 갑옷', link: '/equipment/태양_갑옷' },
            { text: '정심회', link: '/equipment/정심회' },
            { text: '적금순', link: '/equipment/적금순' },
            { text: '백사 채찍', link: '/equipment/백사_채찍' },
          ],
        },
        {
          text: '대장간 Lv.12',
          collapsed: true,
          items: [
            { text: '금 사슬갑옷', link: '/equipment/금_사슬갑옷' },
            { text: '갈고리검', link: '/equipment/갈고리검' },
            { text: '호심경', link: '/equipment/호심경' },
            { text: '도끼', link: '/equipment/도끼' },
            { text: '옥패', link: '/equipment/옥패' },
            { text: '천기산', link: '/equipment/천기산' },
            { text: '분심계', link: '/equipment/분심계' },
            { text: '구겸', link: '/equipment/구겸' },
            { text: '분노의 허리띠', link: '/equipment/분노의_허리띠' },
            { text: '가시공', link: '/equipment/가시공' },
          ],
        },
        {
          text: '대장간 Lv.14',
          collapsed: true,
          items: [
            { text: '회피 신발', link: '/equipment/회피_신발' },
            { text: '혈적자', link: '/equipment/혈적자' },
            { text: '시간 깃발', link: '/equipment/시간_깃발' },
            { text: '모래시계', link: '/equipment/모래시계' },
            { text: '현목 영락', link: '/equipment/현목_영락' },
            { text: '현철 지팡이', link: '/equipment/현철_지팡이' },
          ],
        },
        {
          text: '전용 무기',
          collapsed: true,
          items: [
            { text: '장창', link: '/equipment/장창' },
            { text: '긴창', link: '/equipment/긴창' },
            { text: '장과', link: '/equipment/장과' },
            { text: '맥도', link: '/equipment/맥도' },
            { text: '양손검', link: '/equipment/양손검' },
            { text: '쌍극', link: '/equipment/쌍극' },
            { text: '나무 방패', link: '/equipment/나무_방패' },
            { text: '무거운 방패', link: '/equipment/무거운_방패' },
            { text: '삭', link: '/equipment/삭' },
            { text: '무쇠망치', link: '/equipment/무쇠망치' },
            { text: '검&방패', link: '/equipment/검&방패' },
            { text: '도끼&방패', link: '/equipment/도끼&방패' },
            { text: '장궁', link: '/equipment/장궁' },
            { text: '쇠뇌', link: '/equipment/쇠뇌' },
            { text: '독궁', link: '/equipment/독궁' },
            { text: '사냥활', link: '/equipment/사냥활' },
            { text: '강화 쇠뇌', link: '/equipment/강화_쇠뇌' },
            { text: '화궁', link: '/equipment/화궁' },
            { text: '대검', link: '/equipment/대검' },
            { text: '장극', link: '/equipment/장극' },
            { text: '언월도', link: '/equipment/언월도' },
            { text: '망치', link: '/equipment/망치' },
            { text: '곡궁', link: '/equipment/곡궁' },
            { text: '개산부', link: '/equipment/개산부' },
          ],
        },
      ],
      '/hero/': [
        {
          text: '영웅 도감',
          items: [{ text: '병종별 전체 목록', link: '/hero/' }],
        },
        ...heroGroups,
      ],
      '/policies/': [
        { text: '\uC815\uCC45\uBCC4 \uB4F1\uAE09', items: [{ text: '\uB4F1\uAE09\uD45C', link: '/tiers/policies/' }] },
        {
          text: '정책 도감',
          items: [
            { text: '개요 및 전체 목록', link: '/policies/' },
          ],
        },
      ],
      '/soldiers/': [
        { text: '\uBCD1\uC885\uBCC4 \uB4F1\uAE09', items: [{ text: '\uB4F1\uAE09\uD45C', link: '/tiers/soldiers/' }] },
        {
          text: '병사 도감',
          items: [
            { text: '개요', link: '/soldiers/' },
            { text: '장창', link: '/soldiers/장창' },
            { text: '긴 창', link: '/soldiers/긴_창' },
            { text: '장과', link: '/soldiers/장과' },
            { text: '맥도', link: '/soldiers/맥도' },
            { text: '장검', link: '/soldiers/장검' },
            { text: '쌍창', link: '/soldiers/쌍창' },
            { text: '칼방', link: '/soldiers/칼과_방패' },
            { text: '무거운 방패', link: '/soldiers/무거운_방패' },
            { text: '창방', link: '/soldiers/창과_방패' },
            { text: '망치방패', link: '/soldiers/망치와_방패' },
            { text: '검과 방패', link: '/soldiers/검과_방패' },
            { text: '도끼방패', link: '/soldiers/도끼와_방패' },
            { text: '장궁', link: '/soldiers/장궁' },
            { text: '쇠뇌', link: '/soldiers/쇠뇌' },
            { text: '독궁', link: '/soldiers/독궁' },
            { text: '사냥꾼', link: '/soldiers/사냥꾼' },
            { text: '강화 쇠뇌', link: '/soldiers/강화_쇠뇌' },
            { text: '화궁', link: '/soldiers/화궁' },
            { text: '검기병', link: '/soldiers/기병_검' },
            { text: '창기병', link: '/soldiers/기병_창' },
            { text: '대도기병', link: '/soldiers/기병_대도' },
            { text: '중기병', link: '/soldiers/중기병' },
            { text: '궁기병', link: '/soldiers/기병_활' },
            { text: '기병 도끼', link: '/soldiers/기병_도끼' },
            { text: '투석기', link: '/soldiers/투석차' },
            { text: '쇠뇌차', link: '/soldiers/쇠뇌차' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '검색', buttonAriaLabel: '위키 검색' },
          modal: {
            displayDetails: '상세 결과 표시',
            resetButtonTitle: '검색어 지우기',
            backButtonTitle: '검색 닫기',
            noResultsText: '검색 결과가 없습니다',
            footer: { selectText: '선택', navigateText: '이동', closeText: '닫기' },
          },
        },
      },
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
