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

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module.js';
import { KeycloakModule } from '../security/keycloak/keycloak.module.js';
import { PflanzeGetController } from './controller/pflanze-get.controller.js';
import { PflanzeWriteController } from './controller/pflanze-write.controller.js';
import { entities } from './entity/entities.js';
import { PflanzeMutationResolver } from './resolver/pflanze-mutation.resolver.js';
import { PflanzeQueryResolver } from './resolver/pflanze-query.resolver.js';
import { PflanzeReadService } from './service/pflanze-read.service.js';
import { PflanzeWriteService } from './service/pflanze-write.service.js';
import { QueryBuilder } from './service/query-builder.js';

/**
 * Das Modul für die Pflanzen-Anwendung.
 * @packageDocumentation
 */

/**
 * Die dekorierte Modul-Klasse mit Controller- und Service-Klassen sowie der
 * Funktionalität für TypeORM.
 */
@Module({
    imports: [KeycloakModule, MailModule, TypeOrmModule.forFeature(entities)],
    controllers: [PflanzeGetController, PflanzeWriteController],
    // Provider sind z.B. Service-Klassen fuer DI
    providers: [
        PflanzeReadService,
        PflanzeWriteService,
        PflanzeQueryResolver,
        PflanzeMutationResolver,
        QueryBuilder,
    ],
    // Export der Provider fuer DI in anderen Modulen
    exports: [PflanzeReadService, PflanzeWriteService],
})
export class PflanzeModule {}
