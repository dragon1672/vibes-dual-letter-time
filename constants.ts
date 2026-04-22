
import { BaseType, SupportType, TextSettings } from './types';
import { BASE_URL } from './font_constants';
import { getFontLibrary } from './services/fontManager';



const library = getFontLibrary();
const defaultFamily = 'IBMPlex Sans JP'; 
const defaultUrl = library[defaultFamily]?.[1]?.url || library['Roboto']?.[0]?.url;

export const DEFAULT_SETTINGS: TextSettings = {
  text1: '♥YE♥',
  text2: '♥NO!',
  fontUrl: defaultUrl, 
  fontSize: 20,
  spacing: 0.15, 
  baseHeight: 2,
  basePadding: 4,
  baseType: 'RECTANGLE' as BaseType,
  baseCornerRadius: 4,
  baseTopRounding: 0.5,
  embedDepth: 0.5,
  
  supportEnabled: false,
  supportType: 'CYLINDER' as SupportType,
  supportHeight: 2.5, 
  supportRadius: 1.5,

  intersectionConfig: []
};
