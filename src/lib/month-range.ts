/** YYYY-MM → その月の inclusive な開始日・終了日 (YYYY-MM-DD) */
export function monthDateBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`不正な月指定です: ${month}`);
  }
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}
