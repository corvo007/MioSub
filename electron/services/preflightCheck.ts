/**
 * Preflight Check Service
 *
 * Validates settings before generation to catch configuration errors early.
 * Consolidates validation logic from localWhisper.ts and ctcAligner.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n.ts';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PreflightError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Settings field name for UI navigation */
  field?: string;
  /** Settings tab to open */
  tab?: 'services' | 'enhance';
  /** Documentation URL for more info */
  docUrl?: string;
}

export interface PreflightWarning {
  code: string;
  message: string;
  field?: string;
}

export interface PreflightResult {
  passed: boolean;
  errors: PreflightError[];
  warnings: PreflightWarning[];
}

export interface PreflightSettings {
  // API Keys
  geminiKey?: string;
  openaiKey?: string;
  // Local Whisper
  useLocalWhisper?: boolean;
  whisperModelPath?: string;
  localWhisperBinaryPath?: string;
  // CTC Alignment
  alignmentMode?: 'ctc' | 'none';
  alignmentModelPath?: string;
  alignerPath?: string;
}

// ============================================================================
// Magic Numbers
// ============================================================================

// Whisper GGML/GGUF format magic numbers
const GGML_MAGIC = 0x67676d6c; // "ggml" in little-endian
const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian

// ONNX protobuf header - field 1 (ir_version) with varint wire type
const ONNX_PROTOBUF_FIELD1_TAG = 0x08; // (1 << 3) | 0

// Minimum file sizes
const MIN_WHISPER_MODEL_SIZE = 50 * 1024 * 1024; // 50MB

// Documentation URLs
const CTC_DOC_URL = 'https://www.miosub.app/docs/guide/alignment';
const WHISPER_DOC_URL = 'https://www.miosub.app/docs/guide/whisper';
const GEMINI_KEY_DOC_URL = 'https://www.miosub.app/docs/guide/get-key';

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Whisper model file (GGML/GGUF format)
 */
export function validateWhisperModel(filePath: string): { valid: boolean; error?: string } {
  try {
    // Check existence
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: t('preflight.whisperModelNotExist') };
    }

    // Check extension
    if (!filePath.endsWith('.bin')) {
      return { valid: false, error: t('preflight.whisperModelInvalidFormat') };
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size < MIN_WHISPER_MODEL_SIZE) {
      return { valid: false, error: t('preflight.whisperModelTooSmall') };
    }

    // Check magic number for GGML/GGUF format
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    const magic = buffer.readUInt32LE(0);
    if (magic !== GGML_MAGIC && magic !== GGUF_MAGIC) {
      return { valid: false, error: t('preflight.whisperModelIncompatibleFormat') };
    }

    return { valid: true };
  } catch (_error) {
    return { valid: false, error: t('preflight.whisperModelReadError') };
  }
}

/**
 * Validate CTC alignment model directory
 *
 * The alignmentModelPath is a DIRECTORY containing:
 * - model.onnx (ONNX model file)
 * - model.onnx.data (model weights data)
 * - vocab.json (vocabulary file)
 *
 * All three files are required for CTC alignment to work.
 */
export function validateCtcModelDir(dirPath: string): { valid: boolean; error?: string } {
  try {
    // Check directory existence first (highest priority)
    if (!fs.existsSync(dirPath)) {
      return { valid: false, error: t('preflight.ctcModelDirNotExist') };
    }

    // Check if it's a directory
    const dirStats = fs.statSync(dirPath);
    if (!dirStats.isDirectory()) {
      return { valid: false, error: t('preflight.ctcModelPathNotDir') };
    }

    // Check all required files exist
    const requiredFiles = ['model.onnx', 'model.onnx.data', 'vocab.json'];
    const missingFiles: string[] = [];

    for (const file of requiredFiles) {
      const filePath = path.join(dirPath, file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      return {
        valid: false,
        error: t('preflight.ctcModelFilesMissing', { files: missingFiles.join(', ') }),
      };
    }

    // Check model.onnx protobuf header
    const modelPath = `${dirPath}/model.onnx`;
    const fd = fs.openSync(modelPath, 'r');
    const buffer = Buffer.alloc(1);
    fs.readSync(fd, buffer, 0, 1, 0);
    fs.closeSync(fd);

    if (buffer[0] !== ONNX_PROTOBUF_FIELD1_TAG) {
      return { valid: false, error: t('preflight.ctcModelInvalidOnnx') };
    }

    return { valid: true };
  } catch (_error) {
    return { valid: false, error: t('preflight.ctcModelReadError') };
  }
}

/**
 * Check if a binary/executable exists
 */
function validateBinaryExists(
  filePath: string | undefined,
  errorCode: string,
  errorKey: string,
  field: string
): PreflightError | null {
  if (!filePath) {
    return null; // Will use bundled binary
  }
  if (!fs.existsSync(filePath)) {
    return {
      code: errorCode,
      message: t(errorKey),
      field,
      tab: 'services',
    };
  }
  return null;
}

// ============================================================================
// Main Preflight Check
// ============================================================================

/**
 * Run preflight checks on settings before generation.
 * Returns errors that should block generation and warnings that are informational.
 */
export function runPreflightCheck(settings: PreflightSettings): PreflightResult {
  const errors: PreflightError[] = [];
  const warnings: PreflightWarning[] = [];

  // =========================================================================
  // API Key Checks
  // =========================================================================

  // Gemini API key is always required (for translation/refinement)
  if (!settings.geminiKey || settings.geminiKey.trim() === '') {
    errors.push({
      code: 'gemini_key_missing',
      message: t('preflight.geminiKeyMissing'),
      field: 'geminiKey',
      tab: 'services',
      docUrl: GEMINI_KEY_DOC_URL,
    });
  }

  // OpenAI API key is required when NOT using local Whisper
  if (!settings.useLocalWhisper) {
    if (!settings.openaiKey || settings.openaiKey.trim() === '') {
      errors.push({
        code: 'openai_key_missing',
        message: t('preflight.openaiKeyMissing'),
        field: 'openaiKey',
        tab: 'services',
      });
    }
  }

  // =========================================================================
  // Local Whisper Checks
  // =========================================================================
  if (settings.useLocalWhisper) {
    // Check model path is set
    if (!settings.whisperModelPath) {
      errors.push({
        code: 'whisper_path_empty',
        message: t('preflight.whisperPathEmpty'),
        field: 'whisperModelPath',
        tab: 'services',
        docUrl: WHISPER_DOC_URL,
      });
    } else {
      // Validate model file
      const validation = validateWhisperModel(settings.whisperModelPath);
      if (!validation.valid) {
        errors.push({
          code: 'whisper_model_invalid',
          message: validation.error!,
          field: 'whisperModelPath',
          tab: 'services',
          docUrl: WHISPER_DOC_URL,
        });
      }
    }

    // Check custom binary if specified
    const binaryError = validateBinaryExists(
      settings.localWhisperBinaryPath,
      'whisper_binary_missing',
      'preflight.whisperBinaryNotExist',
      'localWhisperBinaryPath'
    );
    if (binaryError) {
      errors.push({ ...binaryError, docUrl: WHISPER_DOC_URL });
    }
  }

  // =========================================================================
  // CTC Alignment Checks
  // =========================================================================
  if (settings.alignmentMode === 'ctc') {
    // Check model path is set
    if (!settings.alignmentModelPath) {
      errors.push({
        code: 'ctc_path_empty',
        message: t('preflight.ctcPathEmpty'),
        field: 'alignmentModelPath',
        tab: 'enhance',
        docUrl: CTC_DOC_URL,
      });
    } else {
      // Validate model directory (contains model.onnx)
      const validation = validateCtcModelDir(settings.alignmentModelPath);
      if (!validation.valid) {
        errors.push({
          code: 'ctc_model_invalid',
          message: validation.error!,
          field: 'alignmentModelPath',
          tab: 'enhance',
          docUrl: CTC_DOC_URL,
        });
      }
    }

    // Check custom aligner binary if specified
    const alignerError = validateBinaryExists(
      settings.alignerPath,
      'ctc_aligner_missing',
      'preflight.ctcAlignerNotExist',
      'alignerPath'
    );
    if (alignerError) {
      errors.push({ ...alignerError, tab: 'enhance' });
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
