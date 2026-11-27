import { useEffect, useState } from 'react';
import './App.css';
import DataManagementPage from './pages/DataManagementPage';
import PredictorPage from './pages/PredictorPage';

type RoutePath = '/' | '/data';

function resolveRoute(pathname: string): RoutePath {
  return pathname.startsWith('/data') ? '/data' : '/';
}

export default function App() {
  const [route, setRoute] = useState<RoutePath>(() => resolveRoute(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      setRoute(resolveRoute(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (target: RoutePath) => {
    if (route === target) return;
    window.history.pushState({}, '', target);
    setRoute(target);
  };

  return (
    <div className="app-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <button
          type="button"
          className={`nav-tab ${route === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          Прогноз цены
        </button>
        <button
          type="button"
          className={`nav-tab ${route === '/data' ? 'active' : ''}`}
          onClick={() => navigate('/data')}
        >
          Управление данными
        </button>
      </nav>

      <main className="app-container">
        {route === '/data' ? <DataManagementPage /> : <PredictorPage />}
      </main>
    </div>
  );
}
