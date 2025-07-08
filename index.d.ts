declare interface ConfigEndpoint<T> {
	get?: () => T;
	set?: (value: T) => void;
}

declare type ConfigTypeMap = {
	boolean: boolean;
	string: string;
	number: number;
	object: object;
	array: any[]; // []
	any: any;
}

export function alias(id: string): void;
export function registerConfig<Type extends keyof ConfigTypeMap>(key: string, type: Type, endpoint: ConfigEndpoint<ConfigTypeMap[Type]>): void;
