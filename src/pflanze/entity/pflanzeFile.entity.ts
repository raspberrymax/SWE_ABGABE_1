import {
    Column,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { binaryType } from '../../config/db.js';
import { Pflanze } from './pflanze.entity.js';

@Entity()
export class PflanzeFile {
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @Column('varchar')
    filename: string | undefined;

    @Column('varchar')
    mimetype: string | undefined;

    @OneToOne(() => Pflanze, (pflanze) => pflanze.file)
    @JoinColumn({ name: 'pflanze_id' })
    pflanze: Pflanze | undefined;

    @Column({ type: binaryType })
    data: Uint8Array | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            filename: this.filename,
            mimetype: this.mimetype,
        });
}
