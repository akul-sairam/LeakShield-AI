import { render, screen } from '@testing-library/react';
import Dashboard from '../src/app/page';

// Mock Recharts since it requires DOM measurements
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: () => <div>BarChart</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

// Mock API
jest.mock('../src/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

describe('Dashboard', () => {
  it('renders stats cards correctly', () => {
    render(<Dashboard />);
    expect(screen.getByText('Total Scans')).toBeInTheDocument();
    expect(screen.getByText('Leaks Prevented')).toBeInTheDocument();
    expect(screen.getByText('Active Policies')).toBeInTheDocument();
    expect(screen.getByText('System Health')).toBeInTheDocument();
  });
});
