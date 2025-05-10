import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayUnique,
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { AbbildungDTO } from './abbildungDTO.entity.js';
import { PflanzeTyp } from '../entity/pflanze.entity.js';

export class PflanzeDtoOhneRef {
    @IsString()
    @IsNotEmpty({ message: 'name must not be empty' })
    @ApiProperty({ example: 'Photus', type: String })
    readonly name!: string;

    @IsEnum(['INDOOR', 'OUTDOOR'])
    @ApiProperty({ example: 'INDOOR', type: String })
    readonly typ: PflanzeTyp | undefined;

    @IsOptional()
    @ArrayUnique()
    @IsArray()
    @ApiProperty({
        example: ['pflegeleicht', 'schattenliebend'],
        type: [String],
    })
    readonly schlagwoerter: string[] | undefined;
}

export class PflanzeDTO extends PflanzeDtoOhneRef {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AbbildungDTO)
    @ApiProperty({ type: [AbbildungDTO] })
    readonly abbildungen: AbbildungDTO[] | undefined;
}
