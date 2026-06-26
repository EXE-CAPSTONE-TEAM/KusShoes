import React from 'react';
import { LayoutDashboard, FolderKanban, CreditCard, Settings, LogOut, Disc } from 'lucide-react';
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
  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
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
        <div className={styles.logoContainer}>
          <Disc className={styles.logoIcon} />
        </div>
        <div className={styles.logoText}>
          <span className={styles.brandTitle}>SNEAKER</span>
          <span className={styles.brandSubtitle}>FLOW PORTAL</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className={styles.navMenu}>
        <div className={styles.navGroup}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
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
            <span className={styles.recentHeader}>Recent Projects</span>
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
            </div>
          </div>
        )}
      </nav>

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
