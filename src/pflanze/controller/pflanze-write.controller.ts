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
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { Express, Request, Response } from 'express';
import { AuthGuard, Public, Roles } from 'nest-keycloak-connect';
import { paths } from '../../config/paths.js';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Abbildung } from '../entity/abbildung.entity.js';
import { type Pflanze } from '../entity/pflanze.entity.js';
import { type Titel } from '../entity/titel.entity.js';
import { PflanzeWriteService } from '../service/pflanze-write.service.js';
import { PflanzeDTO, PflanzeDtoOhneRef } from './pflanzeDTO.entity.js';
import { createBaseUri } from './createBaseUri.js';

const MSG_FORBIDDEN = 'Kein Token mit ausreichender Berechtigung vorhanden';
/**
 * Die Controller-Klasse für die Verwaltung von Pflanzen.
 */
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

    const pflanze = this.#pflanzeDtoToPflanze(pflanzeDTO);
    const id = await this.#service.create(pflanze);

    const location = `${createBaseUri(req)}/${id}`;
    this.#logger.debug('post: location=%s', location);
    return res.location(location).send();
    }

   /**
     * Zu einem gegebenen Pflanze wird eine Binärdatei, z.B. ein Bild, hochgeladen.
     * Nest realisiert File-Upload mit POST.
     * https://docs.nestjs.com/techniques/file-upload.
     * Postman: Body mit "form-data", key: "file" und "File" im Dropdown-Menü
     * @param id ID der vorhandenen Pflanze
     * @param file Binärdatei als `File`-Objekt von _Multer_.
     * @param req: Request-Objekt von Express für den Location-Header.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Post(':id')
    @Public()
    // @Roles({ roles: ['admin']})
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Binärdatei mit einem Bild hochladen' })
    @ApiParam({
        name: 'id',
        description: 'Z.B. 1',
    })
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
            'addFile: id: %d, originalname=%s, mimetype=%s',
            id,
            file.originalname,
            file.mimetype,
        );

        // TODO Dateigroesse pruefen

        await this.#service.addFile(
            id,
            file.buffer,
            file.originalname,
            file.mimetype,
        );

        const location = `${createBaseUri(req)}/file/${id}`;
        this.#logger.debug('addFile: location=%s', location);
        return res.location(location).send();
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
        const neueVersion = await this.#service.update({ id, pflanze, version });
        this.#logger.debug('put: version=%d', neueVersion);
        return res.header('ETag', `"${neueVersion}"`).send();
    }

     /**
     * Ein Pflanze wird anhand seiner ID-gelöscht, die als Pfad-Parameter angegeben
     * ist. Der zurückgelieferte Statuscode ist `204` (`No Content`).
     *
     * @param id Pfad-Paramater für die ID.
     * @returns Leeres Promise-Objekt.
     */
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
 
     #pflanzeDtoToPflanze(pflanzeDTO: PflanzeDTO): Pflanze {
         const titelDTO = pflanzeDTO.titel;
         const titel: Titel = {
             id: undefined,
             titel: titelDTO.titel,
             untertitel: titelDTO.untertitel,
             pflanze: undefined,
         };
         const abbildungen = pflanzeDTO.abbildungen?.map((abbildungDTO) => {
             const abbildung: Abbildung = {
                 id: undefined,
                 beschriftung: abbildungDTO.beschriftung,
                 contentType: abbildungDTO.contentType,
                 pflanze: undefined,
             };
             return abbildung;
         });
         const pflanze = {
             id: undefined,
             version: undefined,
             name: pflanzeDTO.name,
             schlagwoerter: pflanzeDTO.schlagwoerter,
             titel,
             abbildungen,
             file: undefined,
             erzeugt: new Date(),
             aktualisiert: new Date(),
         };
 
         // Rueckwaertsverweise
         pflanze.titel.pflanze = pflanze;
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
            schlagwoerter: pflanzeDTO.schlagwoerter,
            titel: undefined,
            abbildungen: undefined,
            file: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
        };
    }
}
    

 