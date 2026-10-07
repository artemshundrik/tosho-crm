/**
 * Розділ сайту голосуванням пар (спека, розділ 4).
 *
 * Голос — модель того самого підрозділу постачальника, уже перенесена на
 * сайт: вона «голосує» за розділ, куди її поклали (так визначається 89%
 * моделей). Переможець — лише одноосібний: при нічиїй код не вгадує, а дає
 * мовній моделі короткий список рівних (`tied`). Голосів немає зовсім — модель
 * вибирає з усього переліку розділів, а не вийде — людина в CRM.
 */
export type CategoryVote = { path: string; votes: number };

export function voteCategory(votes: CategoryVote[]): { category: string | null; tied: string[] } {
  const ranked = votes
    .filter((vote) => vote.path && vote.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.path.localeCompare(b.path, "uk"));
  if (ranked.length === 0) return { category: null, tied: [] };
  const top = ranked[0].votes;
  const tied = ranked.filter((vote) => vote.votes === top).map((vote) => vote.path);
  return tied.length === 1 ? { category: tied[0], tied: [] } : { category: null, tied };
}
