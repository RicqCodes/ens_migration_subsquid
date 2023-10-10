import { decodeHex } from "@subsquid/evm-processor";
import {
  Account,
  Registration,
  Domain,
  NameRegistered,
  NameRenewed,
  NameTransferred,
} from "../model";
import { Log } from "../processor";
import {
  ETH_NODE,
  byteArrayFromHex,
  byteArrayToHex,
  checkValidLabel,
  concat,
  createEventID,
  makeSubnode,
  uint256ToByteArray,
  uint8ArrayToHex,
} from "../utils";

var rootNode = byteArrayFromHex(ETH_NODE);
const GRACE_PERIOD_SECONDS = BigInt(7776000); // 90 days

async function _setNamePreimage(
  name: string,
  label: string,
  cost: BigInt,
  ctx: any
): Promise<Registration | undefined> {
  if (!checkValidLabel(name, ctx)) {
    return;
  }

  let domain = await ctx.store.findOne(Domain, {
    where: {
      id: makeSubnode(rootNode.toString(), label.toString()),
    },
  })!;

  if (domain.labelName !== name) {
    domain.labelName = name;
    domain.name = name + ".eth";
    await ctx.store.upsert(domain);
  }

  let registration = ctx.store.findOneBy(Registration, { label });
  if (registration == null) return;
  registration.labelName = name;
  registration.cost = cost;

  return registration;
}

export async function handleNameRegistered(
  event: {
    id: bigint;
    owner: string;
    expires: bigint;
  },
  log: Log,
  ctx: any
): Promise<NameRegistered> {
  let account = new Account({ id: event.owner });
  ctx.store.upsert(account);

  let label = byteArrayFromHex(event.id.toString());
  let registration = new Registration({ id: uint8ArrayToHex(label) });
  let domain = await ctx.store.findOne(Domain, {
    where: {
      id: makeSubnode(rootNode.toString(), label.toString()),
    },
  });

  registration.domain = domain.id;
  registration.registrationDate = BigInt(log.block.timestamp);
  registration.expiryDate = event.expires;
  registration.registrant.id = account.id;

  domain.registrant = account.id;
  domain.expiryDate = event.expires + GRACE_PERIOD_SECONDS;

  let labelName = await ctx.store.findOneBy(Domain, { label });

  if (labelName != null) {
    domain.labelName = labelName;
    domain.name = labelName! + ".eth";
    registration.labelName = labelName;
  }
  await ctx.store.upsert(domain);
  await ctx.store.upsert(registration);

  let registrationEvent = new NameRegistered({
    id: createEventID(log.block.height, log.logIndex),
  });
  registrationEvent.registration.id = registration.id;
  registrationEvent.blockNumber = log.block.height;
  registrationEvent.transactionID = decodeHex(log.transaction?.hash!);
  registrationEvent.registrant.id = account.id;
  registrationEvent.expiryDate = event.expires;

  return registrationEvent;
}

export async function handleNameRenewed(
  event: {
    id: bigint;
    expires: bigint;
  },
  log: Log,
  ctx: any
): Promise<NameRenewed> {
  let label = byteArrayFromHex(event.id.toString());
  let registration = await ctx.store.findOne(Registration, {
    where: {
      id: uint8ArrayToHex(label),
    },
  });

  let domain = await ctx.store.get(Domain, {
    id: makeSubnode(rootNode.toString(), label.toString()),
  })!;

  registration.expiryDate = event.expires;
  domain.expiryDate = event.expires + GRACE_PERIOD_SECONDS;

  await ctx.store.upsert(domain);
  await ctx.store.upsert(registration);

  let registrationEvent = new NameRenewed({
    id: createEventID(log.block.height, log.logIndex),
  });
  registrationEvent.registration = registration.id;
  registrationEvent.blockNumber = log.block.height;
  registrationEvent.transactionID = decodeHex(log.transaction?.hash!);
  registrationEvent.expiryDate = event.expires;

  return registrationEvent;
}

export async function handleNameTransferred(
  event: {
    from: string;
    to: string;
    tokenId: bigint;
  },
  log: Log,
  ctx: any
): Promise<NameTransferred | undefined> {
  let account = new Account({ id: event.to });
  await ctx.store.upsert(account);

  let label = uint256ToByteArray(BigInt(event.tokenId));
  //   console.log("label", label);
  let registration = ctx.store.findOne(Registration, {
    where: { id: byteArrayToHex(label) },
  });
  if (registration == null) return;

  let domain = await ctx.store.findOne(Domain, {
    where: {
      id: byteArrayToHex(concat(rootNode, label)),
    },
  })!;
  console.log("domain", domain);

  registration.registrant = account.id;
  domain.registrant = account.id;

  await ctx.store.upsert(domain);
  await ctx.store.upsert(registration);

  let transferEvent = new NameTransferred({
    id: createEventID(log.block.height, log.logIndex),
  });
  console.log(byteArrayToHex(label), "byteArray from hex");
  transferEvent.registration.id = byteArrayToHex(label);
  transferEvent.blockNumber = log.block.height;
  transferEvent.transactionID = decodeHex(log.transaction?.hash!);
  transferEvent.newOwner.id = account.id;

  return transferEvent;
}

export async function handleNameRegisteredByController(
  event: {
    name: string;
    label: string;
    owner: string;
    baseCost: bigint;
    premium: bigint;
    expires: bigint;
  },
  log: Log,
  ctx: any
) {
  const registration = await _setNamePreimage(
    event.name,
    event.label,
    event.baseCost + event.premium,
    ctx
  );

  return registration;
}

export async function handleNameRenewedByController(
  event: {
    name: string;
    label: string;
    cost: bigint;
    expires: bigint;
  },
  log: Log,
  ctx: any
) {
  const registration = await _setNamePreimage(
    event.name,
    event.label,
    event.cost,
    ctx
  );

  return registration;
}

export async function handleNameRegisteredByControllerOld(
  event: {
    name: string;
    label: string;
    cost: bigint;
    expires: bigint;
  },
  log: Log,
  ctx: any
): Promise<Registration | undefined> {
  return await _setNamePreimage(event.name, event.label, event.cost, ctx);
}
