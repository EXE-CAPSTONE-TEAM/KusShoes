import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Archive,
  Trash2,
  CreditCard,
  Settings,
  LogOut,
  Plus,
  ChevronsUpDown,
  User,
  Shield,
  Eye,
  ChevronDown,
  Palette,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Progress from '@radix-ui/react-progress';
import * as Separator from '@radix-ui/react-separator';
import * as Avatar from '@radix-ui/react-avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useTheme } from '../../context/ThemeContext';
import type { PortalProject } from '../../api/client';
import type { SettingTab } from '../../pages/Settings/settingsNavigation';
import styles from './Sidebar.module.css';

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  onLogout: () => void;
  projects: PortalProject[];
  activeSettingTab: SettingTab;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  setActivePage,
  onLogout,
  projects,
  activeSettingTab,
}) => {
  const { theme } = useTheme();
  const isSettingsActive = activePage.split('?')[0] === 'settings';
  const [settingsExpanded, setSettingsExpanded] = React.useState(isSettingsActive);
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('kusshoes.sidebar.collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kusshoes.sidebar.collapsed', next ? '1' : '0');
      } catch {
        // ignore storage errors (private browsing, etc.)
      }
      return next;
    });
  };
  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'archives', label: 'Archives', icon: Archive },
    { id: 'trash', label: 'Trash', icon: Trash2 },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ];
  const settingItems: Array<{ id: SettingTab; label: string; icon: typeof User }> = [
    { id: 'profile', label: 'Profile Details', icon: User },
    { id: 'security', label: 'Security & Auth', icon: Shield },
    { id: 'privacy', label: 'Model Privacy', icon: Eye },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  React.useEffect(() => {
    setSettingsExpanded(isSettingsActive);
  }, [isSettingsActive]);

  // Storage usage isn't exposed by the backend yet; this mirrors the placeholder that was
  // already hardcoded in the widget below (1.4 GB of 5.0 GB).
  const storagePercent = 28;

  // Get top 3 projects by the server's updated timestamp.
  const recentProjects = React.useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);
  }, [projects]);

  const handleRecentClick = (id: string) => {
    setActivePage(`/project-details?id=${id}`);
  };

  const handleSettingsToggle = () => {
    if (!isSettingsActive) {
      setSettingsExpanded(true);
      setActivePage(`settings?tab=${activeSettingTab}`);
      return;
    }

    setSettingsExpanded((expanded) => !expanded);
  };

  const renderNavItem = (item: { id: string; label: string; icon: typeof LayoutDashboard }) => {
    const Icon = item.icon;
    const isActive = activePage.split('?')[0] === item.id;
    const button = (
      <button
        className={`${styles.navItem} ${isActive ? styles.active : ''}`}
        onClick={() => setActivePage(item.id)}
      >
        <Icon className={styles.navIcon} />
        {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
      </button>
    );
    if (!collapsed) {
      return <React.Fragment key={item.id}>{button}</React.Fragment>;
    }
    return (
      <Tooltip.Root key={item.id}>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={styles.tooltipContent} side="right" sideOffset={8}>
            {item.label}
            <Tooltip.Arrow className={styles.tooltipArrow} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  };

  const settingsButton = (
    <button
      type="button"
      className={`${styles.navItem} ${isSettingsActive ? styles.active : ''}`}
      onClick={handleSettingsToggle}
      aria-expanded={settingsExpanded}
      aria-controls="settings-submenu"
    >
      <Settings className={styles.navIcon} />
      {!collapsed && (
        <>
          <span className={styles.navLabel}>Settings</span>
          <ChevronDown
            className={`${styles.navChevron} ${settingsExpanded ? styles.expanded : ''}`}
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        {/* Brand Header */}
        {!collapsed && (
          <div className={styles.logoSection}>
            <img
              src={
                theme === 'dark'
                  ? '/KusShoes_Logo_Dark_Mode_cropped.png'
                  : '/KusShoes_Logo_cropped.png'
              }
              alt="KusShoes"
              className={styles.logoImage}
              onClick={() => setActivePage('dashboard')}
            />
          </div>
        )}

        <button
          type="button"
          className={styles.collapseToggle}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        {/* Navigation Links */}
        <ScrollArea.Root className={styles.navScrollArea} type="hover" scrollHideDelay={500}>
          <ScrollArea.Viewport className={styles.navScrollViewport}>
            <nav className={styles.navMenu}>
              <div className={styles.navGroup}>
                {menuItems.map(renderNavItem)}

                <div className={styles.settingsNavGroup}>
                  {collapsed ? (
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>{settingsButton}</Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className={styles.tooltipContent}
                          side="right"
                          sideOffset={8}
                        >
                          Settings
                          <Tooltip.Arrow className={styles.tooltipArrow} />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  ) : (
                    settingsButton
                  )}

                  {!collapsed && settingsExpanded && (
                    <div id="settings-submenu" className={styles.settingsSubmenu}>
                      {settingItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = isSettingsActive && activeSettingTab === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`${styles.settingsSubItem} ${isActive ? styles.activeSubItem : ''}`}
                            onClick={() => setActivePage(`settings?tab=${item.id}`)}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <Icon className={styles.settingsSubIcon} aria-hidden="true" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Separator and Recent Projects Section */}
              {!collapsed && recentProjects.length > 0 && (
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
                        <Tooltip.Content
                          className={styles.tooltipContent}
                          side="right"
                          sideOffset={8}
                        >
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
                        <img src={proj.imageUrl} alt="" className={styles.recentThumb} />
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
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className={styles.navScrollbar} orientation="vertical">
            <ScrollArea.Thumb className={styles.navScrollThumb} />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        {/* Storage Widget */}
        {!collapsed && (
          <div className={styles.storageWidget}>
            <div className={styles.storageLabels}>
              <span>1.4 GB of 5 GB</span>
              <span>28%</span>
            </div>
            <Progress.Root className={styles.storageBarBg} value={storagePercent}>
              <Progress.Indicator
                className={`${styles.storageBarFill} ${
                  storagePercent > 95
                    ? styles.storageCritical
                    : storagePercent > 80
                      ? styles.storageWarning
                      : ''
                }`}
                style={{ transform: `translateX(-${100 - storagePercent}%)` }}
              />
            </Progress.Root>
          </div>
        )}

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
                {!collapsed && (
                  <div className={styles.userDetails}>
                    <p className={styles.userName}>Duy Nguyen</p>
                    <p className={styles.userRole}>Sneaker Creator</p>
                  </div>
                )}
                {!collapsed && <ChevronsUpDown size={14} className={styles.userChevron} />}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={styles.dropdownContent}
                side="top"
                align="start"
                sideOffset={8}
              >
                <DropdownMenu.Item
                  className={styles.dropdownItem}
                  onSelect={() => setActivePage('settings?tab=profile')}
                >
                  <User size={14} /> Profile
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.dropdownItem}
                  onSelect={() => setActivePage(`settings?tab=${activeSettingTab}`)}
                >
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

          {!collapsed && (
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
          )}
        </div>
      </aside>
    </Tooltip.Provider>
  );
};
