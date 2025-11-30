# Refactoring Plan

## Phase 1: Directory Structure Reorganization
- [x] Create `src` directory
- [x] Create subdirectories (`components`, `services`, `hooks`, `utils`, `types`, `constants`, `workers`, `styles`)
- [x] Configure path aliases in `tsconfig.json` and `vite.config.ts`
- [x] Move files to `src` and subdirectories
- [x] Update import paths
- [x] Verify build

## Phase 2: Type System Refactoring
- [x] Create `src/types/` directory
- [x] Create modular type files (`subtitle.ts`, `glossary.ts`, `api.ts`, `settings.ts`, `index.ts`)
- [x] Update imports in `src/App.tsx`
- [x] Update imports in other files (`gemini.ts`, `utils.ts`, etc.)
- [x] Verify build
- [x] Delete `src/types.ts`

## Phase 3: Service Layer Extraction
- [x] **Step 1: Create Service Directory Structure**
    - [x] Create `src/services/` and subdirectories: `api`, `audio`, `subtitle`, `glossary`, `utils`.
- [x] **Step 2: Extract Logger Utility**
    - [x] Move `Logger`, `LogLevel`, `LogEntry` to `src/services/utils/logger.ts`.
    - [x] Update `src/utils.ts` to re-export.
- [x] **Step 3: Extract Concurrency Utility**
    - [x] Move `mapInParallel` to `src/services/utils/concurrency.ts`.
    - [x] Update `src/utils.ts` to re-export.
- [x] **Step 4: Extract Time Utilities**
    - [x] Move `formatTime`, `timeToSeconds`, `normalizeTimestamp`, `toAssTime` to `src/services/subtitle/time.ts`.
    - [x] Update `src/utils.ts` to re-export.
- [x] **Step 5: Extract Audio Decoder**
    - [x] Move `decodeAudio` (and `decodeAudioWithRetry` from gemini.ts) to `src/services/audio/decoder.ts`.
    - [x] Update `src/utils.ts` and `src/gemini.ts`.
- [x] **Step 6: Extract Audio Converter**
    - [x] Move `fileToBase64`, `blobToBase64` to `src/services/audio/converter.ts`.
    - [x] Update `src/utils.ts` to re-export.
- [ ] **Step 7: Move Audio Segmenter**
    - [ ] Move `src/smartSegmentation.ts` to `src/services/audio/segmenter.ts`.
    - [ ] Update imports in `src/gemini.ts`.
- [x] **Step 8: Extract Subtitle Parser**
    - [x] Move `parseSrt`, `parseAss`, `extractJsonArray`, `parseGeminiResponse` to `src/services/subtitle/parser.ts`.
    - [x] Update `src/utils.ts` to re-export.
- [x] **Step 9: Extract Subtitle Generator**
    - [x] Move `generateSrtContent`, `generateAssContent` to `src/services/subtitle/generator.ts`.
    - [x] Update `src/utils.ts` to re-export.
    - [ ] `FileUploader.tsx`
    - [ ] `SubtitleEditor.tsx`
    - [ ] `SettingsPanel.tsx`
    - [ ] `ProgressOverlay.tsx`
- [ ] Move `GlossaryManager.tsx` to `src/components/`
- [ ] Update imports

## Phase 5: Custom Hooks
- [ ] Extract logic into hooks:
    - [ ] `useSubtitle.ts`
    - [ ] `useAudio.ts`
    - [ ] `useGlossary.ts`
    - [ ] `useSettings.ts`

## Phase 6: Cleanup and Final Verification
- [ ] Remove unused files
- [ ] Final build check
- [ ] Run all tests (manual)
