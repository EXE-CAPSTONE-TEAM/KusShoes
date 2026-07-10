import { useState, useEffect } from 'react';
import { Landing } from './pages/Landing/Landing';
import { Login } from './pages/Login/Login';
import { PricingPage } from './pages/PricingPage/PricingPage';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Projects } from './pages/Projects/Projects';
import { Billing } from './pages/Billing/Billing';
import { Settings } from './pages/Settings/Settings';
import { ProjectDetails } from './pages/ProjectDetails/ProjectDetails';
import { ProductsPage } from './pages/ProductsPage/ProductsPage';
import { AdminApp } from './pages/Admin/AdminApp';
import { api, ApiError, type PortalProject } from './api/client';

// Helper to convert URL path to page key
const getPageFromPath = (path: string): string => {
  const parts = path.split('?');
  const cleanPath = parts[0];
  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/')) {
    return 'admin';
  }
  switch (cleanPath) {
    case '/project-details':
      return 'project-details';
    case '/products':
      return 'products-info';
    case '/pricing':
      return 'pricing';
    case '/login':
      return 'login';
    case '/dashboard':
      return 'dashboard';
    case '/projects':
      return 'projects';
    case '/archives':
      return 'archives';
    case '/billing':
      return 'billing';
    case '/settings':
      return 'settings';
    case '/':
    default:
      return 'landing';
  }
};

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
    case 'login':
      return '/login' + query;
    case 'dashboard':
      return '/dashboard' + query;
    case 'projects':
      return '/projects' + query;
    case 'archives':
      return '/archives' + query;
    case 'billing':
      return '/billing' + query;
    case 'settings':
      return '/settings' + query;
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

  const [activeDetailProject, setActiveDetailProject] = useState<PortalProject | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');

  // Intercept state changes and push history
  const navigate = (pageOrPath: string) => {
    const isPath = pageOrPath.startsWith('/');
    const path = isPath ? pageOrPath : getPathFromPage(pageOrPath);
    const page = isPath ? getPageFromPath(pageOrPath) : pageOrPath.split('?')[0];
    
    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== path) {
      window.history.pushState({}, '', path);
    }

    // Immediately extract and set active project details if applicable
    if (page === 'project-details') {
      const searchStr = path.includes('?') ? '?' + path.split('?')[1] : '';
      const params = new URLSearchParams(searchStr);
      const id = params.get('id');
      const found = projects.find(p => p.id === id);
      if (found) {
        setActiveDetailProject(found);
      }
    }
    
    setActivePage(page);
  };

  useEffect(() => {
    const portalPages = ['dashboard', 'projects', 'archives', 'billing', 'settings', 'project-details'];
    if (!portalPages.includes(activePage) || projectsLoading) return;
    setProjectsLoading(true);
    setProjectsError('');
    api.listProjects()
      .then((page) => setProjects(page.items))
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          navigate('/login');
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
      setActivePage(page);
      
      if (page === 'project-details') {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        const found = projects.find(p => p.id === id);
        if (found) {
          setActiveDetailProject(found);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [projects]);

  // Fallback for initial load or query reload
  useEffect(() => {
    if (activePage === 'project-details' && !activeDetailProject && projects.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const found = projects.find(p => p.id === id) || projects[0];
      setActiveDetailProject(found);
    }
  }, [activePage, projects, activeDetailProject]);

  if (activePage === 'admin') {
    return <AdminApp />;
  }

  const isPortalView = ['dashboard', 'projects', 'archives', 'billing', 'settings', 'project-details'].includes(activePage);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      navigate('/');
    }
  };

  return (
    <>
      {/* If it's a logged-in view, show the Sidebar navigation */}
      {isPortalView && (
        <Sidebar 
          activePage={activePage} 
          setActivePage={navigate} 
          onLogout={handleLogout} 
          projects={projects}
        />
      )}

      {/* Main Content Area */}
      <main style={{ flexGrow: 1, backgroundColor: 'var(--bg-primary)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', transition: 'background-color var(--transition-normal)' }}>

        {activePage === 'landing' && <Landing navigate={navigate} />}
        {activePage === 'products-info' && <ProductsPage navigate={navigate} />}
        {activePage === 'login' && <Login setPage={navigate} />}
        {activePage === 'pricing' && <PricingPage navigate={navigate} />}
        
        {/* Portal pages */}
        {activePage === 'dashboard' && <Dashboard setActivePage={navigate} projects={projects} />}
        {activePage === 'projects' && (
          <Projects 
            projects={projects} 
            setProjects={setProjects}
            onViewDetails={(id) => navigate(`/project-details?id=${id}`)}
          />
        )}
        {activePage === 'archives' && (
          <Projects 
            projects={projects} 
            setProjects={setProjects}
            onViewDetails={(id) => navigate(`/project-details?id=${id}`)}
            initialFilter="Completed"
          />
        )}
        {activePage === 'billing' && <Billing />}
        {activePage === 'settings' && <Settings />}
        {projectsError && isPortalView && (
          <div role="alert" style={{ margin: '24px', color: '#ef4444' }}>{projectsError}</div>
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
    </>
  );
}

export default App;
