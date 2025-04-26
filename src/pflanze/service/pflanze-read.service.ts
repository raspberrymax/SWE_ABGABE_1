// Copyright (C) 2016 - present Juergen Zimmermann, Hochschule Karlsruhe
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

/**
 * Das Modul besteht aus der Klasse {@linkcode PflanzeReadService}.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js';
import { PflanzeFile } from '../entity/pflanzeFile.entity.js';
import { Pflanze } from '../entity/pflanze.entity.js';
import { type Pageable } from './pageable.js';
import { type Slice } from './slice.js';
import { QueryBuilder } from './query-builder.js';
import { type Suchkriterien } from './suchkriterien.js';

/**
 * Typdefinition für `findById`
 */
export type FindByIdParams = {
    /** ID des gesuchten Pflanzes */
    readonly id: number;
    /** Sollen die Abbildungen mitgeladen werden? */
    readonly mitAbbildungen?: boolean;
};

/**
 * Die Klasse `PflanzeReadService` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class PflanzeReadService {
    static readonly ID_PATTERN = /^[1-9]\d{0,10}$/u;

    readonly #pflanzeProps: string[];

    readonly #queryBuilder: QueryBuilder;

    readonly #fileRepo: Repository<PflanzeFile>;

    readonly #logger = getLogger(PflanzeReadService.name);

    constructor(
        queryBuilder: QueryBuilder,
        @InjectRepository(PflanzeFile) fileRepo: Repository<PflanzeFile>,
    ) {
        const pflanzeDummy = new Pflanze();
        this.#pflanzeProps = Object.getOwnPropertyNames(pflanzeDummy);
        this.#queryBuilder = queryBuilder;
        this.#fileRepo = fileRepo;
    }

    // Rueckgabetyp Promise bei asynchronen Funktionen
    //    ab ES2015
    //    vergleiche Task<> bei C#
    // Status eines Promise:
    //    Pending: das Resultat ist noch nicht vorhanden, weil die asynchrone
    //             Operation noch nicht abgeschlossen ist
    //    Fulfilled: die asynchrone Operation ist abgeschlossen und
    //               das Promise-Objekt hat einen Wert
    //    Rejected: die asynchrone Operation ist fehlgeschlagen and das
    //              Promise-Objekt wird nicht den Status "fulfilled" erreichen.
    //              Im Promise-Objekt ist dann die Fehlerursache enthalten.

    /**
     * Ein Pflanze asynchron anhand seiner ID suchen
     * @param id ID des gesuchten Pflanzees
     * @returns Das gefundene Pflanze in einem Promise aus ES2015.
     * @throws NotFoundException falls kein Pflanze mit der ID existiert
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async findById({
        id,
        mitAbbildungen = false,
    }: FindByIdParams): Promise<Readonly<Pflanze>> {
        this.#logger.debug('findById: id=%d', id);

        // https://typeorm.io/working-with-repository
        // Das Resultat ist undefined, falls kein Datensatz gefunden
        // Lesen: Keine Transaktion erforderlich
        const pflanze = await this.#queryBuilder
            .buildId({ id, mitAbbildungen })
            .getOne();
        if (pflanze === null) {
            throw new NotFoundException(`Es gibt kein Pflanze mit der ID ${id}.`);
        }
        if (pflanze.schlagwoerter === null) {
            pflanze.schlagwoerter = [];
        }

        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: pflanze=%s, titel=%o',
                pflanze.toString(),
                pflanze.titel,
            );
            if (mitAbbildungen) {
                this.#logger.debug(
                    'findById: abbildungen=%o',
                    pflanze.abbildungen,
                );
            }
        }
        return pflanze;
    }

    /**
     * Binärdatei zu einem Pflanze suchen.
     * @param pflanzeId ID des zugehörigen Pflanzes.
     * @returns Binärdatei oder undefined als Promise.
     */
    async findFileByPflanzeId(
        pflanzeId: number,
    ): Promise<Readonly<PflanzeFile> | undefined> {
        this.#logger.debug('findFileByPflanzeId: pflanzeId=%s', pflanzeId);
        const pflanzeFile = await this.#fileRepo
            .createQueryBuilder('pflanze_file')
            .where('pflanze_id = :id', { id: pflanzeId })
            .getOne();
        if (pflanzeFile === null) {
            this.#logger.debug('findFileByPflanzeId: Keine Datei gefunden');
            return;
        }

        this.#logger.debug('findFileByPflanzeId: filename=%s', pflanzeFile.filename);
        return pflanzeFile;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien.
     * @param pageable Maximale Anzahl an Datensätzen und Seitennummer.
     * @returns Ein JSON-Array mit den gefundenen Büchern.
     * @throws NotFoundException falls keine Bücher gefunden wurden.
     */
    async find(
        suchkriterien: Suchkriterien | undefined,
        pageable: Pageable,
    ): Promise<Slice<Pflanze>> {
        this.#logger.debug(
            'find: suchkriterien=%o, pageable=%o',
            suchkriterien,
            pageable,
        );

        // Keine Suchkriterien?
        if (suchkriterien === undefined) {
            return await this.#findAll(pageable);
        }
        const keys = Object.keys(suchkriterien);
        if (keys.length === 0) {
            return await this.#findAll(pageable);
        }

        // Falsche Namen fuer Suchkriterien?
        if (!this.#checkKeys(keys) || !this.#checkEnums(suchkriterien)) {
            throw new NotFoundException('Ungueltige Suchkriterien');
        }

        // QueryBuilder https://typeorm.io/select-query-builder
        // Das Resultat ist eine leere Liste, falls nichts gefunden
        // Lesen: Keine Transaktion erforderlich
        const queryBuilder = this.#queryBuilder.build(suchkriterien, pageable);
        const buecher = await queryBuilder.getMany();
        if (buecher.length === 0) {
            this.#logger.debug('find: Keine Buecher gefunden');
            throw new NotFoundException(
                `Keine Buecher gefunden: ${JSON.stringify(suchkriterien)}, Seite ${pageable.number}}`,
            );
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(buecher, totalElements);
    }

    async #findAll(pageable: Pageable) {
        const queryBuilder = this.#queryBuilder.build({}, pageable);
        const buecher = await queryBuilder.getMany();
        if (buecher.length === 0) {
            throw new NotFoundException(`Ungueltige Seite "${pageable.number}"`);
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(buecher, totalElements);

    }

    #createSlice(buecher: Pflanze[], totalElements: number) {
        buecher.forEach((pflanze) => {
            if (pflanze.schlagwoerter === null) {
                pflanze.schlagwoerter = [];
            }
        });
        const pflanzeSlice: Slice<Pflanze> = {
            content: buecher,
            totalElements,
        };
        this.#logger.debug('createSlice: pflanzeSlice=%o', pflanzeSlice);
        return pflanzeSlice;
    }

    #checkKeys(keys: string[]) {
        this.#logger.debug('#checkKeys: keys=%s', keys);
        // Ist jedes Suchkriterium auch eine Property von Pflanze oder "schlagwoerter"?
        let validKeys = true;
        keys.forEach((key) => {
            if (
                !this.#pflanzeProps.includes(key) &&
                key !== 'javascript' &&
                key !== 'typescript' &&
                key !== 'java' &&
                key !== 'python'
            ) {
                this.#logger.debug(
                    '#checkKeys: ungueltiges Suchkriterium "%s"',
                    key,
                );
                validKeys = false;
            }
        });

        return validKeys;
    }

    #checkEnums(suchkriterien: Suchkriterien) {
        const { art } = suchkriterien;
        this.#logger.debug('#checkEnums: Suchkriterium "art=%s"', art);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return (
            art === undefined ||
            art === 'EPUB' ||
            art === 'HARDCOVER' ||
            art === 'PAPERBACK'
        );
    }
}
