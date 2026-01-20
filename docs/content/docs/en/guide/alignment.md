---
title: 'Timeline Alignment'
---

Use forced alignment models for character-level timestamps with high precision, ideal for sync-critical subtitles.

---

## 📋 Setup Steps

1. **Download Tool**: Get `aligner-windows-x64.zip` from [Releases](https://github.com/corvo007/Gemini-Subtitle-Pro/releases), extract to get `align.exe`
2. **Download Model**: Get [mms-300m-1130-forced-aligner](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner) from Hugging Face (also available in Releases)
3. **Configure**:
   - Settings > Enhancement > Timeline Alignment > Alignment Mode: Select "CTC"
   - Settings > Enhancement > Timeline Alignment > Aligner Executable: Select `align.exe`
   - Settings > Enhancement > Timeline Alignment > Model Directory: Select model folder
4. **Enable**: Toggle on to start using

---

## 🎯 How It Works

CTC-based high-precision alignment:

- Millisecond-level character alignment
- Auto-corrects Whisper timing errors
- Perfect for sync-critical subtitles
