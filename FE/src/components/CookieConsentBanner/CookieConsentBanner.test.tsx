import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCookieConsent, openCookieSettings, saveCookieConsent } from '../../analytics';
import { CookieConsentBanner } from './CookieConsentBanner';

const banner = () => screen.queryByRole('dialog', { name: /cookies/i });
/** The banner opens after the webfonts load (immediately in JSDOM, but asynchronously). */
const renderBanner = async (navigate = vi.fn()) => {
  render(<CookieConsentBanner navigate={navigate} />);
  await act(async () => {});
};

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    window.dataLayer = [];
  });
  afterEach(cleanup);

  it('asks until the visitor decides and stores "accept all"', async () => {
    await renderBanner();
    expect(banner()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));
    expect(getCookieConsent()).toEqual({ analytics: true, ads: true });
    expect(banner()).not.toBeInTheDocument();
  });

  it('lets the visitor reject everything optional in one click', async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /necessary only/i }));
    expect(getCookieConsent()).toEqual({ analytics: false, ads: false });
    expect(banner()).not.toBeInTheDocument();
  });

  it('saves a per-category choice', async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /analytics/i }));
    fireEvent.click(screen.getByRole('button', { name: /save choices/i }));
    expect(getCookieConsent()).toEqual({ analytics: true, ads: false });
  });

  it('stays hidden after a choice and reopens from "Cookie settings" with it preselected', async () => {
    saveCookieConsent({ analytics: true, ads: false });
    await renderBanner();
    expect(banner()).not.toBeInTheDocument();

    act(() => openCookieSettings());
    expect(banner()).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /analytics/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /advertising/i })).not.toBeChecked();
  });

  it('closes when the choice is made elsewhere (Settings → Privacy)', async () => {
    await renderBanner();
    act(() => {
      saveCookieConsent({ analytics: false });
    });
    expect(banner()).not.toBeInTheDocument();
  });

  it('opens the privacy policy in-app', async () => {
    const navigate = vi.fn();
    await renderBanner(navigate);
    fireEvent.click(screen.getByRole('link', { name: /privacy policy/i }));
    expect(navigate).toHaveBeenCalledWith('/privacy');
  });
});
