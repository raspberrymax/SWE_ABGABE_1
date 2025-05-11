/**
 * Das Modul besteht aus der Controller-Klasse für Lesen an der REST-Schnittstelle.
 * @packageDocumentation
 */

// eslint-disable-next-line max-classes-per-file
import {
    Controller,
    Get,
    Headers,
    HttpStatus,
    NotFoundException,
    Param,
    ParseIntPipe,
    Query,
    Req,
    Res,
    StreamableFile,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiHeader,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiProperty,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from 'nest-keycloak-connect';
import { Readable } from 'node:stream';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Pflanze, type PflanzeTyp } from '../entity/pflanze.entity.js';
import { PflanzeReadService } from '../service/pflanze-read.service.js';
import { type Suchkriterien } from '../service/suchkriterien.js';
import { createPage } from './page.js';
import { createPageable } from '../service/pageable.js';
import { getLogger } from '../../logger/logger.js';
import { paths } from '../../config/paths.js';

export class PflanzeQuery implements Suchkriterien {
    @ApiProperty({ required: false })
    declare readonly name?: string;

    @ApiProperty({ required: false })
    declare readonly typ?: PflanzeTyp;

    @ApiProperty({ required: false })
    declare readonly titel?: string;

    @ApiProperty({ required: false })
    declare size?: string;

    @ApiProperty({ required: false })
    declare page?: string;
}

@Controller(paths.rest)
@UseInterceptors(ResponseTimeInterceptor)
@ApiTags('Pflanze REST-API')
export class PflanzeGetController {
    readonly #service: PflanzeReadService;

    readonly #logger = getLogger(PflanzeGetController.name);

    constructor(service: PflanzeReadService) {
        this.#service = service;
    }

    // eslint-disable-next-line max-params
    @Get(':id')
    @Public()
    @ApiOperation({ summary: 'Suche mit der Pflanze-ID' })
    @ApiParam({
        name: 'id',
        description: 'Z.B. 1',
    })
    @ApiHeader({
        name: 'If-None-Match',
        description: 'Header für bedingte GET-Requests, z.B. "0"',
        required: false,
    })
    @ApiOkResponse({ description: 'Die Pflanze wurde gefunden' })
    @ApiNotFoundResponse({ description: 'Keine Pflanze zur ID gefunden' })
    @ApiResponse({
        status: HttpStatus.NOT_MODIFIED,
        description: 'Die Pflanze wurde bereits heruntergeladen',
    })
    async getById(
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @Req() req: Request,
        @Headers('If-None-Match') version: string | undefined,
        @Res() res: Response,
    ): Promise<Response<Pflanze | undefined>> {
        this.#logger.debug('getById: id=%s, version=%s', id, version);

        if (req.accepts(['json', 'html']) === false) {
            this.#logger.debug('getById: accepted=%o', req.accepted);
            return res.sendStatus(HttpStatus.NOT_ACCEPTABLE);
        }

        const pflanze = await this.#service.findById({ id });
        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug('getById(): pflanze=%s', pflanze.toString());
            this.#logger.debug('getById(): name=%o', pflanze.name);
        }

        // ETags
        const versionDb = pflanze.version;
        if (version === `"${pflanze.version}"`) {
            this.#logger.debug('getById: NOT_MODIFIED');
            return res.sendStatus(HttpStatus.NOT_MODIFIED);
        }
        this.#logger.debug('getById: versionDb=%s', versionDb);
        res.header('ETag', `"${versionDb}"`);

        this.#logger.debug('getById: pflanze=%o', pflanze);
        return res.json(pflanze);
    }

    @Get()
    @Public()
    @ApiOperation({ summary: 'Suche mit Suchkriterien' })
    @ApiOkResponse({ description: 'Eine evtl. leere Liste mit Pflanzen' })
    async get(
        @Query() query: PflanzeQuery,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response<Pflanze[] | undefined>> {
        this.#logger.debug('get: query=%o', query);

        if (req.accepts(['json', 'html']) === false) {
            this.#logger.debug('get: accepted=%o', req.accepted);
            return res.sendStatus(HttpStatus.NOT_ACCEPTABLE);
        }

        const { page, size } = query;
        delete query['page'];
        delete query['size'];
        this.#logger.debug('get: page=%s, size=%s', page, size);

        const keys = Object.keys(query) as (keyof PflanzeQuery)[];

        // Überprüfen auf Schlagwörter als spezielle Parameter
        const schlagwoerterKeys = Object.keys(query).filter(
            (key) => !['name', 'typ', 'datum', 'page', 'size'].includes(key),
        );

        // Schlagwörter aus der Anfrage entfernen und separat speichern, wenn vorhanden
        schlagwoerterKeys.forEach((key) => {
            delete query[key as keyof PflanzeQuery];
        });

        keys.forEach((key) => {
            if (query[key] === undefined) {
                delete query[key];
            }
        });
        this.#logger.debug(
            'get: query=%o, schlagwoerterKeys=%o',
            query,
            schlagwoerterKeys,
        );

        const pageable = createPageable({ number: page, size });

        // Standardsuche durchführen
        let pflanzenSlice = await this.#service.find(query, pageable);

        // Falls Schlagwörter als Parameter vorhanden sind, filtern wir die Ergebnisse
        if (schlagwoerterKeys.length > 0) {
            const filtered = pflanzenSlice.content.filter((pflanze) => {
                if (!pflanze.schlagwoerter) {
                    return false;
                }
                // Prüfen ob mindestens ein Schlagwort übereinstimmt (case insensitive)
                return schlagwoerterKeys.some((key) =>
                    pflanze.schlagwoerter?.some(
                        (schlagwort) =>
                            schlagwort.toLowerCase() === key.toLowerCase(),
                    ),
                );
            });

            if (filtered.length === 0) {
                throw new NotFoundException(
                    `Keine Pflanzen mit den angegebenen Schlagwörtern gefunden`,
                );
            }

            pflanzenSlice = {
                content: filtered,
                totalElements: filtered.length,
            };
        }

        const pflanzePage = createPage(pflanzenSlice, pageable);
        this.#logger.debug('get: pflanzePage=%o', pflanzePage);

        return res.json(pflanzePage).send();
    }

    @Get('/file/:id')
    @Public()
    @ApiOperation({ description: 'Suche nach Datei mit der Pflanze-ID' })
    @ApiParam({
        name: 'id',
        description: 'Z.B. 1',
    })
    @ApiNotFoundResponse({ description: 'Keine Datei zur Pflanze-ID gefunden' })
    @ApiOkResponse({ description: 'Die Datei wurde gefunden' })
    async getFileById(
        @Param('id') idStr: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        this.#logger.debug('getFileById: pflanzeId:%s', idStr);

        const id = Number(idStr);
        if (!Number.isInteger(id)) {
            this.#logger.debug('getById: not isInteger()');
            throw new NotFoundException(
                `Die Pflanzen-ID ${idStr} ist ungueltig.`,
            );
        }

        const pflanzeFile = await this.#service.findFileByPflanzeId(id);
        if (pflanzeFile?.data === undefined) {
            throw new NotFoundException('Keine Datei gefunden.');
        }

        const stream = Readable.from(pflanzeFile.data);
        res.contentType(pflanzeFile.mimetype ?? 'image/png').set({
            'Content-Disposition': `inline; filename="${pflanzeFile.filename}"`, // eslint-disable-line @typescript-eslint/naming-convention
        });

        return new StreamableFile(stream);
    }
}
