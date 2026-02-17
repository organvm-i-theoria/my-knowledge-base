// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResult } from '../types';
import { SearchResultCard } from './UnitCard';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const ui = {
    activeTab: 'search',
    modalUnitId: null as string | null,
    setActiveTab: vi.fn((tab: string) => {
      ui.activeTab = tab;
    }),
    openModal: vi.fn((unitId: string) => {
      ui.modalUnitId = unitId;
    }),
  };

  const branches = {
    rootUnitId: null as string | null,
    selectedPath: [] as string[],
    setRootUnit: vi.fn((unitId: string) => {
      branches.rootUnitId = unitId;
      branches.selectedPath = [unitId];
    }),
  };

  return { ui, branches };
});

vi.mock('../stores/uiStore', () => ({
  useUIStore: () => ({
    setActiveTab: mocks.ui.setActiveTab,
    openModal: mocks.ui.openModal,
  }),
}));

vi.mock('../stores/branchStore', () => ({
  useBranchStore: () => ({
    setRootUnit: mocks.branches.setRootUnit,
  }),
}));

const sampleResult: SearchResult = {
  unit: {
    id: 'unit-123',
    title: 'Root Candidate',
    content: 'Sample content for branch exploration',
    context: 'sample context',
    type: 'insight',
    category: 'programming',
    tags: ['sample'],
    keywords: ['sample'],
    timestamp: '2026-02-17T00:00:00.000Z',
  },
  score: 0.91,
};

describe('SearchResultCard', () => {
  beforeEach(() => {
    mocks.ui.activeTab = 'search';
    mocks.ui.modalUnitId = null;
    mocks.ui.setActiveTab.mockClear();
    mocks.ui.openModal.mockClear();
    mocks.branches.rootUnitId = null;
    mocks.branches.selectedPath = [];
    mocks.branches.setRootUnit.mockClear();
  });

  it('navigates to branches and sets root when Explore Branches is clicked', async () => {
    const user = userEvent.setup();
    render(<SearchResultCard result={sampleResult} />);

    await user.click(screen.getByRole('button', { name: 'Explore Branches' }));

    expect(mocks.ui.setActiveTab).toHaveBeenCalledWith('branches');
    expect(mocks.branches.setRootUnit).toHaveBeenCalledWith('unit-123');
    expect(mocks.ui.openModal).not.toHaveBeenCalled();
    expect(mocks.ui.activeTab).toBe('branches');
    expect(mocks.branches.rootUnitId).toBe('unit-123');
    expect(mocks.branches.selectedPath).toEqual(['unit-123']);
  });
});
