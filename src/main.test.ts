import Logger from '@gershy/logger';
import { assertEqual, cmpJson, testRunner } from '../build/utils.test.ts';
import { JsfnUtility } from './import.test.ts';
import { LambdaHttp } from './main.ts';
import codecParse from '@gershy/util-codec-parse';
import { entry } from '@gershy/entry';
// import { regions as awsRegions } from '@gershy/lilac';

const codec = {
  type: 'rec',
  props: {
    
    reg:    { type: 'str', map: (str: string) => new RegExp(str) },
    effort: { type: 'enum', opts: [ 0, 1, 2, 3, 4, 5, 6 ] },
    
    // aws: { type: 'rec', req: false, props: {
    //   region: { type: 'enum', opts: awsRegions.map(v => v.term) },
    //   auth: { type: 'rec', props: {
    //     id: { type: 'str' },
    //     '!secret': { type: 'str' }
    //   }}
    // }}
    
  }
} as const;

entry({ name: 'lilacLambdaHttp', codec, inp: { reg: '^', effort: 0 }, fn: async (logger, { reg, effort, ...inp }) => {
  
  // Type testing
  (async () => {
    
    type Enforce<Provided, Expected extends Provided> = { provided: Provided, expected: Expected };
    
    type Tests = {
      1: Enforce<{ x: 'y' }, { x: 'y' }>,
    };
    if (0) ((v?: Tests) => void 0)();
    
  })();

  await testRunner({ logger, reg, effort, inp, cases: [
    
    { name: 'sourcecode gen', fn: async () => {
      
      // Instantiates a `JsfnUtility` instance with `a = 'util'`, and takes an http body param `b`,
      // which is a number, to call `JsfnUtility.prototype.helperFn`, which returns `a.repeat(b)`
      const lbd = new LambdaHttp({
        garden: {
          pfx: 'testlilaclambdahttpsourcecodegen',
          defaults: { region: 'ca-central-1' }
        } as any,
        name: 'myLbd',
        baseUrl: import.meta.url,
        memoryMb: 128,
        localData: {
          z: 'hi',
          utility: new JsfnUtility({ a: 'util' })
        },
        codec: { type: 'rec', loose: true, props: { body: { type: 'rec' as const, props: { b: { type: 'num' as const } } } } } as const,
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
      
      const script = await lbd.getScript({ lang: 'js' });
      
      const require = (term: string) => {
        if (term === '@gershy/clearing') return null;
        if (term === '@gershy/logger') return { default: function() { return Logger.dummy; } }; // Silence lambda logs
        if (term === '@gershy/util-codec-parse') return { default: codecParse };
        if (term.split(/[/\\]/).slice(-2).join('/') === 'src/import.test.ts') return { JsfnUtility };
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
              ';;;   ;  k2=cookie2   ; k4.k5.k6 = cookie444  ;;    ;',
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
            cookies: { k0: 'cookie0', k1: 'cookie1', k2: 'cookie2', k4: { k5: { k6: 'cookie444' } } },
            body: { b: 10 }
          }
        }],
        isBase64Encoded: false,
        statusCode: 200
      });
      
    }},
    
    // TODO: should probably include a deployed aws test...
    
  ]});
  
}});
