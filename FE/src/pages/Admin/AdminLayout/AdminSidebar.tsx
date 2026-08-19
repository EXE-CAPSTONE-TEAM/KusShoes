import React from 'react';
import {
  LayoutDashboard, Users, Package, CreditCard, FolderKanban,
  Flame, Download, Activity, ScrollText, LogOut,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useTheme } from '../../../context/ThemeContext';
import styles from './AdminSidebar.module.css';

interface AdminSidebarProps {
  activePage: string;
  navigate: (page: string) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activePage, navigate }) => {
  const { session, logout, isLoggingOut, isAdmin } = useAdminAuth();
  const { theme } = useTheme();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'plans', label: 'Plans', icon: Package },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'bake-jobs', label: 'Bake Jobs', icon: Flame },
    { id: 'exports', label: 'Exports', icon: Download },
    { id: 'system', label: 'System Health', icon: Activity },
    ...(isAdmin ? [{ id: 'audit-logs', label: 'Audit Logs', icon: ScrollText }] : []),
  ];

  return (
    <Tooltip.Provider delayDuration={300}>
      <aside className={styles.sidebar}>
        <div className={styles.logoSection}>
          <img
            src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
            alt="KusShoes"
            className={styles.logoImage}
          />
          <span className={styles.adminTag}>Admin Panel</span>
        </div>

        <nav className={styles.navMenu}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                onClick={() => navigate(item.id)}
              >
                <Icon className={styles.navIcon} size={18} />
                <span>{item.label}</span>
                {active && <div className={styles.activeIndicator} />}
              </button>
            );
          })}
        </nav>

        <div className={styles.footerSection}>
          <div className={styles.sessionInfo}>
            <span className={styles.sessionEmail}>{session?.email || 'Active admin session'}</span>
            <span className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : styles.roleStaff}`}>
              {isAdmin ? 'Admin' : 'Staff'}
            </span>
          </div>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={styles.logoutBtn}
                onClick={() => { void logout(); }}
                disabled={isLoggingOut}
              >
                <LogOut size={16} />
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
