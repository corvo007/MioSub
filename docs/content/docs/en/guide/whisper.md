---
title: 'Local Whisper Setup'
---

This project integrates [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for completely offline speech transcription.

- **Built-in**: Installation package includes CPU version (`whisper-cli.exe`)
- **Model Required**: Download model files (`.bin`) separately
- **GPU Acceleration**: Manually replace with GPU version for faster speed

---

## ⚡ Quick Start

1. **Download Model**: Visit [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main) to download GGML format model
2. **Enable Feature**: Settings > Services > Speech Recognition, select "Local Whisper"
3. **Load Model**: Click "Browse" and select the downloaded `.bin` model file
4. **Start Using**: Ready after model path is configured

---

## 📦 Model Download Guide

### Recommended Models

Download **Standard Version** models, filename format: `ggml-[model].bin`

| Model        | Filename            | Size   | Memory  | Speed     | Use Case         |
| :----------- | :------------------ | :----- | :------ | :-------- | :--------------- |
| **Tiny**     | `ggml-tiny.bin`     | 75 MB  | ~390 MB | Very Fast | Quick Testing    |
| **Base**     | `ggml-base.bin`     | 142 MB | ~500 MB | Fast      | Daily Use ⭐     |
| **Small**    | `ggml-small.bin`    | 466 MB | ~1 GB   | Medium    | Podcast/Video ⭐ |
| **Medium**   | `ggml-medium.bin`   | 1.5 GB | ~2.6 GB | Slow      | Complex Audio    |
| **Large-v3** | `ggml-large-v3.bin` | 2.9 GB | ~4.7 GB | Slowest   | Professional     |

### Filename Suffix Guide

- **`.en`**: English-only model, doesn't support other languages
- **`q5_0`, `q8_0`**: Quantized versions, smaller size, slightly reduced precision

---

## 🛠️ GPU Acceleration (NVIDIA)

**Prerequisites**: Latest NVIDIA graphics driver installed

1. Visit [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases) to download `whisper-cublas-bin-x64.zip`
2. Extract `whisper-cli.exe` and `.dll` files
3. Place all files in `resources` folder next to the app (create if missing)
4. Restart app and test - significant speed improvement indicates success

---

## ❓ FAQ

- **Can't find option?** Make sure you're using the **Desktop version**, web version doesn't support this
- **Status error?** Check if you've correctly selected a `.bin` model file
- **Too slow?** CPU mode depends on processor performance, recommend `Base` or `Small` models
