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

import { UseFilters, UseInterceptors } from '@nestjs/common';
import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { Public } from 'nest-keycloak-connect';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { Pflanze } from '../entity/pflanze.entity.js';
import { PflanzeReadService } from '../service/pflanze-read.service.js';
import { createPageable } from '../service/pageable.js';
import { type Suchkriterien } from '../service/suchkriterien.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

export type IdInput = {
    readonly id: number;
};

export type SuchkriterienInput = {
    readonly suchkriterien: Suchkriterien;
};

@Resolver('Pflanze')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseTimeInterceptor)
export class PflanzeQueryResolver {
    readonly #service: PflanzeReadService;

    readonly #logger = getLogger(PflanzeQueryResolver.name);

    constructor(service: PflanzeReadService) {
        this.#service = service;
    }

    @Query('pflanze')
    @Public()
    async findById(@Args() { id }: IdInput) {
        this.#logger.debug('findById: id=%d', id);

        const pflanze = await this.#service.findById({ id });

        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: pflanze=%s, titel=%o',
                pflanze.toString(),
                pflanze.titel,
            );
        }
        return pflanze;
    }

    @Query('buecher')
    @Public()
    async find(@Args() input: SuchkriterienInput | undefined) {
        this.#logger.debug('find: input=%o', input);
        const pageable = createPageable({});
        const buecherSlice = await this.#service.find(
            input?.suchkriterien,
            pageable,
        );
        this.#logger.debug('find: buecherSlice=%o', buecherSlice);
        return buecherSlice.content;
    }

    @ResolveField('rabatt')
    rabatt(@Parent() pflanze: Pflanze, short: boolean | undefined) {
        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'rabatt: pflanze=%s, short=%s',
                pflanze.toString(),
                short,
            );
        }
        // "Nullish Coalescing" ab ES2020
        const rabatt = pflanze.rabatt ?? Decimal(0);
        const shortStr = short === undefined || short ? '%' : 'Prozent';
        return `${rabatt.toString()} ${shortStr}`;
    }
}
