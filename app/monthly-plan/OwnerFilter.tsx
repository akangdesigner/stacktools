'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState } from 'react';

const PEOPLE = ['Amy', 'Selina', 'Emma', 'Mike', 'Steven', 'Jena'];

export const DEFAULT_COLORS: Record<string, { bg: string; text: string }> = {
  Amy:    { bg: '#dbeafe', text: '#1d4ed8' },
  Selina: { bg: '#ede9fe', text: '#7c3aed' },
  Emma:   { bg: '#dcfce7', text: '#15803d' },
  Mike:   { bg: '#ffedd5', text: '#c2410c' },
  Steven: { bg: '#ccfbf1', text: '#0f766e' },
  Jena:   { bg: '#fce7f3', text: '#be185d' },
};

export default function OwnerFilter({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  function toggle(name: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === name) params.delete('owner');
    else params.set('owner', name);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PEOPLE.map(name => {
        const color = DEFAULT_COLORS[name];
        const isActive = value === name;
        const isHovered = hovered === name;
        const showColor = isActive || isHovered;
        return (
          <button
            key={name}
            onClick={() => toggle(name)}
            onMouseEnter={() => setHovered(name)}
            onMouseLeave={() => setHovered(null)}
            className="px-2.5 py-0.5 text-xs font-medium rounded-full border transition-all"
            style={showColor
              ? { backgroundColor: color.bg, color: color.text, borderColor: color.text + '60' }
              : { backgroundColor: 'white', color: '#9ca3af', borderColor: '#e5e7eb' }
            }
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
