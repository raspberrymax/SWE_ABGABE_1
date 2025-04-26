// Copyright (C) 2021 - present Juergen Zimmermann, Hochschule Karlsruhe
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

// eslint-disable-next-line max-classes-per-file
import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { IsInt, IsNumberString, Min } from 'class-validator';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { AuthGuard, Roles } from 'nest-keycloak-connect';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { PflanzeDTO } from '../controller/pflanzeDTO.entity.js';
import { type Abbildung } from '../entity/abbildung.entity.js';
import { type Pflanze } from '../entity/pflanze.entity.js';
import { type Titel } from '../entity/titel.entity.js';
import { PflanzeWriteService } from '../service/pflanze-write.service.js';
import { type IdInput } from './pflanze-query.resolver.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

// Authentifizierung und Autorisierung durch
//  GraphQL Shield
//      https://www.graphql-shield.com
//      https://github.com/maticzav/graphql-shield
//      https://github.com/nestjs/graphql/issues/92
//      https://github.com/maticzav/graphql-shield/issues/213
//  GraphQL AuthZ
//      https://github.com/AstrumU/graphql-authz
//      https://www.the-guild.dev/blog/graphql-authz

export type CreatePayload = {
    readonly id: number;
};

export type UpdatePayload = {
    readonly version: number;
};

export class PflanzeUpdateDTO extends PflanzeDTO {
    @IsNumberString()
    readonly id!: string;

    @IsInt()
    @Min(0)
    readonly version!: number;
}
@Resolver('Pflanze')
// alternativ: globale Aktivierung der Guards https://docs.nestjs.com/security/authorization#basic-rbac-implementation
@UseGuards(AuthGuard)
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseTimeInterceptor)
export class PflanzeMutationResolver {
    readonly #service: PflanzeWriteService;

    readonly #logger = getLogger(PflanzeMutationResolver.name);

    constructor(service: PflanzeWriteService) {
        this.#service = service;
    }

    @Mutation()
    @Roles({ roles: ['admin', 'user'] })
    async create(@Args('input') pflanzeDTO: PflanzeDTO) {
        this.#logger.debug('create: pflanzeDTO=%o', pflanzeDTO);

        const pflanze = this.#pflanzeDtoToPflanze(pflanzeDTO);
        const id = await this.#service.create(pflanze);
        this.#logger.debug('createPflanze: id=%d', id);
        const payload: CreatePayload = { id };
        return payload;
    }

    @Mutation()
    @Roles({ roles: ['admin', 'user'] })
    async update(@Args('input') pflanzeDTO: PflanzeUpdateDTO) {
        this.#logger.debug('update: pflanze=%o', pflanzeDTO);

        const pflanze = this.#pflanzeUpdateDtoToPflanze(pflanzeDTO);
        const versionStr = `"${pflanzeDTO.version.toString()}"`;

        const versionResult = await this.#service.update({
            id: Number.parseInt(pflanzeDTO.id, 10),
            pflanze,
            version: versionStr,
        });
        // TODO BadUserInputError
        this.#logger.debug('updatePflanze: versionResult=%d', versionResult);
        const payload: UpdatePayload = { version: versionResult };
        return payload;
    }

    @Mutation()
    @Roles({ roles: ['admin'] })
    async delete(@Args() id: IdInput) {
        const idStr = id.id;
        this.#logger.debug('delete: id=%s', idStr);
        const deletePerformed = await this.#service.delete(idStr);
        this.#logger.debug('deletePflanze: deletePerformed=%s', deletePerformed);
        return deletePerformed;
    }

    #pflanzeDtoToPflanze(pflanzeDTO: PflanzeDTO): Pflanze {
        const titelDTO = pflanzeDTO.titel;
        const titel: Titel = {
            id: undefined,
            titel: titelDTO.titel,
            untertitel: titelDTO.untertitel,
            pflanze: undefined,
        };
        // "Optional Chaining" ab ES2020
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
            isbn: pflanzeDTO.isbn,
            rating: pflanzeDTO.rating,
            art: pflanzeDTO.art,
            preis: Decimal(pflanzeDTO.preis),
            rabatt: Decimal(pflanzeDTO.rabatt ?? ''),
            lieferbar: pflanzeDTO.lieferbar,
            datum: pflanzeDTO.datum,
            homepage: pflanzeDTO.homepage,
            schlagwoerter: pflanzeDTO.schlagwoerter,
            titel,
            abbildungen,
            file: undefined,
            erzeugt: new Date(),
            aktualisiert: new Date(),
        };

        // Rueckwaertsverweis
        pflanze.titel!.pflanze = pflanze;
        return pflanze;
    }

    #pflanzeUpdateDtoToPflanze(pflanzeDTO: PflanzeUpdateDTO): Pflanze {
        return {
            id: undefined,
            version: undefined,
            isbn: pflanzeDTO.isbn,
            rating: pflanzeDTO.rating,
            art: pflanzeDTO.art,
            preis: Decimal(pflanzeDTO.preis),
            rabatt: Decimal(pflanzeDTO.rabatt ?? ''),
            lieferbar: pflanzeDTO.lieferbar,
            datum: pflanzeDTO.datum,
            homepage: pflanzeDTO.homepage,
            schlagwoerter: pflanzeDTO.schlagwoerter,
            titel: undefined,
            abbildungen: undefined,
            file: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
        };
    }

    // #errorMsgCreatePflanze(err: CreateError) {
    //     switch (err.type) {
    //         case 'IsbnExists': {
    //             return `Die ISBN ${err.isbn} existiert bereits`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }

    // #errorMsgUpdatePflanze(err: UpdateError) {
    //     switch (err.type) {
    //         case 'PflanzeNotExists': {
    //             return `Es gibt kein Pflanze mit der ID ${err.id}`;
    //         }
    //         case 'VersionInvalid': {
    //             return `"${err.version}" ist keine gueltige Versionsnummer`;
    //         }
    //         case 'VersionOutdated': {
    //             return `Die Versionsnummer "${err.version}" ist nicht mehr aktuell`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }
}
