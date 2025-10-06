export type OperationArgs = Record<string, unknown>;

export type OperationHandler = (args: OperationArgs, signal?: AbortSignal) => Promise<unknown>;

export type OperationMap = Record<string, OperationHandler>;
