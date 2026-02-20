/**
 * Preflight Check Service
 *
 * Validates settings before generation to catch configuration errors early.
 * Consolidates validation logic from localWhisper.ts and ctcAligner.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n.ts';
import { getBinaryPath } from '../utils/paths.ts';
import { compareVersions, isRealVersion } from '../utils/version.ts';

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
  tab?: 'services' | 'enhance' | 'about';
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
  alignerVersion?: string;
}

// ============================================================================
// Magic Numbers
// ============================================================================

// Whisper GGML/GGUF format magic numbers
const GGML_MAGIC = 0x67676d6c; // "ggml" in little-endian
const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian

// ONNX protobuf header - field 1 (ir_version) with varint wire type
const ONNX_PROTOBUF_FIELD1_TAG = 0x08; // (1 << 3) | 0

/** Validate that a file starts with the ONNX protobuf header byte. */
function validateOnnxHeader(filePath: string): boolean {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1);
    fs.readSync(fd, buffer, 0, 1, 0);
    return buffer[0] === ONNX_PROTOBUF_FIELD1_TAG;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

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

// Minimum aligner version required for Omnilingual model support
const MIN_OMNILINGUAL_ALIGNER_VERSION = '0.2.0';

/**
 * Detected CTC model type based on directory contents.
 */
export type CtcModelType = 'mms' | 'omnilingual' | 'unknown';

/**
 * Detect which CTC model is present in a directory.
 *
 * - MMS model: model.onnx + model.onnx.data + vocab.json
 * - Omnilingual model: model.int8.onnx + tokens.txt (or model.onnx + tokens.txt for fp32)
 */
function detectCtcModelType(dirPath: string): CtcModelType {
  const hasVocabJson = fs.existsSync(path.join(dirPath, 'vocab.json'));
  const hasTokensTxt = fs.existsSync(path.join(dirPath, 'tokens.txt'));
  const hasModelOnnxData = fs.existsSync(path.join(dirPath, 'model.onnx.data'));

  if (hasTokensTxt) return 'omnilingual';
  if (hasVocabJson && hasModelOnnxData) return 'mms';
  return 'unknown';
}

/**
 * Validate CTC alignment model directory
 *
 * Supports two model formats:
 * - MMS (legacy): model.onnx + model.onnx.data + vocab.json
 * - Omnilingual (recommended): model.int8.onnx + tokens.txt (or model.onnx + tokens.txt)
 */
export function validateCtcModelDir(
  dirPath: string,
  alignerVersion?: string
): { valid: boolean; error?: string; warning?: string; modelType?: CtcModelType } {
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

    // Detect model type
    const modelType = detectCtcModelType(dirPath);

    if (modelType === 'omnilingual') {
      // Omnilingual model: need an ONNX file + tokens.txt
      const hasInt8 = fs.existsSync(path.join(dirPath, 'model.int8.onnx'));
      const hasFp32 = fs.existsSync(path.join(dirPath, 'model.onnx'));
      if (!hasInt8 && !hasFp32) {
        return {
          valid: false,
          error: t('preflight.ctcModelFilesMissing', { files: 'model.int8.onnx' }),
          modelType,
        };
      }

      // Validate ONNX header
      const onnxFile = hasInt8 ? 'model.int8.onnx' : 'model.onnx';
      if (!validateOnnxHeader(path.join(dirPath, onnxFile))) {
        return { valid: false, error: t('preflight.ctcModelInvalidOnnx'), modelType };
      }

      // Check aligner version compatibility
      if (isRealVersion(alignerVersion)) {
        if (compareVersions(alignerVersion, MIN_OMNILINGUAL_ALIGNER_VERSION) < 0) {
          return {
            valid: false,
            error: t('preflight.ctcAlignerVersionTooOld', {
              current: alignerVersion,
              required: MIN_OMNILINGUAL_ALIGNER_VERSION,
            }),
            modelType,
          };
        }
      } else {
        // Version unknown — can't verify compatibility, warn the user
        return {
          valid: true,
          warning: t('preflight.ctcAlignerVersionUnknown', {
            required: MIN_OMNILINGUAL_ALIGNER_VERSION,
          }),
          modelType,
        };
      }

      return { valid: true, modelType };
    }

    if (modelType === 'mms') {
      // MMS model: model.onnx + model.onnx.data + vocab.json
      const requiredFiles = ['model.onnx', 'model.onnx.data', 'vocab.json'];
      const missingFiles: string[] = [];
      for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(dirPath, file))) {
          missingFiles.push(file);
        }
      }
      if (missingFiles.length > 0) {
        return {
          valid: false,
          error: t('preflight.ctcModelFilesMissing', { files: missingFiles.join(', ') }),
          modelType,
        };
      }

      // Validate ONNX header
      if (!validateOnnxHeader(path.join(dirPath, 'model.onnx'))) {
        return { valid: false, error: t('preflight.ctcModelInvalidOnnx'), modelType };
      }

      return { valid: true, modelType };
    }

    // Unknown model type — no recognizable file combination
    return {
      valid: false,
      error: t('preflight.ctcModelFilesMissing', {
        files: 'model.int8.onnx + tokens.txt (Omnilingual) or model.onnx + vocab.json (MMS)',
      }),
    };
  } catch (_error) {
    return { valid: false, error: t('preflight.ctcModelReadError') };
  }
}

/**
 * Check if a binary/executable exists and is executable
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
  // On macOS/Linux, check execute permission
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
    } catch {
      return {
        code: `${errorCode}_not_executable`,
        message: t('preflight.binaryNotExecutable', { path: path.basename(filePath) }),
        field,
        tab: 'services',
      };
    }
  }
  return null;
}

// Companion dynamic libraries required by the aligner binary per platform
const ALIGNER_COMPANION_LIBS: Record<string, string> = {
  win32: 'onnxruntime.dll',
  darwin: 'libonnxruntime.dylib',
  linux: 'libonnxruntime.so',
};

/**
 * Check that companion dynamic libraries exist alongside a binary.
 */
function validateCompanionLibs(binaryPath: string, field: string): PreflightError | null {
  const lib = ALIGNER_COMPANION_LIBS[process.platform];
  if (!lib) return null;
  const libPath = path.join(path.dirname(binaryPath), lib);
  if (!fs.existsSync(libPath)) {
    return {
      code: 'ctc_companion_lib_missing',
      message: t('preflight.ctcCompanionLibMissing', { lib }),
      field,
      tab: 'about',
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
  // Bundled Binary Checks (should always be present in a valid installation)
  // =========================================================================
  for (const bin of ['ffmpeg', 'ffprobe'] as const) {
    const binPath = getBinaryPath(bin);
    if (!fs.existsSync(binPath)) {
      errors.push({
        code: `${bin}_not_found`,
        message: t('preflight.bundledBinaryNotFound', { name: bin }),
      });
    }
  }

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

    // Check binary: custom path if specified, otherwise bundled binary
    if (settings.localWhisperBinaryPath) {
      const binaryError = validateBinaryExists(
        settings.localWhisperBinaryPath,
        'whisper_binary_missing',
        'preflight.whisperBinaryNotExist',
        'localWhisperBinaryPath'
      );
      if (binaryError) {
        errors.push({ ...binaryError, docUrl: WHISPER_DOC_URL });
      }
    } else if (!fs.existsSync(getBinaryPath('whisper-cli'))) {
      errors.push({
        code: 'whisper_binary_missing',
        message: t('preflight.downloadableBinaryNotFound', { name: 'whisper-cli' }),
        tab: 'about',
        docUrl: WHISPER_DOC_URL,
      });
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
      // Validate model directory (contains model.onnx or model.int8.onnx)
      const validation = validateCtcModelDir(settings.alignmentModelPath, settings.alignerVersion);
      if (!validation.valid) {
        errors.push({
          code: 'ctc_model_invalid',
          message: validation.error!,
          field: 'alignmentModelPath',
          tab: 'enhance',
          docUrl: CTC_DOC_URL,
        });
      }
      if (validation.warning) {
        warnings.push({
          code: 'ctc_aligner_version_unknown',
          message: validation.warning,
          field: 'alignmentModelPath',
        });
      }
    }

    // Check bundled aligner binary and companion libraries
    const alignerBinPath = getBinaryPath('cpp-ort-aligner');
    if (!fs.existsSync(alignerBinPath)) {
      errors.push({
        code: 'ctc_aligner_missing',
        message: t('preflight.downloadableBinaryNotFound', { name: 'cpp-ort-aligner' }),
        tab: 'about',
        docUrl: CTC_DOC_URL,
      });
    } else {
      const companionError = validateCompanionLibs(alignerBinPath, 'alignerPath');
      if (companionError) errors.push(companionError);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
