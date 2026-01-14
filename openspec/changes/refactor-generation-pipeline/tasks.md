## 1. Core Infrastructure

- [ ] 1.1 Create `core/types.ts` - StepName, StepContext, StepResult types
- [ ] 1.2 Create `core/BaseStep.ts` - Abstract base class with Template Method
- [ ] 1.3 Create `core/PipelineRunner.ts` - Step execution and chaining

## 2. Extract Steps

- [ ] 2.1 Create `steps/TranscriptionStep.ts` - lines 120-224
- [ ] 2.2 Create `steps/WaitForDepsStep.ts` - lines 225-274 (Glossary/Speaker waiting)
- [ ] 2.3 Create `steps/RefinementStep.ts` - lines 276-445
- [ ] 2.4 Create `steps/AlignmentStep.ts` - lines 447-605
- [ ] 2.5 Create `steps/TranslationStep.ts` - lines 607-791
- [ ] 2.6 Create `steps/index.ts` - re-export all steps

## 3. Refactor ChunkProcessor

- [ ] 3.1 Update `chunkProcessor.ts` to use BaseStep and PipelineRunner
- [ ] 3.2 Remove extracted logic, keep only orchestration (~50 lines)
- [ ] 3.3 Ensure ChunkResult interface unchanged

## 4. Verification (Manual)

- [ ] 4.1 Full Flow: Transcription → Refinement → Alignment → Translation
- [ ] 4.2 Mock Mode: Test `mockStage='alignment'` (skip Transcribe/Refine)
- [ ] 4.3 Mock Mode: Test `mockStage='translation'` (load Alignment artifact)
- [ ] 4.4 Mock API: Test individual `mockApi.transcribe/refinement/alignment/translation`
- [ ] 4.5 skipAfter: Test `skipAfter='transcribe'`, `'refinement'`, `'alignment'`
- [ ] 4.6 Cancellation: Verify abort signal works during heavy steps
- [ ] 4.7 Artifact Saving: Verify intermediate artifacts are saved correctly
- [ ] 4.8 Batch Operations: Verify `batch/operations.ts` still works (uses translateBatch, UsageReporter, adjustTimestampOffset)
