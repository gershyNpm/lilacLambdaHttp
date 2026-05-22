import '@gershy/clearing';
import { LambdaBase, type LambdaShape } from '@gershy/lilac-lambda';
import type Logger from '@gershy/logger';
import type { Codec } from '@gershy/util-codec-parse';
import type { Jsfn } from '@gershy/util-jsfn-encode';

type LambdaShapeHttp = LambdaShape & {
  
  ctx: {
    callbackWaitsForEmptyEventLoop: boolean,
    clientContext: unknown,
    invokedFunctionArn: string,
    awsRequestId: string,
    getRemainingTimeInMillis: () => number
  },
  req: {
    path: string,
    httpMethod: string,
    
    // Consider: no headers currently; they're all filtered out by cloudfront!
    headers: Obj<string>,
    multiValueHeaders: Obj<string[]>,
    
    queryStringParameters: any,
    multiValueQueryStringParameters: Obj<string[]>,
    requestContext: {
      
      // The properties always show up:
      identity:   { sourceIp: `${number}.${number}.${number}.${number}` }, // Consider: typing is probably wrong for ipv6
      stage:      string,
      domainName: string,
      resourceId: `${'GET' | 'POST' | 'PUT'} /${string}`,
        
      // TODO: Websockets should be handled in a separate lambda subclass
      // // These show up for socket connections:
      // routeKey?:     '$connect' | '$disconnect' | string,
      // eventType?:    'CONNECT' | 'DISCONNECT' | string,
      // connectedAt?:  number,
      // connectionId?: string,
      
      stageVariables: Obj<string>
      
    },
    body: any, // Consider testing how this value looks? And is it coupled with "isBase64Encoded"??
    isBase64Encoded: boolean,
  },
  res: {
    statusCode: number,
    headers: { [K: string]: string | string[] },
    isBase64Encoded?: boolean
    body: Json,
  },
  
  invokeRes: { code: number, headers?: Obj<string> } & (
    | { base64?: false, body: Json }
    | { base64:  true,  body: string | ArrayBuffer }
  )
  
};
export class LambdaHttp<
  LocalData extends Jsfn,                      // Data provided to lambda by project
  Res extends LambdaShapeHttp['invokeRes'], // The lambda's particular response
  LaunchData,                                  // Arbitrary data initialized by lambda on cold-start
  Cdc extends Codec.Rec<any>,                  // Codec for validating incoming invocation args
  Env extends Obj<string>                      // Environment vars (main use-case is for passing arbitrary infra values to lambda)
> extends LambdaBase<LambdaShapeHttp, Res, LocalData, LaunchData, Cdc, Env> {
  
  public getGenericCodecFn(): ReturnType<LambdaBase<any, any, any, any, any, any>['getGenericCodecFn']> {
    
    return () => {
      
      let builtStrsCodec: Codec.Map<any> = { type: 'map', item: { type: 'oneOf', opts: [ { type: 'str' } ] }};
      builtStrsCodec.item.opts.push(builtStrsCodec);
      return {
        type: 'rec',
        props: {
          path:    { type: 'arr',  item: { type: 'str' } },
          method:  { type: 'enum', opts: [ 'head', 'get', 'post', 'put', 'patch', 'delete' ] },
          headers: { type: 'map',  item: { type: 'arr', item: { type: 'str' } } },
          cookies: builtStrsCodec,
          query:   builtStrsCodec,
          body:    { type: 'any' }
        }
      };
      
    };
    
  }
  
  public getInvokeWrapper() {
    
    type LbdCls = typeof LambdaBase<LambdaShapeHttp, any, any, any, any, any>;
    type LbdInvokeWrapper = ReturnType<InstanceType<LbdCls>['getInvokeWrapper']>;
    
    return (async (args: {
      
      jsfnImport: (fp: string) => any,
      debug:      boolean,
      logger:     Logger,
      codec:      Cdc,
      launchData: LaunchData,
      shapeData:  Pick<LambdaShapeHttp, 'ctx' | 'req'>,
      invokeFn:   LambdaBase<LambdaShapeHttp, Res, LocalData, LaunchData, Cdc, Env>['invokeFn']
      
    }) => {
      
      const { default: codecParse } = args.jsfnImport('@gershy/util-codec-parse') as typeof import('@gershy/util-codec-parse');
      
      const { isCls, skip } = cl;
      const mapk:  typeof cl.mapk  = cl.mapk;
      const lower: typeof cl.lower = cl.lower;
      const walk:  typeof cl.walk  = cl.walk;
      const at:    typeof cl.at    = cl.at;
      const map:   typeof cl.map   = cl.map;
      const toObj: typeof cl.toObj = cl.toObj;
      const cut:   typeof cl.cut   = cl.cut;
      const slash: typeof cl.slash = cl.slash;
      const limn:  typeof cl.limn  = cl.limn;
      const merge: typeof cl.merge = cl.merge;
      
      // linear
      // nested
      
      const ms = Date.now();
      const { jsfnImport, debug, codec, launchData, shapeData, invokeFn } = args;
      const { ctx, req } = shapeData;
      const logger = args.logger.kid('invoke');
      
      const { code, headers = {}, body, base64 = false } = await (async (): Promise<Res> => {
        
        const headers: Obj<string[]> = (req.multiValueHeaders ?? {})[mapk]((v, k) => [ k[lower](), v ]);
        
        const reqBody = (() => {
          if (!req.body) return null;
          try { return JSON.parse(req.body); } catch(err) {}
          return req.body;
        })();
        
        const build = <O extends Obj<any>>(obj: O) => {
          
          // Convert:
          //    | {
          //    |   'a.b.c': 1,
          //    |   'a.x.y': 2
          //    | }
          // To:
          //    | { a: { b: { c: 1 }, x: { y: 2 } } }
          
          type Built<T> = T | { [K: string]: Built<T> };
          const result: Built<O> = {};
          for (const [ k, v ] of obj[walk]()) {
            
            const dive = k.split('.');
            const last = dive.pop()!;
            let ptr = result;
            for (const cmp of dive) ptr = ptr[at](cmp) ?? (ptr[cmp] = {});
            ptr[last] = isCls(v, Object) ? build(v) : v;
            
          }
          
          return result;
          
        };
        
        const args = {
          
          path: req.path.split('/').filter(v => !!v.trim()),
          method: req.httpMethod[lower](),
          headers: headers[slash]([ 'cookie' ]),
          
          // Note we do not accept multi-value query strings; we ignore any duplicated name beyond
          // the first. To provide an array in a query use e.g. `val.0=a&val.1=b&val.2=c`
          query: build(
            (req.multiValueQueryStringParameters ?? {})
              [map](v => v[0])
          ),
          
          cookies: build(
            (headers.cookie ?? [])
              [map](cookies => cookies.split(/[;][ ]*/))
              .flat(1)
              [toObj](c => {
                const [ k, v ] = c[cut]('=', 1)[map](v => v.trim());
                if (!k || !v) return skip;
                return [ k, v ] as const;
              })
          ),
          
          body: reqBody
          
        };
        
        const dbgArgs = args[slash]([ 'headers' ]);
        
        try {
          
          logger.log({ $$: 'launch', debug, args: dbgArgs });
          
          const parsedArgs = codecParse(codec, args);
          
          const res = await invokeFn({ debug, logger, jsfnImport, shapeData: { ctx, req }, launchData, args: parsedArgs });
          logger.log({ $$: 'accept', ms: Date.now() - ms, res });
          return res;
          
        } catch(err: any) {
          
          if (err.codecParse) err.http = {
            body: {
              desc: 'input rejected',
              args: err.args ?? null,
              chain: err.chain ?? [],
              guard: (err.fn ?? (args => false)).toString().replace(/\s+/g, ' ')
            }
          };
          
          if (err.http) {
            
            // The error representation appears in two places:
            // 1. In logs
            // 2. In the http response, if in "debug" mode
            // In both cases, it's accompanied with the full http response value - since the full
            // http response value is a superset of the error's "http" property, we don't have to
            // include the "http" value in either case!
            const { http = {}, ...errLimn } = err[limn]();
            const res: Res = { code: 400, base64: false, body: { code: 'reject', trace: logger.getTraceId('invoke') } }
              [merge](http as {})
              [merge](debug ? { body: { err: errLimn } } : {}) as any;
            
            // In debug mode, don't log res.body.err - it's already available in the log as "err"
            logger.log({ $$: 'reject', ms: Date.now() - ms, err: errLimn, res: debug ? {}[merge](res)[merge]({ body: { err: skip } }) : res });
            return res;
            
          } else {
            
            const res: Res = { code: 500, body: { code: 'glitch', trace: logger.getTraceId('invoke') } }
              [merge](debug ? { body: { err: err[limn]() } } : {}) as any;
            
            logger.log({ $$: 'glitch', ms: Date.now() - ms, err, res });
            return res;
            
          }
          
        }
        
      })();
      
      const isStringBody = isCls(body, String);
      const hdrs = { contentType: isStringBody ? 'text/plain' : 'application/json', ...headers };
      return {
        statusCode: code,
        headers: hdrs[mapk]((v, k) => [ k.replace(/([A-Z])/g, '-$1')[lower](), v ]), // Kebab-case!
        body: isStringBody ? body : JSON.stringify(body), // TODO: Allow response body to be `skip` (to provide websockets with a way to send *no* response as opposed to `null` response)
        isBase64Encoded: base64
      };
      
    }) satisfies LbdInvokeWrapper;
    
  }
  
};
