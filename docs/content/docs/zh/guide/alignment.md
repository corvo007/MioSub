---
title: '时间轴强制对齐'
---

使用强制对齐模型来获得更高精度的字符级时间戳，适合对时间轴精度有高要求的场景。

---

## 📋 配置步骤

1. **准备工具**: 在 [Releases](https://github.com/corvo007/Gemini-Subtitle-Pro/releases) 页面下载 `aligner-windows-x64.zip`，解压得到 `align.exe`
2. **下载模型**: 访问 Hugging Face 下载 [mms-300m-1130-forced-aligner](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner)（Release 也有提供）
3. **配置应用**:
   - 设置 > 增强 > 时间轴对齐 > 对齐模式 选择「CTC」
   - 设置 > 增强 > 时间轴对齐 > 对齐器执行文件: 选择 `align.exe`
   - 设置 > 增强 > 时间轴对齐 > 模型目录: 选择模型文件夹
4. **开启功能**: 启用后即可使用

---

## 🎯 工作原理

基于 CTC 技术的高精度时间轴对齐：

- 支持毫秒级字符对齐
- 自动修正 Whisper 转录的时间偏差
- 适用于需要精确同步的字幕场景
