import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { IsInt, IsNumberString, Min } from 'class-validator';
import { AuthGuard, Roles } from 'nest-keycloak-connect';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { PflanzeDTO } from '../controller/pflanzeDTO.entity.js';
import { type Abbildung } from '../entity/abbildung.entity.js';
import { type Pflanze } from '../entity/pflanze.entity.js';
import { PflanzeWriteService } from '../service/pflanze-write.service.js';
import { type IdInput } from './pflanze-query.resolver.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

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
        this.#logger.debug('update: pflanzeDTO=%o', pflanzeDTO);

        const pflanze = this.#pflanzeUpdateDtoToPflanze(pflanzeDTO);
        const versionStr = `"${pflanzeDTO.version.toString()}"`;

        const versionResult = await this.#service.update({
            id: Number.parseInt(pflanzeDTO.id, 10),
            pflanze,
            version: versionStr,
        });
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
        this.#logger.debug(
            'deletePflanze: deletePerformed=%s',
            deletePerformed,
        );
        return deletePerformed;
    }

    #pflanzeDtoToPflanze(pflanzeDTO: PflanzeDTO): Pflanze {
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
            typ: pflanzeDTO.typ,
            name: pflanzeDTO.name, // Anpassung: 'name' statt 'titel'
            schlagwoerter: pflanzeDTO.schlagwoerter,
            abbildungen,
            erzeugt: new Date(),
            aktualisiert: new Date(),
            file: undefined,
        };

        return pflanze;
    }

    #pflanzeUpdateDtoToPflanze(pflanzeDTO: PflanzeUpdateDTO): Pflanze {
        return {
            id: undefined,
            version: undefined,
            typ: pflanzeDTO.typ,
            name: pflanzeDTO.name, // Anpassung: 'name' statt 'titel'
            schlagwoerter: pflanzeDTO.schlagwoerter,
            abbildungen: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
            file: undefined,
        };
    }
}
