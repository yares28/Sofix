"use client";

export default function BoardPagination({ page, total, onPage, label }: { page: number; total: number; onPage: (page: number) => void; label: string }) {
  const pages = Math.ceil(total / 10);
  if (pages < 2) return null;
  return <nav className="board-pagination" aria-label={label}>
    <span aria-live="polite">{page * 10 + 1}–{Math.min((page + 1) * 10, total)} of {total}</span>
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">←</button>
    <button type="button" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">→</button>
  </nav>;
}
