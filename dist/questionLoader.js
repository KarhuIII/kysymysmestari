"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadQuestions = loadQuestions;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function loadQuestions() {
    const dataDir = path_1.default.join(__dirname, '../data');
    const questions = [];
    // Ensure data directory exists
    if (!fs_1.default.existsSync(dataDir)) {
        console.error(`Data directory not found: ${dataDir}`);
        return [];
    }
    // Read all JSON files in the data directory
    // Now including 'questions.json' for manually added/edited questions
    const files = fs_1.default.readdirSync(dataDir).filter(file => (file.startsWith('batch_import_') && file.endsWith('.json')) ||
        file === 'questions.json');
    for (const file of files) {
        try {
            const filePath = path_1.default.join(dataDir, file);
            const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
            let loadedData = JSON.parse(fileContent);
            // Handle both RawQuestion[] (batch) and Question[] (manual questions.json) structures
            // If it's the manual questions.json, it might already store them as Question objects roughly,
            // or we might strictly stick to one format.
            // Simplified: If it's questions.json, we assume it stores Question[] directly (or close to it)
            // If it's batch*, it's RawQuestion[]
            if (file === 'questions.json') {
                // Assuming questions.json stores Question[] directly
                const manualQuestions = loadedData;
                console.log(`Loading ${manualQuestions.length} manual questions from ${file}...`);
                manualQuestions.forEach(q => {
                    q._sourceFile = file;
                    if (!q.category)
                        q.category = 'Yleistieto';
                    questions.push(q);
                });
            }
            else {
                const rawQuestions = loadedData;
                console.log(`Loading ${rawQuestions.length} questions from ${file}...`);
                for (const rawQ of rawQuestions) {
                    // Skip inactive questions? Keeping them active for now based on user request "jatka"
                    // if (!rawQ.active) continue;
                    // Map answers to options array and find correct index
                    const options = [];
                    let correctIndex = -1;
                    // Sort answers by idx just in case
                    const sortedAnswers = rawQ.answers.sort((a, b) => a.idx - b.idx);
                    sortedAnswers.forEach((ans, index) => {
                        options.push(ans.text);
                        if (ans.is_correct) {
                            correctIndex = index;
                        }
                    });
                    if (correctIndex === -1) {
                        console.warn(`Warning: Question ${rawQ.id} has no correct answer defined. Skipping.`);
                        continue;
                    }
                    questions.push({
                        id: rawQ.id,
                        question: rawQ.text,
                        options: options,
                        correctIndex: correctIndex,
                        difficulty: rawQ.difficulty,
                        category: rawQ.category_label || 'Yleistieto', // Use label as the primary category identifier
                        cardType: rawQ.card_type,
                        _sourceFile: file // Track source
                    });
                }
            }
        }
        catch (error) {
            console.error(`Error loading file ${file}:`, error);
        }
    }
    console.log(`Total loaded questions: ${questions.length}`);
    return questions;
}
