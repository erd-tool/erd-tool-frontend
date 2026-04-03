export type SeasonTheme = 'spring' | 'summer' | 'autumn' | 'winter';

export function getSeasonTheme(date = new Date()) {
  const month = date.getMonth() + 1;
  const season: SeasonTheme =
    month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';

  const labelMap: Record<SeasonTheme, string> = {
    spring: '봄',
    summer: '여름',
    autumn: '가을',
    winter: '겨울'
  };

  return {
    month,
    season,
    bodyClassName: `theme-${season}`,
    label: `${month}월 ${labelMap[season]} 테마`
  };
}
