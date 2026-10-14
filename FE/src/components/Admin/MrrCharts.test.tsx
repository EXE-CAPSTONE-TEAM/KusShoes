import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MrrAreaChart } from './MrrAreaChart';
import { MrrWaterfallChart, buildWaterfallSteps } from './MrrWaterfallChart';

const movement = { month: '2026-10', new: 5_000_000, expansion: 2_000_000, reactivation: 1_000_000, contraction: 1_500_000, churn: 3_000_000, net_new: 3_500_000 };

describe('buildWaterfallSteps', () => {
  it('chains each step from the previous cumulative level', () => {
    const steps = buildWaterfallSteps(movement);
    for (let i = 1; i < 5; i += 1) expect(steps[i].start).toBe(steps[i - 1].end);
  });

  it('reconciles the cumulative level with inflow minus outflow', () => {
    const steps = buildWaterfallSteps(movement);
    const inflow = movement.new + movement.expansion + movement.reactivation;
    const outflow = movement.contraction + movement.churn;
    expect(steps[4].end).toBe(inflow - outflow);
  });

  it('treats sign-flipped inputs as magnitudes and keeps range ordered low→high', () => {
    const steps = buildWaterfallSteps({ ...movement, contraction: -1_500_000, churn: -3_000_000 });
    for (const s of steps) expect(s.range[0]).toBeLessThanOrEqual(s.range[1]);
    expect(steps[3].delta).toBeLessThan(0);
    expect(steps[4].delta).toBeLessThan(0);
  });

  it('anchors the Net New total at zero', () => {
    const total = buildWaterfallSteps({ ...movement, net_new: -2_000_000 })[5];
    expect(total.range).toEqual([-2_000_000, 0]);
  });
});

describe('Mrr charts', () => {
  it('renders the waterfall summary strip and coverage ratio', () => {
    render(<MrrWaterfallChart data={movement} />);
    expect(screen.getByText('Khả năng bù đắp')).toBeInTheDocument();
    expect(screen.getByText('178%')).toBeInTheDocument();
  });

  it('shows the empty message when there are no revenue points', () => {
    render(<MrrAreaChart points={[]} />);
    expect(screen.getByText(/Chưa có dữ liệu phân tích doanh thu/)).toBeInTheDocument();
  });

  it('shows period stats for the area chart', () => {
    render(
      <MrrAreaChart
        points={[
          { label: '09', value: 1_000_000 },
          { label: '10', value: 3_000_000 },
        ]}
      />,
    );
    expect(screen.getByText('Tổng kỳ (2 tháng)')).toBeInTheDocument();
    expect(screen.getByText('Đạt đỉnh (T10)')).toBeInTheDocument();
  });
});
