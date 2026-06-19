import { useTheme } from '../context/ThemeContext';

export default function ThemeToggleFab() {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle-fab"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Switch to ${nextLabel} mode`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
      <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}
