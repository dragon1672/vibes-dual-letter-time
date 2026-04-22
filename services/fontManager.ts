
import { FontLibrary, FontVariant } from '../types';
import { BASE_URL, RAW_FONT_PATHS } from '../font_constants';
import { FALLBACK_FONT_URLS } from '../constants';

// --- Font Library Logic ---

export const getFontLibrary = (): FontLibrary => {
    const library: FontLibrary = {};

    RAW_FONT_PATHS.forEach(path => {
        const filename = path.split('/').pop() || "";
        let namePart = filename.replace(/\.ttf$/, "");
        const isVariable = namePart.includes("[");
        namePart = namePart.replace(/\[.*?\]/, ""); 

        const parts = namePart.split('-');
        let family = parts[0];
        let variant = parts.length > 1 ? parts.slice(1).join(' ') : "Regular";

        if (isVariable && variant === "Regular") variant = "Variable";
        if (isVariable && variant !== "Variable") variant = `${variant} (Variable)`;

        family = family.replace(/([a-z])([A-Z])/g, '$1 $2');
        variant = variant.replace(/([a-z])([A-Z])/g, '$1 $2');

        if (!library[family]) library[family] = [];
        library[family].push({
            name: variant,
            url: `${BASE_URL}/${path}`
        });
    });

    const sortedLibrary: FontLibrary = {};
    Object.keys(library).sort().forEach(key => {
        const variants = library[key].sort((a, b) => {
             const getScore = (name: string) => {
                 if (name.includes('Regular') || name.includes('Variable')) return -1;
                 if (name.includes('Bold')) return 0;
                 return 1;
             };
             const scoreA = getScore(a.name);
             const scoreB = getScore(b.name);
             if (scoreA !== scoreB) return scoreA - scoreB;
             return a.name.localeCompare(b.name);
        });
        sortedLibrary[key] = variants;
    });

    return sortedLibrary;
};


// --- Font Loading & Caching Logic (OpenType) ---

// Global cache to prevent reloading same fonts
const loadedFonts = new Set<string>();
const loadingFonts = new Map<string, Promise<void>>();
const parsedFonts = new Map<string, any>(); 
const glyphCheckCache = new Map<string, string>();

let fallbackInitPromise: Promise<void> | null = null;
const fallbackOpentypeFonts: any[] = [];
const fallbackFontFamilyNames: string[] = [];

// Initialize fallback fonts (Symbols, CJK, etc.)
export const initFallbackFonts = () => {
    if (fallbackInitPromise) return fallbackInitPromise;

    fallbackInitPromise = (async () => {
        // @ts-ignore
        if (!window.opentype) return;

        const promises = FALLBACK_FONT_URLS.map(async (url, index) => {
            try {
                const name = `GlobalFallback_${index}`;
                const res = await fetch(url);
                const buffer = await res.arrayBuffer();
                
                // CSS Font Face
                const fontFace = new FontFace(name, buffer);
                await fontFace.load();
                document.fonts.add(fontFace);
                
                // OpenType Parse
                // @ts-ignore
                const otFont = window.opentype.parse(buffer);
                
                return { name, otFont };
            } catch (e) {
                console.warn("Failed to load fallback font", url, e);
                return null;
            }
        });

        const results = await Promise.all(promises);
        results.forEach(res => {
            if (res) {
                fallbackFontFamilyNames.push(res.name);
                fallbackOpentypeFonts.push(res.otFont);
            }
        });
    })();
    return fallbackInitPromise;
};

// Helper to check glyphs against a parsed font AND fallbacks
export const checkGlyphs = (otFont: any, text: string): string => {
    try {
        const uniqueChars = Array.from(new Set([...text]));
        const missing = new Set();
        
        uniqueChars.forEach(char => {
            let found = false;

            // 1. Check Primary Font
            if (otFont) {
                const glyph = otFont.charToGlyph(char);
                if (glyph.index !== 0 && glyph.name !== '.notdef') {
                    found = true;
                }
            }

            // 2. Check Fallbacks (if not in primary)
            if (!found) {
                for (const fbFont of fallbackOpentypeFonts) {
                    const glyph = fbFont.charToGlyph(char);
                    if (glyph.index !== 0 && glyph.name !== '.notdef') {
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                missing.add(char);
            }
        });

        return text.split('').map(c => missing.has(c) ? '?' : c).join('');
    } catch (e) {
        return text;
    }
};

export const getFallbackFontFamilies = () => fallbackFontFamilyNames;

export interface FontLoadResult {
    isLoaded: boolean;
    validatedText: string;
}

// Logic to load a font for preview purposes (fetch + opentype)
export const loadPreviewFont = async (
    url: string, 
    fontName: string, 
    previewText: string
): Promise<string> => {
    const cacheKey = `${fontName}::${previewText}`;

    // Return cached text if available
    if (glyphCheckCache.has(cacheKey)) {
        return glyphCheckCache.get(cacheKey)!;
    }

    // Ensure fallbacks are initializing/loaded
    if (!fallbackInitPromise) initFallbackFonts();
    await fallbackInitPromise;

    // Load if not loaded
    if (!loadingFonts.has(fontName)) {
        const loadTask = async () => {
            try {
                const response = await fetch(url);
                const buffer = await response.arrayBuffer();
                
                // 1. Register for CSS usage
                const font = new FontFace(fontName, buffer);
                await font.load();
                document.fonts.add(font);
                loadedFonts.add(fontName);

                // 2. Parse with OpenType to check glyphs
                // @ts-ignore
                if (window.opentype) {
                    // @ts-ignore
                    const otFont = window.opentype.parse(buffer);
                    parsedFonts.set(fontName, otFont);
                }
            } catch (e) {
                console.warn(`Failed to load preview font ${fontName}`, e);
            }
        };
        loadingFonts.set(fontName, loadTask());
    }

    await loadingFonts.get(fontName);

    // Perform Glyph Check
    if (parsedFonts.has(fontName)) {
        const checked = checkGlyphs(parsedFonts.get(fontName), previewText);
        glyphCheckCache.set(cacheKey, checked);
        return checked;
    }

    return previewText;
};

export const isFontLoaded = (fontName: string) => loadedFonts.has(fontName);
export const getCachedGlyphCheck = (fontName: string, text: string) => glyphCheckCache.get(`${fontName}::${text}`);
export const isFontParsed = (fontName: string) => parsedFonts.has(fontName);
export const getParsedFont = (fontName: string) => parsedFonts.get(fontName);
