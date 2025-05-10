import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js'; // Passe an, falls nötig
import { PflanzeFile } from '../entity/pflanzeFile.entity.js'; // Deine Datei-Entity
import { Pflanze } from '../entity/pflanze.entity.js'; // Deine Haupt-Entity
import { type Pageable } from './pageable.js';
import { type Slice } from './slice.js';
import { QueryBuilder } from './query-builder.js';
import { type Suchkriterien } from './suchkriterien.js';

export type FindByIdParams = {
    readonly id: number;
    readonly mitAbbildungen?: boolean;
};

@Injectable()
export class PflanzeReadService {
    static readonly ID_PATTERN = /^[1-9]\d{0,10}$/u;

    readonly #pflanzeProps: string[];

    readonly #pflanzeQueryBuilder: QueryBuilder;

    readonly #fileRepo: Repository<PflanzeFile>;

    readonly #logger = getLogger(PflanzeReadService.name);

    constructor(
        pflanzeQueryBuilder: QueryBuilder,
        @InjectRepository(PflanzeFile) fileRepo: Repository<PflanzeFile>,
    ) {
        const dummy = new Pflanze();
        this.#pflanzeProps = Object.getOwnPropertyNames(dummy);
        this.#pflanzeQueryBuilder = pflanzeQueryBuilder;
        this.#fileRepo = fileRepo;
    }

    async findById({
        id,
        mitAbbildungen = false,
    }: FindByIdParams): Promise<Readonly<Pflanze>> {
        this.#logger.debug('findById: id=%d', id);

        const pflanze = await this.#pflanzeQueryBuilder
            .buildId({ id, mitAbbildungen })
            .getOne();

        if (pflanze === null) {
            throw new NotFoundException(
                `Es gibt keine Pflanze mit der ID ${id}.`,
            );
        }
        if (pflanze.schlagwoerter === null) {
            pflanze.schlagwoerter = [];
        }

        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: pflanze=%s, name=%o',
                pflanze.toString(),
                pflanze.name,
            );
            if (mitAbbildungen) {
                this.#logger.debug('findById: dateien=%o', pflanze.abbildungen);
            }
        }
        return pflanze;
    }

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

        this.#logger.debug(
            'findFileByPflanzeId: filename=%s',
            pflanzeFile.filename,
        );
        return pflanzeFile;
    }

    async find(
        suchkriterien: Suchkriterien | undefined,
        pageable: Pageable,
    ): Promise<Slice<Pflanze>> {
        this.#logger.debug(
            'find: suchkriterien=%o, pageable=%o',
            suchkriterien,
            pageable,
        );

        if (
            suchkriterien === undefined ||
            Object.keys(suchkriterien).length === 0
        ) {
            return await this.#findAll(pageable);
        }

        if (
            !this.#checkKeys(Object.keys(suchkriterien)) ||
            !this.#checkEnums(suchkriterien)
        ) {
            throw new NotFoundException('Ungueltige Suchkriterien');
        }

        const queryBuilder = this.#pflanzeQueryBuilder.build(
            suchkriterien,
            pageable,
        );
        const pflanzen = await queryBuilder.getMany();
        if (pflanzen.length === 0) {
            this.#logger.debug('find: Keine Pflanzen gefunden');
            throw new NotFoundException(
                `Keine Pflanzen gefunden: ${JSON.stringify(suchkriterien)}, Seite ${pageable.number}`,
            );
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(pflanzen, totalElements);
    }

    async #findAll(pageable: Pageable) {
        const queryBuilder = this.#pflanzeQueryBuilder.build({}, pageable);
        const pflanzen = await queryBuilder.getMany();
        if (pflanzen.length === 0) {
            throw new NotFoundException(
                `Ungueltige Seite "${pageable.number}"`,
            );
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(pflanzen, totalElements);
    }

    #createSlice(pflanzen: Pflanze[], totalElements: number) {
        pflanzen.forEach((pflanze) => {
            if (pflanze.schlagwoerter === null) {
                pflanze.schlagwoerter = [];
            }
        });
        const pflanzenSlice: Slice<Pflanze> = {
            content: pflanzen,
            totalElements,
        };
        this.#logger.debug('createSlice: pflanzenSlice=%o', pflanzenSlice);
        return pflanzenSlice;
    }

    #checkKeys(keys: string[]) {
        this.#logger.debug('#checkKeys: keys=%s', keys);
        let validKeys = true;
        keys.forEach((key) => {
            if (
                !this.#pflanzeProps.includes(key) &&
                key !== 'indoor' &&
                key !== 'outdoor'
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
        const { typ } = suchkriterien;
        this.#logger.debug('#checkEnums: Suchkriterium "typ=%s"', typ);
        return typ === undefined || typ === 'INDOOR' || typ === 'OUTDOOR';
    }
}
