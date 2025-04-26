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
 * Das Modul besteht aus der Klasse {@linkcode PflanzeWriteService} für die
 * Schreiboperationen im Anwendungskern.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type DeleteResult, Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js';
import { MailService } from '../../mail/mail.service.js';
import { Abbildung } from '../entity/abbildung.entity.js';
import { Pflanze } from '../entity/pflanze.entity.js';
import { PflanzeFile } from '../entity/pflanzeFile.entity.js';
import { Titel } from '../entity/titel.entity.js';
import { PflanzeReadService } from './pflanze-read.service.js';
import {
    IsbnExistsException,
    VersionInvalidException,
    VersionOutdatedException,
} from './exceptions.js';

/** Typdefinitionen zum Aktualisieren eines Pflanzees mit `update`. */
export type UpdateParams = {
    /** ID des zu aktualisierenden Pflanzees. */
    readonly id: number | undefined;
    /** Pflanze-Objekt mit den aktualisierten Werten. */
    readonly pflanze: Pflanze;
    /** Versionsnummer für die aktualisierenden Werte. */
    readonly version: string;
};

// TODO Transaktionen, wenn mehr als 1 TypeORM-Schreibmethode involviert ist
// https://docs.nestjs.com/techniques/database#typeorm-transactions
// https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional
// https://betterprogramming.pub/handling-transactions-in-typeorm-and-nest-js-with-ease-3a417e6ab5
// https://bytesmith.dev/blog/20240320-nestjs-transactions

/**
 * Die Klasse `PflanzeWriteService` implementiert den Anwendungskern für das
 * Schreiben von Bücher und greift mit _TypeORM_ auf die DB zu.
 */
@Injectable()
export class PflanzeWriteService {
    private static readonly VERSION_PATTERN = /^"\d{1,3}"/u;

    readonly #repo: Repository<Pflanze>;

    readonly #fileRepo: Repository<PflanzeFile>;

    readonly #readService: PflanzeReadService;

    readonly #mailService: MailService;

    readonly #logger = getLogger(PflanzeWriteService.name);

    // eslint-disable-next-line max-params
    constructor(
        @InjectRepository(Pflanze) repo: Repository<Pflanze>,
        @InjectRepository(PflanzeFile) fileRepo: Repository<PflanzeFile>,
        readService: PflanzeReadService,
        mailService: MailService,
    ) {
        this.#repo = repo;
        this.#fileRepo = fileRepo;
        this.#readService = readService;
        this.#mailService = mailService;
    }

    /**
     * Ein neues Pflanze soll angelegt werden.
     * @param pflanze Das neu abzulegende Pflanze
     * @returns Die ID des neu angelegten Pflanzees
     * @throws IsbnExists falls die ISBN-Nummer bereits existiert
     */
    async create(pflanze: Pflanze) {
        this.#logger.debug('create: pflanze=%o', pflanze);
        await this.#validateCreate(pflanze);

        const pflanzeDb = await this.#repo.save(pflanze); // implizite Transaktion
        await this.#sendmail(pflanzeDb);

        return pflanzeDb.id!;
    }

    /**
     * Zu einem vorhandenen Pflanze ein3 Binärdatei mit z.B. einem Bild abspeichern.
     * @param pflanzeId ID des vorhandenen Pflanzees
     * @param data Bytes der Datei
     * @param filename Dateiname
     * @param mimetype MIME-Type
     * @returns Entity-Objekt für `PflanzeFile`
     */
    // eslint-disable-next-line max-params
    async addFile(
        pflanzeId: number,
        data: Buffer,
        filename: string,
        mimetype: string,
    ): Promise<Readonly<PflanzeFile>> {
        this.#logger.debug(
            'addFile: pflanzeId: %d, filename:%s, mimetype: %s',
            pflanzeId,
            filename,
            mimetype,
        );

        // Pflanze ermitteln, falls vorhanden
        const pflanze = await this.#readService.findById({ id: pflanzeId });

        // evtl. vorhandene Datei loeschen
        await this.#fileRepo
            .createQueryBuilder('pflanze_file')
            .delete()
            .where('pflanze_id = :id', { id: pflanzeId })
            .execute();

        // Entity-Objekt aufbauen, um es spaeter in der DB zu speichern (s.u.)
        const pflanzeFile = this.#fileRepo.create({
            filename,
            data,
            mimetype,
            pflanze,
        });

        // Den Datensatz fuer Pflanze mit der neuen Binaerdatei aktualisieren
        await this.#repo.save({
            id: pflanze.id,
            file: pflanzeFile,
        });

        return pflanzeFile;
    }

    /**
     * Ein vorhandenes Pflanze soll aktualisiert werden. "Destructured" Argument
     * mit id (ID des zu aktualisierenden Pflanzes), pflanze (zu aktualisierendes Pflanze)
     * und version (Versionsnummer für optimistische Synchronisation).
     * @returns Die neue Versionsnummer gemäß optimistischer Synchronisation
     * @throws NotFoundException falls kein Pflanze zur ID vorhanden ist
     * @throws VersionInvalidException falls die Versionsnummer ungültig ist
     * @throws VersionOutdatedException falls die Versionsnummer veraltet ist
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async update({ id, pflanze, version }: UpdateParams) {
        this.#logger.debug(
            'update: id=%d, pflanze=%o, version=%s',
            id,
            pflanze,
            version,
        );
        if (id === undefined) {
            this.#logger.debug('update: Keine gueltige ID');
            throw new NotFoundException(`Es gibt kein Pflanze mit der ID ${id}.`);
        }

        const validateResult = await this.#validateUpdate(pflanze, id, version);
        this.#logger.debug('update: validateResult=%o', validateResult);
        if (!(validateResult instanceof Pflanze)) {
            return validateResult;
        }

        const pflanzeNeu = validateResult;
        const merged = this.#repo.merge(pflanzeNeu, pflanze);
        this.#logger.debug('update: merged=%o', merged);
        const updated = await this.#repo.save(merged); // implizite Transaktion
        this.#logger.debug('update: updated=%o', updated);

        return updated.version!;
    }

    /**
     * Ein Pflanze wird asynchron anhand seiner ID gelöscht.
     *
     * @param id ID des zu löschenden Pflanzees
     * @returns true, falls das Pflanze vorhanden war und gelöscht wurde. Sonst false.
     */
    async delete(id: number) {
        this.#logger.debug('delete: id=%d', id);
        const pflanze = await this.#readService.findById({
            id,
            mitAbbildungen: true,
        });

        let deleteResult: DeleteResult | undefined;
        await this.#repo.manager.transaction(async (transactionalMgr) => {
            // Das Pflanze zur gegebenen ID mit Titel und Abb. asynchron loeschen

            // TODO "cascade" funktioniert nicht beim Loeschen
            const titelId = pflanze.titel?.id;
            if (titelId !== undefined) {
                await transactionalMgr.delete(Titel, titelId);
            }
            // "Nullish Coalescing" ab ES2020
            const abbildungen = pflanze.abbildungen ?? [];
            for (const abbildung of abbildungen) {
                await transactionalMgr.delete(Abbildung, abbildung.id);
            }

            deleteResult = await transactionalMgr.delete(Pflanze, id);
            this.#logger.debug('delete: deleteResult=%o', deleteResult);
        });

        return (
            deleteResult?.affected !== undefined &&
            deleteResult.affected !== null &&
            deleteResult.affected > 0
        );
    }

    async #validateCreate({ isbn }: Pflanze): Promise<undefined> {
        this.#logger.debug('#validateCreate: isbn=%s', isbn);
        if (await this.#repo.existsBy({ isbn })) {
            throw new IsbnExistsException(isbn);
        }
    }

    async #sendmail(pflanze: Pflanze) {
        const subject = `Neues Pflanze ${pflanze.id}`;
        const titel = pflanze.titel?.titel ?? 'N/A';
        const body = `Das Pflanze mit dem Titel <strong>${titel}</strong> ist angelegt`;
        await this.#mailService.sendmail({ subject, body });
    }

    async #validateUpdate(
        pflanze: Pflanze,
        id: number,
        versionStr: string,
    ): Promise<Pflanze> {
        this.#logger.debug(
            '#validateUpdate: pflanze=%o, id=%s, versionStr=%s',
            pflanze,
            id,
            versionStr,
        );
        if (!PflanzeWriteService.VERSION_PATTERN.test(versionStr)) {
            throw new VersionInvalidException(versionStr);
        }

        const version = Number.parseInt(versionStr.slice(1, -1), 10);
        this.#logger.debug(
            '#validateUpdate: pflanze=%o, version=%d',
            pflanze,
            version,
        );

        const pflanzeDb = await this.#readService.findById({ id });

        // nullish coalescing
        const versionDb = pflanzeDb.version!;
        if (version < versionDb) {
            this.#logger.debug('#validateUpdate: versionDb=%d', version);
            throw new VersionOutdatedException(version);
        }
        this.#logger.debug('#validateUpdate: pflanzeDb=%o', pflanzeDb);
        return pflanzeDb;
    }
}
