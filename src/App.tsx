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
import { api } from './api/client';

interface Project {
  id: string;
  name: string;
  baseModel: string;
  status: 'Scanned' | 'Designing' | 'Completed';
  visibility: 'Private' | 'Link' | 'Public';
  updatedAt: string;
  imageUrl: string;
  device: string;
  fileSize: string;
  photosCount: number;
  verticesCount: string;
  colorCode: string;
  description: string;
}

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

  const [activeDetailProject, setActiveDetailProject] = useState<Project | null>(null);


  // Projects State lifted up to App level
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      name: 'Air Force 1 Street Art',
      baseModel: 'Nike Air Force 1',
      status: 'Completed',
      visibility: 'Public',
      updatedAt: '2 hours ago',
      imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=300&q=80',
      device: 'iPhone 14 Pro',
      fileSize: '45.8 MB',
      photosCount: 84,
      verticesCount: '248.000 points',
      colorCode: '#38BDF8',
      description: 'Custom street-art themed Air Force 1 with graffiti prints on the side mesh panels. Optimized for print-ready color transfer.',
    },
    {
      id: '2',
      name: 'Jordan 1 Retro Shadow',
      baseModel: 'Nike Air Jordan 1',
      status: 'Designing',
      visibility: 'Link',
      updatedAt: 'Yesterday',
      imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=300&q=80',
      device: 'iPad Pro (LiDAR)',
      fileSize: '68.2 MB',
      photosCount: 112,
      verticesCount: '385.000 points',
      colorCode: '#62626A',
      description: 'Monochrome shadow theme using heavy leather textures. Synced into desktop workspace for paint mapping.',
    },
    {
      id: '3',
      name: 'Superstar Core Neon',
      baseModel: 'Adidas Superstar',
      status: 'Scanned',
      visibility: 'Private',
      updatedAt: '3 days ago',
      imageUrl: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=300&q=80',
      device: 'Sony A7 IV Rig',
      fileSize: '118.4 MB',
      photosCount: 180,
      verticesCount: '650.000 points',
      colorCode: '#FBBD23',
      description: 'Bright neon yellow accents on classic Superstar shell toe. Reconstructed using automated photogrammetry pipeline.',
    },
    {
      id: '4',
      name: 'Yeezy 350 Sand Wave',
      baseModel: 'Yeezy Boost 350',
      status: 'Designing',
      visibility: 'Private',
      updatedAt: '1 week ago',
      imageUrl: 'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?auto=format&fit=crop&w=300&q=80',
      device: 'iPhone 15 Pro Max',
      fileSize: '32.1 MB',
      photosCount: 76,
      verticesCount: '190.000 points',
      colorCode: '#D4C5B9',
      description: 'Light desert sand colorway. Low-poly optimized scan to reduce render latency during fast customizer mapping.',
    },
    {
      id: '5',
      name: 'Dunk Low Crimson',
      baseModel: 'Nike Dunk Low',
      status: 'Completed',
      visibility: 'Public',
      updatedAt: '2 weeks ago',
      imageUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=300&q=80',
      device: 'iPhone 13 mini',
      fileSize: '29.7 MB',
      photosCount: 64,
      verticesCount: '160.000 points',
      colorCode: '#E61E43',
      description: 'Deep crimson red panels. Baked lightmaps and metallic sheen optimized for instant web browser visualization.',
    },
    {
      id: '6',
      name: 'Forum Low Off-White',
      baseModel: 'Adidas Forum Low',
      status: 'Scanned',
      visibility: 'Link',
      updatedAt: '1 month ago',
      imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80',
      device: 'Samsung S23 Ultra',
      fileSize: '54.2 MB',
      photosCount: 92,
      verticesCount: '280.000 points',
      colorCode: '#F4F4F6',
      description: 'Soft cream tones on leather panels. Raw reconstructed mesh containing full vertex normals.',
    },
  ]);

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
        {activePage === 'dashboard' && <Dashboard setActivePage={navigate} />}
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
        {activePage === 'project-details' && (
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
