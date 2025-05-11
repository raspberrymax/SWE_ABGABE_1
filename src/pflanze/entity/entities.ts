import { Abbildung } from './abbildung.entity.js';
import { Pflanze } from './pflanze.entity.js';
import { PflanzeFile } from './pflanzeFile.entity.js';

// erforderlich in src/config/db.ts und src/pflanze/pflanze.module.ts
export const entities = [Abbildung, Pflanze, PflanzeFile];
