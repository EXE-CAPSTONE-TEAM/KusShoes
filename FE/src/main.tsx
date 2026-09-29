import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { i18nReady } from './i18n'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'
import { ErrorBoundary } from './components/Layout/ErrorBoundary.tsx'
import { initSentry } from './monitoring/sentry.ts'

initSentry()

// Wait for i18next to finish (translations + language detection) before the first render, so
// no component can ever render mid-init and see a half-ready `t()`.
void i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
})

