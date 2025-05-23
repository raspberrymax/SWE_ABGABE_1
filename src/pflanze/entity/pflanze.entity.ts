/**
 * Das Modul besteht aus der Entity-Klasse.
 * @packageDocumentation
 */

import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { dbType } from '../../config/db.js';
import { Abbildung } from './abbildung.entity.js';
import { PflanzeFile } from './pflanzeFile.entity.js';

export type PflanzeTyp = 'INDOOR' | 'OUTDOOR';

@Entity()
export class Pflanze {
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @VersionColumn()
    readonly version: number | undefined;

    @Column()
    @ApiProperty({ example: 'Photus', type: String })
    readonly name!: string;

    @Column('varchar')
    @ApiProperty({ example: 'INDOOR', type: String })
    readonly typ: PflanzeTyp | undefined;

    @Column('simple-array')
    schlagwoerter: string[] | null | undefined;

    @OneToMany(() => Abbildung, (abbildung) => abbildung.pflanze, {
        cascade: ['insert', 'remove'],
    })
    readonly abbildungen: Abbildung[] | undefined;

    @OneToOne(() => PflanzeFile, (pflanzeFile) => pflanzeFile.pflanze, {
        cascade: ['insert', 'remove'],
    })
    readonly file: PflanzeFile | undefined;

    @CreateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    readonly erzeugt: Date | undefined;

    @UpdateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    readonly aktualisiert: Date | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            version: this.version,
            name: this.name,
            typ: this.typ,
            schlagwoerter: this.schlagwoerter,
            erzeugt: this.erzeugt,
            aktualisiert: this.aktualisiert,
        });
}
