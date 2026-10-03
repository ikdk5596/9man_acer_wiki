import talentData from '../tiers/data/talents.json'
import heroTalentData from '../tiers/data/hero-talents.json'

const talentMap = new Map(
  (talentData.talents || []).map(talent => [String(talent.id), talent])
)

export const HERO_TALENT_CATALOG = Object.freeze(
  (heroTalentData.heroes || []).map(hero => {
    const advancedIds = Array.isArray(hero?.talents?.advanced)
      ? hero.talents.advanced.map(String)
      : []

    const advancedTalents = advancedIds
      .map(id => talentMap.get(id))
      .filter(Boolean)
      .map(talent => Object.freeze({
        id: String(talent.id),
        text: String(talent.text || ''),
        maxStacks: Number(talent.maxStacks || 1),
      }))

    return Object.freeze({
      id: String(hero.heroId),
      name: String(hero.heroName),
      troop: String(hero.troop || ''),
      image: `/images/hero/${hero.heroId}.png`,
      href: `/hero/${hero.heroId}`,
      advancedTalents: Object.freeze(advancedTalents),
    })
  })
)

export const HERO_TALENT_MAP = new Map(
  HERO_TALENT_CATALOG.map(hero => [hero.id, hero])
)
