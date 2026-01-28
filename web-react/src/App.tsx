/**
 * Main App Component
 * Root component with React Query provider and layout
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUIStore } from './stores/uiStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
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
import { GraphTab } from './components/tabs/GraphTab';
import { TagsTab } from './components/tabs/TagsTab';
import { ConversationsTab } from './components/tabs/ConversationsTab';
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
  const { activeTab } = useUIStore();

  // Set up keyboard shortcuts
  useKeyboardShortcuts();

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return <SearchTab />;
      case 'graph':
        return <GraphTab />;
      case 'tags':
        return <TagsTab />;
      case 'conversations':
        return <ConversationsTab />;
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
