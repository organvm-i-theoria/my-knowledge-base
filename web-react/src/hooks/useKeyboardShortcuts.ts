/**
 * Keyboard Shortcuts Hook
 * Implements same shortcuts as vanilla JS version
 */

import { useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Tab } from '../types';

// Key sequence tracking for multi-key shortcuts
let keySequence: string[] = [];
let keySequenceTimer: ReturnType<typeof setTimeout> | null = null;

export function useKeyboardShortcuts() {
  const { setActiveTab, toggleShortcuts, setTheme, theme } = useUIStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Ctrl+K or / to focus search (works even in inputs for Ctrl+K)
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !isInput)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('#searchInput');
        searchInput?.focus();
        return;
      }

      // Don't process other shortcuts if in input
      if (isInput) return;

      // Escape to close modals
      if (e.key === 'Escape') {
        useUIStore.getState().closeModal();
        useUIStore.getState().toggleShortcuts();
        return;
      }

      // T to toggle theme
      if (e.key === 't' || e.key === 'T') {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        return;
      }

      // ? to show shortcuts
      if (e.key === '?') {
        toggleShortcuts();
        return;
      }

      // Multi-key shortcuts (G + letter)
      // Clear sequence after 500ms
      if (keySequenceTimer) clearTimeout(keySequenceTimer);
      keySequence.push(e.key.toLowerCase());
      keySequenceTimer = setTimeout(() => {
        keySequence = [];
      }, 500);

      // Keep only last 2 keys
      if (keySequence.length > 2) {
        keySequence = keySequence.slice(-2);
      }

      // Check for G + letter combinations
      if (keySequence.length === 2 && keySequence[0] === 'g') {
        const tabMap: Record<string, Tab> = {
          r: 'search', // Results
          g: 'graph',
          t: 'tags',
          c: 'conversations',
          a: 'admin',
          s: 'settings',
        };

        const tab = tabMap[keySequence[1]];
        if (tab) {
          e.preventDefault();
          setActiveTab(tab);
          keySequence = [];
        }
      }
    },
    [setActiveTab, toggleShortcuts, setTheme, theme]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Shortcut display data
export const shortcuts = [
  { keys: ['Ctrl', 'K'], action: 'Focus search' },
  { keys: ['/'], action: 'Focus search (alternative)' },
  { keys: ['Esc'], action: 'Close modal / Clear suggestions' },
  { keys: ['T'], action: 'Toggle dark mode' },
  { keys: ['?'], action: 'Show this help' },
  { keys: ['G', 'R'], action: 'Go to Results tab' },
  { keys: ['G', 'G'], action: 'Go to Graph tab' },
  { keys: ['G', 'T'], action: 'Go to Tags tab' },
  { keys: ['G', 'C'], action: 'Go to Conversations tab' },
  { keys: ['G', 'A'], action: 'Go to Admin tab' },
  { keys: ['G', 'S'], action: 'Go to Settings tab' },
];
