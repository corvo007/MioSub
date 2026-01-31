---
title: 'Timeline Alignment'
description: 'Get millisecond-precise timestamps with CTC forced alignment'
---

import { Callout } from 'fumadocs-ui/components/callout';

<Callout type="info" title="v3.0 Feature">
  v3.0 includes a built-in CTC aligner — no extra downloads needed, works out of the box!
</Callout>

Use forced alignment models for character-level timestamps with high precision, ideal for sync-critical subtitles.

---

## ⚡ Quick Enable (v3.0+)

v3.0 includes a built-in CTC aligner. Simply:

1. Open **Settings > Enhancement > Timeline Alignment**
2. Set **Alignment Mode** to "CTC"
3. Toggle the switch on

The aligner will automatically download required models on first use.

---

## 📋 Manual Configuration (Optional)

If you need custom models or encounter download issues:

1. **Download Model**: Get [mms-300m-1130-forced-aligner](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner) from Hugging Face
2. **Configure Path**:
   - Settings > Enhancement > Timeline Alignment > Model Directory: Select model folder
3. **Enable**: Toggle on to start using

---

## 🎯 How It Works

CTC (Connectionist Temporal Classification) based high-precision alignment:

- **Millisecond Precision**: Character-level timestamp alignment
- **Auto-Correction**: Fixes Whisper transcription timing errors
- **Multi-Language**: Supports Chinese, English, Japanese, and more
- **GPU Acceleration**: Uses ONNX Runtime GPU when available

---

## 🆚 Alignment Mode Comparison

| Mode    | Precision   | Speed   | Use Case               |
| :------ | :---------- | :------ | :--------------------- |
| **Off** | Original    | Fastest | Quick preview          |
| **CTC** | Millisecond | Medium  | Professional subtitles |

---

## ❓ FAQ

### Alignment made timing worse?

This may be due to source audio quality. Try:

1. Check if audio has significant noise
2. Verify language settings are correct
3. For segments with heavy background music, manual adjustment may be needed

### Alignment is slow?

CTC alignment requires computational resources. Tips:

1. Ensure sufficient RAM (8GB+ recommended)
2. NVIDIA GPU will be used automatically if available
3. Long videos are processed in segments
