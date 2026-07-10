import React, { useEffect, useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from '../../context/AdminAuthContext';
import { AdminSidebar } from './AdminLayout/AdminSidebar';
import { AdminLogin } from './AdminLogin/AdminLogin';
import { AdminDashboard } from './Dashboard/AdminDashboard';
import { AdminUsers } from './Users/AdminUsers';
import { AdminPlans } from './Plans/AdminPlans';
import { AdminBilling } from './Billing/AdminBilling';
import { AdminProjects } from './Projects/AdminProjects';
import { AdminBakeJobs } from './BakeJobs/AdminBakeJobs';
import { AdminExports } from './Exports/AdminExports';
import { AdminSystemHealth } from './SystemHealth/AdminSystemHealth';
import { AdminAuditLogs } from './AuditLogs/AdminAuditLogs';

const VALID_PAGES = [
  'dashboard', 'users', 'plans', 'billing', 'projects',
  'bake-jobs', 'exports', 'system', 'audit-logs',
];

const getSubPage = (): string => {
  const path = window.location.pathname;
  const match = path.match(/^\/admin\/?(.*)$/);
  const sub = (match?.[1] || '').replace(/\/$/, '');
  return VALID_PAGES.includes(sub) ? sub : 'dashboard';
};

const AdminShell: React.FC = () => {
  const { session, isRestoring } = useAdminAuth();
  const [page, setPage] = useState<string>(getSubPage());

  useEffect(() => {
    const handlePopState = () => setPage(getSubPage());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPage: string) => {
    const path = `/admin/${nextPage}`;
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setPage(nextPage);
  };

  if (isRestoring) {
    return <div style={{ padding: 24, color: 'var(--text-primary)' }}>Restoring session...</div>;
  }

  if (!session) {
    return <AdminLogin />;
  }

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <AdminSidebar activePage={page} navigate={navigate} />
      <main style={{ flexGrow: 1, backgroundColor: 'var(--bg-primary)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {page === 'dashboard' && <AdminDashboard />}
        {page === 'users' && <AdminUsers />}
        {page === 'plans' && <AdminPlans />}
        {page === 'billing' && <AdminBilling />}
        {page === 'projects' && <AdminProjects />}
        {page === 'bake-jobs' && <AdminBakeJobs />}
        {page === 'exports' && <AdminExports />}
        {page === 'system' && <AdminSystemHealth />}
        {page === 'audit-logs' && <AdminAuditLogs />}
      </main>
    </div>
  );
};

export const AdminApp: React.FC = () => {
  return (
    <AdminAuthProvider>
      <AdminShell />
    </AdminAuthProvider>
  );
};
