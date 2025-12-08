import { useState, useCallback } from 'react';
import {
  GlossaryItem,
  GlossaryExtractionResult,
  GlossaryExtractionMetadata,
} from '@/types/glossary';

/**
 * Custom hook for managing glossary extraction workflow
 * Handles confirmation dialogs and retry logic for glossary extraction
 */
export const useGlossaryFlow = () => {
  const [showGlossaryConfirmation, setShowGlossaryConfirmation] = useState(false);
  const [showGlossaryFailure, setShowGlossaryFailure] = useState(false);
  const [pendingGlossaryResults, setPendingGlossaryResults] = useState<GlossaryExtractionResult[]>(
    []
  );
  const [glossaryMetadata, setGlossaryMetadata] = useState<GlossaryExtractionMetadata | null>(null);
  const [glossaryConfirmCallback, setGlossaryConfirmCallback] = useState<
    ((glossary: GlossaryItem[]) => void) | null
  >(null);
  const [isGeneratingGlossary, setIsGeneratingGlossary] = useState(false);

  const setupGlossaryConfirmation = useCallback(
    (metadata: GlossaryExtractionMetadata, callback: (glossary: GlossaryItem[]) => void) => {
      setGlossaryMetadata(metadata);
      setGlossaryConfirmCallback(() => callback);

      if (metadata.totalTerms > 0) {
        setPendingGlossaryResults(metadata.results);
        setShowGlossaryConfirmation(true);
      } else if (metadata.hasFailures) {
        setShowGlossaryFailure(true);
      }
    },
    []
  );

  const confirmGlossary = useCallback(
    (items: GlossaryItem[]) => {
      if (glossaryConfirmCallback) {
        glossaryConfirmCallback(items);
      }

      // Cleanup state
      setShowGlossaryConfirmation(false);
      setShowGlossaryFailure(false);
      setPendingGlossaryResults([]);
      setGlossaryMetadata(null);
      setGlossaryConfirmCallback(null);
    },
    [glossaryConfirmCallback]
  );

  const updateMetadata = useCallback((metadata: GlossaryExtractionMetadata) => {
    setGlossaryMetadata(metadata);
  }, []);

  return {
    showGlossaryConfirmation,
    setShowGlossaryConfirmation,
    showGlossaryFailure,
    setShowGlossaryFailure,
    pendingGlossaryResults,
    setPendingGlossaryResults,
    glossaryMetadata,
    setGlossaryMetadata: updateMetadata,
    glossaryConfirmCallback,
    setGlossaryConfirmCallback,
    isGeneratingGlossary,
    setIsGeneratingGlossary,
    setupGlossaryConfirmation,
    confirmGlossary,
  };
};
