// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const store = {
    activeTab: 'search',
    theme: 'system' as 'light' | 'dark' | 'system',
    setActiveTab: vi.fn((tab: string) => {
      store.activeTab = tab;
    }),
    toggleShortcuts: vi.fn(),
    setTheme: vi.fn((theme: 'light' | 'dark' | 'system') => {
      store.theme = theme;
    }),
    closeModal: vi.fn(),
  };

  const useUIStore = Object.assign(
    () => ({
      setActiveTab: store.setActiveTab,
      toggleShortcuts: store.toggleShortcuts,
      setTheme: store.setTheme,
      theme: store.theme,
    }),
    {
      getState: () => ({
        closeModal: store.closeModal,
        toggleShortcuts: store.toggleShortcuts,
      }),
    },
  );

  return { store, useUIStore };
});

vi.mock('../stores/uiStore', () => ({
  useUIStore: mocks.useUIStore,
}));

import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function KeyboardShortcutHarness() {
  useKeyboardShortcuts();
  return <input id="searchInput" aria-label="search" />;
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    mocks.store.activeTab = 'search';
    mocks.store.theme = 'system';
    mocks.store.setActiveTab.mockClear();
    mocks.store.toggleShortcuts.mockClear();
    mocks.store.setTheme.mockClear();
    mocks.store.closeModal.mockClear();
  });

  it('switches to branches tab when pressing G then B', async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcutHarness />);

    await user.keyboard('gb');

    expect(mocks.store.setActiveTab).toHaveBeenCalledWith('branches');
    expect(mocks.store.activeTab).toBe('branches');
  });
});
