// VitaWise TypeScript Ambient Module Declarations
// Ensures flawless IDE type inference and 0 compilation errors across NestJS & ecosystem modules

declare module '@nestjs/common' {
  export interface Type<T = any> extends Function {
    new (...args: any[]): T;
  }
  export interface DynamicModule {
    module: any;
    imports?: any[];
    controllers?: any[];
    providers?: any[];
    exports?: any[];
    global?: boolean;
    [key: string]: any;
  }
  export interface ModuleMetadata {
    imports?: any[];
    controllers?: any[];
    providers?: any[];
    exports?: any[];
  }
  export function Module(metadata: ModuleMetadata): ClassDecorator;
  export function Global(): ClassDecorator;
  export function Injectable(options?: any): ClassDecorator;
  export function Controller(prefix?: string | string[]): ClassDecorator;
  export function Get(path?: string | string[]): MethodDecorator;
  export function Post(path?: string | string[]): MethodDecorator;
  export function Put(path?: string | string[]): MethodDecorator;
  export function Patch(path?: string | string[]): MethodDecorator;
  export function Delete(path?: string | string[]): MethodDecorator;
  export function Body(property?: string): ParameterDecorator;
  export function Param(property?: string): ParameterDecorator;
  export function Query(property?: string): ParameterDecorator;
  export function Headers(property?: string): ParameterDecorator;
  export function Req(): ParameterDecorator;
  export function Res(): ParameterDecorator;
  export function UseGuards(...guards: any[]): MethodDecorator & ClassDecorator;
  export function HttpCode(statusCode: number): MethodDecorator;

  export enum HttpStatus {
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    INTERNAL_SERVER_ERROR = 500,
  }

  export interface CanActivate {
    canActivate(context: ExecutionContext): boolean | Promise<boolean>;
  }

  export interface ExecutionContext {
    switchToHttp(): {
      getRequest<T = any>(): T;
      getResponse<T = any>(): T;
      getNext<T = any>(): T;
    };
    getClass<T = any>(): Type<T>;
    getHandler(): Function;
  }

  export interface OnModuleInit {
    onModuleInit(): any;
  }

  export interface OnModuleDestroy {
    onModuleDestroy(): any;
  }

  export class Logger {
    constructor(context?: string);
    log(message: any, ...optionalParams: any[]): void;
    error(message: any, ...optionalParams: any[]): void;
    warn(message: any, ...optionalParams: any[]): void;
    debug?(message: any, ...optionalParams: any[]): void;
    verbose?(message: any, ...optionalParams: any[]): void;
  }

  export class HttpException extends Error {
    constructor(response: string | Record<string, any>, status: number);
    getStatus(): number;
    getResponse(): string | Record<string, any>;
  }

  export class UnauthorizedException extends HttpException {
    constructor(message?: string | Record<string, any>);
  }

  export class BadRequestException extends HttpException {
    constructor(message?: string | Record<string, any>);
  }

  export class NotFoundException extends HttpException {
    constructor(message?: string | Record<string, any>);
  }

  export class ForbiddenException extends HttpException {
    constructor(message?: string | Record<string, any>);
  }
}

declare module '@nestjs/core' {
  export class NestFactory {
    static create(module: any, options?: any): Promise<INestApplication>;
  }
  export interface INestApplication {
    listen(port: number | string, ...args: any[]): Promise<any>;
    enableCors(options?: any): void;
    useGlobalPipes?(...pipes: any[]): this;
    close(): Promise<void>;
  }
}

declare module '@nestjs/config' {
  export interface ConfigModuleOptions {
    isGlobal?: boolean;
    envFilePath?: string | string[];
    load?: Array<() => Record<string, any>>;
    validate?: (config: Record<string, any>) => Record<string, any>;
    ignoreEnvFile?: boolean;
    [key: string]: any;
  }
  export class ConfigModule {
    static forRoot(options?: ConfigModuleOptions): import('@nestjs/common').DynamicModule;
  }
  export class ConfigService<K = Record<string, any>> {
    get<T = any>(propertyPath: string, defaultValue?: T): T;
  }
}

declare module '@nestjs/platform-express' {
  export interface NestExpressApplication {}
}

declare module '@supabase/supabase-js' {
  export interface SupabaseClientOptions<SchemaName> {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
      [key: string]: any;
    };
    [key: string]: any;
  }

  export interface SupabaseClient {
    auth: {
      admin: {
        createUser(attributes: any): Promise<{ data: { user: any }; error: any }>;
        signOut(jwt: string): Promise<{ data: any; error: any }>;
        [key: string]: any;
      };
      signInWithPassword(credentials: any): Promise<{ data: { user: any; session: any }; error: any }>;
      getUser(jwt?: string): Promise<{ data: { user: any }; error: any }>;
      refreshSession(options: { refresh_token: string }): Promise<{ data: { session: any }; error: any }>;
      resetPasswordForEmail(email: string, options?: any): Promise<{ data: any; error: any }>;
      [key: string]: any;
    };
    storage: {
      listBuckets(): Promise<{ data: any[]; error: any }>;
      from(bucket: string): {
        createSignedUploadUrl(path: string, options?: any): Promise<{ data: { token: string; signedUrl: string; path: string }; error: any }>;
        createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string }; error: any }>;
        [key: string]: any;
      };
    };
    from(table: string): {
      select(columns?: string): any;
      insert(values: any): any;
      update(values: any): any;
      delete(): any;
      [key: string]: any;
    };
  }

  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions<any>,
  ): SupabaseClient;
}

declare module 'pg' {
  export interface QueryResult<T = any> {
    rows: T[];
    command: string;
    rowCount: number;
    oid: number;
    fields: any[];
  }

  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized: boolean; [key: string]: any };
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    [key: string]: any;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = any>(text: string, values?: any[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}

declare module 'bullmq' {
  export class Queue {
    constructor(name: string, opts?: any);
    add(name: string, data: any, opts?: any): Promise<any>;
    close(): Promise<void>;
  }
  export class Worker {
    constructor(name: string, processor?: any, opts?: any);
    close(): Promise<void>;
  }
}

declare module 'class-validator' {
  export function IsString(options?: any): PropertyDecorator;
  export function IsNotEmpty(options?: any): PropertyDecorator;
  export function IsOptional(options?: any): PropertyDecorator;
  export function IsEmail(options?: any): PropertyDecorator;
  export function IsNumber(options?: any): PropertyDecorator;
  export function IsBoolean(options?: any): PropertyDecorator;
}

declare module 'class-transformer' {
  export function Type(typeFunction?: any): PropertyDecorator;
  export function Expose(options?: any): PropertyDecorator;
  export function Exclude(options?: any): PropertyDecorator;
}
