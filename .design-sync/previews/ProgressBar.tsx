import { ProgressBar } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function MidProgress() {
  return (
    <Stage style={{ width: 220 }}>
      <ProgressBar current={12} total={24} />
    </Stage>
  );
}

export function NearlyComplete() {
  return (
    <Stage style={{ width: 220 }}>
      <ProgressBar current={23} total={24} />
    </Stage>
  );
}
