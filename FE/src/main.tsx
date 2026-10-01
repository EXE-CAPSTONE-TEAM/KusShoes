import { addBootTask, finishBoot } from './boot/boot'
import { applyStylesheets } from './boot/stylesheets'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
// Self-hosted fonts (no render-blocking third-party stylesheet). @font-face only: each file is
// downloaded on first use, so the admin-only Roboto costs nothing on the public pages.
import '@fontsource-variable/outfit'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/roboto'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import './index.css'
import i18n, { i18nReady } from './i18n'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'
import { ErrorBoundary } from './components/Layout/ErrorBoundary.tsx'
import { initSentry } from './monitoring/sentry.ts'
import { captureInitialAttribution } from './analytics/attribution.ts'

initSentry()
captureInitialAttribution()

addBootTask(document.fonts.ready)
void finishBoot()

// Wait for i18next to finish (translations + language detection) before the first render, so
// no component can ever render mid-init and see a half-ready `t()`. The entry CSS is loaded
// without blocking the first paint (vite-plugin-async-css.ts), so it is applied here too.
void Promise.all([i18nReady, applyStylesheets()]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/*
        Explicit provider on purpose: AdminApp mounts its own separate i18next instance
        (src/i18n/adminI18n.ts) in its own <I18nextProvider>. Without *this* provider here,
        every useTranslation() call outside the admin subtree falls back to react-i18next's
        implicit "last instance that called initReactI18next wins" default — which module
        loads last (and so becomes that default) depends on bundler chunk/evaluation order,
        which differs between dev, tests and a production Rollup build. That's exactly what
        made the whole site read back raw translation keys ("nav.products", "hero.badge", ...)
        in production while working locally: adminI18n happened to initialize after this one
        and silently became the default for the entire app. Being explicit here removes that
        instance entirely from the outer tree's resolution.
      */}
      <I18nextProvider i18n={i18n}>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </I18nextProvider>
    </StrictMode>,
  )
})

