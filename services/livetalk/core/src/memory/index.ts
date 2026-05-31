export { cosineSimilarity } from './embedding.js';
export { MemoryRetriever } from './retrieval.js';
export type { IMemoryRetriever, RetrieveOptions, RetrievedMemory, RetrieveResult } from './types.js';
export { detectCorrection } from './correction-detector.js';
export type { CorrectionResult } from './correction-detector.js';
export { identifyPromotionCandidates, identifyNewLearnings } from './confirmation.js';
export { applyCorrection, executePromotion } from './promotion.js';
