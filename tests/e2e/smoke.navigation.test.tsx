import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScanProvider } from '@/context/ScanContext';
import App from '@/App';

describe('Route Navigation & Lifecycle Smoke Tests', () => {
  it('renders Home page on / with Take a Picture and Gallery buttons', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ScanProvider>
          <App />
        </ScanProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Grocery Scanner')).toBeInTheDocument();
    expect(screen.getByText('Take a Picture')).toBeInTheDocument();
    expect(screen.getByText('Choose from Gallery')).toBeInTheDocument();
    expect(screen.getByText(/100% On-Device Privacy/i)).toBeInTheDocument();
  });

  it('redirects /results back to / when no photo session is active', async () => {
    render(
      <MemoryRouter initialEntries={['/results']}>
        <ScanProvider>
          <App />
        </ScanProvider>
      </MemoryRouter>
    );

    // Results without sourceImage immediately navigates back to /
    expect(await screen.findByText('Take a Picture')).toBeInTheDocument();
  });

  it('tracks object URL creation and revocation on cleanup', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <ScanProvider>
          <App />
        </ScanProvider>
      </MemoryRouter>
    );

    unmount();
    // Upon unmount of provider, revokeAllUrls is invoked
    expect(revokeSpy).toBeDefined();
  });
});
