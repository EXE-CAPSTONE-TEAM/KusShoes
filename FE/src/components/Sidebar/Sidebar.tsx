import React from 'react';
import { LayoutDashboard, FolderKanban, Archive, CreditCard, Settings, LogOut, Plus, ChevronsUpDown, User } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Progress from '@radix-ui/react-progress';
import * as Separator from '@radix-ui/react-separator';
import * as Avatar from '@radix-ui/react-avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme } from '../../context/ThemeContext';
import type { PortalProject } from '../../api/client';
import styles from './Sidebar.module.css';

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  onLogout: () => void;
  projects: PortalProject[];
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

  // Get top 3 projects by the server's updated timestamp.
  const recentProjects = React.useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);
  }, [projects]);

  const handleRecentClick = (id: string) => {
    setActivePage(`/project-details?id=${id}`);
  };

  return (
    <Tooltip.Provider delayDuration={300}>
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
            <Separator.Root className={styles.recentDivider} decorative />
            <div className={styles.recentHeaderRow}>
              <span className={styles.recentHeader}>Recent Projects</span>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className={styles.quickAddBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePage('projects?new=true');
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className={styles.tooltipContent} side="right" sideOffset={8}>
                    Quick Create Project
                    <Tooltip.Arrow className={styles.tooltipArrow} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
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
        <Progress.Root className={styles.storageBarBg} value={28}>
          <Progress.Indicator
            className={styles.storageBarFill}
            style={{ transform: `translateX(-${100 - 28}%)` }}
          />
        </Progress.Root>
      </div>

      {/* User Session Info Footer */}
      <div className={styles.footerSection}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className={styles.userInfo}>
              <Avatar.Root className={styles.avatarRoot}>
                <Avatar.Image
                  className={styles.avatar}
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"
                  alt="Duy Nguyen"
                />
                <Avatar.Fallback className={styles.avatarFallback} delayMs={300}>
                  DN
                </Avatar.Fallback>
              </Avatar.Root>
              <div className={styles.userDetails}>
                <p className={styles.userName}>Duy Nguyen</p>
                <p className={styles.userRole}>Sneaker Creator</p>
              </div>
              <ChevronsUpDown size={14} className={styles.userChevron} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.dropdownContent} side="top" align="start" sideOffset={8}>
              <DropdownMenu.Item className={styles.dropdownItem} onSelect={() => setActivePage('settings')}>
                <User size={14} /> Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item className={styles.dropdownItem} onSelect={() => setActivePage('settings')}>
                <Settings size={14} /> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className={styles.dropdownSeparator} />
              <DropdownMenu.Item
                className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                onSelect={onLogout}
              >
                <LogOut size={14} /> Log out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button className={styles.logoutBtn} onClick={onLogout}>
              <LogOut size={18} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className={styles.tooltipContent} side="top" sideOffset={8}>
              Log out
              <Tooltip.Arrow className={styles.tooltipArrow} />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </aside>
    </Tooltip.Provider>
  );
};
