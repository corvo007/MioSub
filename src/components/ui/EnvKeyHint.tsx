import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';

interface EnvKeyHintProps {
  envKey: string;
  userKey: string;
}

/**
 * Displays status hint for environment variable configured API keys
 */
export const EnvKeyHint: React.FC<EnvKeyHintProps> = ({ envKey, userKey }) => {
  const { t } = useTranslation('ui');

  if (!envKey) return null;

  if (!userKey) {
    return (
      <p className="text-xs text-emerald-400 mt-1 flex items-center">
        <CheckCircle className="w-3 h-3 mr-1" /> {t('envKeyHint.usingEnvKey')}
      </p>
    );
  }

  return <p className="text-xs text-amber-400 mt-1">{t('envKeyHint.overriddenEnvKey')}</p>;
};
