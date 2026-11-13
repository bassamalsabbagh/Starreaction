import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../../../src/components/EmptyState';

describe('EmptyState', () => {
  it('renders its title and note', () => {
    render(<EmptyState title="No ranked sites">Depends on step 1.</EmptyState>);
    expect(screen.getByText('No ranked sites')).toBeInTheDocument();
    expect(screen.getByText('Depends on step 1.')).toBeInTheDocument();
  });
});
