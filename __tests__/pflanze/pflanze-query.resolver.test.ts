/* eslint-disable max-lines, @typescript-eslint/no-non-null-assertion */
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

import { type GraphQLRequest } from '@apollo/server';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import {
    type Pflanze,
    type PflanzeTyp,
} from '../../src/pflanze/entity/pflanze.entity.js';
import { type GraphQLResponseBody } from '../graphql.js';
import {
    host,
    httpsAgent,
    port,
    shutdownServer,
    startServer,
} from '../testserver.js';

type PflanzeDTO = Omit<
    Pflanze,
    'abbildungen' | 'aktualisiert' | 'erzeugt' | 'file'
>;

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const idVorhanden = '1';

const nameVorhanden = 'Photus';
const teilNameVorhanden = 'Ph';
const teilNameNichtVorhanden = 'xyz';

const typVorhanden = 'INDOOR';

const schlagwortVorhanden = 'SCHATTENPFLANZE';

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
// eslint-disable-next-line max-lines-per-function
describe('GraphQL Queries', () => {
    let client: AxiosInstance;
    const graphqlPath = 'graphql';

    // Testserver starten und dabei mit der DB verbinden
    beforeAll(async () => {
        await startServer();
        const baseURL = `https://${host}:${port}/`;
        client = axios.create({
            baseURL,
            httpsAgent,
            // auch Statuscode 400 als gueltigen Request akzeptieren, wenn z.B.
            // ein Enum mit einem falschen String getestest wird
            validateStatus: () => true,
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Pflanze zu vorhandener ID', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    pflanze(id: "${idVorhanden}") {
                        version
                        name
                        typ
                        schlagwoerter
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { pflanze } = data.data! as { pflanze: PflanzeDTO };

        expect(pflanze.name).toMatch(/^\w/u);
        expect(pflanze.version).toBeGreaterThan(-1);
        expect(pflanze.id).toBeUndefined();
    });

    test('Pflanze zu nicht-vorhandener ID', async () => {
        // given
        const id = '999999';
        const body: GraphQLRequest = {
            query: `
                {
                    pflanze(id: "${id}") {
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.pflanze).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toBe(`Es gibt keine Pflanze mit der ID ${id}.`);
        expect(path).toBeDefined();
        expect(path![0]).toBe('pflanze');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Pflanze zu vorhandenem Namen', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    pflanzen(suchkriterien: {
                        name: "${nameVorhanden}"
                    }) {
                        typ
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { pflanzen } = data.data! as { pflanzen: PflanzeDTO[] };

        expect(pflanzen).not.toHaveLength(0);
        expect(pflanzen).toHaveLength(1);

        const [pflanze] = pflanzen;

        expect(pflanze!.name).toBe(nameVorhanden);
    });

    test('Pflanze zu vorhandenem Teil-Namen', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    pflanzen(suchkriterien: {
                        name: "${teilNameVorhanden}"
                    }) {
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { pflanzen } = data.data! as { pflanzen: PflanzeDTO[] };

        expect(pflanzen).not.toHaveLength(0);

        pflanzen.forEach((pflanze) => {
            expect(pflanze.name.toLowerCase()).toEqual(
                expect.stringContaining(teilNameVorhanden.toLowerCase()),
            );
        });
    });

    test('Pflanze zu nicht vorhandenem Namen', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    pflanzen(suchkriterien: {
                        name: "${teilNameNichtVorhanden}"
                    }) {
                        typ
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.pflanzen).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Pflanzen gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('pflanzen');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Pflanzen zum Typ "INDOOR"', async () => {
        // given
        const pflanzeTyp: PflanzeTyp = 'INDOOR';
        const body: GraphQLRequest = {
            query: `
                {
                    pflanzen(suchkriterien: {
                        typ: ${pflanzeTyp}
                    }) {
                        typ
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { pflanzen } = data.data! as { pflanzen: PflanzeDTO[] };

        expect(pflanzen).not.toHaveLength(0);

        pflanzen.forEach((pflanze) => {
            const { typ, name } = pflanze;

            expect(typ).toBe(pflanzeTyp);
            expect(name).toBeDefined();
        });
    });

    test('Pflanzen zu einem ungültigen Typ', async () => {
        // given
        const pflanzeTyp = 'UNGUELTIG';
        const body: GraphQLRequest = {
            query: `
                {
                    pflanzen(suchkriterien: {
                        typ: ${pflanzeTyp}
                    }) {
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.BAD_REQUEST);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data).toBeUndefined();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { extensions } = error;

        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('GRAPHQL_VALIDATION_FAILED');
    });

    test('Pflanzen mit vorhandenem Schlagwort', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    pflanzen(suchkriterien: {
                        schlagwoerter: ["${schlagwortVorhanden}"]
                    }) {
                        schlagwoerter
                        name
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { pflanzen } = data.data! as { pflanzen: PflanzeDTO[] };

        expect(pflanzen).not.toHaveLength(0);

        pflanzen.forEach((pflanze) => {
            const { schlagwoerter, name } = pflanze;

            expect(schlagwoerter).toContain(schlagwortVorhanden);
            expect(name).toBeDefined();
        });
    });
});

/* eslint-enable max-lines, , @typescript-eslint/no-non-null-assertion */
