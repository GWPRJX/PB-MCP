import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { login, setToken, getToken, clearToken } from './api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { TenantsPage } from './pages/TenantsPage';
import { TenantDetailPage } from './pages/TenantDetailPage';
import { CreateTenantPage } from './pages/CreateTenantPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';

function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());

  useEffect(() => {
    const check = () => setAuthenticated(!!getToken());
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  if (!authenticated) {
    return (
      <LoginPage
        onLogin={async (username: string, password: string) => {
          const token = await login(username, password);
          setToken(token);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <BrowserRouter basename="/dashboard">
      <Layout onLogout={() => { clearToken(); setAuthenticated(false); }}>
        <Routes>
          <Route path="/" element={<Navigate to="/tenants" replace />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/tenants/new" element={<CreateTenantPage />} />
          <Route path="/tenants/:id" element={<TenantDetailPage />} />
          <Route path="/kb" element={<KnowledgeBasePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
