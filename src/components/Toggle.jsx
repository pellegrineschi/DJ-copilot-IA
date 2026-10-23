import React from 'react';

export default function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      className={`toggle ${checked ? 'on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
