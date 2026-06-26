import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import styles from './Navbar.module.css';

interface NavbarProps {
  navigate: (path: string) => void;
  currentPage: 'landing' | 'pricing' | string;
}

export const Navbar: React.FC<NavbarProps> = ({ navigate, currentPage }) => {
  const { theme, toggleTheme } = useTheme();

  
  const handleScrollLink = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (currentPage !== 'landing') {
      e.preventDefault();
      // Navigate to home first
      navigate('/');
      // Wait a brief moment for the Landing view to mount, then scroll
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    }
    // If we are already on landing, standard href anchor #targetId will handle the scroll automatically.
  };

  return (
    <header className={`${styles.navbar} glass-panel`}>
      <div className={styles.navBrand} onClick={() => navigate('/')}>
        <div className={styles.logoIndicator} />
        <span className={styles.logoText}>SNEAKER FLOW</span>
      </div>
      <nav className={styles.navLinks}>
        <a href="#products" onClick={(e) => handleScrollLink(e, 'products')}>Products</a>
        <a href="#workflow" onClick={(e) => handleScrollLink(e, 'workflow')}>Workflow</a>
        <a href="#features" onClick={(e) => handleScrollLink(e, 'features')}>Features</a>
        <a 
          href="/pricing" 
          onClick={(e) => { 
            e.preventDefault(); 
            navigate('/pricing'); 
          }}
          className={currentPage === 'pricing' ? styles.activeLink : ''}
        >
          Pricing
        </a>
        <a href="#resources" onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}>Resources</a>
      </nav>
      <div className={styles.navActions}>
        <button 
          className={styles.themeToggleBtn} 
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme mode"
        >
          {theme === 'dark' ? <Sun className={styles.themeIcon} size={18} /> : <Moon className={styles.themeIcon} size={18} />}
        </button>
        <button className={styles.loginLink} onClick={() => navigate('/login')}>
          Sign In
        </button>
        <button className="btn-neon-orange" onClick={() => navigate('/login')}>
          Register
        </button>
      </div>
    </header>
  );
};
