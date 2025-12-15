import React from 'react';
import { Settings, X, CheckCircle, Languages, Type, Clock, Book, Bug } from 'lucide-react';
import { AppSettings } from '@/types/settings';
import { CustomSelect } from '@/components/settings/CustomSelect';
import { LocalWhisperSettings } from '@/components/settings/LocalWhisperSettings';
import { Toggle } from '@/components/ui/Toggle';
import { SettingRow } from '@/components/ui/SettingRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { OptionButton } from '@/components/ui/OptionButton';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  envGeminiKey: string;
  envOpenaiKey: string;
  onOpenGlossaryManager: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  updateSetting,
  activeTab,
  setActiveTab,
  envGeminiKey,
  envOpenaiKey,
  onOpenGlossaryManager,
}) => {
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative overflow-hidden">
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-indigo-400" /> 设置
          </h2>

          <div className="flex space-x-1 border-b border-slate-700 mb-6 overflow-x-auto">
            {[
              'general',
              'services',
              'performance',
              'glossary',
              ...(window.electronAPI?.isDebug ? ['debug'] : []),
            ].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab ? 'bg-slate-800 text-indigo-400 border-t border-x border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                {tab === 'general' && '常规'}
                {tab === 'services' && '服务'}
                {tab === 'performance' && '性能'}
                {tab === 'glossary' && '术语表'}
                {tab === 'debug' && '调试'}
              </button>
            ))}
          </div>

          <div className="space-y-6 min-h-[400px]">
            {activeTab === 'general' && (
              <div className="space-y-6 animate-fade-in">
                {/* Output Settings */}
                <div className="space-y-3">
                  <SectionHeader>输出设置</SectionHeader>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      导出模式
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <OptionButton
                        selected={settings.outputMode === 'bilingual'}
                        onClick={() => updateSetting('outputMode', 'bilingual')}
                        size="md"
                      >
                        <Languages className="w-4 h-4" />
                        <span>双语字幕</span>
                      </OptionButton>
                      <OptionButton
                        selected={settings.outputMode === 'target_only'}
                        onClick={() => updateSetting('outputMode', 'target_only')}
                        size="md"
                      >
                        <Type className="w-4 h-4" />
                        <span>仅译文</span>
                      </OptionButton>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      双语模式会在字幕中同时显示原文和译文。
                    </p>
                  </div>

                  {/* Speaker Diarization Settings */}
                  <div className="space-y-4 mt-4 pt-4 border-t border-slate-700/50">
                    <SettingRow
                      label="启用说话人区分"
                      description="识别音频或视频中的不同说话人，并打上标签"
                    >
                      <Toggle
                        checked={settings.enableDiarization || false}
                        onChange={(v) => updateSetting('enableDiarization', v)}
                      />
                    </SettingRow>

                    {settings.enableDiarization && (
                      <SettingRow
                        label="启用说话人预分析 (实验性)"
                        description="在生成字幕前预先分析音频以识别说话人数量和声音特征，可提高区分准确度，但会增加耗时"
                        indented
                      >
                        <Toggle
                          checked={settings.enableSpeakerPreAnalysis || false}
                          onChange={(v) => updateSetting('enableSpeakerPreAnalysis', v)}
                        />
                      </SettingRow>
                    )}

                    {settings.enableDiarization && (
                      <div className="space-y-3 animate-fade-in">
                        <SettingRow
                          label="导出时包含说话人名称"
                          description="在字幕文件中显示说话人（如：羊宫妃那：对话内容）"
                          indented
                        >
                          <Toggle
                            checked={settings.includeSpeakerInExport || false}
                            onChange={(v) => updateSetting('includeSpeakerInExport', v)}
                          />
                        </SettingRow>
                        <SettingRow
                          label="使用说话人颜色 (ASS)"
                          description="为不同说话人分配不同颜色（仅 ASS 格式有效）"
                          indented
                        >
                          <Toggle
                            checked={settings.useSpeakerColors || false}
                            onChange={(v) => updateSetting('useSpeakerColors', v)}
                          />
                        </SettingRow>
                        <SettingRow
                          label="角色风格化翻译"
                          description="根据说话人特征调整翻译语气（正式/口语）"
                          indented
                        >
                          <Toggle
                            checked={settings.useSpeakerStyledTranslation || false}
                            onChange={(v) => updateSetting('useSpeakerStyledTranslation', v)}
                          />
                        </SettingRow>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'services' && (
              <div className="space-y-6 animate-fade-in">
                {/* API Settings */}
                <div className="space-y-3">
                  <SectionHeader>翻译和润色服务</SectionHeader>
                  <div className="space-y-4">
                    {/* Gemini */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Gemini API 密钥
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          value={settings.geminiKey}
                          onChange={(e) => updateSetting('geminiKey', e.target.value.trim())}
                          placeholder="请输入 Gemini API 密钥"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        翻译使用 <strong>Gemini 2.5 Flash</strong>，术语提取和润色使用{' '}
                        <strong>Gemini 3 Pro</strong>。
                      </p>
                      {envGeminiKey && !settings.geminiKey && (
                        <p className="text-xs text-emerald-400 mt-1 flex items-center">
                          <CheckCircle className="w-3 h-3 mr-1" /> 正在使用环境变量配置的密钥
                        </p>
                      )}
                      {envGeminiKey && settings.geminiKey && (
                        <p className="text-xs text-amber-400 mt-1">已覆盖环境变量中的默认密钥</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Gemini 端点 (可选)
                      </label>
                      <div className="relative flex gap-2">
                        <input
                          type="text"
                          value={settings.geminiEndpoint || ''}
                          onChange={(e) => updateSetting('geminiEndpoint', e.target.value.trim())}
                          placeholder="https://generativelanguage.googleapis.com"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                        />
                        <button
                          onClick={() => updateSetting('geminiEndpoint', undefined)}
                          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors whitespace-nowrap"
                          title="恢复默认"
                        >
                          重置
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        自定义 API 端点，支持使用代理或第三方网关。
                      </p>
                    </div>
                  </div>
                </div>

                {/* Transcription Provider Settings */}
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <SectionHeader>语音识别</SectionHeader>

                  {isElectron ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <OptionButton
                          selected={!settings.useLocalWhisper}
                          onClick={() => updateSetting('useLocalWhisper', false)}
                          size="md"
                        >
                          <span>OpenAI API</span>
                        </OptionButton>
                        <OptionButton
                          selected={settings.useLocalWhisper || false}
                          onClick={() => updateSetting('useLocalWhisper', true)}
                          size="md"
                        >
                          <span>本地 Whisper</span>
                        </OptionButton>
                      </div>

                      {settings.useLocalWhisper ? (
                        <LocalWhisperSettings
                          useLocalWhisper={true}
                          whisperModelPath={settings.whisperModelPath}
                          onToggle={(enabled) => {
                            updateSetting('useLocalWhisper', enabled);
                          }}
                          onModelPathChange={(path) => {
                            updateSetting('whisperModelPath', path);
                          }}
                        />
                      ) : (
                        <div className="space-y-4 animate-fade-in">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                              OpenAI API 密钥
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={settings.openaiKey}
                                onChange={(e) => updateSetting('openaiKey', e.target.value.trim())}
                                placeholder="输入 OpenAI API 密钥"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                              />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              使用 OpenAI 的 <strong>Whisper</strong> 模型进行高精度语音转文字。
                            </p>
                            {envOpenaiKey && !settings.openaiKey && (
                              <p className="text-xs text-emerald-400 mt-1 flex items-center">
                                <CheckCircle className="w-3 h-3 mr-1" /> 正在使用环境变量配置的密钥
                              </p>
                            )}
                            {envOpenaiKey && settings.openaiKey && (
                              <p className="text-xs text-amber-400 mt-1">
                                已覆盖环境变量中的默认密钥
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                              OpenAI 端点 (可选)
                            </label>
                            <div className="relative flex gap-2">
                              <input
                                type="text"
                                value={settings.openaiEndpoint || ''}
                                onChange={(e) =>
                                  updateSetting('openaiEndpoint', e.target.value.trim())
                                }
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                              />
                              <button
                                onClick={() => updateSetting('openaiEndpoint', undefined)}
                                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors whitespace-nowrap"
                                title="恢复默认"
                              >
                                重置
                              </button>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              自定义 API 端点，支持使用本地模型、代理或第三方网关。
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                          OpenAI API 密钥
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            value={settings.openaiKey}
                            onChange={(e) => updateSetting('openaiKey', e.target.value.trim())}
                            placeholder="输入 OpenAI API 密钥"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          使用 OpenAI 的 <strong>Whisper</strong> 模型进行高精度语音转文字。
                        </p>
                        {envOpenaiKey && !settings.openaiKey && (
                          <p className="text-xs text-emerald-400 mt-1 flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1" /> 正在使用环境变量配置的密钥
                          </p>
                        )}
                        {envOpenaiKey && settings.openaiKey && (
                          <p className="text-xs text-amber-400 mt-1">已覆盖环境变量中的默认密钥</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                          OpenAI 端点 (可选)
                        </label>
                        <div className="relative flex gap-2">
                          <input
                            type="text"
                            value={settings.openaiEndpoint || ''}
                            onChange={(e) => updateSetting('openaiEndpoint', e.target.value.trim())}
                            placeholder="https://api.openai.com/v1"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                          />
                          <button
                            onClick={() => updateSetting('openaiEndpoint', undefined)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors whitespace-nowrap"
                            title="恢复默认"
                          >
                            重置
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          自定义 API 端点，支持使用本地模型、代理或第三方网关。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-3 animate-fade-in">
                {/* Local Whisper Performance Settings */}
                {settings.useLocalWhisper && (
                  <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-semibold text-indigo-300 mb-3 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 mr-2"></span>
                      本地 Whisper 设置
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                          CPU 线程数
                        </label>
                        <input
                          type="text"
                          value={settings.whisperThreads || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '')
                              updateSetting('whisperThreads', undefined); // Set to undefined to trigger defaults
                            else if (/^\d+$/.test(val)) {
                              const num = parseInt(val);
                              if (num > 16) updateSetting('whisperThreads', 16);
                              else updateSetting('whisperThreads', num);
                            }
                          }}
                          onBlur={() => {
                            // Ensure min value on blur if user leaves it empty or invalid
                            if (!settings.whisperThreads || settings.whisperThreads < 1) {
                              updateSetting('whisperThreads', 4);
                            }
                          }}
                          placeholder="4"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          每个转录任务使用的 CPU 线程数，范围 1-16
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                          最大并发数
                        </label>
                        <input
                          type="text"
                          value={settings.whisperConcurrency || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') updateSetting('whisperConcurrency', undefined);
                            else if (/^\d+$/.test(val)) {
                              const num = parseInt(val);
                              if (num > 4) updateSetting('whisperConcurrency', 4);
                              else updateSetting('whisperConcurrency', num);
                            }
                          }}
                          onBlur={() => {
                            if (!settings.whisperConcurrency || settings.whisperConcurrency < 1) {
                              updateSetting('whisperConcurrency', 1);
                            }
                          }}
                          placeholder="1"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          同时处理的转录任务数，范围 1-4
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      润色翻译批次大小
                    </label>
                    <input
                      type="text"
                      value={settings.proofreadBatchSize === 0 ? '' : settings.proofreadBatchSize}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') updateSetting('proofreadBatchSize', 0);
                        else if (/^\d+$/.test(val))
                          updateSetting('proofreadBatchSize', parseInt(val));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      每次润色翻译的字幕条数。数值越大上下文越完整、质量越高，但会消耗更多 Token。
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      翻译批次大小
                    </label>
                    <input
                      type="text"
                      value={
                        settings.translationBatchSize === 0 ? '' : settings.translationBatchSize
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') updateSetting('translationBatchSize', 0);
                        else if (/^\d+$/.test(val))
                          updateSetting('translationBatchSize', parseInt(val));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      每次翻译的字幕条数。数值越大上下文越完整、质量越高，但会消耗更多 Token。
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      分块时长 (秒)
                    </label>
                    <input
                      type="text"
                      value={settings.chunkDuration === 0 ? '' : settings.chunkDuration}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') updateSetting('chunkDuration', 0);
                        else if (/^\d+$/.test(val)) updateSetting('chunkDuration', parseInt(val));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      音频分段的目标长度（秒），影响转录的并行处理效率。
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      并发数 (Flash)
                    </label>
                    <input
                      type="text"
                      value={settings.concurrencyFlash === 0 ? '' : settings.concurrencyFlash}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') updateSetting('concurrencyFlash', 0);
                        else if (/^\d+$/.test(val))
                          updateSetting('concurrencyFlash', parseInt(val));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      应用于 <strong>Gemini 2.5 Flash</strong> 翻译、优化和{' '}
                      <strong>Whisper API</strong> 转录。请根据账户限额调整。
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      并发数 (Pro)
                    </label>
                    <input
                      type="text"
                      value={settings.concurrencyPro === 0 ? '' : settings.concurrencyPro}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') updateSetting('concurrencyPro', 0);
                        else if (/^\d+$/.test(val)) updateSetting('concurrencyPro', parseInt(val));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      应用于 <strong>Gemini 3 Pro</strong> 术语提取和润色翻译。请根据账户限额调整。
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      请求超时 (秒)
                    </label>
                    <input
                      type="text"
                      value={settings.requestTimeout === 0 ? '' : settings.requestTimeout || 600}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') updateSetting('requestTimeout', 0);
                        else if (/^\d+$/.test(val)) updateSetting('requestTimeout', parseInt(val));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      单个 API 请求的最长等待时间。网络较慢或处理大批量时可适当增加。
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <SettingRow
                    label="智能分段"
                    description="使用 AI 语音检测在自然停顿处切分音频，提升转录准确度（推荐）"
                  >
                    <Toggle
                      checked={settings.useSmartSplit !== false}
                      onChange={(v) => updateSetting('useSmartSplit', v)}
                    />
                  </SettingRow>
                </div>
              </div>
            )}

            {activeTab === 'glossary' && (
              <div className="space-y-3 animate-fade-in">
                <SettingRow
                  label="启用自动术语表"
                  description="自动识别并提取专业术语，提升翻译准确性和一致性"
                >
                  <Toggle
                    checked={settings.enableAutoGlossary !== false}
                    onChange={(v) => updateSetting('enableAutoGlossary', v)}
                  />
                </SettingRow>

                {settings.enableAutoGlossary !== false && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        术语提取音频长度
                      </label>
                      <CustomSelect
                        value={
                          settings.glossarySampleMinutes === 'all'
                            ? 'all'
                            : settings.glossarySampleMinutes.toString()
                        }
                        onChange={(val) => {
                          if (val === 'all') updateSetting('glossarySampleMinutes', 'all');
                          else updateSetting('glossarySampleMinutes', parseInt(val));
                        }}
                        options={[
                          { value: '5', label: '前 5 分钟' },
                          { value: '15', label: '前 15 分钟' },
                          { value: '30', label: '前 30 分钟' },
                          { value: 'all', label: '完整音频 (较慢)' },
                        ]}
                        icon={<Clock className="w-4 h-4" />}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        使用音频的前 N
                        分钟提取术语。选择“完整音频”可获得更全面的术语，但处理时间更长。
                      </p>
                    </div>

                    <SettingRow
                      label="自动确认术语表"
                      description="提取术语后直接应用，无需人工确认"
                    >
                      <Toggle
                        checked={settings.glossaryAutoConfirm || false}
                        onChange={(v) => updateSetting('glossaryAutoConfirm', v)}
                      />
                    </SettingRow>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGlossaryManager();
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center justify-center text-sm font-medium"
                  >
                    <Book className="w-4 h-4 mr-2" /> 管理术语表
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'debug' && (
              <div className="space-y-3 animate-fade-in">
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-2 flex items-center">
                    <Bug className="w-4 h-4 mr-2" /> 调试模式
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    启用 Mock 模式可以跳过实际 API 请求，直接返回模拟数据。用于测试流程或节省 API
                    额度。
                  </p>

                  <div className="space-y-4">
                    <SettingRow label="Mock Gemini API" description="跳过术语提取、润色和翻译请求">
                      <Toggle
                        checked={settings.debug?.mockGemini || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            mockGemini: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <SettingRow label="Mock OpenAI API" description="跳过 OpenAI Whisper 转录请求">
                      <Toggle
                        checked={settings.debug?.mockOpenAI || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            mockOpenAI: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <SettingRow label="Mock Local Whisper" description="跳过本地 Whisper 转录">
                      <Toggle
                        checked={settings.debug?.mockLocalWhisper || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            mockLocalWhisper: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <div className="pt-4 border-t border-slate-700">
                      <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
                        Custom Paths
                      </h4>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Custom ffmpeg.exe Path
                          </label>
                          <input
                            type="text"
                            value={settings.debug?.ffmpegPath || ''}
                            onChange={(e) =>
                              updateSetting('debug', {
                                ...settings.debug,
                                ffmpegPath: e.target.value,
                              })
                            }
                            placeholder="Default (Auto-detected)"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Custom ffprobe.exe Path
                          </label>
                          <input
                            type="text"
                            value={settings.debug?.ffprobePath || ''}
                            onChange={(e) =>
                              updateSetting('debug', {
                                ...settings.debug,
                                ffprobePath: e.target.value,
                              })
                            }
                            placeholder="Default (Auto-detected)"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Custom whisper-cli.exe Path
                          </label>
                          <input
                            type="text"
                            value={settings.debug?.whisperPath || ''}
                            onChange={(e) =>
                              updateSetting('debug', {
                                ...settings.debug,
                                whisperPath: e.target.value,
                              })
                            }
                            placeholder="Default (Auto-detected)"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
