import { Type, HarmCategory, HarmBlockThreshold } from "@google/genai";

export const PROOFREAD_BATCH_SIZE = 20; // Default fallback

export const REFINEMENT_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            start: { type: Type.STRING, description: "HH:MM:SS,mmm" },
            end: { type: Type.STRING, description: "HH:MM:SS,mmm" },
            text: { type: Type.STRING, description: "Corrected original text" },
        },
        required: ["start", "end", "text"],
    },
};

export const TRANSLATION_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.INTEGER },
            text_original: { type: Type.STRING },
            text_translated: { type: Type.STRING, description: "Simplified Chinese translation" },
        },
        required: ["id", "text_translated"],
    },
};

export const BATCH_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.INTEGER },
            start: { type: Type.STRING, description: "HH:MM:SS,mmm" },
            end: { type: Type.STRING, description: "HH:MM:SS,mmm" },
            text_original: { type: Type.STRING },
            text_translated: { type: Type.STRING, description: "Simplified Chinese translation" },
        },
        required: ["id", "start", "end", "text_original", "text_translated"],
    },
};

export const GLOSSARY_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            term: { type: Type.STRING, description: "Original term from the audio" },
            translation: { type: Type.STRING, description: "Simplified Chinese translation" },
            notes: { type: Type.STRING, description: "Optional notes for pronunciation or context" },
        },
        required: ["term", "translation"],
    },
};

export const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];
