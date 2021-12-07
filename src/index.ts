import { createHash } from 'crypto';
import * as serialize from 'serialize-javascript';
import { createClient } from 'redis';

export type MemoizeOptions = {
  redisUrl?: string;
  redisClient?: any;
  prefix: string;
  expires: number;
  statsOutputInterval?: number | null;
};

const defaultOptions: Partial<MemoizeOptions> = {
  prefix: 'prmem:',
  statsOutputInterval: 60,
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
  options: Partial<MemoizeOptions>
) => {
  const optionsWithDefaults = {
    ...defaultOptions,
    ...options,
  } as MemoizeOptions;

  const debug = require('debug')(`prmem:${optionsWithDefaults.prefix}`);

  debug({ options: optionsWithDefaults });

  let lastStatsOutput = new Date();

  if (typeof optionsWithDefaults.expires !== 'number') {
    throw new Error('expires option must be number of seconds');
  }

  if (optionsWithDefaults.expires <= 0) {
    throw new Error('expires option must be greater than zero');
  }

  if (
    typeof optionsWithDefaults.redisUrl !== 'string' &&
    !optionsWithDefaults.redisClient
  ) {
    throw new Error('Either redisClient ro redisUrl must be set');
  }

  const {
    redisUrl,
    prefix,
    expires,
    statsOutputInterval,
  } = optionsWithDefaults;
  const redisClient =
    optionsWithDefaults.redisClient || createClient({ url: redisUrl! });

  redisClient.connect();

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
