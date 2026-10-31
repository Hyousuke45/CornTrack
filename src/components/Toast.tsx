import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: number; title: string; description?: string; variant: ToastVariant };
type ToastInput = { title: string; description?: string; variant?: ToastVariant };

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((input: ToastInput) => {
    const id = ++counter.current;
    setItems((current) => [...current, { id, variant: "success", ...input }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.variant}`}>
            <span className="toast-icon">
              {item.variant === "success" ? (
                <CheckCircle2 size={17} />
              ) : item.variant === "error" ? (
                <AlertTriangle size={17} />
              ) : (
                <Info size={17} />
              )}
            </span>
            <div>
              <b className="block text-[13px] leading-tight">{item.title}</b>
              {item.description && (
                <p className="mt-0.5 text-[11px] leading-snug opacity-80">{item.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
