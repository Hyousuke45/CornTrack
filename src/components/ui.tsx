import { useEffect, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";

/* --------------------------------- Layout ---------------------------------- */

export function PageHead({
  title,
  intro,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  intro?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4">
      {backHref && (
        <a href={backHref} className="back-link">
          ← {backLabel ?? "Back"}
        </a>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{title}</h1>
          {intro && <p className="page-intro">{intro}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="section-title">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <b className="text-sm text-[#3d5245]">{title}</b>
      <p className="mt-1 text-xs leading-relaxed">{text}</p>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "blue" | "gold" | "purple";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/* --------------------------------- Metrics --------------------------------- */

export function StatCard({
  label,
  value,
  meta,
  accent,
}: {
  label: string;
  value: string;
  meta?: string;
  accent?: "red" | "green" | "blue" | "gold";
}) {
  return (
    <div className={`stat-card ${accent ? `stat-${accent}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </div>
  );
}

export function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tiny-stat">
      <div className="tiny-label">{label}</div>
      <div className="tiny-value">{value}</div>
    </div>
  );
}

/* ---------------------------------- Forms ---------------------------------- */

export function Field({
  label,
  name,
  defaultValue = "",
  type = "text",
  required = false,
  step,
  min,
  placeholder,
  help,
  inputMode,
  value,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  step?: string;
  min?: string;
  placeholder?: string;
  help?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  /** Controlled mode (used by live calculators). */
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="field"
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
        step={step}
        min={min}
        placeholder={placeholder}
        data-testid={`input-${name}`}
      />
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue = "",
  rows = 3,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        className="field resize-y"
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        required={required}
        data-testid={`input-${name}`}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field" name={name} defaultValue={defaultValue} data-testid={`select-${name}`}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

/** Reads a non-negative number from FormData. */
export function formNumber(form: FormData, name: string): number {
  const value = Number(form.get(name));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Reads a trimmed string from FormData. */
export function formText(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

/* ------------------------------- Bottom sheet ------------------------------- */

export function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [close]);

  return (
    <div className="sheet-backdrop" onMouseDown={close}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={17} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------- Buttons --------------------------------- */

export function SaveButton({
  label,
  pending,
  testId,
}: {
  label: string;
  pending?: boolean;
  testId?: string;
}) {
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending} data-testid={testId}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function onSubmit(handler: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
  };
}
