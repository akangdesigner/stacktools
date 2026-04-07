"use client";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <span className="text-sm text-gray-600 w-32 shrink-0">{label}</span>
      <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:border-blue-400 transition-colors">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
        />
        <span className="text-sm font-mono text-gray-700">{value.toUpperCase()}</span>
      </div>
    </label>
  );
}
