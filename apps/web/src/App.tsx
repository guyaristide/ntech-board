import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BRAND } from './brand';
import { useWorkspace } from './model/store';
import { Admin } from './pages/Admin';
import { Backlog } from './pages/backlog/Backlog';
import { EpicPage } from './pages/EpicPage';
import { Home } from './pages/Home';
import { Login, ProjectNotFound } from './pages/Login';
import { Programme } from './pages/Programme';
import { WeekPrint } from './pages/print/WeekPrint';
import { RaciPage } from './pages/raci/RaciPage';
import { References } from './pages/References';
import { RiskPage } from './pages/risks/RiskPage';
import { Risks } from './pages/risks/Risks';
import { StoryPage } from './pages/StoryPage';
import { WorkshopPage } from './pages/workshop/WorkshopPage';
import { Layout } from './ui/Layout';

export function App() {
  const phase = useWorkspace(s => s.phase);
  const title = useWorkspace(s => s.session?.project.title);
  const init = useWorkspace(s => s.init);
  useEffect(() => void init(), [init]);
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND.product}` : BRAND.product;
  }, [title]);

  if (phase === 'loading')
    return (
      <main className="boot" aria-busy="true">
        <img src={BRAND.logo} alt={BRAND.publisher} />
      </main>
    );
  if (phase === 'notfound') return <ProjectNotFound />;
  if (phase === 'error')
    return (
      <main style={{ padding: 32 }}>
        Le serveur ne répond pas. <button onClick={() => void init()}>Réessayer</button>
      </main>
    );
  return (
    <BrowserRouter>
      {phase === 'login' ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="connexion" element={<Navigate to="/" replace />} />
          <Route path="impression/semaine" element={<WeekPrint />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="backlog" element={<Backlog />} />
            <Route path="us/:id" element={<StoryPage />} />
            <Route path="epic/:id" element={<EpicPage />} />
            <Route path="programme" element={<Programme />} />
            <Route path="atelier/:id" element={<WorkshopPage />} />
            <Route path="references" element={<References />} />
            <Route path="raci" element={<RaciPage />} />
            <Route path="risques" element={<Risks />} />
            <Route path="risque/:id" element={<RiskPage />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}
