# Gemini Subtitle Pro

[English Documentation](./docs/README_en.md)

**Gemini Subtitle Pro** 是一款基于 AI 的字幕创建、翻译和润色工具。它利用 Google 的 Gemini 模型进行高质量的翻译和润色，并使用 OpenAI 的 Whisper 进行精准的语音转写。

## 🔥 核心特色

**设计目标**：减少甚至无需人工干预，提升字幕生成质量和效率。

**翻译成片（一次生成，无人工核对、修改）：**  
[声优电台（日语，30分钟长，含说话人标注，使用版本v2.13.0）：https://www.bilibili.com/video/BV1XBrsBZE92/](https://www.bilibili.com/video/BV1XBrsBZE92/)  
[铁道vlog（日语，29分钟长，大量地名和铁路专有术语，使用版本v2.8.3）：https://www.bilibili.com/video/BV1k1mgBJEEY/](https://www.bilibili.com/video/BV1k1mgBJEEY/)

**快速体验demo（网页版，仅包含核心功能）：**  
[https://gemini-subtitle-pro.vercel.app/](https://gemini-subtitle-pro.vercel.app/)  
[https://gemini-subtitle-pro-261157428277.asia-east1.run.app/](https://gemini-subtitle-pro-261157428277.asia-east1.run.app/)（国内可访问）

| 功能                  | 说明                                                             |
| --------------------- | ---------------------------------------------------------------- |
| 🎧 **术语自动提取**   | 从音频中智能提取专有名词，配合 Google Search 验证标准译法        |
| ⚡ **长上下文翻译**   | 按语义切分为 5-10 分钟片段，保留完整上下文进行翻译               |
| 💎 **转录后处理**     | 智能断句、时间轴校正、术语替换一气呵成                           |
| 🎯 **强制对齐**       | 基于 CTC 技术的高精度时间轴对齐，支持毫秒级字符对齐              |
| 🗣️ **说话人识别**     | 自动推测并标注多说话人身份，支持自定义颜色和合并                 |
| 🧠 **智能并发**       | 根据模型动态调整并发数，30 分钟视频约 8-10 分钟处理完成          |
| 🚀 **全自动模式**     | 输入视频链接，自动完成下载、转写、翻译、压制全流程               |
| 📺 **所见即所得预览** | 使用 `assjs` 实现实时字幕渲染，精确展示字体、颜色、位置等样式    |
| 🔄 **批量重新生成**   | 选中片段一键重跑完整流程（转录→润色→对齐→翻译）                  |
| 🎬 **视频下载**       | 支持 YouTube / Bilibili 视频下载（桌面版）                       |
| ✂️ **视频压制**       | 内置 FFmpeg，支持 H.264/H.265 硬件加速编码与字幕压制（桌面版）   |
| 📦 **其他功能**       | 双语 SRT/ASS 导出、版本快照、自定义 API 端点、缓存管理、日志查看 |

---

## 📥 快速开始

我们提供了自动构建的安装包，您无需配置开发环境即可直接使用。

1.  访问项目的 [Releases](https://github.com/corvo007/gemini-subtitle-pro/releases) 页面。
2.  下载最新版本：
    - **便携版**: `Gemini-Subtitle-Pro-x.x.x-win-x64.zip`
3.  解压到任意位置，双击 `Gemini Subtitle Pro.exe` 启动程序。
4.  打开设置，填写 Gemini 及 OpenAI API KEY，及配置其他选项。

    **⚠️ 注意事项：**
    1. 如果需要使用本地 Whisper 模型的话，请参考下一节进行配置。
    2. 你需要保证你的 API KEY 能请求 **Gemini 3 Flash**, **Gemini 3 Pro** 及 **Gemini 2.5 Flash** 模型。推荐使用公益站/中转站的API KEY（个人推荐：[云雾API](https://yunwu.ai/register?aff=wmHr)）。
    3. 为了保证翻译质量，目前暂不支持自定义模型。

5.  Enjoy！

---

## 🎙️ 本地 Whisper 配置

本项目支持集成 [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 实现完全离线的语音转写。

- **默认支持**: 我们的安装包 **已内置 CPU 版** 的 Whisper 核心组件 (`whisper-cli.exe`)。
- **需手动下载**: 您需要**自行下载**模型文件 (`.bin`) 才能使用。
- **GPU 加速**: 如需更快的速度，可手动替换为 GPU 版组件。

### ⚡ 快速开始

1.  **下载模型**:
    - 访问 [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main) 下载 GGML 格式的模型文件 (可参考下方的模型下载指南进行模型选择)。
    - 您可以将模型文件保存在电脑的**任意位置**。
2.  **启用功能**:
    - 打开应用，进入 **设置** > **常规**，选择 **"使用本地 Whisper"**。
3.  **加载模型**:
    - 点击 **"浏览"** 按钮。
    - 在弹出的文件浏览窗口中，找到并选中您下载的 `.bin` 模型文件。
4.  **开始使用**:
    - 模型路径设置完成后即可开始使用。

### 📦 模型下载指南

在 Hugging Face 的文件列表中，您会看到大量不同后缀的文件。请参考以下指南进行选择：

#### 1. 推荐下载 (最稳妥)

请下载 **标准版** 模型，文件名格式为 `ggml-[model].bin`。

- **Base**: `ggml-base.bin` (平衡推荐)
- **Small**: `ggml-small.bin` (精度更好)
- **Medium**: `ggml-medium.bin` (高质量，需更多内存)

#### 2. 文件名后缀说明

- **`.en` (如 `ggml-base.en.bin`)**: **仅英语**模型。如果您只转写英文视频，它比同级的多语言模型更准；但**不支持**中文或其他语言。
- **`q5_0`, `q8_0` (如 `ggml-base-q5_0.bin`)**: **量化版**模型。体积更小、速度更快，但精度略有下降。
  - `q8_0`: 几乎无损，推荐。
  - `q5_0`: 损失少量精度，体积显著减小。
- **`.mlmodelc.zip`**: ❌ **不要下载**。这是 macOS CoreML 专用格式，Windows 无法使用。

#### 3. 性能对比参考

| 模型         | 推荐文件名          | 大小   | 内存    | 速度 | 适用场景         |
| :----------- | :------------------ | :----- | :------ | :--- | :--------------- |
| **Tiny**     | `ggml-tiny.bin`     | 75 MB  | ~390 MB | 极快 | 快速测试         |
| **Base**     | `ggml-base.bin`     | 142 MB | ~500 MB | 快   | 日常对话 (推荐)  |
| **Small**    | `ggml-small.bin`    | 466 MB | ~1 GB   | 中等 | 播客/视频 (推荐) |
| **Medium**   | `ggml-medium.bin`   | 1.5 GB | ~2.6 GB | 慢   | 复杂音频         |
| **Large-v3** | `ggml-large-v3.bin` | 2.9 GB | ~4.7 GB | 最慢 | 专业需求         |

### 🛠️ 进阶：GPU 加速 (NVIDIA 显卡)

如果您拥有 NVIDIA 显卡，强烈建议启用 GPU 加速以获得 5-10 倍的性能提升。

**前提条件**:

- 已安装最新版 **NVIDIA 显卡驱动**。

**安装步骤**:

1.  **下载组件**:
    - 访问 [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases)。
    - 找到最新的 Windows GPU 版本，文件名通常为 `whisper-cublas-bin-x64.zip`。
2.  **解压文件**:
    - 解压下载的压缩包。您会看到 `whisper-cli.exe` 和多个 `.dll` 文件 (例如 `cublas64_12.dll`, `cudart64_12.dll` 等)。
3.  **放置文件**:
    - 请在 `.exe` 同级目录下创建一个名为 `resources` 的文件夹，并将解压出的所有文件放入其中；或者直接将文件放在 `.exe` 同级目录。
    - 注意：必须确保`whisper-cli.exe`存在，且 `.dll` 动态库文件与 `whisper-cli.exe` 在同一个文件夹内。
4.  **验证**:
    - 重启应用。尝试转写，如果速度显著提升，即表示 GPU 加速生效。

### ❓ 常见问题

- **找不到选项？**: 请确认您使用的是**桌面版**,网页版不支持此功能。
- **状态错误？**: 检查是否已正确选择了 `.bin` 模型文件。
- **速度慢？**: CPU 模式下速度取决于处理器性能,建议使用 `Base` 或 `Small` 模型。如需极致速度请配置 GPU 加速。

---

## 🎯 时间轴强制对齐配置

使用强制对齐模型来获得更高精度的字符级时间戳，特别适合对时间轴精度有高要求的场景。

1. **准备工具**:
   - 在 Releases 页面中，此功能需要**额外下载** aligner 组件（如 `aligner-windows-x64.zip`）。
   - 解压该压缩包，将会得到 `align.exe`。

2. **下载模型**:
   - 访问 Hugging Face 下载 [mms-300m-1130-forced-aligner](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner)（Release也有提供）。
   - 下载并将模型解压到本地任意位置。

3. **配置应用**:
   - 打开应用 **设置**。
   - 在 **"强制对齐"** (Alignment) 设置中：
     - **执行文件**: 选择解压出来的 `align.exe` 文件。
     - **模型路径**: 选择您下载并解压的模型文件夹。
   - 开启功能即可使用。

---

### 🎬 视频下载支持

支持从 YouTube 和 Bilibili 下载视频，内置 yt-dlp 引擎。

#### ✅ 支持的链接格式

| 平台         | 类型     | 示例                           |
| ------------ | -------- | ------------------------------ |
| **YouTube**  | 标准视频 | `youtube.com/watch?v=xxx`      |
|              | 短链接   | `youtu.be/xxx`                 |
|              | Shorts   | `youtube.com/shorts/xxx`       |
|              | 嵌入式   | `youtube.com/embed/xxx`        |
| **Bilibili** | BV/av 号 | `bilibili.com/video/BVxxx`     |
|              | 分P视频  | `bilibili.com/video/BVxxx?p=2` |
|              | B23 短链 | `b23.tv/xxx`                   |

#### ❌ 暂不支持

| 平台     | 类型            | 原因               |
| -------- | --------------- | ------------------ |
| YouTube  | 播放列表/频道   | 请使用单个视频链接 |
| Bilibili | 番剧/影视       | 版权限制           |
|          | 付费课程        | 需购买             |
|          | 直播            | 实时流             |
|          | 大会员/充电视频 | 需登录 cookies     |
|          | 收藏夹/个人空间 | 请使用单个视频链接 |

---

## 🚀 本地开发运行

**前提条件:** Node.js 18+

1. **安装依赖:**

   ```bash
   yarn install
   ```

2. **运行应用:**

   ```bash
   yarn electron:dev
   ```

3. **构建应用:**

   ```bash
   yarn electron:build
   ```

   打包完成后，您可以在 `release` 目录下找到便携版压缩包 (`.zip`)。解压后即可运行。

---

## 📚 文档

- [项目架构文档](./docs/ARCHITECTURE_zh.md)
- [English Documentation](./docs/README_en.md)
