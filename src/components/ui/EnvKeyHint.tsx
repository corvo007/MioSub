import React from 'react';
import { CheckCircle } from 'lucide-react';

interface EnvKeyHintProps {
  envKey: string;
  userKey: string;
}

/**
 * Displays status hint for environment variable configured API keys
 */
export const EnvKeyHint: React.FC<EnvKeyHintProps> = ({ envKey, userKey }) => {
  if (!envKey) return null;

  if (!userKey) {
    return (
      <p className="text-xs text-emerald-400 mt-1 flex items-center">
        <CheckCircle className="w-3 h-3 mr-1" /> 正在使用环境变量配置的密钥
      </p>
    );
  }

  return <p className="text-xs text-amber-400 mt-1">已覆盖环境变量中的默认密钥</p>;
};
