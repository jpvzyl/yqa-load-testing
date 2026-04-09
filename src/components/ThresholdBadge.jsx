import { Check, X } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ThresholdBadge({ passed, label }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        passed
          ? 'bg-green-500/15 text-green-400'
          : 'bg-red-500/15 text-red-400'
      )}
    >
      {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}
