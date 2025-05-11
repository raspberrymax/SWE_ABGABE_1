import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Pflanze } from './pflanze.entity.js';

@Entity()
export class Abbildung {
    // https://typeorm.io/entities#primary-columns
    // CAVEAT: zuerst @Column() und erst dann @PrimaryGeneratedColumn()
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @Column()
    readonly beschriftung!: string;

    @Column('varchar')
    readonly contentType: string | undefined;

    @ManyToOne(() => Pflanze, (pflanze) => pflanze.abbildungen)
    @JoinColumn({ name: 'pflanze_id' })
    pflanze: Pflanze | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            beschriftung: this.beschriftung,
            contentType: this.contentType,
        });
}
