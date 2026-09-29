import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useTranslation, I18nextProvider } from 'react-i18next';
import i18n, { i18nReady } from './index';
// Force adminI18n to also initialize in this test run, matching how both modules end up in the
// same bundle in production. Without the explicit <I18nextProvider> in main.tsx, whichever
// instance's initReactI18next call runs last silently becomes react-i18next's implicit default
// for every useTranslation() call with no provider ancestor — and that order depends on bundler
// chunking, so it can differ between dev/test and a production build. That's what made the whole
// site read back raw keys ("nav.products", "hero.badge", ...) in production while working
// locally: adminI18n happened to win the race there.
import './adminI18n';

const Probe: React.FC = () => {
  const { t } = useTranslation('common');
  return <span data-testid="probe">{t('nav.products')}</span>;
};

describe('main i18n instance', () => {
  it('useTranslation resolves the main instance even with adminI18n also initialized', async () => {
    await i18nReady;
    render(
      <I18nextProvider i18n={i18n}>
        <Probe />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Products');
  });
});
