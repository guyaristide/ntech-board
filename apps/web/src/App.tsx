import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BRAND } from './brand';
import { useWorkspace } from './model/store';
import { Admin } from './pages/Admin';
import { Backlog } from './pages/backlog/Backlog';
import { DiligencePage } from './pages/diligences/DiligencePage';
import { Diligences } from './pages/diligences/Diligences';
import { EpicPage } from './pages/EpicPage';
import { Home } from './pages/Home';
import { Login, ProjectNotFound } from './pages/Login';
import { Board } from './pages/delivery/Board';
import { DeliveryBacklog } from './pages/delivery/DeliveryBacklog';
import { MyTickets } from './pages/delivery/MyTickets';
import { Roadmap } from './pages/delivery/Roadmap';
import { SprintPage } from './pages/delivery/SprintPage';
import { Sprints } from './pages/delivery/Sprints';
import { TicketPage } from './pages/delivery/TicketPage';
import { Parties } from './pages/parties/Parties';
import { Settings } from './pages/parties/Settings';
import { Programme } from './pages/Programme';
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
            <Route path="diligences" element={<Diligences />} />
            <Route path="diligence/:id" element={<DiligencePage />} />
            <Route path="realisation" element={<DeliveryBacklog />} />
            <Route path="realisation/sprints" element={<Sprints />} />
            <Route path="realisation/sprint/:id" element={<SprintPage />} />
            <Route path="realisation/versions" element={<Roadmap />} />
            <Route path="realisation/tableau" element={<Board />} />
            <Route path="realisation/mes-tickets" element={<MyTickets />} />
            <Route path="realisation/ticket/:id" element={<TicketPage />} />
            <Route path="parties" element={<Parties />} />
            <Route path="reglages" element={<Settings />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}
