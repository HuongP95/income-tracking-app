import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertTriangle, X, Info, HelpCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  onUndo?: () => void | Promise<void>;
  undoLabel?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
}

interface FeedbackContextType {
  showToast: (message: string, type?: ToastType, onUndo?: () => void | Promise<void>, undoLabel?: string) => void;
  confirm: (options: ConfirmOptions) => void;
}

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const showToast = (
    message: string,
    type: ToastType = 'success',
    onUndo?: () => void | Promise<void>,
    undoLabel: string = 'Hoàn tác'
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, onUndo, undoLabel }]);

    // Auto-dismiss: 1s for success as requested, 4s for others
    const duration = type === 'success' ? 1000 : 4000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  const confirm = ({
    title,
    message,
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Hủy',
    type = 'info',
    onConfirm,
  }: ConfirmOptions) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmLabel,
      cancelLabel,
      type,
      onConfirm,
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <FeedbackContext.Provider value={{ showToast, confirm }}>
      {children}

      {/* Floating Toasts container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex items-center justify-between p-4 rounded-xl bg-[#0B0F19]/95 text-white shadow-lg shadow-black/10 border border-white/10 backdrop-blur-md"
              layout
            >
              <div className="flex items-center gap-3">
                {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-[#17B978]" />}
                {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-[#F0426B]" />}
                {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-[#4F6EF7]" />}
                <p className="text-sm font-medium tracking-tight text-slate-100">{toast.message}</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {toast.onUndo && (
                  <button
                    onClick={async () => {
                      if (toast.onUndo) {
                        try {
                          await toast.onUndo();
                        } catch (e) {
                          console.error(e);
                        }
                      }
                      removeToast(toast.id);
                    }}
                    className="text-xs font-bold text-[#4F6EF7] hover:text-[#4F6EF7]/80 bg-[#4F6EF7]/10 hover:bg-[#4F6EF7]/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {toast.undoLabel}
                  </button>
                )}
                <button
                  onClick={() => removeToast(toast.id)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirmation Dialog Modal */}
      <AnimatePresence>
        {confirmDialog?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDialog(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-100 overflow-hidden"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-xl flex-shrink-0 ${
                    confirmDialog.type === 'danger'
                      ? 'bg-rose-50 text-[#F0426B]'
                      : confirmDialog.type === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-indigo-50 text-[#4F6EF7]'
                  }`}
                >
                  {confirmDialog.type === 'danger' ? (
                    <AlertTriangle className="w-6 h-6" />
                  ) : confirmDialog.type === 'warning' ? (
                    <AlertTriangle className="w-6 h-6" />
                  ) : (
                    <HelpCircle className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                    {confirmDialog.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
                >
                  {confirmDialog.cancelLabel}
                </button>
                <button
                  onClick={async () => {
                    const callback = confirmDialog.onConfirm;
                    setConfirmDialog(null);
                    try {
                      await callback();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className={`px-4 py-2 text-sm font-semibold text-white rounded-xl shadow-sm transition-all hover:scale-[1.02] cursor-pointer ${
                    confirmDialog.type === 'danger'
                      ? 'bg-[#F0426B] hover:bg-[#F0426B]/90 shadow-rose-200'
                      : confirmDialog.type === 'warning'
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                      : 'bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 shadow-indigo-100'
                  }`}
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
};
