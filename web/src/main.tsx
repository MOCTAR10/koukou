import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { API_BASE, OfflineError } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import { startConnectivityWatch } from './offline/connectivity';
import { pruneReadCache } from './offline/readCache';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Queries and writes must run offline: api answers from the saved data,
      // or the engine queues the write. The default would pause them forever.
      networkMode: 'always',
      retry: (count, error) => !(error instanceof OfflineError) && count < 1,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'always' },
  },
});

startConnectivityWatch(API_BASE);
void pruneReadCache();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);