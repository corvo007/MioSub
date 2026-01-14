## ADDED Requirements

### Requirement: BaseStep Abstract Class

The system SHALL provide a `BaseStep` abstract class implementing the Template Method pattern with complete hooks.

#### Scenario: Normal execution with all hooks

- **WHEN** `run()` is called on a step
- **THEN** it executes: checkAbort → checkMockStage → acquireSemaphore → preCheck → preProcess → execute → postProcess → saveArtifact → releaseSemaphore

#### Scenario: PreCheck skip

- **WHEN** `preCheck()` returns false
- **THEN** it skips execution and returns input as output with `skipped: true`

#### Scenario: PostCheck retry

- **WHEN** step has `postCheck` defined and check fails with `retryable: true`
- **THEN** it retries execution up to maxRetries times

#### Scenario: Mock stage skip

- **WHEN** `mockStageIndex > stepIndex`
- **THEN** it skips execution and returns input as output

#### Scenario: Mock API execution

- **WHEN** `mockApi.[stepName]` is enabled
- **THEN** it calls `loadMockData()` instead of execute

#### Scenario: Error with fallback

- **WHEN** `execute()` throws an error and `getFallback` is defined
- **THEN** it returns fallback data with `error` field set

#### Scenario: Semaphore management

- **WHEN** `getSemaphore()` returns a semaphore
- **THEN** it acquires before execution and releases in finally block

### Requirement: TranscriptionStep

The system SHALL provide a `TranscriptionStep` that handles audio transcription.

#### Scenario: Real transcription

- **WHEN** executed with audio buffer and chunk params
- **THEN** it acquires transcriptionSemaphore, calls Whisper API, returns raw segments

#### Scenario: PostProcess cleaning

- **WHEN** transcription completes
- **THEN** it cleans non-speech annotations and filters empty segments via postProcess

### Requirement: WaitForDepsStep

The system SHALL provide a `WaitForDepsStep` that waits for glossary and speaker analysis.

#### Scenario: Wait for glossary

- **WHEN** executed after transcription
- **THEN** it waits for glossary extraction and stores in context

#### Scenario: Wait for speaker profiles

- **WHEN** speaker pre-analysis is enabled
- **THEN** it waits for speaker profile extraction with abort signal support

### Requirement: RefinementStep

The system SHALL provide a `RefinementStep` that handles subtitle refinement.

#### Scenario: Real refinement with postCheck

- **WHEN** executed with raw segments
- **THEN** it acquires refinementSemaphore, calls Gemini API, validates with postCheck

#### Scenario: PostProcess reconciliation

- **WHEN** refinement completes
- **THEN** it reconciles results with original segments via postProcess

#### Scenario: Refinement failure fallback

- **WHEN** Gemini API call fails
- **THEN** it returns input segments via getFallback

### Requirement: AlignmentStep

The system SHALL provide an `AlignmentStep` that handles timestamp alignment.

#### Scenario: PreCheck alignment enabled

- **WHEN** `alignmentMode` is 'none' or undefined
- **THEN** preCheck returns false and step is skipped

#### Scenario: CTC alignment

- **WHEN** `alignmentMode` is 'ctc' and preCheck passes
- **THEN** it acquires alignmentSemaphore, writes temp audio, runs CTC aligner, cleans up

### Requirement: TranslationStep

The system SHALL provide a `TranslationStep` that handles subtitle translation.

#### Scenario: PreCheck has segments

- **WHEN** input segments array is empty
- **THEN** preCheck returns false and step is skipped

#### Scenario: Real translation with postCheck

- **WHEN** executed with aligned segments
- **THEN** it calls Gemini API in batches, validates with postCheck

#### Scenario: PostProcess filtering

- **WHEN** translation completes
- **THEN** it filters out music segments and empty content via postProcess

### Requirement: ChunkProcessor Orchestration

The system SHALL maintain `ChunkProcessor.process()` as a declarative orchestrator.

#### Scenario: Full pipeline

- **WHEN** no skip settings are active
- **THEN** it runs: Transcribe → WaitDeps → Refine → Align → Translate

#### Scenario: Early termination via skipAfter

- **WHEN** `skipAfter` is set to a step name
- **THEN** it stops after that step and returns partial results

#### Scenario: Mock stage with first chunk only

- **WHEN** `mockStage` is set and chunk index > 1
- **THEN** it skips processing and returns empty result

#### Scenario: Timestamp conversion

- **WHEN** all steps complete
- **THEN** it converts chunk-local timestamps to global timestamps
