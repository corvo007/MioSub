/**
 * Generic Pipeline Framework
 * 
 * Provides a flexible, reusable system for executing multi-stage AI operations
 * with iteration support, progress tracking, and error handling.
 */

import { logger } from "./utils";

export interface PipelineContext<TData = any> {
    /** Shared data accessible by all stages */
    data: TData;
    /** Audio buffer if applicable */
    audioBuffer?: AudioBuffer;
    /** Cached audio data (base64) for model consumption */
    cachedAudio?: Map<string, string>;
    /** Current iteration number (1-indexed) */
    iteration: number;
    /** Maximum iterations allowed */
    maxIterations: number;
    /** Metadata for tracking */
    metadata: Record<string, any>;
}

export interface StageResult<TOutput> {
    /** Output data from this stage */
    output: TOutput;
    /** Whether this stage completed successfully */
    success: boolean;
    /** Optional error message if failed */
    error?: string;
    /** Stage-specific metadata */
    metadata?: Record<string, any>;
}

export interface PipelineStage<TInput, TOutput, TContext = any> {
    /** Unique name for this stage */
    name: string;
    /** Execute the stage logic */
    execute: (
        input: TInput,
        context: PipelineContext<TContext>
    ) => Promise<StageResult<TOutput>>;
    /** Optional pre-execution validation */
    validate?: (input: TInput, context: PipelineContext<TContext>) => Promise<boolean>;
    /** Optional progress callback */
    onProgress?: (progress: number, message: string) => void;
}

export interface PipelineConfig<TInput, TOutput, TContext = any> {
    /** Pipeline identifier */
    name: string;
    /** Ordered list of stages to execute */
    stages: PipelineStage<any, any, TContext>[];
    /** Maximum iterations for the entire pipeline */
    maxIterations: number;
    /** Function to determine if pipeline should continue iterating */
    shouldContinue: (
        output: TOutput,
        iteration: number,
        context: PipelineContext<TContext>
    ) => Promise<boolean>;
    /** Optional callback when each iteration completes */
    onIterationComplete?: (
        iteration: number,
        output: TOutput,
        context: PipelineContext<TContext>
    ) => Promise<'continue' | 'accept' | 'cancel'>;
    /** Optional callback for overall progress */
    onProgress?: (stage: string, progress: number, message: string) => void;
}

export interface PipelineResult<TOutput> {
    /** Final output from the pipeline */
    output: TOutput;
    /** Number of iterations completed */
    iterations: number;
    /** Whether pipeline completed successfully */
    success: boolean;
    /** Reason for termination */
    terminationReason: 'completed' | 'max_iterations' | 'user_accepted' | 'user_cancelled' | 'error';
    /** Error if failed */
    error?: string;
    /** Execution history */
    history: IterationHistory[];
}

export interface IterationHistory {
    iteration: number;
    stages: {
        name: string;
        success: boolean;
        duration: number;
        metadata?: Record<string, any>;
    }[];
    output: any;
}

/**
 * Execute a pipeline with iteration support
 */
export async function executePipeline<TInput, TOutput, TContext = any>(
    config: PipelineConfig<TInput, TOutput, TContext>,
    initialInput: TInput,
    contextData: TContext
): Promise<PipelineResult<TOutput>> {
    const context: PipelineContext<TContext> = {
        data: contextData,
        iteration: 0,
        maxIterations: config.maxIterations,
        metadata: {},
    };

    logger.info(`Starting pipeline: ${config.name}`, { maxIterations: config.maxIterations });

    const history: IterationHistory[] = [];
    let currentInput = initialInput;
    let lastOutput: TOutput | undefined;

    try {
        // Iteration loop
        for (let iter = 1; iter <= config.maxIterations; iter++) {
            context.iteration = iter;
            const iterationStart = Date.now();
            const iterationHistory: IterationHistory = {
                iteration: iter,
                stages: [],
                output: null,
            };

            config.onProgress?.(`Iteration ${iter}`, 0, `Starting iteration ${iter}/${config.maxIterations}`);
            logger.debug(`Pipeline ${config.name} - Iteration ${iter} started`);

            // Execute stages sequentially
            let stageInput: any = currentInput;
            let allStagesSucceeded = true;

            for (let i = 0; i < config.stages.length; i++) {
                const stage = config.stages[i];
                const stageStart = Date.now();

                config.onProgress?.(
                    stage.name,
                    (i / config.stages.length) * 100,
                    `Executing ${stage.name}...`
                );
                logger.debug(`Executing stage: ${stage.name}`);

                // Optional validation
                if (stage.validate) {
                    const isValid = await stage.validate(stageInput, context);
                    if (!isValid) {
                        iterationHistory.stages.push({
                            name: stage.name,
                            success: false,
                            duration: Date.now() - stageStart,
                            metadata: { error: 'Validation failed' },
                        });
                        allStagesSucceeded = false;
                        logger.warn(`Stage ${stage.name} validation failed`);
                        break;
                    }
                }

                // Execute stage
                try {
                    const result = await stage.execute(stageInput, context);

                    iterationHistory.stages.push({
                        name: stage.name,
                        success: result.success,
                        duration: Date.now() - stageStart,
                        metadata: result.metadata,
                    });

                    if (!result.success) {
                        allStagesSucceeded = false;
                        logger.error(`Stage ${stage.name} failed`, { error: result.error });
                        throw new Error(`Stage ${stage.name} failed: ${result.error}`);
                    }

                    // Output of this stage becomes input for next stage
                    stageInput = result.output;
                } catch (err: any) {
                    iterationHistory.stages.push({
                        name: stage.name,
                        success: false,
                        duration: Date.now() - stageStart,
                        metadata: { error: err.message },
                    });
                    allStagesSucceeded = false;
                    logger.error(`Stage ${stage.name} threw exception`, err);
                    throw err;
                }
            }

            if (!allStagesSucceeded) {
                throw new Error(`Iteration ${iter} failed`);
            }

            // Final output from last stage
            lastOutput = stageInput as TOutput;
            iterationHistory.output = lastOutput;
            history.push(iterationHistory);

            config.onProgress?.(
                `Iteration ${iter}`,
                100,
                `Iteration ${iter} completed in ${((Date.now() - iterationStart) / 1000).toFixed(1)}s`
            );
            logger.info(`Pipeline ${config.name} - Iteration ${iter} completed`, { duration: Date.now() - iterationStart });

            // Check if we should continue
            const shouldContinue = await config.shouldContinue(lastOutput, iter, context);

            if (!shouldContinue) {
                return {
                    output: lastOutput,
                    iterations: iter,
                    success: true,
                    terminationReason: 'completed',
                    history,
                };
            }

            // Ask user if they want to continue
            if (config.onIterationComplete) {
                const userDecision = await config.onIterationComplete(iter, lastOutput, context);

                if (userDecision === 'accept') {
                    return {
                        output: lastOutput,
                        iterations: iter,
                        success: true,
                        terminationReason: 'user_accepted',
                        history,
                    };
                } else if (userDecision === 'cancel') {
                    throw new Error('Pipeline cancelled by user');
                }
                // 'continue' falls through to next iteration
            }

            // Prepare for next iteration
            currentInput = lastOutput as any;
        }

        // Reached max iterations
        return {
            output: lastOutput!,
            iterations: config.maxIterations,
            success: true,
            terminationReason: 'max_iterations',
            history,
        };
    } catch (err: any) {
        return {
            output: lastOutput as any,
            iterations: context.iteration,
            success: false,
            terminationReason: err.message.includes('cancelled') ? 'user_cancelled' : 'error',
            error: err.message,
            history,
        };
    }
}

/**
 * Helper to create a simple stage
 */
export function createStage<TInput, TOutput, TContext = any>(
    name: string,
    executeFn: (
        input: TInput,
        context: PipelineContext<TContext>
    ) => Promise<TOutput>
): PipelineStage<TInput, TOutput, TContext> {
    return {
        name,
        execute: async (input, context) => {
            try {
                const output = await executeFn(input, context);
                return { output, success: true };
            } catch (err: any) {
                logger.error(`Stage ${name} execution error`, err);
                return { output: null as any, success: false, error: err.message };
            }
        },
    };
}
