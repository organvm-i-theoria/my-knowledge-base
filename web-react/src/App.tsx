/**
 * Main App Component
 * Root component with React Query provider and layout
 */

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUIStore } from './stores/uiStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useWebSocket } from './hooks/useWebSocket';
import './index.css';

// Components
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { TabNav } from './components/TabNav';
import { UnitModal } from './components/UnitModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ToastContainer } from './components/ToastContainer';

// Tab content
import { SearchTab } from './components/tabs/SearchTab';
import { FederationTab } from './components/tabs/FederationTab';
import { GraphTab } from './components/tabs/GraphTab';
import { TagsTab } from './components/tabs/TagsTab';
import { ConversationsTab } from './components/tabs/ConversationsTab';
import { ExportsTab } from './components/tabs/ExportsTab';
import { NotificationsTab } from './components/tabs/NotificationsTab';
import { ProfileTab } from './components/tabs/ProfileTab';
import { AdminTab } from './components/tabs/AdminTab';
import { SettingsTab } from './components/tabs/SettingsTab';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { activeTab, addNotification } = useUIStore();
  const { lastEvent } = useWebSocket();

  // Set up keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'ping' || lastEvent.type === 'pong' || lastEvent.type === 'connection') {
      return;
    }
    addNotification({
      title: `Event: ${lastEvent.type}`,
      message:
        typeof lastEvent.data === 'object' && lastEvent.data !== null
          ? JSON.stringify(lastEvent.data).slice(0, 160)
          : 'Realtime update received',
      level: 'info',
      timestamp: lastEvent.timestamp || new Date().toISOString(),
      sourceEventType: lastEvent.type,
    });
  }, [addNotification, lastEvent]);

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return <SearchTab />;
      case 'federation':
        return <FederationTab />;
      case 'graph':
        return <GraphTab />;
      case 'tags':
        return <TagsTab />;
      case 'conversations':
        return <ConversationsTab />;
      case 'exports':
        return <ExportsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'profile':
        return <ProfileTab />;
      case 'admin':
        return <AdminTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <SearchTab />;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Header />
        <SearchBar />
        <TabNav />
        <main>{renderTabContent()}</main>
      </div>

      {/* Modals */}
      <UnitModal />
      <ShortcutsModal />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
