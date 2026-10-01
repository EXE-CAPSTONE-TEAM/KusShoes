import { lazy, Suspense, useEffect, useState, useTransition } from 'react';
import { addBootTask, markAppMounted } from './boot/boot';
import { Landing } from './pages/Landing/Landing';
import { Login } from './pages/Login/Login';
import { GoogleCallback } from './pages/Login/GoogleCallback';
import { LegalConsentGate } from './components/LegalConsentGate/LegalConsentGate';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ImpersonationBanner } from './components/ImpersonationBanner/ImpersonationBanner';
import { TopProgressBar } from './components/TopProgressBar/TopProgressBar';
import { api, ApiError, type PortalProject } from './api/client';
import { getSettingTabFromSearch, type SettingTab } from './pages/Settings/settingsNavigation';
import { useDocumentMeta } from './seo/useDocumentMeta';

// Everything except the public entry points (Landing, Login) is code-split. The importers are
// kept in one map so the first page of a full load can be registered as a boot task.
const importDashboard = () =>
  import('./pages/Dashboard/Dashboard').then((m) => ({ default: m.Dashboard }));
const importProjects = () =>
  import('./pages/Projects/Projects').then((m) => ({ default: m.Projects }));
const importTrash = () => import('./pages/Trash/Trash').then((m) => ({ default: m.Trash }));
const importExports = () => import('./pages/Exports/Exports').then((m) => ({ default: m.Exports }));
const importBilling = () => import('./pages/Billing/Billing').then((m) => ({ default: m.Billing }));
const importSettings = () =>
  import('./pages/Settings/Settings').then((m) => ({ default: m.Settings }));
const importFeedback = () =>
  import('./pages/Feedback/Feedback').then((m) => ({ default: m.Feedback }));
const importProjectDetails = () =>
  import('./pages/ProjectDetails/ProjectDetails').then((m) => ({ default: m.ProjectDetails }));
const importProducts = () =>
  import('./pages/ProductsPage/ProductsPage').then((m) => ({ default: m.ProductsPage }));
const importPricing = () =>
  import('./pages/PricingPage/PricingPage').then((m) => ({ default: m.PricingPage }));
const importAdmin = () => import('./pages/Admin/AdminApp').then((m) => ({ default: m.AdminApp }));
const importLegal = () =>
  import('./pages/Legal/LegalPage').then((m) => ({ default: m.LegalPage }));
const importArtisanViewer = () =>
  import('./pages/ArtisanViewer/ArtisanViewer').then((m) => ({ default: m.ArtisanViewer }));

const Dashboard = lazy(importDashboard);
const Projects = lazy(importProjects);
const Trash = lazy(importTrash);
const Exports = lazy(importExports);
const Billing = lazy(importBilling);
const Settings = lazy(importSettings);
const Feedback = lazy(importFeedback);
const ProjectDetails = lazy(importProjectDetails);
const ProductsPage = lazy(importProducts);
const PricingPage = lazy(importPricing);
const AdminApp = lazy(importAdmin);
const ArtisanViewer = lazy(importArtisanViewer);
const LegalPage = lazy(importLegal);

const pageImporters: Record<string, (() => Promise<unknown>) | undefined> = {
  dashboard: importDashboard,
  projects: importProjects,
  archives: importProjects,
  trash: importTrash,
  exports: importExports,
  billing: importBilling,
  settings: importSettings,
  feedback: importFeedback,
  'project-details': importProjectDetails,
  'products-info': importProducts,
  pricing: importPricing,
  admin: importAdmin,
  'artisan-viewer': importArtisanViewer,
  privacy: importLegal,
  terms: importLegal,
};

// Helper to convert URL path to page key
const getPageFromPath = (path: string): string => {
  const parts = path.split('?');
  const cleanPath = parts[0];
  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/')) {
    return 'admin';
  }
  if (cleanPath.startsWith('/artisan/')) {
    return 'artisan-viewer';
  }
  switch (cleanPath) {
    case '/auth/google/callback':
      return 'google-callback';
    case '/project-details':
      return 'project-details';
    case '/products':
      return 'products-info';
    case '/pricing':
      return 'pricing';
    case '/privacy':
      return 'privacy';
    case '/terms':
      return 'terms';
    case '/login':
      return 'login';
    case '/dashboard':
      return 'dashboard';
    case '/projects':
      return 'projects';
    case '/archives':
      return 'archives';
    case '/trash':
      return 'trash';
    case '/exports':
      return 'exports';
    case '/billing':
    case '/billing/success': // PayOS / MoMo return URLs
    case '/billing/cancel':
      return 'billing';
    case '/settings':
      return 'settings';
    case '/feedback':
      return 'feedback';
    case '/':
    default:
      return 'landing';
  }
};

// A full load that lands on a lazy page: make the boot loader wait for its chunk.
const initialImporter = pageImporters[getPageFromPath(window.location.pathname)];
if (initialImporter) addBootTask(initialImporter());

// Helper to convert page key to URL path
const getPathFromPage = (page: string): string => {
  const parts = page.split('?');
  const cleanPage = parts[0];
  const query = parts[1] ? '?' + parts[1] : '';
  switch (cleanPage) {
    case 'project-details':
      return '/project-details' + query;
    case 'pricing':
      return '/pricing' + query;
    case 'privacy':
      return '/privacy' + query;
    case 'terms':
      return '/terms' + query;
    case 'login':
      return '/login' + query;
    case 'dashboard':
      return '/dashboard' + query;
    case 'projects':
      return '/projects' + query;
    case 'archives':
      return '/archives' + query;
    case 'trash':
      return '/trash' + query;
    case 'exports':
      return '/exports' + query;
    case 'billing':
      return '/billing' + query;
    case 'settings':
      return '/settings' + query;
    case 'feedback':
      return '/feedback' + query;
    case 'admin':
      return '/admin' + query;
    case 'landing':
    default:
      return '/' + query;
  }
};

function App() {
  const [activePage, setActivePage] = useState<string>(() => {
    return getPageFromPath(window.location.pathname);
  });
  const [activeSettingTab, setActiveSettingTab] = useState<SettingTab>(() => {
    return getSettingTabFromSearch(window.location.search);
  });

  // Route changes run in a transition so React keeps the current page on screen while a lazy
  // chunk loads; `isPending` drives the top progress line.
  const [isPending, startTransition] = useTransition();

  const [activeDetailProject, setActiveDetailProject] = useState<PortalProject | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');

  useEffect(() => markAppMounted(), []);
  useDocumentMeta(activePage);

  // Intercept state changes and push history
  const navigate = (pageOrPath: string) => {
    const isPath = pageOrPath.startsWith('/');
    const path = isPath ? pageOrPath : getPathFromPage(pageOrPath);
    const page = isPath ? getPageFromPath(pageOrPath) : pageOrPath.split('?')[0];

    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== path) {
      window.history.pushState({}, '', path);
    }

    // All state for the new route changes together in one transition, so the old page stays
    // visible while a lazy page chunk loads.
    startTransition(() => {
      if (page === 'settings') {
        const query = path.includes('?') ? `?${path.split('?')[1]}` : '';
        setActiveSettingTab(getSettingTabFromSearch(query));
      }

      // Immediately extract and set active project details if applicable
      if (page === 'project-details') {
        const searchStr = path.includes('?') ? '?' + path.split('?')[1] : '';
        const params = new URLSearchParams(searchStr);
        const id = params.get('id');
        const found = projects.find((p) => p.id === id);
        if (found) {
          setActiveDetailProject(found);
        }
      }

      setActivePage(page);
    });
  };

  useEffect(() => {
    const portalPages = [
      'dashboard',
      'projects',
      'archives',
      'exports',
      'billing',
      'settings',
      'project-details',
    ];
    if (!portalPages.includes(activePage)) return;
    setProjectsLoading(true);
    setProjectsError('');
    api
      .listAllProjects()
      .then(setProjects)
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          if (window.location.pathname !== '/login') {
            window.history.pushState({}, '', '/login');
          }
          setActivePage('login');
          return;
        }
        setProjectsError(caught instanceof Error ? caught.message : 'Unable to load projects.');
      })
      .finally(() => setProjectsLoading(false));
  }, [activePage]);

  // Sync browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const page = getPageFromPath(window.location.pathname);
      startTransition(() => {
        setActivePage(page);

        if (page === 'settings') {
          setActiveSettingTab(getSettingTabFromSearch(window.location.search));
        }

        if (page === 'project-details') {
          const params = new URLSearchParams(window.location.search);
          const id = params.get('id');
          const found = projects.find((p) => p.id === id);
          if (found) {
            setActiveDetailProject(found);
          }
        }
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [projects, startTransition]);

  // Fallback for initial load or query reload
  useEffect(() => {
    if (activePage === 'project-details' && !activeDetailProject && projects.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const found = projects.find((p) => p.id === id) || projects[0];
      setActiveDetailProject(found);
    }
  }, [activePage, projects, activeDetailProject]);

  if (activePage === 'admin') {
    return (
      <Suspense fallback={null}>
        <TopProgressBar active={isPending} />
        <AdminApp />
      </Suspense>
    );
  }

  const isPortalView = [
    'dashboard',
    'projects',
    'archives',
    'trash',
    'exports',
    'billing',
    'settings',
    'feedback',
    'project-details',
  ].includes(activePage);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      navigate('/');
    }
  };

  // One Suspense boundary at the root, shared by the admin and main branches, so a route
  // transition never swaps in a fallback over an already-visible page.
  return (
    <Suspense fallback={null}>
      <TopProgressBar active={isPending} />
      <ImpersonationBanner onEnded={() => navigate('/admin/users')} />
      {isPortalView && <LegalConsentGate activePage={activePage} onLogout={() => void handleLogout()} />}

      {/* If it's a logged-in view, show the Sidebar navigation */}
      {isPortalView && (
        <Sidebar
          activePage={activePage}
          setActivePage={navigate}
          onLogout={handleLogout}
          projects={projects}
          activeSettingTab={activeSettingTab}
        />
      )}

      {/* Main Content Area */}
      <main
        data-portal={isPortalView ? '' : undefined}
        style={{
          flexGrow: 1,
          backgroundColor: 'var(--bg-primary)',
          height: isPortalView ? undefined : 'auto',
          minHeight: '100vh',
          overflowY: isPortalView ? 'auto' : undefined,
          display: 'flex',
          flexDirection: 'column',
          transition: 'background-color var(--transition-normal)',
        }}
      >
        {activePage === 'landing' && <Landing navigate={navigate} />}
        {activePage === 'products-info' && <ProductsPage navigate={navigate} />}
        {activePage === 'login' && <Login setPage={navigate} />}
        {activePage === 'google-callback' && <GoogleCallback setPage={navigate} />}
        {activePage === 'artisan-viewer' && <ArtisanViewer />}
        {activePage === 'pricing' && <PricingPage navigate={navigate} />}
        {activePage === 'privacy' && <LegalPage doc="privacy" navigate={navigate} />}
        {activePage === 'terms' && <LegalPage doc="terms" navigate={navigate} />}

        {/* Portal pages */}
        {activePage === 'dashboard' && <Dashboard setActivePage={navigate} projects={projects} />}
        {activePage === 'projects' && (
          <Projects
            projects={projects}
            setProjects={setProjects}
            onViewDetails={(id, tab) =>
              navigate(`/project-details?id=${id}${tab ? `&tab=${tab}` : ''}`)
            }
            loading={projectsLoading}
          />
        )}
        {activePage === 'archives' && (
          <Projects
            projects={projects}
            setProjects={setProjects}
            onViewDetails={(id, tab) =>
              navigate(`/project-details?id=${id}${tab ? `&tab=${tab}` : ''}`)
            }
            initialFilter="Completed"
          />
        )}
        {activePage === 'trash' && <Trash setProjects={setProjects} />}
        {activePage === 'exports' && (
          <Exports onOpenProject={(id) => navigate(`/project-details?id=${id}`)} />
        )}
        {activePage === 'billing' && <Billing />}
        {activePage === 'settings' && (
          <Settings
            activeTab={activeSettingTab}
            onTabChange={(tab) => navigate(`/settings?tab=${tab}`)}
          />
        )}
        {activePage === 'feedback' && <Feedback />}
        {projectsError && isPortalView && (
          <div role="alert" style={{ margin: '24px', color: '#ef4444' }}>
            {projectsError}
          </div>
        )}
        {projectsLoading && isPortalView && projects.length === 0 && (
          <div style={{ margin: '24px' }}>Loading data from server...</div>
        )}
        {activePage === 'project-details' && (activeDetailProject || projects[0]) && (
          <ProjectDetails
            project={activeDetailProject || projects[0]}
            onBack={() => navigate('/projects')}
            setProjects={setProjects}
          />
        )}
      </main>
    </Suspense>
  );
}

export default App;
