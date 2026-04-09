import { GRADES } from '../lib/constants';
import { cn } from '../lib/utils';

const SIZE_CLASSES = {
  sm: 'w-7 h-7 text-xs font-bold',
  md: 'w-9 h-9 text-sm font-bold',
  lg: 'w-12 h-12 text-lg font-extrabold',
};

export default function ScoreGrade({ grade, size = 'md' }) {
  const info = GRADES[grade] || { color: '#64748b', bg: 'bg-gray-500/20' };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-lg',
        info.bg,
        SIZE_CLASSES[size] || SIZE_CLASSES.md
      )}
      style={{ color: info.color }}
    >
      {grade}
    </span>
  );
}
