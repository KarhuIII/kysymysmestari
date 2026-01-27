
export const CATEGORY_COLORS: Record<string, string> = {
    'maantieto': '#4834d4', // Deep Blue
    'kulttuuri': '#e056fd', // Purple
    'tiede': '#6ab04c',     // Green
    'avaruus': '#2d3436',   // Dark / Black
    'biologia': '#badc58',  // Light Green
    'historia': '#b33939',  // Red/Brown
    'urheilu': '#30336b',   // Navy
    'viihde': '#f0932b',    // Orange
    'yleistieto': '#95afc0', // Grey
    'taide': '#be2edd'      // Magenta
};

export const CATEGORY_LABELS: Record<string, string> = {
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

export function getCategoryColor(category: string): string {
    return CATEGORY_COLORS[category.toLowerCase()] || '#95afc0'; // Default to grey
}

export function getCategoryLabel(category: string): string {
    return CATEGORY_LABELS[category.toLowerCase()] || category.charAt(0).toUpperCase() + category.slice(1);
}
