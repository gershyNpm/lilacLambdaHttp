import Logger from '@gershy/logger';
import { assertEqual, cmpJson, testRunner } from '../build/utils.test.ts';
import { JsfnUtility } from './import.test.ts';
import { LambdaHttp } from './main.ts';
import { rootFact, tempFact } from '@gershy/disk';
import codecParse, { type Codec } from '@gershy/util-codec-parse';

// Type testing
(async () => {
  
  type Enforce<Provided, Expected extends Provided> = { provided: Provided, expected: Expected };
  
  type Tests = {
    1: Enforce<{ x: 'y' }, { x: 'y' }>,
  };
  if (0) ((v?: Tests) => void 0)();
  
})();

testRunner([
  
  { name: 'sourcecode gen', fn: async () => {
    
    // Instantiates a `JsfnUtility` instance with `a = 'util'`, and takes an http body param `b`,
    // which is a number, to call `JsfnUtility.prototype.helperFn`, which returns `a.repeat(b)`
    const lbd = new LambdaHttp({
      name: 'myLbd',
      baseUrl: import.meta.url,
      memoryMb: 128,
      localData: {
        z: 'hi',
        utility: new JsfnUtility({ a: 'util' })
      },
      codec: { type: 'rec' as const, props: { body: { type: 'rec' as const, props: { b: { type: 'num' as const } } } } },
      launchFn: args => ({ utility: args.localData.utility, res: { code: 200 } }),
      invokeFn: ({ launchData, args }) => {
        
        const { res, utility } = launchData;
        return {}[cl.merge](res)[cl.merge]({
          body: {
            req: args,
            res: utility.helperFn({ b: args.body.b })
          }
        });
        
      },
      env: {}
    });
    
    const script = await lbd.getScript({
      ctx: {
        name:      'test',
        logger:    new Logger('test'),
        fact:      rootFact.kid([ import.meta.dirname, 'infra' ]),
        patioFact: rootFact.kid([ import.meta.dirname, 'infra', 'patio' ]),
        shedFact:  tempFact.kid([ '@gershy' ]),
        
        maturity: 'm0',
        debug: true,
        pfx: 'test'
      },
      lang: 'js'
    });
    
    let builtStrsCodec: Codec.Map<any> = { type: 'map', item: {
      type: 'oneOf',
      opts: [
        { type: 'str' },
        // { type: 'map', item: {
        //   type: 'oneOf',
        //   opts: [
        //     { type: 'str' },
        //     { type: 'map', item: { type: 'str' }}
        //   ]
        // }}
      ]
    }};
    builtStrsCodec.item.opts.push(builtStrsCodec);
    
    const require = (term: string) => {
      if (term === '@gershy/clearing') return null;
      if (term === '@gershy/logger') return { default: function() { return Logger.dummy; } }; // Silence lambda logs
      if (term === '@gershy/util-codec-parse') return { default: codecParse };
      throw Error('mock require unaware')[cl.mod]({ term });
    };
    const invoke = eval(String[cl.baseline](`
      | (({ require }) => {
      |   
      |   const module = { exports: {} };
      |   
      ${script[cl.indent]('|   ')}
      |   
      |   return module.exports.handler;
      |   
      | })
    `))({ require });
    
    const shapeData = {
      ctx: {
        callbackWaitsForEmptyEventLoop: false,
        clientContext:                  {},
        invokedFunctionArn:             'invoked-function-arn',
        awsRequestId:                   'aws-request-id',
        getRemainingTimeInMillis:       () => 1000 * 60 * 10
      },
      req: {
        path: '/test/path',
        httpMethod: 'GET',
        headers: {
          'User-Agent': 'its a test lmao',
          'cookie': 'k0=cookie0;k1=cookie1;'
        },
        multiValueHeaders: {
          'User-Agent': [ 'its a test lmao' ],
          'Cookie': [
            'k0=cookie0;k1=cookie1;',
            ';;;   ;  k2=cookie2   ; k4 = cookie444  ;;    ;',
            ';',
            ' =j  =  ',
            '   ;;;;;'
          ]
        },
        queryStringParameters: {
          'built.up.query.string': 'test',
        },
        multiValueQueryStringParameters: {
          'built.query.string': [ 'test' ],
        },
        requestContext: {
          identity: { sourceIp: '127.0.0.1' },
          stage:    'stage',
          domainName: 'test.local.com',
          resourceId: 'resource-id',
          stageVariables: {}
        },
        body: JSON.stringify({ b: 10 })
      }
    };
    const res = await invoke(shapeData.req, shapeData.ctx);
    
    assertEqual(res, {
      headers: { 'content-type': 'application/json' },
      body: [ cmpJson, {
        res: 'util'.repeat(10),
        req: {
          path: [ 'test', 'path' ],
          method: 'get',
          headers: { 'user-agent': [ 'its a test lmao' ] },
          query: {
            built: { query: { string: 'test' } }
          },
          cookies: { k0: 'cookie0', k1: 'cookie1', k2: 'cookie2', k4: 'cookie444' },
          body: { b: 10 }
        }
      }],
      isBase64Encoded: false,
      statusCode: 200
    });
    
  }}
  
]);