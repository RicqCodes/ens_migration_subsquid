import { decodeHex } from "@subsquid/evm-processor";
import {
  Account,
  Domain,
  NewOwner,
  Resolver,
  NewResolver,
  NewTTL,
  Transfer,
} from "../model";
import { Log } from "../processor";
import { EMPTY_ADDRESS, ROOT_NODE, createEventID, makeSubnode } from "../utils";

const BIG_INT_ZERO: bigint = 0n;

async function _createDomain(
  node: string,
  timestamp: bigint,
  ctx: any
): Promise<Domain> {
  const owner = new Account({ id: EMPTY_ADDRESS });
  await ctx.store.upsert(owner);
  // Create a new domain entity
  const domain = new Domain();
  domain.id = node;
  if (node == ROOT_NODE) {
    domain.owner = owner;
    domain.isMigrated = true;
    domain.createdAt = timestamp;
    domain.subdomainCount = 0;
  }
  return domain;
}

async function _getDomain(
  node: string,
  ctx: any,
  timestamp: bigint = BIG_INT_ZERO
): Promise<Domain> {
  let domain = await ctx.store.findOne(Domain, {
    where: {
      id: node,
    },
    relations: ["parent", "owner", "resolver"],
  });

  if ((domain === null || domain === undefined) && node == ROOT_NODE) {
    return await _createDomain(node, timestamp, ctx);
  }
  // conssole.log("returned domain", domain);
  return domain;
}

async function _recurseDomainDelete(
  domain: Domain,
  ctx: any
): Promise<string | null> {
  if (
    (domain.resolver == null ||
      domain.resolver?.id.split("-")[0] == EMPTY_ADDRESS) &&
    domain.owner?.id == EMPTY_ADDRESS &&
    domain.subdomainCount == 0
  ) {
    const parentDomain = await ctx.store.findOne(Domain, {
      where: {
        id: domain.parent!.id,
      },
    });
    if (parentDomain != null) {
      parentDomain.subdomainCount = parentDomain.subdomainCount - 1;
      await ctx.store.upsert(parentDomain);
      return _recurseDomainDelete(parentDomain, ctx);
    }

    return null;
  }

  return domain.id;
}

async function _saveDomain(domain: Domain, ctx: any) {
  await _recurseDomainDelete(domain, ctx);
  await ctx.store.upsert(domain);
}

async function _handleNewOwner(
  event: { node: string; label: string; owner: string },
  log: Log,
  ctx: any,
  isMigrated: boolean
) {
  let account = new Account({ id: event.owner });
  await ctx.store.upsert(account);

  let subnode = makeSubnode(event.node, event.label);
  let domain = await _getDomain(subnode, ctx, BigInt(log.block.timestamp));
  let parent = await _getDomain(event.node, ctx);

  if (domain === null || domain === undefined) {
    domain = new Domain({ id: subnode });
    domain.createdAt = BigInt(log.block.timestamp);
    domain.subdomainCount = 0;
  }

  if (
    (domain.parent === null || domain.parent === undefined) &&
    parent !== null
  ) {
    domain.parent = parent;
    parent.subdomainCount = parent.subdomainCount + 1;
    await ctx.store.upsert(parent);
  }

  if (domain.name == null) {
    // Get label and node names
    let label = await ctx.store.findOne(Domain, {
      where: {
        labelName: event.label,
      },
    });
    if (label != null) {
      domain.labelName = label;
    }

    if (label === null || label === undefined) {
      label = "[" + event.label.slice(2) + "]";
    }
    if (
      event.node ==
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      domain.name = label;
    } else {
      parent = parent!;
      let name = parent.name;
      if (label && name) {
        domain.name = label + "." + name;
      }
    }
  }
  domain.owner = account;
  domain.labelhash = decodeHex(event.label);
  domain.isMigrated = isMigrated;

  await _saveDomain(domain, ctx);

  let domainEvent = new NewOwner({
    id: createEventID(log.block.height, log.logIndex),
  });
  domainEvent.blockNumber = log.block.height;
  domainEvent.transactionID = decodeHex(log.transaction?.hash!);
  domainEvent.parentDomain = parent;
  domainEvent.domain = domain;
  domainEvent.owner = account;

  return domainEvent;
}

export async function handleNewResolver(
  event: { node: string; resolver: string },
  log: Log,
  ctx: any
): Promise<NewResolver> {
  let id: string | null;

  if (event.resolver === "0x0") {
    id = null;
  } else {
    id = event.resolver.concat("-").concat(event.node);
  }

  let node = event.node;
  let domain: Domain = await _getDomain(node, ctx)!;
  let resolver: Resolver = await ctx.store.findOne(Resolver, {
    where: { id },
    relations: ["domain"],
  });

  if (id) {
    if (resolver == null) {
      resolver = new Resolver({ id });
      resolver.domain = domain;
      resolver.address = decodeHex(event.resolver);

      await ctx.store.upsert(resolver);
      domain.resolvedAddress = null;
      domain.resolver = resolver;
    } else {
      domain.resolvedAddress = resolver.addr;
    }
  } else {
    domain.resolvedAddress = null;
  }

  await _saveDomain(domain, ctx);

  let domainEvent = new NewResolver({
    id: createEventID(log.block.height, log.logIndex),
  });
  domainEvent.blockNumber = log.block.height;
  domainEvent.transactionID = decodeHex(log.transaction?.hash!);
  domainEvent.domain = domain;
  domainEvent.resolver = id ? resolver : new Resolver({ id: EMPTY_ADDRESS });

  return domainEvent;
}

export async function handleNewTTL(
  event: {
    node: string;
    ttl: bigint;
  },
  log: Log,
  ctx: any
): Promise<NewTTL> {
  let node = event.node;
  let domain = await _getDomain(node, ctx);
  // For the edge case that a domain's owner and resolver are set to empty
  // in the same transaction as setting TTL
  if (domain) {
    domain.ttl = event.ttl;
    await ctx.store.upsert(domain);
  }

  let domainEvent = new NewTTL({
    id: createEventID(log.block.height, log.logIndex),
  });
  domainEvent.blockNumber = log.block.height;
  domainEvent.transactionID = decodeHex(log.transaction?.hash!);
  domainEvent.domain.id = node;
  domainEvent.ttl = event.ttl;

  return domainEvent;
}

export async function handleTransfer(
  event: {
    node: string;
    owner: string;
  },
  log: Log,
  ctx: any
): Promise<Transfer> {
  let node = event.node;
  let account = new Account({ id: event.owner });
  await ctx.store.upsert(account);

  // Update the domain owner
  let domain = await _getDomain(node, ctx)!;

  domain.owner = account;
  await _saveDomain(domain, ctx);

  let domainEvent = new Transfer({
    id: createEventID(log.block.height, log.logIndex),
  });
  domainEvent.blockNumber = log.block.height;
  domainEvent.transactionID = decodeHex(log.transaction?.hash!);
  domainEvent.domain = domain;
  domainEvent.owner = account;

  return domainEvent;
}

export async function handleNewOwner(
  event: { node: string; label: string; owner: string },
  log: Log,
  ctx: any
) {
  return await _handleNewOwner(event, log, ctx, true);
}

export async function handleNewOwnerOldRegistry(
  event: { node: string; label: string; owner: string },
  log: Log,
  ctx: any
): Promise<NewOwner | undefined> {
  let subnode = makeSubnode(event.node, event.label);
  let domain = await _getDomain(subnode, ctx, BigInt(log.block.timestamp));

  if (domain == null || domain.isMigrated == false) {
    return await _handleNewOwner(event, log, ctx, false);
  }
}

export async function handleNewResolverOldRegistry(
  event: { node: string; resolver: string },
  log: Log,
  ctx: any
): Promise<NewResolver | undefined> {
  let node = event.node;
  console.log("node", node);
  let domain = await _getDomain(node, ctx, BigInt(log.block.timestamp))!;
  console.log("domain", domain);
  if (node == ROOT_NODE || !domain.isMigrated) {
    return await handleNewResolver(event, log, ctx);
  }
}
export async function handleNewTTLOldRegistry(
  event: {
    node: string;
    ttl: bigint;
  },
  log: Log,
  ctx: any
): Promise<NewTTL | undefined> {
  let domain = await _getDomain(event.node, ctx)!;
  if (domain.isMigrated == false) {
    return await handleNewTTL(event, log, ctx);
  }
}

export async function handleTransferOldRegistry(
  event: {
    node: string;
    owner: string;
  },
  log: Log,
  ctx: any
): Promise<Transfer | undefined> {
  let domain = await _getDomain(event.node, ctx)!;
  if (domain.isMigrated == false) {
    return await handleTransfer(event, log, ctx);
  }
}
