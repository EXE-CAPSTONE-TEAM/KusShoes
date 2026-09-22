import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsEmptyState } from './ProjectsEmptyState';

afterEach(cleanup);

const base = { activeFilters: [] as string[], onCreate: vi.fn(), onClearFilters: vi.fn() };

describe('ProjectsEmptyState', () => {
  it('welcomes a brand-new account with a call to action and the three steps', () => {
    const onCreate = vi.fn();
    render(<ProjectsEmptyState {...base} totalProjects={0} onCreate={onCreate} />);
    expect(screen.getByText(/your studio is empty/i)).toBeInTheDocument();
    for (const step of [/create a project/i, /design in kusstudio/i, /export & share/i]) {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole('button', { name: /create your first project/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('explains a filtered-out list, names the filters and offers to clear them', () => {
    const onClearFilters = vi.fn();
    render(
      <ProjectsEmptyState
        {...base}
        totalProjects={4}
        activeFilters={['“nike”', 'Designing']}
        onClearFilters={onClearFilters}
      />,
    );
    expect(screen.getByText(/no projects match your filters/i)).toBeInTheDocument();
    expect(screen.getByText(/you have 4 projects/i)).toBeInTheDocument();
    expect(screen.getByText('Designing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('shows a loading placeholder instead of flashing "empty"', () => {
    render(<ProjectsEmptyState {...base} totalProjects={0} loading />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading your projects/i);
    expect(screen.queryByText(/your studio is empty/i)).not.toBeInTheDocument();
  });
});
