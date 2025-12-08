/**
 * URL Input Component - Tailwind CSS Version
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface UrlInputProps {
  onParse: (url: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function UrlInput({ onParse, disabled, loading }: UrlInputProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onParse(url.trim());
    }
  };

  const isValidUrl = (input: string) => {
    return (
      input.includes('youtube.com') || input.includes('youtu.be') || input.includes('bilibili.com')
    );
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴 YouTube / Bilibili 视频链接..."
          disabled={disabled}
          className="flex-1 px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg text-white text-base
                        placeholder:text-white/40 transition-all
                        focus:outline-none focus:border-violet-500/50 focus:ring-3 focus:ring-violet-500/15
                        disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !isValidUrl(url)}
          className="px-6 py-3.5 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-lg text-white font-medium
                        transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/40
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              解析中
            </span>
          ) : (
            '解析'
          )}
        </button>
      </div>
    </form>
  );
}
