import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../context/ThemeContext';
import { ToastProvider } from '../../context/ToastContext';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return { ...actual, api: { listPlans: vi.fn() } };
});

import { api, type Plan } from '../../api/client';
import { Landing } from './Landing';

afterEach(cleanup);

// jsdom has no IntersectionObserver; framer-motion's whileInView needs one to mount.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver);

const plan = (overrides: Partial<Plan>): Plan => ({
  id: 'x',
  tier: 'free',
  billing_cycle: null,
  price_vnd: 0,
  max_projects: 3,
  max_exports_per_month: 0,
  allowed_export_formats: ['glb'],
  bake_priority: 'low',
  max_ai_credits_per_cycle: null,
  max_scans_per_cycle: null,
  max_layers_per_zone: 5,
  max_layers_per_project: 20,
  allow_draw_artwork: false,
  ...overrides,
});

describe('Landing pricing section', () => {
  it('shows the prices and limits returned by /plans, per billing cycle', async () => {
    vi.mocked(api.listPlans).mockResolvedValue([
      plan({ id: 'free', tier: 'free' }),
      plan({ id: 'bm', tier: 'basic', billing_cycle: 'monthly', price_vnd: 111000, max_projects: 17 }),
      plan({ id: 'by', tier: 'basic', billing_cycle: 'yearly', price_vnd: 999000, max_projects: 17 }),
    ]);
    render(
      <ThemeProvider>
        <ToastProvider>
          <Landing navigate={vi.fn()} />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('17 active projects')).toBeInTheDocument();
    expect(screen.getByText('111.000 VNĐ')).toBeInTheDocument();
    expect(screen.queryByText('999.000 VNĐ')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Annually').previousElementSibling as HTMLElement);
    expect(await screen.findByText('999.000 VNĐ')).toBeInTheDocument();
  });

  it('hides the Annual toggle instead of dropping paid tiers when no yearly plan is active', async () => {
    // Matches production today: yearly rows are deactivated (BR-93, monthly-only this term),
    // so /plans only ever returns monthly + free. Without a guard, picking "Annually" used to
    // filter basic/pro out of the grid entirely since no billing_cycle === 'yearly' plan exists.
    vi.mocked(api.listPlans).mockResolvedValue([
      plan({ id: 'free', tier: 'free' }),
      plan({ id: 'bm', tier: 'basic', billing_cycle: 'monthly', price_vnd: 259000, max_projects: 20 }),
      plan({ id: 'pm', tier: 'pro', billing_cycle: 'monthly', price_vnd: 649000, max_projects: 50 }),
    ]);
    render(
      <ThemeProvider>
        <ToastProvider>
          <Landing navigate={vi.fn()} />
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByText('259.000 VNĐ');
    expect(screen.getByText('649.000 VNĐ')).toBeInTheDocument();
    expect(screen.queryByText('Annually')).not.toBeInTheDocument();
  });
});
