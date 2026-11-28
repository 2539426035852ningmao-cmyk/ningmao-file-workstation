export const animals: ReadonlyArray<readonly [id: string, name: string]>;
export const avatarSize: number;
export const photoAvatarId: RegExp;
export function isAnimalAvatar(id: unknown): id is string;
export function defaultAnimalAvatar(accountId: string): string;
