# Change: Refactor ChunkProcessor with Pipeline Pattern

## Problem Analysis

`ChunkProcessor.ts` 存在以下架构问题：

1. **Monolithic "God Class"** - 800+ 行代码，职责过多
2. **High Mocking Logic Intrusion** - Mock 逻辑与业务逻辑深度耦合，遮蔽 Happy Path
3. **Rigid Control Flow** - 流程硬编码，无法复用单个步骤
4. **Duplicated Boilerplate** - 每步重复相同模式：Progress → Semaphore → Cancel → Execute → Artifact → Error

## Goal

采用 **Pipeline Pattern** 重构，分离：

- **What** (Pipeline Orchestration)
- **How** (Individual Steps)
- **Cross-Cutting Concerns** (Mocking, Logging, Artifacts)

## Architecture Design

### 1. BaseStep 抽象基类 (Template Method Pattern)

```typescript
abstract class BaseStep<TInput, TOutput> {
  abstract name: StepName;
  abstract execute(input: TInput, ctx: StepContext): Promise<TOutput>;

  // Template Method: Check Mock → Run/Load → Save Artifact
  async run(input: TInput, ctx: StepContext): Promise<TOutput> {
    if (this.shouldMock(ctx)) return this.loadMockData(ctx);
    const result = await this.execute(input, ctx);
    await this.saveArtifact(result, ctx);
    return result;
  }
}
```

### 2. Concrete Steps

- `TranscriptionStep` - Whisper API 调用
- `WaitForDepsStep` - 等待 Glossary/Speaker 分析
- `RefinementStep` - Gemini 精炼 + 后处理验证
- `AlignmentStep` - CTC 对齐 + 临时文件管理
- `TranslationStep` - 翻译 + 回退处理

### 3. ChunkProcessor (Orchestrator)

```typescript
const steps = [
  new TranscriptionStep(context),
  new WaitForDepsStep(context),
  new RefinementStep(context),
  new AlignmentStep(context),
  new TranslationStep(context),
];
return runPipeline(steps, initialInput);
```

## Directory Structure

```
src/services/generation/pipeline/
├── core/
│   ├── BaseStep.ts         # 抽象基类 (Template Method)
│   ├── PipelineRunner.ts   # 步骤执行器
│   └── types.ts            # 共享类型
├── steps/
│   ├── TranscriptionStep.ts
│   ├── WaitForDepsStep.ts
│   ├── RefinementStep.ts
│   ├── AlignmentStep.ts
│   ├── TranslationStep.ts
│   └── index.ts
└── chunkProcessor.ts       # 简化为步骤编排
```

## Impact

- Affected specs: `chunk-processing` (new capability spec)
- Affected code:
  - `chunkProcessor.ts` lines 60-830 → 拆分到 5 个 Step 文件
  - 新增 `core/` 和 `steps/` 目录
