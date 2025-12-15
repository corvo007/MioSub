import React, { useState, useEffect } from 'react';
import { Settings, Download, FileText, Film, Zap, Cpu, Loader2 } from 'lucide-react';
import type { HardwareAccelInfo } from '@/types/compression';
import type { AppSettings } from '@/types/settings';
import { CustomSelect } from '@/components/settings/CustomSelect';
import { ConfigSection } from '@/components/endToEnd/wizard/shared/ConfigSection';
import { ToggleOptionInline } from '@/components/endToEnd/wizard/shared/ToggleOption';
import { GenreSelectorInline } from '@/components/endToEnd/wizard/shared/GenreSelector';

/** 步骤 2: 配置选项 */
export function StepConfig({
  config,
  onConfigChange,
  videoInfo,
  settings,
}: {
  config: any;
  onConfigChange: (updates: any) => void;
  videoInfo?: any;
  settings?: AppSettings;
}) {
  const [hwAccelInfo, setHwAccelInfo] = useState<HardwareAccelInfo | null>(null);

  useEffect(() => {
    (async () => {
      if (window.electronAPI?.compression?.getHwAccelInfo) {
        try {
          const info = await window.electronAPI.compression.getHwAccelInfo();
          setHwAccelInfo(info);
        } catch (err) {
          console.error('Failed to get hw info', err);
        }
      }
    })();
  }, []);

  const handleSelectDir = async () => {
    if (window.electronAPI?.download?.selectDir) {
      const result = await window.electronAPI.download.selectDir();
      if (result.success && result.path) {
        onConfigChange({ outputDir: result.path });
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 mb-4">
          <Settings className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">配置参数</h2>
        <p className="text-white/60">设置下载、字幕和压制选项</p>
      </div>

      {/* Video Info Card */}
      {videoInfo && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
          <div className="flex items-center gap-4">
            {videoInfo.thumbnail && (
              <img
                src={videoInfo.thumbnail}
                alt="Thumbnail"
                className="w-20 h-14 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-white truncate">{videoInfo.title}</h4>
              <p className="text-sm text-white/50">{videoInfo.uploader}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* ================================ */}
        {/* Section 1: 下载配置 */}
        {/* ================================ */}
        <ConfigSection title="下载配置" icon={<Download className="w-4 h-4" />}>
          {/* Output Directory */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">输出目录</label>
            <div className="flex items-center gap-3">
              <span className="flex-1 px-3 py-2 bg-white/5 rounded-lg text-white/70 text-sm truncate">
                {config.outputDir || '未选择'}
              </span>
              <button
                onClick={handleSelectDir}
                className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded-lg text-violet-300 text-sm transition-colors hover:bg-violet-500/30"
              >
                选择
              </button>
            </div>
          </div>

          {/* Video Quality */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">下载清晰度</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'best', label: '最佳' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
                { value: '480p', label: '480p' },
              ].map((quality) => (
                <button
                  key={quality.value}
                  onClick={() => onConfigChange({ downloadFormat: quality.value })}
                  className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                    (config.downloadFormat || 'best') === quality.value
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {quality.label}
                </button>
              ))}
            </div>
          </div>

          {/* Download Thumbnail */}
          <ToggleOptionInline
            label="下载封面"
            checked={config.downloadThumbnail !== false}
            onChange={(v) => onConfigChange({ downloadThumbnail: v })}
          />
        </ConfigSection>

        {/* ================================ */}
        {/* Section 2: 字幕生成配置 */}
        {/* ================================ */}
        <ConfigSection title="字幕生成配置" icon={<FileText className="w-4 h-4" />}>
          {/* Genre Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">内容类型</label>
            <GenreSelectorInline
              currentGenre={config.genre || 'anime'}
              onGenreChange={(genre) => onConfigChange({ genre })}
            />
          </div>

          {/* Glossary & Speaker Detection */}
          <div className="space-y-2">
            <ToggleOptionInline
              label="启用术语提取"
              description="自动识别并提取专有名词"
              checked={config.enableGlossary !== false}
              onChange={(v) => onConfigChange({ enableGlossary: v })}
            />

            {/* Glossary Selection */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-white/90">使用术语表</span>
                <p className="text-xs text-white/50">选择已有的术语表辅助翻译</p>
              </div>
              <div className="w-40">
                <CustomSelect
                  value={config.selectedGlossaryId || ''}
                  onChange={(val: string) => onConfigChange({ selectedGlossaryId: val || null })}
                  options={[
                    { value: '', label: '(无)' },
                    ...(settings?.glossaries?.map((g) => ({
                      value: g.id,
                      label: (
                        <div className="flex items-center justify-between w-full min-w-0">
                          <span className="truncate mr-2">{g.name}</span>
                          <span className="text-slate-500 text-xs flex-shrink-0">
                            ({g.terms?.length || 0})
                          </span>
                        </div>
                      ),
                    })) || []),
                  ]}
                  placeholder="(无)"
                />
              </div>
            </div>

            <ToggleOptionInline
              label="说话人识别"
              description="识别音频中的不同说话人"
              checked={config.enableDiarization !== false}
              onChange={(v) => onConfigChange({ enableDiarization: v })}
            />
            {/* Speaker Options */}
            {config.enableDiarization !== false && (
              <div className="ml-8 mt-1 space-y-2 border-l-2 border-white/10 pl-3">
                <ToggleOptionInline
                  label="显示说话人名称"
                  description="在字幕文本中包含说话人名字"
                  checked={!!config.includeSpeaker}
                  onChange={(v) => onConfigChange({ includeSpeaker: v })}
                />
                <ToggleOptionInline
                  label="使用说话人颜色"
                  description="为不同说话人使用不同颜色 (仅ASS)"
                  checked={!!config.useSpeakerColors}
                  onChange={(v) => onConfigChange({ useSpeakerColors: v })}
                />
                {/* Min/Max Speaker Count */}
                <div className="pt-3">
                  <span className="text-sm text-white/90 block mb-2">说话人数量 (可选)</span>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/70">最少说话人</span>
                      <input
                        type="text"
                        value={config.minSpeakers ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          const num = val ? Math.min(99, Math.max(1, parseInt(val))) : undefined;
                          onConfigChange({ minSpeakers: num });
                        }}
                        placeholder="-"
                        className="w-12 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm text-center focus:outline-none focus:border-violet-500/50 transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/70">最多说话人</span>
                      <input
                        type="text"
                        value={config.maxSpeakers ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          const num = val ? Math.min(99, Math.max(1, parseInt(val))) : undefined;
                          onConfigChange({ maxSpeakers: num });
                        }}
                        placeholder="-"
                        className="w-12 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm text-center focus:outline-none focus:border-violet-500/50 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ConfigSection>

        {/* ================================ */}
        {/* Section 3: 压制配置 */}
        {/* ================================ */}
        <ConfigSection title="视频压制配置" icon={<Film className="w-4 h-4" />}>
          <ToggleOptionInline
            label="启用视频压制"
            description="将字幕内嵌到视频中生成成品"
            checked={config.enableCompression !== false}
            onChange={(v) => onConfigChange({ enableCompression: v })}
          />

          {config.enableCompression !== false && (
            <div className="mt-6 space-y-6 pl-2">
              {/* Hardware Acceleration (Reused from CompressionPage) */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">硬件加速</label>
                <div className="flex-1 space-y-2">
                  <button
                    onClick={() =>
                      hwAccelInfo?.available &&
                      onConfigChange({ useHardwareAccel: !(config.useHardwareAccel !== false) })
                    }
                    disabled={!hwAccelInfo || !hwAccelInfo.available}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      !hwAccelInfo
                        ? 'bg-slate-800/50 border-slate-700/50 cursor-wait opacity-70'
                        : !hwAccelInfo.available
                          ? 'bg-slate-800/50 border-slate-700/50 cursor-not-allowed opacity-60'
                          : config.useHardwareAccel !== false
                            ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {!hwAccelInfo ? (
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                      ) : !hwAccelInfo.available ? (
                        <Cpu className="w-5 h-5 text-slate-500" />
                      ) : config.useHardwareAccel !== false ? (
                        <Zap className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Cpu className="w-5 h-5 text-slate-400" />
                      )}

                      <div className="text-left">
                        <div
                          className={`font-medium ${
                            !hwAccelInfo
                              ? 'text-slate-400'
                              : !hwAccelInfo.available
                                ? 'text-slate-500'
                                : config.useHardwareAccel !== false
                                  ? 'text-emerald-300'
                                  : 'text-slate-300'
                          }`}
                        >
                          {!hwAccelInfo
                            ? '正在检测...'
                            : !hwAccelInfo.available
                              ? '硬件加速不可用'
                              : config.useHardwareAccel !== false
                                ? 'GPU 加速已开启'
                                : 'CPU 模式'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {!hwAccelInfo
                            ? '正在检测硬件加速支持情况'
                            : !hwAccelInfo.available
                              ? '未检测到可以使用硬件加速的 GPU'
                              : config.useHardwareAccel !== false
                                ? `将使用 ${
                                    (config.compressionEncoder || 'libx264') === 'libx264'
                                      ? hwAccelInfo.preferredH264
                                      : hwAccelInfo.preferredH265
                                  }`
                                : '强制使用 CPU 编码'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        !hwAccelInfo || !hwAccelInfo.available
                          ? 'bg-slate-700'
                          : config.useHardwareAccel !== false
                            ? 'bg-emerald-500'
                            : 'bg-slate-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all ${
                          config.useHardwareAccel !== false && hwAccelInfo?.available
                            ? 'left-5'
                            : 'left-0.5'
                        }`}
                      />
                    </div>
                  </button>

                  {hwAccelInfo?.available && config.useHardwareAccel !== false && (
                    <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>可用编码器:</span>
                      {hwAccelInfo.encoders.h264_nvenc && (
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                          NVENC
                        </span>
                      )}
                      {hwAccelInfo.encoders.h264_qsv && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                          QSV
                        </span>
                      )}
                      {hwAccelInfo.encoders.h264_amf && (
                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                          AMF
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Encoder */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">编码器</label>
                <div className="flex-1">
                  <CustomSelect
                    value={config.compressionEncoder || 'libx264'}
                    onChange={(v: string) => onConfigChange({ compressionEncoder: v })}
                    options={[
                      {
                        value: 'libx264',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">H.264 (AVC)</div>
                            <div className="text-xs text-slate-500">
                              兼容性最好，适合大多数播放器
                            </div>
                          </div>
                        ),
                      },
                      {
                        value: 'libx265',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">H.265 (HEVC)</div>
                            <div className="text-xs text-slate-500">高压缩率，同画质体积更小</div>
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>

              {/* Resolution Select */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">分辨率</label>
                <div className="flex-1">
                  <CustomSelect
                    value={config.compressionResolution || 'original'}
                    onChange={(v: string) => onConfigChange({ compressionResolution: v })}
                    options={[
                      { value: 'original', label: '原画 (保持一致)' },
                      { value: '1080p', label: '1080p (全高清)' },
                      { value: '720p', label: '720p (高清)' },
                      { value: '480p', label: '480p (标清)' },
                    ]}
                    forceDropUp={true}
                  />
                </div>
              </div>

              {/* CRF Input (Reused from CompressionPage) */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">
                  质量 (CRF)
                </label>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={config.compressionCrf ?? 23}
                    onChange={(e) => {
                      const input = e.target.value;
                      if (input === '' || /^\d*\.?\d*$/.test(input)) {
                        const val = parseFloat(input);
                        if (!isNaN(val) && val >= 0 && val <= 51) {
                          onConfigChange({ compressionCrf: val });
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val) || val < 0) {
                        onConfigChange({ compressionCrf: 0 });
                      } else if (val > 51) {
                        onConfigChange({ compressionCrf: 51 });
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                  <div className="text-xs text-slate-500">
                    范围 0-51，数值越小画质越高。推荐：H.264 (23), H.265 (28)
                  </div>
                </div>
              </div>
            </div>
          )}
        </ConfigSection>
      </div>
    </div>
  );
}
