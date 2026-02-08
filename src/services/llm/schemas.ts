import { Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { toLanguageName } from '@/services/utils/language';

export const PROOFREAD_BATCH_SIZE = 20; // Default fallback

export const REFINEMENT_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      end: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      text: { type: Type.STRING, description: 'Corrected original text' },
    },
    required: ['start', 'end', 'text'],
  },
};

export const REFINEMENT_WITH_DIARIZATION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      end: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      text: { type: Type.STRING, description: 'Corrected original text' },
      speaker: { type: Type.STRING, description: "Speaker identifier (e.g., 'Speaker 1')" },
    },
    required: ['start', 'end', 'text', 'speaker'],
  },
};

export const createTranslationSchema = (targetLanguage?: string) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      text_original: { type: Type.STRING },
      text_translated: {
        type: Type.STRING,
        description: `${toLanguageName(targetLanguage || 'zh-CN')} translation`,
      },
    },
    required: ['id', 'text_original', 'text_translated'],
  },
});

export const createTranslationWithDiarizationSchema = (targetLanguage?: string) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      text_original: { type: Type.STRING },
      text_translated: {
        type: Type.STRING,
        description: `${toLanguageName(targetLanguage || 'zh-CN')} translation`,
      },
      speaker: { type: Type.STRING, description: 'Speaker identifier' },
    },
    required: ['id', 'text_original', 'text_translated', 'speaker'],
  },
});

export const createBatchSchema = (targetLanguage?: string) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      start: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      end: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      text_original: { type: Type.STRING },
      text_translated: {
        type: Type.STRING,
        description: `${toLanguageName(targetLanguage || 'zh-CN')} translation`,
      },
    },
    required: ['id', 'start', 'end', 'text_original', 'text_translated'],
  },
});

export const createBatchWithDiarizationSchema = (targetLanguage?: string) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      start: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      end: { type: Type.STRING, description: 'HH:MM:SS,mmm' },
      text_original: { type: Type.STRING },
      text_translated: {
        type: Type.STRING,
        description: `${toLanguageName(targetLanguage || 'zh-CN')} translation`,
      },
      speaker: {
        type: Type.STRING,
        description: "Speaker identifier (e.g., 'Speaker 1', 'Speaker 2').",
      },
    },
    required: ['id', 'start', 'end', 'text_original', 'text_translated', 'speaker'],
  },
});

export const createGlossarySchema = (targetLanguage?: string) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      term: { type: Type.STRING, description: 'Original term from the audio' },
      translation: {
        type: Type.STRING,
        description: `${toLanguageName(targetLanguage || 'zh-CN')} translation`,
      },
      notes: { type: Type.STRING, description: 'Optional notes for pronunciation or context' },
    },
    required: ['term', 'translation'],
  },
});

export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const SPEAKER_PROFILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    speakerCount: { type: Type.INTEGER },
    profiles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          characteristics: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, nullable: true },
              gender: { type: Type.STRING, enum: ['male', 'female', 'unknown'] },
              pitch: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
              speed: { type: Type.STRING, enum: ['slow', 'normal', 'fast'] },
              accent: { type: Type.STRING },
              tone: { type: Type.STRING },
            },
            required: ['gender', 'pitch', 'speed', 'accent', 'tone'],
          },
          inferredIdentity: { type: Type.STRING, nullable: true },
          speakingStyle: {
            type: Type.OBJECT,
            properties: {
              formality: { type: Type.STRING, enum: ['formal', 'casual', 'mixed'], nullable: true },
              vocabulary: { type: Type.STRING, nullable: true },
              sentenceStructure: { type: Type.STRING, nullable: true },
            },
            nullable: true,
          },
          emotionalTone: { type: Type.STRING, nullable: true },
          catchphrases: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            nullable: true,
          },
          speakingContext: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            nullable: true,
          },
          sampleQuotes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          confidence: { type: Type.NUMBER },
        },
        required: ['id', 'characteristics', 'sampleQuotes', 'confidence'],
      },
    },
  },
  required: ['speakerCount', 'profiles'],
};
