import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { AdminAuthProvider, useAdminAuth } from '../../context/AdminAuthContext';
import adminI18n from '../../i18n/adminI18n';
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
import { AdminAnalytics } from './Analytics/AdminAnalytics';
import { AdminContent } from './Content/AdminContent';
import { AdminFeedbackPage } from './Feedback/AdminFeedbackPage';
import { AdminSettings } from './Settings/AdminSettings';

const VALID_PAGES = [
  'dashboard', 'analytics', 'users', 'plans', 'billing', 'projects',
  'bake-jobs', 'exports', 'content', 'feedback', 'system', 'audit-logs', 'settings',
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
    <div style={{ display: 'flex', width: '100%', fontFamily: "var(--font-admin, 'Roboto Variable', 'Roboto', sans-serif)" }}>
      <AdminSidebar activePage={page} navigate={navigate} />
      <main style={{ flexGrow: 1, backgroundColor: 'var(--bg-primary)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontFamily: "var(--font-admin, 'Roboto Variable', 'Roboto', sans-serif)" }}>
        {page === 'dashboard' && <AdminDashboard navigate={navigate} />}
        {page === 'analytics' && <AdminAnalytics />}
        {page === 'users' && <AdminUsers />}
        {page === 'plans' && <AdminPlans />}
        {page === 'billing' && <AdminBilling />}
        {page === 'projects' && <AdminProjects />}
        {page === 'bake-jobs' && <AdminBakeJobs />}
        {page === 'exports' && <AdminExports />}
        {page === 'content' && <AdminContent />}
        {page === 'feedback' && <AdminFeedbackPage />}
        {page === 'system' && <AdminSystemHealth />}
        {page === 'audit-logs' && <AdminAuditLogs />}
        {page === 'settings' && <AdminSettings />}
      </main>
    </div>
  );
};

export const AdminApp: React.FC = () => {
  return (
    <I18nextProvider i18n={adminI18n}>
      <AdminAuthProvider>
        <AdminShell />
      </AdminAuthProvider>
    </I18nextProvider>
  );
};
