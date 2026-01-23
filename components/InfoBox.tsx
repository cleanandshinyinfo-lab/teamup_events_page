import { cn } from '@/lib/utils';

interface InfoBoxProps {
  icon: string;
  label: string;
  value: string | null;
  className?: string;
}

/**
 * Reusable information box component with icon and label
 */
export default function InfoBox({ icon, label, value, className }: InfoBoxProps) {
  if (!value || value === 'No especificado') return null;

  return (
    <div
      className={cn(
        'bg-blue-50 border-l-4 border-primary p-4 rounded-r-lg',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-700 mb-1">{label}</p>
          <p className="text-base text-gray-900 break-words">{value}</p>
        </div>
      </div>
    </div>
  );
}
