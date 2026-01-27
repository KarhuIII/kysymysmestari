"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_LABELS = exports.CATEGORY_COLORS = void 0;
exports.getCategoryColor = getCategoryColor;
exports.getCategoryLabel = getCategoryLabel;
exports.CATEGORY_COLORS = {
    'maantieto': '#4834d4', // Deep Blue
    'kulttuuri': '#e056fd', // Purple
    'tiede': '#6ab04c', // Green
    'avaruus': '#2d3436', // Dark / Black
    'biologia': '#badc58', // Light Green
    'historia': '#b33939', // Red/Brown
    'urheilu': '#30336b', // Navy
    'viihde': '#f0932b', // Orange
    'yleistieto': '#95afc0', // Grey
    'taide': '#be2edd' // Magenta
};
exports.CATEGORY_LABELS = {
    'maantieto': 'Maantieto',
    'kulttuuri': 'Kulttuuri',
    'tiede': 'Tiede',
    'avaruus': 'Avaruus',
    'biologia': 'Biologia',
    'historia': 'Historia',
    'urheilu': 'Urheilu',
    'viihde': 'Viihde',
    'yleistieto': 'Yleistieto',
    'taide': 'Taide'
};
function getCategoryColor(category) {
    return exports.CATEGORY_COLORS[category.toLowerCase()] || '#95afc0'; // Default to grey
}
function getCategoryLabel(category) {
    return exports.CATEGORY_LABELS[category.toLowerCase()] || category.charAt(0).toUpperCase() + category.slice(1);
}
