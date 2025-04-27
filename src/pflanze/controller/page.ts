import { Pageable } from '../service/pageable.js';
import { Slice } from '../service/slice.js';

export type Page<T> = {
    readonly content: T[];
    readonly page: {
        readonly size: number;
        readonly number: number;
        readonly totalElements: number;
        readonly totalPages: number;
    };
};

export function createPage<T>(slice: Slice<T>, pageable: Pageable): Page<T> {
    const { content, totalElements } = slice;
    const { size, number } = pageable;
    return {
        content,
        page: {
            size,
            number,
            totalElements,
            totalPages: Math.ceil(totalElements / size),
        },
    };
}
