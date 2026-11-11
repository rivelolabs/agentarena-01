"use client";
import { X } from "lucide-react";
import clsx from "clsx";

export function Modal({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx("grain w-full rounded-3xl border border-line bg-[#141415] p-6 shadow-2xl", wide ? "max-w-2xl" : "max-w-lg")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-fg placeholder:text-dim outline-none transition focus:border-white/30";

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; disabled?: boolean }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-lg px-3.5 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
            value === o.value ? "bg-white text-[#111]" : "text-muted hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
