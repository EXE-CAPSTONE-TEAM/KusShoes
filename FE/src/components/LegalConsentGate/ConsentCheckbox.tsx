import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

interface ConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/** "I'm 18+ and agree to the Terms & Privacy Policy", with both documents opening in a new tab. */
export const ConsentCheckbox: React.FC<ConsentCheckboxProps> = ({ checked, onChange, className }) => {
  const { t } = useTranslation('auth');
  return (
    <label className={className}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: 'var(--accent, #ff5a36)', marginTop: 3 }}
      />
      <span>
        <Trans
          t={t}
          i18nKey="login.agreeTermsCheckbox"
          components={{
            terms: <a href="/terms" target="_blank" rel="noopener noreferrer" />,
            privacy: <a href="/privacy" target="_blank" rel="noopener noreferrer" />,
          }}
        />
      </span>
    </label>
  );
};
