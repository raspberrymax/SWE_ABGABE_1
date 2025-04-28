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
 * Das Modul besteht aus der Klasse {@linkcode QueryBuilder}.
 * @packageDocumentation
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { typeOrmModuleOptions } from '../../config/typeormOptions.js';
import { getLogger } from '../../logger/logger.js';
import { Abbildung } from '../entity/abbildung.entity.js';
import { Pflanze } from '../entity/pflanze.entity.js';
import { DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_SIZE } from './pageable.js';
import { type Pageable } from './pageable.js';
import { type Suchkriterien } from './suchkriterien.js';

/** Typdefinitionen für die Suche mit der Pflanze-ID. */
export type BuildIdParams = {
    /** ID des gesuchten Pflanzes. */
    readonly id: number;
    /** Sollen die Abbildungen mitgeladen werden? */
    readonly mitAbbildungen?: boolean;
};
/**
 * Die Klasse `QueryBuilder` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class QueryBuilder {
    readonly #pflanzeAlias = `${Pflanze.name
        .charAt(0)
        .toLowerCase()}${Pflanze.name.slice(1)}`;

    readonly #titelAlias = `${Pflanze.name
        .charAt(0)
        .toLowerCase()}${Pflanze.name.slice(1)}`;

    readonly #abbildungAlias = `${Abbildung.name
        .charAt(0)
        .toLowerCase()}${Abbildung.name.slice(1)}`;

    readonly #repo: Repository<Pflanze>;

    readonly #logger = getLogger(QueryBuilder.name);

    constructor(@InjectRepository(Pflanze) repo: Repository<Pflanze>) {
        this.#repo = repo;
    }

    /**
     * Ein Pflanze mit der ID suchen.
     * @param id ID des gesuchten Pflanzees
     * @returns QueryBuilder
     */
    buildId({ id, mitAbbildungen = false }: BuildIdParams) {
        // QueryBuilder "pflanze" fuer Repository<Pflanze>
        const queryBuilder = this.#repo.createQueryBuilder(this.#pflanzeAlias);

        // Fetch-Join: aus QueryBuilder "pflanze" die Property "titel" ->  Tabelle "titel"
        queryBuilder.innerJoinAndSelect(
            `${this.#pflanzeAlias}.titel`,
            this.#titelAlias,
        );

        if (mitAbbildungen) {
            // Fetch-Join: aus QueryBuilder "pflanze" die Property "abbildungen" -> Tabelle "abbildung"
            queryBuilder.leftJoinAndSelect(
                `${this.#pflanzeAlias}.abbildungen`,
                this.#abbildungAlias,
            );
        }

        queryBuilder.where(`${this.#pflanzeAlias}.id = :id`, { id: id }); // eslint-disable-line object-shorthand
        return queryBuilder;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien. Bei "titel" wird mit
     * einem Teilstring gesucht, bei "rating" mit einem Mindestwert, bei "preis"
     * mit der Obergrenze.
     * @param pageable Maximale Anzahl an Datensätzen und Seitennummer.
     * @returns QueryBuilder
     */
    // z.B. { titel: 'a', rating: 5, preis: 22.5, javascript: true }
    // "rest properties" fuer anfaengliche WHERE-Klausel: ab ES 2018 https://github.com/tc39/proposal-object-rest-spread
    // eslint-disable-next-line max-lines-per-function, prettier/prettier, sonarjs/cognitive-complexity
    build(
        {
            // NOSONAR
            name,
            ...restProps
        }: Suchkriterien,
        pageable: Pageable,
    ) {
        this.#logger.debug(
            'build: titel=%s, rating=%s, preis=%s, javascript=%s, typescript=%s, java=%s, python=%s, restProps=%o, pageable=%o',
            name,
            restProps,
            pageable,
        );

        let queryBuilder = this.#repo.createQueryBuilder(this.#pflanzeAlias);
        queryBuilder.innerJoinAndSelect(`${this.#pflanzeAlias}.titel`, 'titel');

        // z.B. { titel: 'a', rating: 5, javascript: true }
        // "rest properties" fuer anfaengliche WHERE-Klausel: ab ES 2018 https://github.com/tc39/proposal-object-rest-spread
        // type-coverage:ignore-next-line
        // const { titel, javascript, typescript, ...otherProps } = suchkriterien;

        let useWhere = true;

        // Titel in der Query: Teilstring des Titels und "case insensitive"
        // CAVEAT: MySQL hat keinen Vergleich mit "case insensitive"
        // type-coverage:ignore-next-line
        if (name !== undefined && typeof name === 'string') {
            const ilike =
                typeOrmModuleOptions.type === 'postgres' ? 'ilike' : 'like';
            queryBuilder = queryBuilder.where(
                `${this.#titelAlias}.titel ${ilike} :titel`,
                { titel: `%${name}%` },
            );
            useWhere = false;
        }

        // if (rating !== undefined) {
        //     const ratingNumber =
        //         typeof rating === 'string' ? parseInt(rating) : rating;
        //     if (!isNaN(ratingNumber)) {
        //         queryBuilder = queryBuilder.where(
        //             `${this.#pflanzeAlias}.rating >= ${ratingNumber}`,
        //         );
        //         useWhere = false;
        //     }
        // }

        // if (preis !== undefined && typeof preis === 'string') {
        //     const preisNumber = Number(preis);
        //     queryBuilder = queryBuilder.where(
        //         `${this.#pflanzeAlias}.preis <= ${preisNumber}`,
        //     );
        //     useWhere = false;
        // }

        // if (javascript === 'true') {
        //     queryBuilder = useWhere
        //         ? queryBuilder.where(
        //               `${this.#pflanzeAlias}.schlagwoerter like '%JAVASCRIPT%'`,
        //           )
        //         : queryBuilder.andWhere(
        //               `${this.#pflanzeAlias}.schlagwoerter like '%JAVASCRIPT%'`,
        //           );
        //     useWhere = false;
        // }

        // if (typescript === 'true') {
        //     queryBuilder = useWhere
        //         ? queryBuilder.where(
        //               `${this.#pflanzeAlias}.schlagwoerter like '%TYPESCRIPT%'`,
        //           )
        //         : queryBuilder.andWhere(
        //               `${this.#pflanzeAlias}.schlagwoerter like '%TYPESCRIPT%'`,
        //           );
        //     useWhere = false;
        // }

        // // Bei "JAVA" sollen Ergebnisse mit "JAVASCRIPT" _nicht_ angezeigt werden
        // if (java === 'true') {
        //     queryBuilder = useWhere
        //         ? queryBuilder.where(
        //               `REPLACE(${this.#pflanzeAlias}.schlagwoerter, 'JAVASCRIPT', '') like '%JAVA%'`,
        //           )
        //         : queryBuilder.andWhere(
        //               `REPLACE(${this.#pflanzeAlias}.schlagwoerter, 'JAVASCRIPT', '') like '%JAVA%'`,
        //           );
        //     useWhere = false;
        // }

        // if (python === 'true') {
        //     queryBuilder = useWhere
        //         ? queryBuilder.where(
        //               `${this.#pflanzeAlias}.schlagwoerter like '%PYTHON%'`,
        //           )
        //         : queryBuilder.andWhere(
        //               `${this.#pflanzeAlias}.schlagwoerter like '%PYTHON%'`,
        //           );
        //     useWhere = false;
        // }

        // Restliche Properties als Key-Value-Paare: Vergleiche auf Gleichheit
        Object.entries(restProps).forEach(([key, value]) => {
            const param: Record<string, any> = {};
            param[key] = value; // eslint-disable-line security/detect-object-injection
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `${this.#pflanzeAlias}.${key} = :${key}`,
                      param,
                  )
                : queryBuilder.andWhere(
                      `${this.#pflanzeAlias}.${key} = :${key}`,
                      param,
                  );
            useWhere = false;
        });

        this.#logger.debug('build: sql=%s', queryBuilder.getSql());

        if (pageable?.size === 0) {
            return queryBuilder;
        }
        const size = pageable?.size ?? DEFAULT_PAGE_SIZE;
        const number = pageable?.number ?? DEFAULT_PAGE_NUMBER;
        const skip = number * size;
        this.#logger.debug('take=%s, skip=%s', size, skip);
        return queryBuilder.take(size).skip(skip);
    }
}
