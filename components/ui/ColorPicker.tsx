"use client";

import { useState } from "react";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function isValidHex(str: string) {
  return /^#[0-9a-fA-F]{6}$/.test(str);
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [text, setText] = useState(value.toUpperCase());

  // Keep text in sync when value changes externally (e.g. color wheel)
  function handleColorWheel(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    setText(hex.toUpperCase());
    onChange(hex);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    const withHash = raw.startsWith("#") ? raw : "#" + raw;
    if (isValidHex(withHash)) {
      onChange(withHash);
    }
  }

  function handleTextBlur() {
    // Normalise on blur
    const withHash = text.startsWith("#") ? text : "#" + text;
    if (isValidHex(withHash)) {
      setText(withHash.toUpperCase());
      onChange(withHash);
    } else {
      // Reset to last valid value
      setText(value.toUpperCase());
    }
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer">
      {label && <span className="text-sm text-gray-600 w-32 shrink-0">{label}</span>}
      <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:border-blue-400 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        <input
          type="color"
          value={isValidHex(value) ? value : "#000000"}
          onChange={handleColorWheel}
          className="w-6 h-6 rounded cursor-pointer border-none bg-transparent shrink-0"
        />
        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          maxLength={7}
          className="w-20 text-sm font-mono text-gray-700 bg-transparent focus:outline-none"
          placeholder="#000000"
        />
      </div>
    </label>
  );
}
