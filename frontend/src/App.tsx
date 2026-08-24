import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Layout } from './components/layout/Layout.js';
import { Login } from './pages/Login.js';
import { Register } from './pages/Register.js';
import { Dashboard } from './pages/Dashboard.js';
import { TendersList } from './pages/TendersList.js';
import { TenderDetail } from './pages/TenderDetail.js';
import { CreateTender } from './pages/CreateTender.js';
import { EvaluationView } from './pages/EvaluationView.js';
import { VendorBids } from './pages/VendorBids.js';
import { VendorProfilePage } from './pages/VendorProfilePage.js';
import { AuditLogs } from './pages/AuditLogs.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-stone-50 text-xs text-stone-500 font-mono"
        role="status"
        aria-live="polite"
      >
        Authenticating session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tenders" element={<TendersList />} />
            <Route path="/tenders/new" element={<CreateTender />} />
            <Route path="/tenders/:id" element={<TenderDetail />} />
            <Route path="/evaluations/:id" element={<EvaluationView />} />
            <Route path="/vendor/bids" element={<VendorBids />} />
            <Route path="/vendor/profile" element={<VendorProfilePage />} />
            <Route path="/audit" element={<AuditLogs />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
};
export default App;
