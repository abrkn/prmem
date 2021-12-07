import { randomBytes } from 'crypto';
import delay from 'delay';
import prmem from './index';

const mems = {
  items: [],
  quit: async () => {
    await Promise.all(
      mems.items.map(async (_: any) => {
        try {
          await _.quit();
        } catch (eror) {}
      })
    );
    mems.items.splice(0);
  },
  push: (item: any) => {
    (mems.items as any[]).push(item);
    return item;
  },
};

beforeEach(mems.quit);
afterEach(mems.quit);

const getRandomRedisPrefix = (name: string) =>
  ['prmem', 'test', name, randomBytes(4).toString('hex')].join(':');

test('test sum', async () => {
  const mem = mems.push(
    prmem(
      async (a: number, b: number) => {
        return a + b;
      },
      {
        redisUrl: '',
        expires: 5,
        prefix: getRandomRedisPrefix('sum'),
      }
    )
  );

  let result: number;

  // MISS
  result = await mem(1, 2);
  expect(result).toBe(3);

  // MISS
  result = await mem(2, 2);
  expect(result).toBe(4);

  // HIT
  result = await mem(1, 2);
  expect(result).toBe(3);

  const { stats } = mem;
  expect(stats.misses).toBe(2);
  expect(stats.hits).toBe(1);
});

test('test expiration', async () => {
  const mmem = mems.push(
    prmem(
      async (a: number, b: number) => {
        return (a + b) as number;
      },
      {
        redisUrl: '',
        expires: 1,
        prefix: getRandomRedisPrefix('expiration'),
      }
    )
  );

  let result: number;

  // MISS
  result = await mmem(1, 2);
  expect(result).toBe(3);

  // HIT
  result = await mmem(1, 2);
  expect(result).toBe(3);

  await delay(2e3);

  // MISS
  result = await mmem(1, 2);
  expect(result).toBe(3);

  const { stats } = mmem;
  expect(stats.misses).toBe(2);
  expect(stats.hits).toBe(1);
});

test('test undefined', async () => {
  const mem = mems.push(
    prmem(
      async () => {
        return undefined;
      },
      {
        redisUrl: '',
        expires: 5,
        prefix: getRandomRedisPrefix('sum'),
      }
    )
  );

  let result: undefined;

  // MISS
  result = await mem();
  expect(result).toBe(undefined);
  expect(mem.stats.hits).toBe(0);
  expect(mem.stats.misses).toBe(1);

  // HIT
  result = await mem();
  expect(result).toBe(undefined);
  expect(mem.stats.hits).toBe(1);
  expect(mem.stats.misses).toBe(1);
});

test('test null', async () => {
  const mem = mems.push(
    prmem(
      async () => {
        return null;
      },
      {
        redisUrl: '',
        expires: 5,
        prefix: getRandomRedisPrefix('null'),
      }
    )
  );

  let result: null;

  // MISS
  result = await mem();
  expect(result).toBe(null);
  expect(mem.stats.hits).toBe(0);
  expect(mem.stats.misses).toBe(1);

  // HIT
  result = await mem();
  expect(result).toBe(null);
  expect(mem.stats.hits).toBe(1);
  expect(mem.stats.misses).toBe(1);
});

test('test object', async () => {
  const mem = mems.push(
    prmem(
      async (a: number, b: number) => {
        return { sum: a + b };
      },
      {
        redisUrl: '',
        expires: 5,
        prefix: getRandomRedisPrefix('object'),
      }
    )
  );

  let result: any;

  // MISS
  result = await mem(1, 2);
  expect(result).toEqual({ sum: 3 });
  expect(mem.stats.hits).toBe(0);
  expect(mem.stats.misses).toBe(1);

  // HIT
  result = await mem(1, 2);
  expect(result).toEqual({ sum: 3 });
  expect(mem.stats.hits).toBe(1);
  expect(mem.stats.misses).toBe(1);
});

test('test array', async () => {
  const mem = mems.push(
    prmem(
      async (...parts: string[]) => {
        return parts;
      },
      {
        redisUrl: '',
        expires: 5,
        prefix: getRandomRedisPrefix('array'),
      }
    )
  );

  let result: any;

  // MISS
  result = await mem('one', 'two');
  expect(result).toEqual(['one', 'two']);
  expect(mem.stats.hits).toEqual(0);
  expect(mem.stats.misses).toBe(1);

  // HIT
  result = await mem('one', 'two');
  expect(result).toEqual(['one', 'two']);
  expect(mem.stats.hits).toBe(1);
  expect(mem.stats.misses).toBe(1);
});

test('test empty args async', async () => {
  let calls = 0;

  const mem = mems.push(
    prmem(
      async () => {
        calls += 1;
        return calls;
      },
      {
        redisUrl: '',
        expires: 5,
        prefix: getRandomRedisPrefix('empty-args'),
      }
    )
  );

  let result: any;

  // MISS
  result = await mem();
  expect(result).toEqual(1);
  expect(mem.stats.hits).toBe(0);
  expect(mem.stats.misses).toBe(1);

  // HIT
  result = await mem();
  expect(result).toEqual(1);
  expect(mem.stats.hits).toBe(1);
  expect(mem.stats.misses).toBe(1);
});

// TODO: Weird types
// TODO: memoize something not async
