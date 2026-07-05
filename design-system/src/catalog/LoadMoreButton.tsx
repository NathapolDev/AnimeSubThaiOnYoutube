export interface LoadMoreButtonProps {
  remaining: number;
  onClick: () => void;
}

/** "Show more" button beneath the catalog grid; hidden by the host page once everything is shown. */
export function LoadMoreButton({ remaining, onClick }: LoadMoreButtonProps) {
  return (
    <button className="catalog-load-more" type="button" onClick={onClick}>
      แสดงรายการเพิ่ม (เหลืออีก {remaining} รายการ)
    </button>
  );
}
