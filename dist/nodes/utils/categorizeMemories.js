"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeMemories = void 0;
function categorizeMemories(episodicMemories, historyCount = 5, shortTermCount = 10) {
    const history = episodicMemories.slice(0, historyCount);
    const shortTermMemory = episodicMemories.slice(historyCount, historyCount + shortTermCount);
    const longTermMemory = episodicMemories.slice(historyCount + shortTermCount);
    return {
        history,
        shortTermMemory,
        longTermMemory,
    };
}
exports.categorizeMemories = categorizeMemories;
//# sourceMappingURL=categorizeMemories.js.map