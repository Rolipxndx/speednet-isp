import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans'; 
import Clients from './pages/Clients';
import Payments from './pages/Payments';
import Tickets from './pages/Tickets';
import Cuts from './pages/Cuts'; // ✅ Importación de Cuts
import Inventory from './pages/Inventory';
import Company from './pages/Company';
import Theme from './pages/Theme';
import ExportCSV from './pages/ExportCSV';
import Backup from './pages/Backup';
import { canAccessRoute } from './lib/permissions';

function ProtectedRoute({ children, path }: { children: React.ReactNode; path: string }) {
  const { user, profile, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-muted-foreground">Cargando...</div>
      </div>
    );
  }
  
  if (!user) return <Navigate to="/login" replace />;
  
  if (!canAccessRoute(path, profile?.role || null)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute path="/"><Layout /></ProtectedRoute>}>
            <Route index element={<ProtectedRoute path="/"><Dashboard /></ProtectedRoute>} />
            
            <Route path="clients" element={
              <ProtectedRoute path="/clients">
                <Clients />
              </ProtectedRoute>
            } />
            
            <Route path="plans" element={
              <ProtectedRoute path="/plans">
                <Plans />
              </ProtectedRoute>
            } />

            <Route path="payments" element={
              <ProtectedRoute path="/payments">
                <Payments />
              </ProtectedRoute>
            } />

            <Route path="tickets" element={
              <ProtectedRoute path="/tickets">
                <Tickets />
              </ProtectedRoute>
            } />

            {/* ✅ Ruta de Cortes añadida */}
            <Route path="cuts" element={
              <ProtectedRoute path="/cuts">
                <Cuts />
              </ProtectedRoute>
            } />
			
			 <Route path="inventory" element={
				 <ProtectedRoute path="/inventory">
				 <Inventory />
				 </ProtectedRoute>
				 } />
				 
			<Route path="company" element={
				<ProtectedRoute path="/company">
				<Company />
				</ProtectedRoute>
				} />
			<Route path="theme" element={
				<ProtectedRoute path="/theme">
				<Theme />
				</ProtectedRoute>
				} />
			<Route path="export" element={
				<ProtectedRoute path="/export">
				<ExportCSV />
				</ProtectedRoute>
				} />
			<Route path="backup/export" element={
				<ProtectedRoute path="/backup/export">
				<Backup />
				</ProtectedRoute>
				} />
			<Route path="backup/restore" element={
				<ProtectedRoute path="/backup/restore">
				<Backup />
				</ProtectedRoute>
				} />
				
            
            {/* Rutas restantes en desarrollo */}
            <Route path="billing" element={<ProtectedRoute path="/billing"><div className="p-4">Facturación (en desarrollo)</div></ProtectedRoute>} />
            <Route path="backup/export" element={<ProtectedRoute path="/backup/export"><div className="p-4">Exportar Backup (en desarrollo)</div></ProtectedRoute>} />
            <Route path="backup/restore" element={<ProtectedRoute path="/backup/restore"><div className="p-4">Restaurar Backup (en desarrollo)</div></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;