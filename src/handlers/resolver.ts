import { Log } from "../processor";
import {
  AbiChanged,
  Account,
  AddrChanged,
  AuthorisationChanged,
  ContenthashChanged,
  Domain,
  InterfaceChanged,
  MulticoinAddrChanged,
  NameChanged,
  PubkeyChanged,
  Resolver,
  TextChanged,
  VersionChanged,
} from "../model";
import { createEventID } from "../utils";
import { decodeHex } from "@subsquid/evm-processor";

function _createResolverID(node: string, resolver: string): string {
  return resolver.concat("-").concat(node);
}
function _createEventID(blockNumber: number, logIndex: number): string {
  return `${blockNumber}-${logIndex}`;
}

async function _getOrCreateResolver(
  node: string,
  address: string,
  ctx: any
): Promise<Resolver> {
  let id = _createResolverID(node, address);
  let resolver = await ctx.store.findOne(Resolver, {
    where: { id },
  });
  let domain = await ctx.store.findOne(Domain, {
    where: { id: node },
  });

  if (resolver === null || resolver === undefined) {
    resolver = new Resolver({ id });
    resolver.domain = domain;
    resolver.address = address;

    await ctx.store.upsert(resolver);
  }

  return resolver as Resolver;
}

export async function handleABIChanged(
  event: {
    node: string;
    contentType: bigint;
  },
  log: Log,
  ctx: any
): Promise<AbiChanged> {
  // Create a new Resolver record or fetch an existing one if it exists
  let resolver = await ctx.store.findOne(Resolver, {
    where: { id: _createResolverID(event.node, log.address) },
  });

  let resolverEvent = new AbiChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });

  // Associate the resolver with the ABIChanged event
  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.contentType = event.contentType;

  return resolverEvent;
}

export async function handleAddrChanged(
  event: {
    node: string;
    a: string;
  },
  log: Log,
  ctx: any
) {
  let account = new Account({ id: event.a });
  await ctx.store.upsert(account);

  let resolver = new Resolver({
    id: _createResolverID(event.node, log.address),
  });

  // Check if the Domain with the specified ID exists
  let domain = await ctx.store.findOne(Domain, {
    where: { id: event.node },
    relations: ["resolvedAddress"],
  });

  if (domain) {
    // Domain exists, set it as a property of the resolver
    resolver.domain = domain;
  }

  resolver.address = decodeHex(log.address);
  resolver.addr = account;
  await ctx.store.upsert(resolver);

  if (domain && domain.resolver == resolver.id) {
    domain.resolvedAddress = account;
    await ctx.store.upsert(domain);
  }

  let resolverEvent = new AddrChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });
  // Initialize resolverEvent.resolver if it's not defined

  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.addr = account;

  return resolverEvent;
}

export async function handleMulticoinAddrChanged(
  event: {
    node: string;
    coinType: bigint;
    newAddress: string;
  },
  log: Log,
  ctx: any
) {
  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);

  let eventCoinType = event.coinType;
  if (resolver.coinTypes == null) {
    resolver.coinTypes = [eventCoinType];
  } else {
    let coinTypes: bigint[] = resolver.coinTypes as bigint[];
    if (!coinTypes.includes(eventCoinType)) {
      coinTypes.push(eventCoinType);
      resolver.coinTypes = coinTypes;
      await ctx.store.upsert(resolver);
    }
  }

  let resolverEvent = new MulticoinAddrChanged({
    id: createEventID(log.block.height, log.logIndex),
  });
  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.coinType = eventCoinType;
  resolverEvent.addr = decodeHex(event.newAddress);

  return resolverEvent;
}

export function handleAuthorisationChanged(
  event: {
    node: string;
    owner: string;
    target: string;
    isAuthorised: boolean;
  },
  log: Log
): AuthorisationChanged {
  let resolverEvent = new AuthorisationChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.resolver.id = _createResolverID(event.node, log.address);
  resolverEvent.owner = decodeHex(event.owner);
  resolverEvent.target = decodeHex(event.target);
  resolverEvent.isAuthorized = event.isAuthorised;

  return resolverEvent;
}

export async function handleContentHashChanged(
  event: {
    node: string;
    hash: string;
  },
  log: Log,
  ctx: any
): Promise<ContenthashChanged> {
  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);
  resolver.contentHash = decodeHex(event.hash);
  await ctx.store.upsert(resolver);

  let resolverEvent = new ContenthashChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });
  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.hash = decodeHex(event.hash);

  return resolverEvent;
}

export async function handleInterfaceChanged(
  event: {
    node: string;
    interfaceID: string;
    implementer: string;
  },
  log: Log,
  ctx: any
): Promise<InterfaceChanged> {
  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);

  let resolverEvent = new InterfaceChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });
  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.interfaceID = decodeHex(event.interfaceID);
  resolverEvent.implementer = decodeHex(event.implementer);

  return resolverEvent;
}

export async function handleNameChanged(
  event: {
    node: string;
    name: string;
  },
  log: Log,
  ctx: any
): Promise<NameChanged | undefined> {
  if (event.name.indexOf("\u0000") != -1) return;

  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);

  let resolverEvent = new NameChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });

  // Initialize resolverEvent.resolver with a new Resolver object
  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.name = event.name;

  return resolverEvent;
}

export async function handlePubkeyChanged(
  event: {
    node: string;
    x: string;
    y: string;
  },
  log: Log,
  ctx: any
): Promise<PubkeyChanged> {
  let resolverEvent = new PubkeyChanged({
    id: _createEventID(log.block.height, log.logIndex),
  });

  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);
  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.x = decodeHex(event.x);
  resolverEvent.y = decodeHex(event.y);

  return resolverEvent;
}

export async function handleTextChanged(
  event: {
    node: string;
    indexedKey: string;
    key: string;
  },
  log: Log,
  ctx: any
): Promise<TextChanged> {
  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);
  let key = event.key;
  if (resolver.texts == null) {
    resolver.texts = [key];
    await ctx.store.upsert(resolver);
  } else {
    let texts = resolver.texts!;
    if (!texts.includes(key)) {
      texts.push(key);
      resolver.texts = texts;
      await ctx.store.upsert(resolver);
    }
  }

  let resolverEvent = new TextChanged({
    id: createEventID(log.block.height, log.logIndex),
  });

  resolverEvent.resolver = resolver;
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.key = event.key;

  return resolverEvent;
}

export async function handleTextChangedWithValue(
  event: {
    node: string;
    indexedKey: string;
    key: string;
    value: string;
  },
  log: Log,
  ctx: any
): Promise<TextChanged> {
  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);

  let key = event.key;
  if (resolver.texts == null) {
    resolver.texts = [key];
    await ctx.store.upsert(resolver);
  } else {
    let texts = resolver.texts!;
    if (!texts.includes(key)) {
      texts.push(key);
      resolver.texts = texts;
      await ctx.store.upsert(resolver);
    }
  }

  let resolverEvent = new TextChanged({
    id: createEventID(log.block.height, log.logIndex),
  });
  resolverEvent.resolver.id = _createResolverID(event.node, log.address);
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.key = event.key;
  resolverEvent.value = event.value;

  return resolverEvent;
}

export async function handleVersionChanged(
  event: {
    node: string;
    newVersion: bigint;
  },
  log: Log,
  ctx: any
): Promise<void> {
  let resolverEvent = new VersionChanged({
    id: createEventID(log.block.height, log.logIndex),
  });
  resolverEvent.blockNumber = log.block.height;
  resolverEvent.transactionID = decodeHex(log.transaction?.hash!);
  resolverEvent.resolver.id = _createResolverID(event.node, log.address);
  resolverEvent.version = event.newVersion;
  await ctx.store.upsert(resolverEvent);

  let domain = ctx.store.get(Domain, event.node);
  if (domain && domain.resolver === resolverEvent.resolver) {
    domain.resolvedAddress = null;
    await ctx.store.upsert(domain);
  }

  let resolver = await _getOrCreateResolver(event.node, log.address, ctx);
  resolver.addr = null;
  resolver.contentHash = null;
  resolver.texts = null;
  resolver.coinTypes = null;

  await ctx.store.upsert(resolver);
}
