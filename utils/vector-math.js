export function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Function to find if there's any vector in the store within a similarity threshold
export function checkKNNThreshold(embedding, vectorStore, threshold = 0.85) {
    if (!vectorStore || vectorStore.length === 0) return false;
    for (const stored of vectorStore) {
        if (cosineSimilarity(embedding, stored.vector) >= threshold) {
            return true; // Match found (False positive previously flagged)
        }
    }
    return false;
}
