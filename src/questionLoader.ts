import fs from 'fs';
import path from 'path';
import { Question } from './types';

// Interface for the raw JSON data format from batch files
interface RawQuestion {
    id: string;
    language: string;
    category: string;
    category_label: string;
    text: string;
    difficulty: number;
    active: boolean;
    tarkistettu: boolean;
    answers: {
        idx: number;
        text: string;
        is_correct: boolean;
    }[];
    card_type?: 'normal' | 'extra' | 'classic' | 'holo';
}

export function loadQuestions(): Question[] {
    const dataDir = path.join(__dirname, '../data');
    const questions: Question[] = [];

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
        console.error(`Data directory not found: ${dataDir}`);
        return [];
    }

    // Read all JSON files in the data directory
    // Now including 'questions.json' for manually added/edited questions
    const files = fs.readdirSync(dataDir).filter(file =>
        (file.startsWith('batch_import_') && file.endsWith('.json')) ||
        file === 'questions.json'
    );

    for (const file of files) {
        try {
            const filePath = path.join(dataDir, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            let loadedData = JSON.parse(fileContent);

            // Handle both RawQuestion[] (batch) and Question[] (manual questions.json) structures
            // If it's the manual questions.json, it might already store them as Question objects roughly,
            // or we might strictly stick to one format.
            // Simplified: If it's questions.json, we assume it stores Question[] directly (or close to it)
            // If it's batch*, it's RawQuestion[]

            if (file === 'questions.json') {
                // Assuming questions.json stores Question[] directly
                const manualQuestions: Question[] = loadedData as Question[];
                console.log(`Loading ${manualQuestions.length} manual questions from ${file}...`);
                manualQuestions.forEach(q => {
                    q._sourceFile = file;
                    if (!q.category) q.category = 'Yleistieto';
                    questions.push(q);
                });
            } else {
                const rawQuestions: RawQuestion[] = loadedData as RawQuestion[];
                console.log(`Loading ${rawQuestions.length} questions from ${file}...`);

                for (const rawQ of rawQuestions) {
                    // Skip inactive questions? Keeping them active for now based on user request "jatka"
                    // if (!rawQ.active) continue;

                    // Map answers to options array and find correct index
                    const options: string[] = [];
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
        } catch (error) {
            console.error(`Error loading file ${file}:`, error);
        }
    }

    console.log(`Total loaded questions: ${questions.length}`);
    return questions;
}
