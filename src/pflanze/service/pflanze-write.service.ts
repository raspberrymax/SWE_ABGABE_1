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
import { Pflanze } from '../entity/pflanze.entity.js';
import { PflanzeFile } from '../entity/pflanzeFile.entity.js';
import { PflanzeReadService } from './pflanze-read.service.js';
import {
    NameExistsException,
    VersionInvalidException,
    VersionOutdatedException,
} from './exceptions.js';

/** Typdefinitionen zum Aktualisieren einer Pflanze mit `update`. */
export type UpdateParams = {
    /** ID der zu aktualisierenden Pflanze. */
    readonly id: number | undefined;
    /** Pflanze-Objekt mit den aktualisierten Werten. */
    readonly pflanze: Pflanze;
    /** Versionsnummer für die aktualisierenden Werte. */
    readonly version: string;
};

/**
 * Die Klasse `PflanzeWriteService` implementiert den Anwendungskern für das
 * Schreiben von Pflanzen und greift mit _TypeORM_ auf die DB zu.
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
     * Eine neue Pflanze soll angelegt werden.
     * @param pflanze Die neu anzulegende Pflanze
     * @returns Die ID der neu angelegten Pflanze
     * @throws NameExistsException falls der Name der Pflanze bereits existiert
     */
    async create(pflanze: Pflanze) {
        this.#logger.debug('create: pflanze=%o', pflanze);
        await this.#validateCreate(pflanze);

        const pflanzeDb = await this.#repo.save(pflanze); // implizite Transaktion
        await this.#sendmail(pflanzeDb);

        return pflanzeDb.id!;
    }

    /**
     * Zu einer vorhandenen Pflanze eine Binärdatei mit z.B. einem Bild abspeichern.
     * @param pflanzeId ID der vorhandenen Pflanze
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

        // evtl. vorhandene Datei löschen
        await this.#fileRepo
            .createQueryBuilder('pflanze_file')
            .delete()
            .where('pflanze_id = :id', { id: pflanzeId })
            .execute();

        // Entity-Objekt aufbauen, um es später in der DB zu speichern (s.u.)
        const pflanzeFile = this.#fileRepo.create({
            filename,
            data,
            mimetype,
            pflanze,
        });

        // Den Datensatz für Pflanze mit der neuen Binärdatei aktualisieren
        await this.#repo.save({
            id: pflanze.id,
            file: pflanzeFile,
        });

        return pflanzeFile;
    }

    /**
     * Eine vorhandene Pflanze soll aktualisiert werden. "Destructured" Argument
     * mit id (ID der zu aktualisierenden Pflanze), pflanze (zu aktualisierende Pflanze)
     * und version (Versionsnummer für optimistische Synchronisation).
     * @returns Die neue Versionsnummer gemäß optimistischer Synchronisation
     * @throws NotFoundException falls keine Pflanze zur ID vorhanden ist
     * @throws VersionInvalidException falls die Versionsnummer ungültig ist
     * @throws VersionOutdatedException falls die Versionsnummer veraltet ist
     */
    async update({ id, pflanze, version }: UpdateParams) {
        this.#logger.debug(
            'update: id=%d, pflanze=%o, version=%s',
            id,
            pflanze,
            version,
        );
        if (id === undefined) {
            this.#logger.debug('update: Keine gültige ID');
            throw new NotFoundException(`Es gibt keine Pflanze mit der ID ${id}.`);
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
     * Eine Pflanze wird asynchron anhand ihrer ID gelöscht.
     *
     * @param id ID der zu löschenden Pflanze
     * @returns true, falls die Pflanze vorhanden war und gelöscht wurde. Sonst false.
     */
    async delete(id: number) {
        this.#logger.debug('delete: id=%d', id);
        const pflanze = await this.#readService.findById({
            id,
            mitAbbildungen: true,
        });

        let deleteResult: DeleteResult | undefined;
        await this.#repo.manager.transaction(async (transactionalMgr) => {
            // Die Pflanze zur gegebenen ID mit Abbildungen asynchron löschen

            deleteResult = await transactionalMgr.delete(Pflanze, id);
            this.#logger.debug('delete: deleteResult=%o', deleteResult);
        });

        return (
            deleteResult?.affected !== undefined &&
            deleteResult.affected !== null &&
            deleteResult.affected > 0
        );
    }

    async #validateCreate({ name }: Pflanze): Promise<undefined> {
        this.#logger.debug('#validateCreate: name=%s', name);
        if (await this.#repo.existsBy({ name })) {
            throw new NameExistsException(name);
        }
    }

    async #sendmail(pflanze: Pflanze) {
        const subject = `Neue Pflanze ${pflanze.id}`;
        const name = pflanze.name ?? 'N/A';
        const body = `Die Pflanze mit dem Namen <strong>${name}</strong> ist angelegt`;
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

        const versionDb = pflanzeDb.version!;
        if (version < versionDb) {
            this.#logger.debug('#validateUpdate: versionDb=%d', version);
            throw new VersionOutdatedException(version);
        }
        this.#logger.debug('#validateUpdate: pflanzeDb=%o', pflanzeDb);
        return pflanzeDb;
    }
}
