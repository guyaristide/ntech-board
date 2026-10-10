import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useWorkspace } from './model/store';
import { Backlog } from './pages/backlog/Backlog';
import { EpicPage } from './pages/EpicPage';
import { Home } from './pages/Home';
import { Programme } from './pages/Programme';
import { StoryPage } from './pages/StoryPage';
import { WorkshopPage } from './pages/workshop/WorkshopPage';
import { Layout } from './ui/Layout';

export function App() {
  const ready = useWorkspace(s => s.ready);
  const load = useWorkspace(s => s.load);
  useEffect(() => void load(), [load]);
  if (!ready) return null;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="backlog" element={<Backlog />} />
          <Route path="us/:id" element={<StoryPage />} />
          <Route path="epic/:id" element={<EpicPage />} />
          <Route path="programme" element={<Programme />} />
          <Route path="atelier/:id" element={<WorkshopPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
