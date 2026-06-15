'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export default function SearchSelect({ clients, value }: { clients: string[]; value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set('search', e.target.value);
    } else {
      params.delete('search');
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white text-gray-700 shrink-0"
    >
      <option value="">全部客戶</option>
      {clients.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}
