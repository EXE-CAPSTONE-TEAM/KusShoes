import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Package, CreditCard, FolderKanban,
  Flame, Download, Activity, ScrollText, LogOut, BarChart3, Sparkles, MessageSquare,
  PanelLeftClose, PanelLeftOpen, Sun, Moon,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { adminDashboard, adminSystem } from '../../../api/adminClient';
import styles from './AdminSidebar.module.css';

interface AdminSidebarProps {
  activePage: string;
  navigate: (page: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: 'live' | 'users' | 'bake' | 'exports' | 'health';
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activePage, navigate }) => {
  const { session, logout, isLoggingOut, isAdmin } = useAdminAuth();
  const { theme, toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kusshoes.adminSidebar.collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kusshoes.adminSidebar.collapsed', next ? '1' : '0');
      } catch {
        // ignore storage errors (private browsing, etc.)
      }
      return next;
    });
  };

  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalExports, setTotalExports] = useState<number | null>(null);
  const [bakeActive, setBakeActive] = useState<number | null>(null);
  const [bakeTotal, setBakeTotal] = useState<number | null>(null);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | null>(null);

  useEffect(() => {
    let active = true;
    adminDashboard.stats().then((s) => {
      if (!active) return;
      setTotalUsers(s.total_users);
      setTotalExports(s.total_exports);
    }).catch(() => {});
    adminSystem.health().then((h) => {
      if (!active) return;
      setHealthStatus(h.status);
      const statuses = h.bake_jobs_by_status;
      const total = Object.values(statuses).reduce((a, b) => a + b, 0);
      setBakeTotal(total);
      setBakeActive((statuses.queued ?? 0) + (statuses.processing ?? 0));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const navGroups: NavGroup[] = [
    {
      heading: 'Tổng quan • Core',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: 'live' },
        { id: 'analytics', label: 'Phân tích & Báo cáo', icon: BarChart3 },
      ],
    },
    {
      heading: 'Quản lý & Kinh doanh',
      items: [
        { id: 'users', label: 'Người dùng', icon: Users, badge: 'users' },
        { id: 'plans', label: 'Gói cước & Đăng ký', icon: Package },
        { id: 'billing', label: 'Thanh toán & Doanh thu', icon: CreditCard },
        { id: 'feedback', label: 'Phản hồi khách hàng', icon: MessageSquare },
      ],
    },
    {
      heading: '3D Pipeline & Tác vụ',
      items: [
        { id: 'projects', label: 'Dự án 3D', icon: FolderKanban },
        { id: 'bake-jobs', label: 'Tiến trình Bake', icon: Flame, badge: 'bake' },
        { id: 'exports', label: 'Xuất file (GLB/OBJ)', icon: Download, badge: 'exports' },
        { id: 'content', label: 'Nội dung & Studio', icon: Sparkles },
      ],
    },
    {
      heading: 'Hạ tầng & An ninh',
      items: [
        { id: 'system', label: 'Sức khỏe hệ thống', icon: Activity, badge: 'health' },
        ...(isAdmin ? [{ id: 'audit-logs', label: 'Nhật ký bảo mật', icon: ScrollText } as NavItem] : []),
      ],
    },
  ];

  const renderBadge = (badge: NavItem['badge']) => {
    if (badge === 'live') {
      return (
        <span className={styles.liveTag}>
          <span className={styles.liveDot} />
          Live
        </span>
      );
    }
    if (badge === 'users' && totalUsers !== null) {
      return <span className={styles.countBadge}>{totalUsers}</span>;
    }
    if (badge === 'exports' && totalExports !== null) {
      return <span className={styles.countBadge}>{totalExports} files</span>;
    }
    if (badge === 'bake' && bakeActive !== null && bakeActive > 0) {
      return <span className={styles.accentBadge}>{bakeActive} đang chạy</span>;
    }
    if (badge === 'health' && healthStatus) {
      return (
        <span className={healthStatus === 'ok' ? styles.healthBadgeOk : styles.healthBadgeWarn}>
          <span className={styles.healthDot} />
          {healthStatus === 'ok' ? 'Ổn định' : 'Degraded'}
        </span>
      );
    }
    return null;
  };

  const initials = (session?.email || '??').slice(0, 2).toUpperCase();
  const bakePct = bakeTotal ? Math.round(((bakeActive ?? 0) / bakeTotal) * 100) : 0;

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const active = activePage === item.id;
    const button = (
      <button
        className={`${styles.navItem} ${active ? styles.active : ''}`}
        onClick={() => navigate(item.id)}
      >
        <span className={styles.navItemLeft}>
          <Icon className={styles.navIcon} size={18} />
          {!collapsed && <span>{item.label}</span>}
        </span>
        {!collapsed && renderBadge(item.badge)}
        {active && <div className={styles.activeIndicator} />}
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

  return (
    <Tooltip.Provider delayDuration={300}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        <div className={styles.scrollArea}>
          <div className={styles.header}>
            {!collapsed && (
              <div className={styles.brandRow}>
                <img
                  src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
                  alt="KusShoes"
                  className={styles.brandLogoImage}
                />
                <span className={styles.brandTagline}>3D Sneaker Lab</span>
              </div>
            )}
          </div>

          <nav className={styles.navMenu}>
            {navGroups.map((group) => (
              <div key={group.heading} className={styles.navGroup}>
                {!collapsed && <p className={styles.groupHeading}>{group.heading}</p>}
                {group.items.map(renderNavButton)}
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.footerSection}>
          {!collapsed && bakeTotal !== null && bakeTotal > 0 && (
            <div className={styles.pipelineWidget}>
              <div className={styles.pipelineWidgetHeader}>
                <span className={styles.pipelineWidgetLabel}>
                  <Flame size={14} className={styles.pipelineWidgetIcon} />
                  Bake Pipeline
                </span>
                <span className={styles.pipelineWidgetPct}>{bakePct}%</span>
              </div>
              <div className={styles.pipelineBarTrack}>
                <div className={styles.pipelineBarFill} style={{ width: `${bakePct}%` }} />
              </div>
              <div className={styles.pipelineWidgetFooter}>
                <span>{bakeActive} đang xử lý</span>
                <span>{bakeTotal} tổng cộng</span>
              </div>
            </div>
          )}

          <div className={styles.profilePill}>
            <div className={styles.profileAvatar}>{initials}</div>
            {!collapsed && (
              <div className={styles.sessionInfo}>
                <span className={styles.sessionEmail}>{session?.email || 'Active admin session'}</span>
                <span className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : styles.roleStaff}`}>
                  {isAdmin ? 'Admin' : 'Staff'}
                </span>
              </div>
            )}
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className={styles.logoutBtn}
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
                  title={theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className={styles.tooltipContent} side="top" sideOffset={8}>
                  {theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}
                  <Tooltip.Arrow className={styles.tooltipArrow} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
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
        </div>
      </aside>
    </Tooltip.Provider>
  );
};
