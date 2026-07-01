import React from 'react';
import { LayoutDashboard, FolderKanban, Archive, CreditCard, Settings, LogOut, Plus } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import styles from './Sidebar.module.css';

interface Project {
  id: string;
  name: string;
  baseModel: string;
  status: 'Scanned' | 'Designing' | 'Completed';
  visibility: 'Private' | 'Link' | 'Public';
  updatedAt: string;
  imageUrl: string;
}

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  onLogout: () => void;
  projects: Project[];
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activePage, 
  setActivePage, 
  onLogout, 
  projects 
}) => {
  const { theme } = useTheme();
  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'archives', label: 'Archives', icon: Archive },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Get top 3 most recently updated projects (sorted statically by ID descending)
  const recentProjects = React.useMemo(() => {
    return [...projects]
      .sort((a, b) => parseInt(b.id) - parseInt(a.id))
      .slice(0, 3);
  }, [projects]);

  const handleRecentClick = (id: string) => {
    setActivePage(`/project-details?id=${id}`);
  };

  return (
    <aside className={styles.sidebar}>
      {/* Brand Header */}
      <div className={styles.logoSection}>
        <img
          src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
          alt="KusShoes"
          className={styles.logoImage}
          onClick={() => setActivePage('dashboard')}
        />
      </div>

      {/* Navigation Links */}
      <nav className={styles.navMenu}>
        <div className={styles.navGroup}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage.split('?')[0] === item.id;
            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                onClick={() => setActivePage(item.id)}
              >
                <Icon className={styles.navIcon} />
                <span className={styles.navLabel}>{item.label}</span>
                {isActive && <div className={styles.activeIndicator} />}
              </button>
            );
          })}
        </div>

        {/* Separator and Recent Projects Section */}
        {recentProjects.length > 0 && (
          <div className={styles.recentSection}>
            <div className={styles.recentDivider} />
            <div className={styles.recentHeaderRow}>
              <span className={styles.recentHeader}>Recent Projects</span>
              <button 
                className={styles.quickAddBtn} 
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePage('projects?new=true');
                }}
                title="Quick Create Project"
              >
                <Plus size={12} />
              </button>
            </div>
            
            <div className={styles.recentList}>
              {recentProjects.map((proj) => (
                <button
                  key={proj.id}
                  className={styles.recentItem}
                  onClick={() => handleRecentClick(proj.id)}
                  title={proj.name}
                >
                  <div className={`${styles.recentDot} ${styles[proj.status.toLowerCase()]}`} />
                  <span className={styles.recentName}>{proj.name}</span>
                </button>
              ))}
              <button 
                className={styles.viewAllLink}
                onClick={() => setActivePage('projects')}
              >
                View all
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Storage Widget */}
      <div className={styles.storageWidget}>
        <div className={styles.storageLabels}>
          <span>Storage: 1.4 GB / 5.0 GB</span>
          <span>28%</span>
        </div>
        <div className={styles.storageBarBg}>
          <div className={styles.storageBarFill} style={{ width: '28%' }} />
        </div>
      </div>

      {/* User Session Info Footer */}
      <div className={styles.footerSection}>
        <div className={styles.userInfo}>
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"
            alt="User Avatar"
            className={styles.avatar}
          />
          <div className={styles.userDetails}>
            <p className={styles.userName}>Duy Nguyen</p>
            <p className={styles.userRole}>Sneaker Creator</p>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={onLogout}>
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};
