import React, { createContext, useCallback, useContext, useState } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import styles from './ToastContext.module.css';

export type ToastVariant = 'success' | 'info' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);
let publishToast: ((message: string, variant?: ToastVariant) => void) | null = null;

export const toast = {
  show(message: string, variant: ToastVariant = 'success') {
    publishToast?.(message, variant);
  },
  success(message: string) {
    publishToast?.(message, 'success');
  },
  info(message: string) {
    publishToast?.(message, 'info');
  },
  error(message: string) {
    publishToast?.(message, 'error');
  },
};

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  info: Info,
  error: AlertTriangle,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, message, variant }]);
  }, []);
  publishToast = toast;

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <Toast.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map(item => {
          const Icon = VARIANT_ICON[item.variant];
          return (
            <Toast.Root
              key={item.id}
              className={`${styles.root} ${styles[item.variant]}`}
              onOpenChange={(open) => { if (!open) dismiss(item.id); }}
            >
              <Icon size={18} className={styles.icon} />
              <Toast.Description className={styles.description}>{item.message}</Toast.Description>
            </Toast.Root>
          );
        })}
        <Toast.Viewport className={styles.viewport} />
      </Toast.Provider>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};
