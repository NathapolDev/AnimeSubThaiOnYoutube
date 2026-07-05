import { Dot } from '../primitives/Dot';

export interface ResultLineProps {
  /** e.g. "พบ 12 จาก 48 รายการ" or "รายการโปรด 5 เรื่อง". */
  text: string;
}

/** Result count line with the status-color legend beneath the toolbar. */
export function ResultLine({ text }: ResultLineProps) {
  return (
    <section className="result-line">
      <p>{text}</p>
      <div className="legend">
        <Dot color="green" />
        ดูได้แล้ว <Dot color="amber" />
        รอเริ่มฉาย
      </div>
    </section>
  );
}
