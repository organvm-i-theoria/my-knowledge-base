/**
 * TabNav Component
 * Tab-based navigation matching existing vanilla JS UX
 */

import { useUIStore } from '../stores/uiStore';
import type { Tab } from '../types';

const tabs: { id: Tab; label: string }[] = [
  { id: 'universe', label: 'Universe' },
  { id: 'search', label: 'Search Results' },
  { id: 'branches', label: 'Branches' },
  { id: 'federation', label: 'Federation' },
  { id: 'graph', label: 'Knowledge Graph' },
  { id: 'tags', label: 'Browse by Tags' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'exports', label: 'Exports' },
  { id: 'pages', label: 'GitHub Pages' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'profile', label: 'Profile' },
  { id: 'admin', label: 'Admin Dashboard' },
  { id: 'settings', label: 'Settings' },
];

export function TabNav() {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <nav className="flex border-b border-[var(--border)] mb-6 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`tab-btn whitespace-nowrap ${activeTab === tab.id ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
