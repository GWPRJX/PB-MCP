import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { login, setToken, getToken, clearToken } from './api';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import { LoginPage } from './pages/LoginPage';
import { TenantsPage } from './pages/TenantsPage';
import { TenantDetailPage } from './pages/TenantDetailPage';
import { CreateTenantPage } from './pages/CreateTenantPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { SetupPage } from './pages/SetupPage';

/**
 * Root application component. Manages top-level authentication state and
 * conditionally renders either the {@link LoginPage} (when unauthenticated)
 * or the full router with {@link Layout} and all protected routes (when
 * authenticated). Listens for cross-tab `storage` events so that a logout
 * in another tab is reflected immediately.
 */
function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());

  useEffect(() => {
    const check = () => setAuthenticated(!!getToken());
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  if (!authenticated) {
    return (
      <ToastProvider>
        <LoginPage
          onLogin={async (username: string, password: string) => {
            const token = await login(username, password);
            setToken(token);
            setAuthenticated(true);
          }}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter basename="/dashboard">
        <Layout onLogout={() => { clearToken(); setAuthenticated(false); }}>
          <Routes>
            <Route path="/" element={<Navigate to="/tenants" replace />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/tenants/new" element={<CreateTenantPage />} />
            <Route path="/tenants/:id" element={<TenantDetailPage />} />
            <Route path="/kb" element={<KnowledgeBasePage />} />
            <Route path="/setup" element={<SetupPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
