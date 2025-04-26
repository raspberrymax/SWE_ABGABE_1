import { ApiProperty } from '@nestjs/swagger';
import Decimal from 'decimal.js'; // falls du weiterhin decimal.js nutzen möchtest
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
import { DecimalTransformer } from './decimal-transformer.js';
import { Abbildung } from './abbildung.entity.js';
import { PflanzeFile } from './pflanzeFile.entity.js';

@Entity()
export class Pflanze {
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @VersionColumn()
    readonly version: number | undefined;

    @Column()
    @ApiProperty({ example: 'Ficus lyrata', type: String })
    name!: string;

    @Column({ type: 'varchar', nullable: true })
    @ApiProperty({ example: 'STRAUCH', type: String })
    art: string | undefined;

    @Column('decimal', {
        precision: 8,
        scale: 2,
        transformer: new DecimalTransformer(),
        nullable: true,
    })
    @ApiProperty({ example: 29.99, type: Number })
    preis: Decimal | undefined;

    @Column({ type: 'boolean', default: true })
    @ApiProperty({ example: true, type: Boolean })
    lieferbar: boolean | undefined;

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
    erzeugt: Date | undefined;

    @UpdateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    aktualisiert: Date | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            version: this.version,
            name: this.name,
            art: this.art,
            preis: this.preis,
            lieferbar: this.lieferbar,
            erzeugt: this.erzeugt,
            aktualisiert: this.aktualisiert,
        });
}
