import {
    Body,
    Controller,
    Delete,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNoContentResponse,
    ApiOperation,
    ApiParam,
    ApiPreconditionFailedResponse,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Express, Request, Response } from 'express';
import { AuthGuard, Public, Roles } from 'nest-keycloak-connect';
import { paths } from '../../config/paths.js';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Abbildung } from '../entity/abbildung.entity.js';
import { type Pflanze } from '../entity/pflanze.entity.js';
import { PflanzeWriteService } from '../service/pflanze-write.service.js';
import { PflanzeDTO, PflanzeDtoOhneRef } from './pflanzeDTO.entity.js';
import { createBaseUri } from './createBaseUri.js';

const MSG_FORBIDDEN = 'Kein Token mit ausreichender Berechtigung vorhanden';

@Controller(paths.rest)
@UseGuards(AuthGuard)
@UseInterceptors(ResponseTimeInterceptor)
@ApiTags('Pflanze REST-API')
@ApiBearerAuth()
export class PflanzeWriteController {
    readonly #service: PflanzeWriteService;
    readonly #logger = getLogger(PflanzeWriteController.name);

    constructor(service: PflanzeWriteService) {
        this.#service = service;
    }

    @Post()
    @Roles({ roles: ['admin', 'user'] })
    @ApiOperation({ summary: 'Eine neue Pflanze anlegen' })
    @ApiCreatedResponse({ description: 'Erfolgreich neu angelegt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Pflanzendaten' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async post(
        @Body() pflanzeDTO: PflanzeDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug('post: pflanzeDTO=%o', pflanzeDTO);

        try {
            const pflanze = this.#mapPflanzeDtoToEntity(pflanzeDTO);
            const id = await this.#service.create(pflanze);

            const location = `${createBaseUri(req)}/${id}`;
            this.#logger.debug('post: location=%s', location);
            return res.location(location).send();
        } catch (error) {
            this.#logger.error('post: error=%o', error);

            if (
                error instanceof Error &&
                error.constructor.name === 'NameExistsException'
            ) {
                return res
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .json({
                        message: error.message,
                        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                    });
            }

            return res.status(HttpStatus.BAD_REQUEST).send('Fehlerhafte Daten');
        }
    }

    @Post(':id')
    @Public()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Binärdatei mit einem Bild hochladen' })
    @ApiParam({ name: 'id', description: 'Z.B. 1' })
    @ApiCreatedResponse({ description: 'Erfolgreich hinzugefügt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Datei' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    @UseInterceptors(FileInterceptor('file'))
    async addFile(
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'addFile: id=%d, originalname=%s',
            id,
            file.originalname,
        );

        try {
            await this.#service.addFile(
                id,
                file.buffer,
                file.originalname,
                file.mimetype,
            );

            const location = `${createBaseUri(req)}/file/${id}`;
            this.#logger.debug('addFile: location=%s', location);
            return res.location(location).send();
        } catch (error) {
            this.#logger.error('addFile: error=%o', error);
            return res
                .status(HttpStatus.BAD_REQUEST)
                .send('Fehler beim Hochladen der Datei');
        }
    }

    @Put(':id')
    @Roles({ roles: ['admin', 'user'] })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eine vorhandene Pflanze aktualisieren' })
    @ApiHeader({
        name: 'If-Match',
        description: 'Header für optimistische Synchronisation',
        required: false,
    })
    @ApiNoContentResponse({ description: 'Erfolgreich aktualisiert' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Pflanzendaten' })
    @ApiPreconditionFailedResponse({
        description: 'Falsche Version im Header "If-Match"',
    })
    @ApiResponse({
        status: HttpStatus.PRECONDITION_REQUIRED,
        description: 'Header "If-Match" fehlt',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async put(
        @Body() pflanzeDTO: PflanzeDtoOhneRef,
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @Headers('If-Match') version: string | undefined,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'put: id=%s, pflanzeDTO=%o, version=%s',
            id,
            pflanzeDTO,
            version,
        );

        if (version === undefined) {
            const msg = 'Header "If-Match" fehlt';
            this.#logger.debug('put: msg=%s', msg);
            return res
                .status(HttpStatus.PRECONDITION_REQUIRED)
                .set('Content-Type', 'application/json')
                .send(msg);
        }

        const pflanze = this.#pflanzeDtoOhneRefToPflanze(pflanzeDTO);
        const neueVersion = await this.#service.update({
            id,
            pflanze,
            version,
        });
        this.#logger.debug('put: version=%d', neueVersion);
        return res.header('ETag', `"${neueVersion}"`).send();
    }

    @Delete(':id')
    @Roles({ roles: ['admin'] })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Pflanze mit der ID löschen' })
    @ApiNoContentResponse({
        description: 'Das Pflanze wurde gelöscht oder war nicht vorhanden',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async delete(@Param('id') id: number) {
        this.#logger.debug('delete: id=%s', id);
        await this.#service.delete(id);
    }

    #mapPflanzeDtoToEntity(pflanzeDTO: PflanzeDTO): Pflanze {
        const abbildungen = pflanzeDTO.abbildungen?.map((abbildungDTO) => {
            const abbildung: Abbildung = {
                id: undefined,
                beschriftung: abbildungDTO.beschriftung,
                contentType: abbildungDTO.contentType,
                pflanze: undefined,
            };
            return abbildung;
        });
        const pflanze: Pflanze = {
            id: undefined,
            version: undefined,
            name: pflanzeDTO.name,
            typ: pflanzeDTO.typ,
            schlagwoerter: pflanzeDTO.schlagwoerter,
            abbildungen,
            file: undefined,
            erzeugt: new Date(),
            aktualisiert: new Date(),
        };

        // Rückwärtsverweise
        pflanze.abbildungen?.forEach((abbildung) => {
            abbildung.pflanze = pflanze;
        });
        return pflanze;
    }

    #pflanzeDtoOhneRefToPflanze(pflanzeDTO: PflanzeDtoOhneRef): Pflanze {
        return {
            id: undefined,
            version: undefined,
            name: pflanzeDTO.name,
            typ: pflanzeDTO.typ,
            schlagwoerter: pflanzeDTO.schlagwoerter,
            abbildungen: undefined,
            file: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
        };
    }
}
