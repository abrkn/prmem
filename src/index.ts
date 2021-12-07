import { createHash } from 'crypto';
import * as serialize from 'serialize-javascript';
import { createClient } from 'redis';

export type RedisClient = ReturnType<typeof createClient>;

export type MemoizeOptions = {
  prefix?: string;
  expires?: number;
  statsOutputInterval?: number | null;
};

const deserialize = (_: string) => eval('(' + _ + ')');

const defaultGetCacheKey = (...args: any[]) => {
  const hash = createHash('sha1');
  const components: string[] = [];

  for (const arg of args) {
    if (arg === undefined) {
      components.push('<undefined>');
    }

    components.push(JSON.stringify(arg));
  }

  components.forEach(_ => hash.update(_));

  return hash.digest('hex');
};

const toCached = (value: any) => {
  return serialize(value, {
    unsafe: true,
    isJSON: true,
  });
};

const CACHE_MISS = Symbol();

const fromCached = (value: string) => {
  return deserialize(value);
};

const createRedisPromiseMemoize = <A extends any[], R>(
  fn: (...args: A) => PromiseLike<R>,
  redisClient: RedisClient,
  { expires, prefix, statsOutputInterval }: MemoizeOptions
) => {
  prefix = prefix ?? 'prmem:';
  statsOutputInterval = statsOutputInterval ?? 60;
  expires = expires ?? 60;

  const debug = require('debug')(`prmem:${prefix}`);

  debug({ expires, prefix, redisClient, statsOutputInterval });

  let lastStatsOutput = new Date();

  if (typeof expires !== 'number') {
    throw new Error('expires option must be number of seconds');
  }

  if (expires <= 0) {
    throw new Error('expires option must be greater than zero');
  }

  const getRedisKey = (key: string) => `${prefix}${key}`;
  const getCacheKey = defaultGetCacheKey;

  const stats = {
    hits: 0,
    misses: 0,
  };

  const maybeOutputStats = () => {
    if (statsOutputInterval === null || statsOutputInterval === undefined) {
      return;
    }

    if (
      new Date().getTime() - lastStatsOutput.getTime() <
      statsOutputInterval * 1000
    ) {
      return;
    }

    debug(`Stats: Hits=${stats.hits}; Misses=${stats.misses}`);

    lastStatsOutput = new Date();
  };

  const memoized = async (...args: A) => {
    const innerKey = getCacheKey(...args);
    const redisKey = getRedisKey(innerKey);

    const cachedResult: string | null = await redisClient.get(redisKey);

    if (cachedResult !== null) {
      debug(`Cache HIT for ${innerKey}. ${cachedResult.length} bytes`);
      stats.hits += 1;
      maybeOutputStats();
      return fromCached(cachedResult) as R;
    }

    debug(`Cache MISS for ${innerKey}`);
    stats.misses += 1;
    maybeOutputStats();

    const result = await fn(...args);
    const resultToCache = toCached(result);

    await redisClient.set(redisKey, resultToCache, { EX: expires });

    return result as R;
  };

  return Object.assign(memoized, {
    stats,
    quit: () => redisClient.quit(),
  });
};

export default createRedisPromiseMemoize;
