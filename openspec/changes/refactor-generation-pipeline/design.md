## Context

`ChunkProcessor.process()` 是 830 行的 God Function，每步重复相同模式：

- Start Progress → Acquire Semaphore → Check Cancel → Execute → Save Artifact → Handle Error

**现有 Pre/Post 处理模式：**

- Transcription: `cleanNonSpeechAnnotations` + filter (后处理)
- Refinement: `withPostCheck` + `createRefinementPostProcessor` + `reconcile` (后处理+验证+重试)
- Translation: `withPostCheck` + `createTranslationPostProcessor` + filter (后处理+验证)

**需要支持的横切关注点：**

1. Semaphore 管理 (不同步骤使用不同信号量)
2. Progress 报告 (不同阶段有不同消息)
3. Abort signal 检查
4. Mock stage 逻辑 (mockStageIndex 比较)
5. Mock API 逻辑 (mockApi.transcribe/refinement/alignment/translation)
6. skipAfter 逻辑
7. Artifact 保存
8. 时间戳转换 (chunk-local → global)
9. 错误回退

## Goals / Non-Goals

- Goals:
  - 引入 Template Method Pattern 统一步骤抽象
  - 支持完整的 preCheck/preProcess/postProcess/postCheck 钩子
  - Mock 逻辑集中到 BaseStep
  - 保持所有现有功能，无 breaking change
- Non-Goals:
  - 改变处理算法
  - 添加新功能

## Decisions

### 1. BaseStep 抽象基类 (Template Method + 完整钩子)

```typescript
type StepName = 'transcribe' | 'waitDeps' | 'refinement' | 'alignment' | 'translation';

abstract class BaseStep<TInput, TOutput> {
  abstract name: StepName;
  abstract stageKey: string; // For progress reporting: 'transcribing', 'refining', etc.

  // ===== 核心执行逻辑 (子类必须实现) =====
  abstract execute(input: TInput, ctx: StepContext): Promise<TOutput>;

  // ===== 完整钩子系统 (子类可覆盖) =====
  // Pre-execution hooks
  protected preCheck?(input: TInput, ctx: StepContext): boolean | Promise<boolean>; // 返回 false 跳过执行
  protected preProcess?(input: TInput, ctx: StepContext): TInput | Promise<TInput>;

  // Post-execution hooks
  protected postProcess?(output: TOutput, ctx: StepContext): TOutput | Promise<TOutput>;
  protected postCheck?(
    output: TOutput,
    isFinalAttempt: boolean,
    ctx: StepContext
  ): PostCheckResult | Promise<PostCheckResult>;

  // Mock/Artifact hooks
  protected loadMockData?(ctx: StepContext): TOutput | Promise<TOutput>;
  protected saveArtifact?(result: TOutput, ctx: StepContext): void | Promise<void>;

  // Error handling
  protected getFallback?(input: TInput, error: Error, ctx: StepContext): TOutput;

  // Semaphore (子类可覆盖指定使用哪个信号量)
  protected getSemaphore?(ctx: StepContext): Semaphore | null;

  // ===== Template Method =====
  async run(input: TInput, ctx: StepContext): Promise<StepResult<TOutput>> {
    // 1. Check abort signal
    if (ctx.signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // 2. Check if should skip (mockStage logic)
    if (this.shouldSkipByMockStage(ctx)) {
      return { output: input as unknown as TOutput, skipped: true };
    }

    // 3. Report progress: waiting
    ctx.reportProgress(this.name, this.stageKey, 'waiting');

    // 4. Acquire semaphore if defined
    const semaphore = this.getSemaphore?.(ctx);
    if (semaphore) await semaphore.acquire();

    try {
      // 5. Check abort again after acquiring semaphore
      if (ctx.signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      // 6. Report progress: processing
      ctx.reportProgress(this.name, this.stageKey, 'processing');

      // 7. PreCheck - can skip execution
      if (this.preCheck) {
        const shouldProceed = await this.preCheck(input, ctx);
        if (!shouldProceed) {
          return { output: input as unknown as TOutput, skipped: true };
        }
      }

      // 8. Check mockApi flag
      if (this.shouldUseMockApi(ctx)) {
        const mockResult = await this.loadMockData?.(ctx);
        if (mockResult !== undefined) {
          await this.saveArtifact?.(mockResult, ctx);
          return { output: mockResult, mocked: true };
        }
      }

      // 9. PreProcess
      const processedInput = this.preProcess ? await this.preProcess(input, ctx) : input;

      // 10. Execute with optional retry (if postCheck defined)
      let result: TOutput;
      if (this.postCheck) {
        result = await this.executeWithRetry(processedInput, ctx);
      } else {
        result = await this.execute(processedInput, ctx);
      }

      // 11. PostProcess
      const finalResult = this.postProcess ? await this.postProcess(result, ctx) : result;

      // 12. Save artifact
      await this.saveArtifact?.(finalResult, ctx);

      return { output: finalResult };
    } catch (e) {
      // 13. Error handling with fallback
      if (this.getFallback) {
        const fallback = this.getFallback(input, e as Error, ctx);
        await this.saveArtifact?.(fallback, ctx);
        return { output: fallback, error: e as Error };
      }
      throw e;
    } finally {
      // 14. Release semaphore
      if (semaphore) semaphore.release();
    }
  }

  // ===== Helper Methods =====
  protected shouldSkipByMockStage(ctx: StepContext): boolean {
    const mockStageIndex = ctx.getMockStageIndex();
    const myIndex = this.getStepIndex();
    return mockStageIndex >= 0 && mockStageIndex > myIndex;
  }

  protected shouldUseMockApi(ctx: StepContext): boolean {
    return ctx.settings.debug?.mockApi?.[this.name] === true;
  }

  protected getStepIndex(): number {
    const order = ['transcribe', 'refinement', 'alignment', 'translation'];
    return order.indexOf(this.name);
  }

  private async executeWithRetry(
    input: TInput,
    ctx: StepContext,
    maxRetries = 1
  ): Promise<TOutput> {
    // Integrates with withPostCheck from postCheck.ts
  }
}
```

### 2. StepResult 类型

```typescript
interface StepResult<T> {
  output: T;
  skipped?: boolean; // 被 preCheck 或 mockStage 跳过
  mocked?: boolean; // 使用了 mock 数据
  error?: Error; // 发生错误但有 fallback
}
```

### 3. StepContext 共享状态

```typescript
interface StepContext {
  // Chunk info
  chunk: ChunkParams;
  chunkDuration: number;
  totalChunks: number;

  // Settings & Dependencies
  settings: AppSettings;
  deps: ChunkDependencies;

  // Abort signal
  signal?: AbortSignal;

  // Progress reporting
  reportProgress(
    step: StepName,
    stage: string,
    status: 'waiting' | 'processing' | 'completed'
  ): void;

  // Mock helpers
  getMockStageIndex(): number;
  shouldSkipAfter(step: StepName): boolean;

  // Shared state (for passing data between steps)
  glossary?: GlossaryItem[];
  speakerProfiles?: SpeakerProfile[];
  base64Audio?: string; // Cached for reuse
}
```

### 4. 各步骤的钩子使用

| Step              | preCheck              | preProcess | postProcess               | postCheck                      | getSemaphore                 |
| ----------------- | --------------------- | ---------- | ------------------------- | ------------------------------ | ---------------------------- |
| TranscriptionStep | -                     | -          | cleanAnnotations + filter | -                              | transcriptionSemaphore       |
| WaitForDepsStep   | -                     | -          | -                         | -                              | -                            |
| RefinementStep    | -                     | -          | reconcile                 | createRefinementPostProcessor  | refinementSemaphore          |
| AlignmentStep     | checkAlignmentEnabled | -          | -                         | -                              | alignmentSemaphore           |
| TranslationStep   | checkHasSegments      | -          | filterMusicSegments       | createTranslationPostProcessor | - (uses refinementSemaphore) |

### 5. 代码提取映射

| Step              | Source Lines | Description                               |
| ----------------- | ------------ | ----------------------------------------- |
| TranscriptionStep | 120-224      | Whisper API, semaphore, clean annotations |
| WaitForDepsStep   | 225-274      | Glossary/Speaker waiting                  |
| RefinementStep    | 276-445      | Gemini API, reconcile, post-check         |
| AlignmentStep     | 447-605      | CTC/Gemini alignment, temp file           |
| TranslationStep   | 607-791      | Batch translation, result mapping         |

### 6. 时间戳转换

时间戳转换 (chunk-local → global) 在 ChunkProcessor 编排层处理，不在 Step 内部：

```typescript
// ChunkProcessor.process()
const result = await transcribeStep.run(input, ctx);
// Convert to global timestamps at the end
const globalResult = convertToGlobalTimestamps(result.output, chunk.start);
```

## Breaking Change Analysis

| 现有功能                  | BaseStep 支持               | 风险 |
| ------------------------- | --------------------------- | ---- |
| Semaphore acquire/release | ✅ getSemaphore() + finally | 无   |
| Progress reporting        | ✅ reportProgress()         | 无   |
| Abort signal              | ✅ signal check             | 无   |
| mockStage skip            | ✅ shouldSkipByMockStage()  | 无   |
| mockApi                   | ✅ shouldUseMockApi()       | 无   |
| skipAfter                 | ✅ 在 ChunkProcessor 编排层 | 无   |
| Artifact saving           | ✅ saveArtifact()           | 无   |
| Timestamp conversion      | ✅ 在编排层处理             | 无   |
| Error fallback            | ✅ getFallback()            | 无   |
| postCheck retry           | ✅ executeWithRetry()       | 无   |

**结论：无 breaking change**

## Risks / Trade-offs

- **Risk**: 抽象引入 bug → Mitigation: 逐步迁移，每步验证
- **Risk**: Mock/Resume 逻辑复杂 → Mitigation: 详细测试 mockStage 场景
- **Trade-off**: 更多文件 vs 更好组织 → Accepted

## Migration Plan

1. 创建 `core/` 目录，实现 BaseStep 和 types
2. 逐个创建 Step 实现，从 chunkProcessor 提取逻辑
3. 更新 chunkProcessor 使用新 Step
4. 每步完成后验证功能

## Dependency Analysis

### 外部依赖（公开 API，不能改变）

| 导出                                            | 使用者                                             | 影响               |
| ----------------------------------------------- | -------------------------------------------------- | ------------------ |
| `generateSubtitles` (index.ts)                  | useEndToEndSubtitleGeneration.ts, useGeneration.ts | 公开 API，签名不变 |
| `translateBatch` (translation.ts)               | batch/operations.ts                                | 共享模块，保持不变 |
| `UsageReporter` (usageReporter.ts)              | batch/operations.ts                                | 共享模块，保持不变 |
| `adjustTimestampOffset` (resultTransformers.ts) | batch/operations.ts                                | 共享模块，保持不变 |

### 内部依赖（可以重构）

| 模块                | 依赖                                                      | 重构影响     |
| ------------------- | --------------------------------------------------------- | ------------ |
| `chunkProcessor.ts` | translation.ts, postProcessors.ts, preprocessor.ts        | 主要重构目标 |
| `index.ts`          | chunkProcessor.ts, glossaryHandler.ts, speakerAnalyzer.ts | 更新 import  |

### 保持不变的模块

- `translation.ts` - 被 batch/operations.ts 使用
- `postProcessors.ts` - 被 translation.ts 使用
- `usageReporter.ts` - 被 batch/operations.ts 使用
- `resultTransformers.ts` - 被 batch/operations.ts 使用
- `preprocessor.ts` - 导出 ChunkParams 类型
- `glossaryHandler.ts` - 被 index.ts 使用
- `speakerAnalyzer.ts` - 被 index.ts 使用

### 重构范围

只重构 `chunkProcessor.ts`，其他模块保持不变。新增：

- `core/BaseStep.ts`
- `core/types.ts`
- `steps/TranscriptionStep.ts`
- `steps/WaitForDepsStep.ts`
- `steps/RefinementStep.ts`
- `steps/AlignmentStep.ts`
- `steps/TranslationStep.ts`
- `steps/index.ts`

## Verification Plan

1. **Full Flow**: 完整生成流程 (Transcription → Translation)
2. **Mock Mode**: 测试 `mockStage='alignment'` 和 `mockStage='translation'`
3. **Cancellation**: 验证 abort signal 在各步骤中工作
4. **skipAfter**: 测试各阶段的提前终止
5. **PostCheck**: 验证 Refinement/Translation 的重试逻辑
6. **Semaphore**: 验证并发控制正常工作
7. **Batch Operations**: 验证 batch/operations.ts 仍然正常工作
