import { Link, useLocation } from 'react-router-dom';
import { clearToken } from '../api';
import type { ReactNode } from 'react';

/**
 * Application shell component. Renders the top navigation bar with links to
 * Tenants and Knowledge Base sections, a Logout button, and a centred content
 * area for `children`. Active nav links are highlighted based on the current
 * route.
 *
 * @param children - Page content to render inside the main area.
 * @param onLogout - Callback invoked when the user clicks the Logout button.
 *   Should clear auth state in the parent component.
 */
export function Layout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold text-gray-900">
            PB MCP Admin
          </Link>
          <Link
            to="/tenants"
            className={`text-sm ${location.pathname.startsWith('/tenants') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Tenants
          </Link>
          <Link
            to="/kb"
            className={`text-sm ${location.pathname.startsWith('/kb') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Knowledge Base
          </Link>
          <Link
            to="/setup"
            className={`text-sm ${location.pathname.startsWith('/setup') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Setup
          </Link>
        </div>
        <button
          onClick={() => { clearToken(); onLogout(); }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
