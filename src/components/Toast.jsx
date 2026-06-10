import { Check, X } from 'lucide-react';

export default function Toast({ toast, dismissToast }) {
  if (!toast) return null;
  return (
    <div className="toast-overlay" key={toast.key}>
      <div className="toast-modal">
        <div className="toast-icon-wrap">
          <Check size={22} />
        </div>
        <p className="toast-message">{toast.message}</p>
        <div className="toast-actions">
          {toast.action && (
            <button className="toast-btn toast-btn-action" onClick={() => { dismissToast(); toast.action.action(); }}>
              {toast.action.label}
            </button>
          )}
          <button className="toast-btn toast-btn-dismiss" onClick={dismissToast}>
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
