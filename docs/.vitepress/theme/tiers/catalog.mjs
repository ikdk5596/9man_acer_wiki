export const TIER_KEYS = Object.freeze(['S', 'A', 'B', 'C', 'D', 'E', 'F'])

export const SOLDIERS = Object.freeze([
  ['장창', '장창'], ['긴_창', '긴 창'], ['장과', '장과'], ['맥도', '맥도'],
  ['장검', '장검'], ['쌍창', '쌍창'], ['칼과_방패', '칼방'], ['무거운_방패', '무거운 방패'],
  ['창과_방패', '창방'], ['망치와_방패', '망치방패'], ['검과_방패', '검과 방패'],
  ['도끼와_방패', '도끼방패'], ['장궁', '장궁'], ['쇠뇌', '쇠뇌'], ['독궁', '독궁'],
  ['사냥꾼', '사냥꾼'], ['강화_쇠뇌', '강화 쇠뇌'], ['화궁', '화궁'],
  ['기병_검', '검기병'], ['기병_창', '창기병'], ['기병_대도', '대도기병'],
  ['중기병', '중기병'], ['기병_활', '궁기병'], ['기병_도끼', '기병 도끼'],
  ['투석차', '투석기'], ['쇠뇌차', '쇠뇌차'],
].map(([id, name]) => ({
  id,
  name,
  image: `/images/soldiers/roster_icons/${id}.png`,
  href: `/soldiers/${id}`,
})))

const POLICY_NAMES = Object.freeze([
  '풍성한 수확', '산업 혁명', '상무정신', '급속 행군', '부지런한 훈련', '도광양회',
  '인재 모집', '몸집 키우기', '무역 증시', '확장 협정', '긴급 지원', '완공 임박',
  '특급 보상', '재점화', '이자 벌이', '넘치는 자원', '넘치는 인재', '수호의 심장',
  '농사 달인', '채석 달인', '벌목 달인', '발달한 교통', '장인 정신', '환상 할인',
  '수비 전문가', '진격의 나팔', '생존 정통', '무기 정통', '신병의 힘', '어부지리',
  '자원 약탈', '온화한 기후', '하늘의 은총', '묘수회춘', '뛰어난 의술', '천추백련',
  '전쟁 준비', '군웅 집결', '일타쌍피', '튼튼한 기틀', '야외 정복자', '공성의 달인',
  '생생불식', '약육강식', '파죽지세', '공성악지', '성루연봉', '창병 정통',
  '방패병 정통', '궁병 정통', '기병 정통',
])

export const POLICIES = Object.freeze(POLICY_NAMES.map((name, index) => {
  const id = String(index + 1).padStart(3, '0')
  const fileName = `${id}_${name.replaceAll(' ', '_')}.png`
  return { id, name, image: `/images/policies/icons/${fileName}`, href: `/policies/list/${id}` }
}))

export function catalogFor(kind) {
  if (kind === 'soldiers') return SOLDIERS
  if (kind === 'policies') return POLICIES
  throw new Error('올바르지 않은 등급표 종류입니다.')
}
