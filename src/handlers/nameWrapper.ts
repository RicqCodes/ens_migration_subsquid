import { Bytes } from "@subsquid/evm-processor/lib/interfaces/evm";
import {
  Account,
  Domain,
  ExpiryExtended,
  FusesSet,
  NameUnwrapped,
  NameWrapped,
  WrappedDomain,
  WrappedTransfer,
} from "../model";
import { Log } from "../processor";
import { ETH_NODE, checkValidLabel, createEventID } from "../utils";
import { decodeHex, DataHandlerContext } from "@subsquid/evm-processor";
import { Store } from "../db";
import { EntityBuffer } from "../entityBuffer";

function _decodeName(buf: Uint8Array, ctx: any): Array<string> | null {
  let offset = 0;
  let list = new Uint8Array(0);
  let dot = new Uint8Array([0x2e]);
  let len = buf[offset++];
  let hex = Array.from(buf)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  let firstLabel = "";

  if (len === 0) {
    return [firstLabel, "."];
  }

  while (len) {
    let label = hex.slice((offset + 1) * 2, (offset + 1 + len) * 2);
    let labelBytes = new Uint8Array(
      label.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    if (!checkValidLabel(new TextDecoder().decode(labelBytes), ctx)) {
      return null;
    }

    if (offset > 1) {
      list = new Uint8Array([...list, ...dot]);
    } else {
      firstLabel = new TextDecoder().decode(labelBytes);
    }
    list = new Uint8Array([...list, ...labelBytes]);
    offset += len;
    len = buf[offset++];
  }
  return [firstLabel, new TextDecoder().decode(list)];
}

const PARENT_CANNOT_CONTROL: number = parseInt("65536", 10);

function checkPccBurned(fuses: number): boolean {
  return (fuses & PARENT_CANNOT_CONTROL) == PARENT_CANNOT_CONTROL;
}

async function createOrLoadAccount(
  address: string,
  ctx: any
): Promise<Account> {
  let account = await ctx.store.get(Account, { where: { id: address } });
  if (account == undefined) {
    account = new Account({ id: address });
    ctx.store.upsert(account);
  }

  return account;
}

async function createOrLoadDomain(
  node: string,
  ctx: DataHandlerContext<Store>
): Promise<Domain> {
  let domain = await ctx.store.get(Domain, {
    where: { id: node },
    relations: {
      parent: true,
      owner: true,
      resolver: true,
      resolvedAddress: true,
      registrant: true,
      wrappedOwner: true,
    },
  });
  if (domain == undefined) {
    domain = new Domain({ id: node });
    // await ctx.store.upsert(domain);
  }

  return domain;
}

async function _makeWrappedTransfer(
  blockNumber: number,
  transactionID: Bytes,
  eventID: string,
  node: BigInt,
  to: string,
  ctx: DataHandlerContext<Store>
): Promise<void> {
  const _to = await createOrLoadAccount(to, ctx);
  const namehash = "0x" + node.toString().slice(2).padStart(64, "0");
  let domain = await createOrLoadDomain(namehash, ctx);
  let wrappedDomain = await ctx.store.get(WrappedDomain, {
    where: { id: namehash },
    relations: { owner: true },
  });

  if (domain.isMigrated === undefined) return;

  // new registrations emit the Transfer` event before the NameWrapped event
  // so we need to create the WrappedDomain entity here
  if (wrappedDomain == undefined) {
    wrappedDomain = new WrappedDomain({ id: namehash });
    wrappedDomain.domain = domain;
    wrappedDomain.expiryDate = BigInt(0);
    wrappedDomain.fuses = 0;
  }
  wrappedDomain.owner = _to;

  // EntityBuffer.add(wrappedDomain);
  await ctx.store.upsert(wrappedDomain);
  domain.wrappedOwner = _to;
  // EntityBuffer.add(domain);
  await ctx.store.upsert(domain);
  const wrappedTransfer = new WrappedTransfer({ id: eventID });
  wrappedTransfer.domain = domain;
  wrappedTransfer.blockNumber = blockNumber;
  wrappedTransfer.transactionID = decodeHex(transactionID);
  wrappedTransfer.owner = _to;
  EntityBuffer.add(wrappedTransfer);
  // return wrappedTransfer;
}

export async function handleNameWrapped(
  event: {
    node: string;
    name: string;
    owner: string;
    fuses: number;
    expiry: bigint;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
) {
  let decoded = _decodeName(decodeHex(event.name), ctx);
  let label: string | null = null;
  let name: string | null = null;

  if (!label) return;
  if (decoded !== null) {
    label = decoded[0];
    name = decoded[1];
  }
  let fuses = Number(event.fuses);
  let owner = await createOrLoadAccount(event.owner, ctx);
  let domain = await createOrLoadDomain(event.node, ctx);

  if (!domain.labelName && label) {
    domain.labelName = label;
    domain.name = name;
  }
  if (
    checkPccBurned(fuses) &&
    (!domain.expiryDate || event.expiry > domain.expiryDate!)
  ) {
    domain.expiryDate = event.expiry;
  }
  domain.wrappedOwner = owner;
  // EntityBuffer.add(domain);
  await ctx.store.upsert(domain);

  let wrappedDomain = new WrappedDomain({ id: event.node });
  wrappedDomain.domain = domain;
  wrappedDomain.expiryDate = event.expiry;
  wrappedDomain.fuses = fuses;
  wrappedDomain.owner = owner;
  wrappedDomain.name = name;

  await ctx.store.upsert(wrappedDomain);
  // EntityBuffer.add(wrappedDomain);

  let nameWrappedEvent = new NameWrapped({
    id: createEventID(log.block.height, log.logIndex),
  });
  nameWrappedEvent.domain = domain;
  nameWrappedEvent.name = name;
  nameWrappedEvent.fuses = fuses;
  nameWrappedEvent.expiryDate = event.expiry;
  nameWrappedEvent.owner = owner;
  nameWrappedEvent.blockNumber = log.block.height;
  nameWrappedEvent.transactionID = decodeHex(log.transaction?.hash!);

  // return nameWrappedEvent;
  EntityBuffer.add(nameWrappedEvent);
}

export async function handleNameUnwrapped(
  event: {
    node: string;
    owner: string;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
) {
  let owner = await createOrLoadAccount(event.owner, ctx);

  let domain = await createOrLoadDomain(event.node, ctx);
  if (!domain.subdomainCount || !domain.parent) return;
  domain.wrappedOwner = null;
  if (domain.expiryDate && domain.parent!.id !== ETH_NODE) {
    domain.expiryDate = null;
  }

  ctx.store.upsert(domain);

  let nameUnwrappedEvent = new NameUnwrapped({
    id: createEventID(log.block.height, log.logIndex),
  });
  nameUnwrappedEvent.domain = domain;
  nameUnwrappedEvent.owner = owner;
  nameUnwrappedEvent.blockNumber = log.block.height;
  nameUnwrappedEvent.transactionID = decodeHex(log.transaction?.hash!);
  EntityBuffer.add(nameUnwrappedEvent);
  ctx.store.remove(WrappedDomain, event.node);

  // return nameUnwrappedEvent;
}

export async function handleFusesSet(
  event: {
    node: string;
    fuses: number;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
) {
  let wrappedDomain = await ctx.store.get(WrappedDomain, {
    where: { id: event.node },
  });

  let domain = await createOrLoadDomain(event.node, ctx);

  if (domain.subdomainCount === undefined) return;

  if (wrappedDomain) {
    wrappedDomain.fuses = Number(event.fuses);
    await ctx.store.upsert(wrappedDomain);
    // EntityBuffer.add(wrappedDomain);

    if (wrappedDomain.expiryDate && checkPccBurned(wrappedDomain.fuses)) {
      if (!domain.expiryDate || wrappedDomain.expiryDate > domain.expiryDate!) {
        domain.expiryDate = wrappedDomain.expiryDate;
        EntityBuffer.add(domain);
        // await ctx.store.upsert(domain);
      }
    }
  }

  let fusesBurnedEvent = new FusesSet({
    id: createEventID(log.block.height, log.logIndex),
  });
  fusesBurnedEvent.domain = domain;
  fusesBurnedEvent.fuses = Number(event.fuses);
  fusesBurnedEvent.blockNumber = log.block.height;
  fusesBurnedEvent.transactionID = decodeHex(log.transaction?.hash!);
  EntityBuffer.add(domain);
  // return fusesBurnedEvent;
}

export async function handleExpiryExtended(
  event: {
    node: string;
    expiry: bigint;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
) {
  let wrappedDomain = await ctx.store.get(WrappedDomain, {
    where: { id: event.node },
  });

  let domain = await createOrLoadDomain(event.node, ctx);

  if (domain.subdomainCount === undefined) return;

  if (wrappedDomain) {
    wrappedDomain.expiryDate = event.expiry;
    EntityBuffer.add(wrappedDomain);
    // await ctx.store.upsert(wrappedDomain);

    if (checkPccBurned(wrappedDomain.fuses)) {
      if (!domain.expiryDate || event.expiry > domain.expiryDate!) {
        domain.expiryDate = event.expiry;
        EntityBuffer.add(domain);
        // await ctx.store.upsert(domain);
      }
    }
  }

  let expiryExtendedEvent = new ExpiryExtended({
    id: createEventID(log.block.height, log.logIndex),
  });
  expiryExtendedEvent.domain = domain;
  expiryExtendedEvent.expiryDate = event.expiry;
  expiryExtendedEvent.blockNumber = log.block.height;
  expiryExtendedEvent.transactionID = decodeHex(log.transaction?.hash!);

  EntityBuffer.add(expiryExtendedEvent);
  // return expiryExtendedEvent;
}

export async function handleTransferSingle(
  event: {
    operator: string;
    from: string;
    to: string;
    id: bigint;
    value: bigint;
  },
  log: Log,
  ctx: any
) {
  await _makeWrappedTransfer(
    log.block.height,
    log.transaction?.hash!,
    createEventID(log.block.height, log.logIndex).concat("-0"),
    event.id,
    event.to,
    ctx
  );
}

export async function handleTransferBatch(
  event: {
    operator: string;
    from: string;
    to: string;
    ids: bigint[];
  },
  log: Log,
  ctx: any
): Promise<void> {
  // const transferBatch = [];
  for (let i = 0; i < event.ids.length; i++) {
    const wrappedTransfer = await _makeWrappedTransfer(
      log.block.height,
      log.transaction?.hash!,
      createEventID(log.block.height, log.logIndex)
        .concat("-")
        .concat(i.toString()),
      event.ids[i],
      event.to,
      ctx
    );
    // transferBatch.push(wrappedTransfer);
  }

  // return transferBatch;
}
