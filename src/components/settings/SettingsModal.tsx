import React from 'react';
import { Settings, X, CheckCircle, Languages, Type, Clock, Book } from 'lucide-react';
import { AppSettings } from '@/types/settings';
import { CustomSelect } from './CustomSelect';
import { LocalWhisperSettings } from './LocalWhisperSettings';

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
    onOpenGlossaryManager
}) => {
    const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative overflow-hidden">
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center"><Settings className="w-5 h-5 mr-2 text-indigo-400" /> 设置</h2>

                    <div className="flex space-x-1 border-b border-slate-700 mb-6 overflow-x-auto">
                        {['general', 'performance', 'glossary'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab ? 'bg-slate-800 text-indigo-400 border-t border-x border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                            >
                                {tab === 'general' && '常规'}
                                {tab === 'performance' && '性能'}
                                {tab === 'glossary' && '术语表'}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-6 min-h-[400px]">
                        {activeTab === 'general' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* API Settings */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">翻译和校对服务</h3>
                                    <div className="space-y-4">
                                        {/* Gemini */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Gemini API 密钥</label>
                                            <div className="relative"><input type="password" value={settings.geminiKey} onChange={(e) => updateSetting('geminiKey', e.target.value.trim())} placeholder="输入 Gemini API 密钥" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" /></div>
                                            <p className="text-xs text-slate-500 mt-1">必填。使用 <strong>Gemini 2.5 Flash</strong> 进行翻译，使用 <strong>Gemini 3 Pro</strong> 进行术语提取和深度校对。</p>
                                            {envGeminiKey && !settings.geminiKey && (<p className="text-xs text-emerald-400 mt-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> 使用环境变量中的 API 密钥</p>)}
                                            {envGeminiKey && settings.geminiKey && (<p className="text-xs text-amber-400 mt-1">覆盖环境变量中的 API 密钥</p>)}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Gemini 端点 (可选)</label>
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
                                            <p className="text-xs text-slate-500 mt-1">Gemini API 的自定义基础 URL (例如用于代理)。</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Transcription Provider Settings */}
                                <div className="space-y-3 pt-4 border-t border-slate-800">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">转录服务</h3>

                                    {isElectron ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => {
                                                        updateSetting('useLocalWhisper', false);
                                                    }}
                                                    className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${!settings.useLocalWhisper ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                                                >
                                                    <span>OpenAI API</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        updateSetting('useLocalWhisper', true);
                                                    }}
                                                    className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.useLocalWhisper ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                                                >
                                                    <span>本地 Whisper</span>
                                                </button>
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
                                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">OpenAI API 密钥</label>
                                                        <div className="relative"><input type="password" value={settings.openaiKey} onChange={(e) => updateSetting('openaiKey', e.target.value.trim())} placeholder="输入 OpenAI API 密钥" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" /></div>
                                                        <p className="text-xs text-slate-500 mt-1">必填。使用 <strong>Whisper</strong> 模型进行高精度基础转录。</p>
                                                        {envOpenaiKey && !settings.openaiKey && (<p className="text-xs text-emerald-400 mt-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> 使用环境变量中的 API 密钥</p>)}
                                                        {envOpenaiKey && settings.openaiKey && (<p className="text-xs text-amber-400 mt-1">覆盖环境变量中的 API 密钥</p>)}
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">OpenAI 端点 (可选)</label>
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
                                                        <p className="text-xs text-slate-500 mt-1">OpenAI API 的自定义基础 URL (例如用于本地 LLM 或代理)。</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-1.5">OpenAI API 密钥</label>
                                                <div className="relative"><input type="password" value={settings.openaiKey} onChange={(e) => updateSetting('openaiKey', e.target.value.trim())} placeholder="输入 OpenAI API 密钥" className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" /></div>
                                                <p className="text-xs text-slate-500 mt-1">必填。使用 <strong>Whisper</strong> 模型进行高精度基础转录。</p>
                                                {envOpenaiKey && !settings.openaiKey && (<p className="text-xs text-emerald-400 mt-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> 使用环境变量中的 API 密钥</p>)}
                                                {envOpenaiKey && settings.openaiKey && (<p className="text-xs text-amber-400 mt-1">覆盖环境变量中的 API 密钥</p>)}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-1.5">OpenAI 端点 (可选)</label>
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
                                                <p className="text-xs text-slate-500 mt-1">OpenAI API 的自定义基础 URL (例如用于本地 LLM 或代理)。</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Output Settings */}
                                <div className="space-y-3 pt-4 border-t border-slate-800">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">输出设置</h3>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">导出模式</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => updateSetting('outputMode', 'bilingual')} className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'bilingual' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Languages className="w-4 h-4" /><span>双语 (原文 + 中文)</span></button>
                                            <button onClick={() => updateSetting('outputMode', 'target_only')} className={`p-3 rounded-lg border text-sm flex items-center justify-center space-x-2 transition-all ${settings.outputMode === 'target_only' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Type className="w-4 h-4" /><span>仅中文</span></button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">选择是否在最终输出中保留原文。</p>
                                    </div>
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
                                            本地 Whisper 性能设置
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-1.5">CPU 线程数</label>
                                                <input
                                                    type="text"
                                                    value={settings.whisperThreads || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '') updateSetting('whisperThreads', undefined); // Set to undefined to trigger defaults
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
                                                <p className="text-xs text-slate-500 mt-1">单个任务使用的 CPU 核心数 (1-16)</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-1.5">最大并发数</label>
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
                                                <p className="text-xs text-slate-500 mt-1">同时运行的任务数量 (1-4)</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">校对批次大小</label>
                                        <input type="text" value={settings.proofreadBatchSize === 0 ? '' : settings.proofreadBatchSize} onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') updateSetting('proofreadBatchSize', 0);
                                            else if (/^\d+$/.test(val)) updateSetting('proofreadBatchSize', parseInt(val));
                                        }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        <p className="text-xs text-slate-500 mt-1">单次 API 调用校对的行数。数值越高越节省 token，但可能会降低质量。</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">翻译批次大小</label>
                                        <input type="text" value={settings.translationBatchSize === 0 ? '' : settings.translationBatchSize} onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') updateSetting('translationBatchSize', 0);
                                            else if (/^\d+$/.test(val)) updateSetting('translationBatchSize', parseInt(val));
                                        }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        <p className="text-xs text-slate-500 mt-1">单次 API 调用翻译的行数。根据上下文需求进行调整。</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">分块时长 (秒)</label>
                                        <input type="text" value={settings.chunkDuration === 0 ? '' : settings.chunkDuration} onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') updateSetting('chunkDuration', 0);
                                            else if (/^\d+$/.test(val)) updateSetting('chunkDuration', parseInt(val));
                                        }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        <p className="text-xs text-slate-500 mt-1">处理过程中分割音频文件的目标时长 (秒)。</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">并发数 (Flash)</label>
                                        <input type="text" value={settings.concurrencyFlash === 0 ? '' : settings.concurrencyFlash} onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') updateSetting('concurrencyFlash', 0);
                                            else if (/^\d+$/.test(val)) updateSetting('concurrencyFlash', parseInt(val));
                                        }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        <p className="text-xs text-slate-500 mt-1">用于 <strong>Gemini 2.5 Flash</strong> (优化和翻译) 和 <strong> Whisper API</strong>。支持较高限制 (如 10-20)。</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">并发数 (Pro)</label>
                                        <input type="text" value={settings.concurrencyPro === 0 ? '' : settings.concurrencyPro} onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') updateSetting('concurrencyPro', 0);
                                            else if (/^\d+$/.test(val)) updateSetting('concurrencyPro', parseInt(val));
                                        }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        <p className="text-xs text-slate-500 mt-1">用于 <strong>Gemini 3 Pro</strong> (术语提取和深度校对)。严格的速率限制。</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">请求超时 (秒)</label>
                                        <input type="text" value={settings.requestTimeout === 0 ? '' : (settings.requestTimeout || 600)} onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') updateSetting('requestTimeout', 0);
                                            else if (/^\d+$/.test(val)) updateSetting('requestTimeout', parseInt(val));
                                        }} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm" />
                                        <p className="text-xs text-slate-500 mt-1">API 请求的超时时间。如果经常遇到超时错误，请增加此值。</p>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300">智能分段</label>
                                            <p className="text-xs text-slate-500">使用 VAD 在自然停顿处分割音频 (推荐)</p>
                                        </div>
                                        <button
                                            onClick={() => updateSetting('useSmartSplit', !settings.useSmartSplit)}
                                            className={`w-10 h-5 rounded-full transition-colors relative ${settings.useSmartSplit !== false ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.useSmartSplit !== false ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'glossary' && (
                            <div className="space-y-3 animate-fade-in">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300">启用自动术语表</label>
                                        <p className="text-xs text-slate-500">在翻译前自动从音频中提取术语</p>
                                    </div>
                                    <button
                                        onClick={() => updateSetting('enableAutoGlossary', !settings.enableAutoGlossary)}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${settings.enableAutoGlossary !== false ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.enableAutoGlossary !== false ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </div>

                                {settings.enableAutoGlossary !== false && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">术语提取音频长度</label>
                                            <CustomSelect
                                                value={settings.glossarySampleMinutes === 'all' ? 'all' : settings.glossarySampleMinutes.toString()}
                                                onChange={(val) => {
                                                    if (val === 'all') updateSetting('glossarySampleMinutes', 'all');
                                                    else updateSetting('glossarySampleMinutes', parseInt(val));
                                                }}
                                                options={[
                                                    { value: '5', label: '前 5 分钟' },
                                                    { value: '15', label: '前 15 分钟' },
                                                    { value: '30', label: '前 30 分钟' },
                                                    { value: 'all', label: '完整音频 (较慢)' }
                                                ]}
                                                icon={<Clock className="w-4 h-4" />}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">
                                                分析前 X 分钟以提取术语。“完整音频”覆盖面更广，但耗时更长。
                                            </p>
                                        </div>


                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300">自动确认术语表</label>
                                                <p className="text-xs text-slate-500">如果发现术语，跳过确认对话框</p>
                                            </div>
                                            <button
                                                onClick={() => updateSetting('glossaryAutoConfirm', !settings.glossaryAutoConfirm)}
                                                className={`w-10 h-5 rounded-full transition-colors relative ${settings.glossaryAutoConfirm ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                            >
                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.glossaryAutoConfirm ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-800">
                                    <button
                                        onClick={() => { onClose(); onOpenGlossaryManager(); }}
                                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center justify-center text-sm font-medium"
                                    >
                                        <Book className="w-4 h-4 mr-2" /> 管理术语表
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
