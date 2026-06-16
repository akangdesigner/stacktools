'use client';
import { DEFAULT_COLORS } from './OwnerFilter';

export default function OwnerBadge({ owners, activeOwner }: { owners: string[]; activeOwner: string }) {
  if (owners.length === 0) return null;
  return (
    <>
      {owners.map(name => {
        const color = DEFAULT_COLORS[name] ?? { bg: '#f3f4f6', text: '#374151' };
        return (
          <span
            key={name}
            style={{ backgroundColor: color.bg, color: color.text }}
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${activeOwner === name ? 'ring-1 ring-inset' : ''}`}
          >
            {name}
          </span>
        );
      })}
    </>
  );
}
