import React, { useSyncExternalStore } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Archive,
  Trash2,
  Download,
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
  Menu,
  X,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import * as Avatar from '@radix-ui/react-avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { formatBytes } from '../../utils/format';
import { api, type PortalProject, type UserProfile } from '../../api/client';
import type { SettingTab } from '../../pages/Settings/settingsNavigation';
import styles from './Sidebar.module.css';

// Below this width the sidebar becomes an off-canvas drawer opened from a top bar
const DRAWER_QUERY = '(max-width: 1023px)';

const subscribeDrawerQuery = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(DRAWER_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

const useIsDrawer = () =>
  useSyncExternalStore(
    subscribeDrawerQuery,
    () => typeof window.matchMedia === 'function' && window.matchMedia(DRAWER_QUERY).matches,
    () => false
  );

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  onLogout: () => void;
  projects: PortalProject[];
  activeSettingTab: SettingTab;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  setActivePage: navigatePage,
  onLogout,
  projects,
  activeSettingTab,
}) => {
  const { t } = useTranslation('portal');
  const { theme } = useTheme();
  const isSettingsActive = activePage.split('?')[0] === 'settings';
  const [settingsExpanded, setSettingsExpanded] = React.useState(isSettingsActive);
  const isDrawer = useIsDrawer();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const setActivePage = (page: string) => {
    setDrawerOpen(false);
    navigatePage(page);
  };
  const [collapsedPref, setCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('kusshoes.sidebar.collapsed') === '1';
    } catch {
      return false;
    }
  });
  // The icon-only rail is a desktop affordance; the drawer always shows full labels
  const collapsed = collapsedPref && !isDrawer;
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
    { id: 'dashboard', label: t('sidebar.overview'), icon: LayoutDashboard },
    { id: 'projects', label: t('sidebar.projects'), icon: FolderKanban },
    { id: 'archives', label: t('sidebar.archives'), icon: Archive },
    { id: 'trash', label: t('sidebar.trash'), icon: Trash2 },
    { id: 'exports', label: t('sidebar.exports'), icon: Download },
    { id: 'billing', label: t('sidebar.billing'), icon: CreditCard },
    { id: 'feedback', label: t('sidebar.feedback'), icon: MessageSquare },
  ];
  const settingItems: Array<{ id: SettingTab; label: string; icon: typeof User }> = [
    { id: 'profile', label: t('sidebar.settingsProfile'), icon: User },
    { id: 'security', label: t('sidebar.settingsSecurity'), icon: Shield },
    { id: 'privacy', label: t('sidebar.settingsPrivacy'), icon: Eye },
    { id: 'appearance', label: t('sidebar.settingsAppearance'), icon: Palette },
  ];

  React.useEffect(() => {
    setSettingsExpanded(isSettingsActive);
  }, [isSettingsActive]);

  // Drawer: Escape closes it, and focus moves in on open / back to the menu button on close
  React.useEffect(() => {
    if (!isDrawer) setDrawerOpen(false);
  }, [isDrawer]);
  React.useEffect(() => {
    if (!drawerOpen) return;
    const menuBtn = menuBtnRef.current;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      menuBtn?.focus();
    };
  }, [drawerOpen]);

  const [storageUsed, setStorageUsed] = React.useState<number | null>(null);

  // Signed-in user for the footer card — fetched here (rather than lifted to App) because
  // the Sidebar is the only consumer; mirrors the same api.profile() call Settings.tsx makes.
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    api
      .profile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        // Non-critical chrome element: fall back to initials/blank rather than surface a toast.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    api
      .usage()
      .then((usage) => {
        if (!cancelled) setStorageUsed(usage.storage_used_bytes);
      })
      .catch(() => {
        // Non-critical chrome element: the widget keeps showing "—".
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const displayName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const avatarSrc = profile ? api.avatarUrl(profile.avatar_path) : undefined;

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
    const isActive =
      activePage.split('?')[0] === item.id ||
      (item.id === 'billing' && (activePage === 'billing-checkout' || activePage === 'billing-bill'));
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
          <span className={styles.navLabel}>{t('sidebar.settings')}</span>
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
      {/* Phone / tablet: top bar with the menu button (hidden on desktop by CSS) */}
      <header className={styles.mobileBar}>
        <button
          ref={menuBtnRef}
          type="button"
          className={styles.menuBtn}
          onClick={() => setDrawerOpen(true)}
          aria-label={t('sidebar.openMenu')}
          aria-expanded={drawerOpen}
          aria-controls="portal-sidebar"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <img
          src={
            theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.webp' : '/KusShoes_Logo_cropped.webp'
          }
          alt="KusShoes"
          className={styles.mobileLogo}
          onClick={() => setActivePage('dashboard')}
        />
      </header>
      {drawerOpen && (
        <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="portal-sidebar"
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${drawerOpen ? styles.drawerOpen : ''}`}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className={styles.drawerClose}
          onClick={() => setDrawerOpen(false)}
          aria-label={t('sidebar.closeMenu')}
        >
          <X size={20} aria-hidden="true" />
        </button>

        {/* Brand Header */}
        {!collapsed && (
          <div className={styles.logoSection}>
            <img
              src={
                theme === 'dark'
                  ? '/KusShoes_Logo_Dark_Mode_cropped.webp'
                  : '/KusShoes_Logo_cropped.webp'
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
          aria-label={collapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')}
          title={collapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')}
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
                          {t('sidebar.settings')}
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
                    <span className={styles.recentHeader}>{t('sidebar.recentProjects')}</span>
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
                          {t('sidebar.quickCreate')}
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
                      {t('sidebar.viewAll')}
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

        {/* Storage Widget: bytes held for this account. No plan has a storage limit, so no bar. */}
        {!collapsed && (
          <div className={styles.storageWidget}>
            <div className={styles.storageLabels}>
              <span>{t('sidebar.storage')}</span>
              <span>{storageUsed === null ? '—' : t('sidebar.storageUsed', { size: formatBytes(storageUsed) })}</span>
            </div>
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
                    src={avatarSrc}
                    alt={displayName || t('sidebar.userAvatar')}
                  />
                  <Avatar.Fallback className={styles.avatarFallback} delayMs={300}>
                    {initials}
                  </Avatar.Fallback>
                </Avatar.Root>
                {!collapsed && (
                  <div className={styles.userDetails}>
                    <p className={styles.userName} title={displayName}>{displayName}</p>
                    <p className={styles.userRole} title={profile?.email}>{profile?.email}</p>
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
                  <User size={14} /> {t('sidebar.profile')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.dropdownItem}
                  onSelect={() => setActivePage(`settings?tab=${activeSettingTab}`)}
                >
                  <Settings size={14} /> {t('sidebar.settings')}
                </DropdownMenu.Item>
                <DropdownMenu.Separator className={styles.dropdownSeparator} />
                <DropdownMenu.Item
                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                  onSelect={onLogout}
                >
                  <LogOut size={14} /> {t('sidebar.logout')}
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
                  {t('sidebar.logout')}
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
