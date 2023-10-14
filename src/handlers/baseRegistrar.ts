import { decodeHex, DataHandlerContext } from "@subsquid/evm-processor";
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
import { Store } from "../db";
import { EntityBuffer } from "../entityBuffer";

var rootNode = byteArrayFromHex(ETH_NODE);
const GRACE_PERIOD_SECONDS = BigInt(7776000); // 90 days

async function _setNamePreimage(
  name: string,
  label: string,
  cost: BigInt,
  ctx: DataHandlerContext<Store>
): Promise<Registration | undefined> {
  if (!checkValidLabel(name, ctx)) {
    return;
  }

  let domain = await ctx.store.get(Domain, {
    where: {
      id: makeSubnode(rootNode.toString(), label.toString()),
    },
  })!;

  if (domain?.labelName !== name) {
    domain!.labelName = name;
    domain!.name = name + ".eth";
    EntityBuffer.add(domain!);
    // await ctx.store.upsert(domain!);
  }

  let registration = await ctx.store.get(Registration, label);
  if (registration == undefined) return;
  registration.labelName = name;
  registration.cost = BigInt(cost.toString());
  EntityBuffer.add(registration);
  // return registration;
}

export async function handleNameRegistered(
  event: {
    id: bigint;
    owner: string;
    expires: bigint;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
): Promise<void> {
  let account = new Account({ id: event.owner });
  ctx.store.upsert(account);

  let label = byteArrayFromHex(event.id.toString());
  let registration = new Registration({ id: uint8ArrayToHex(label) });
  let domain = await ctx.store.get(Domain, {
    where: {
      id: makeSubnode(rootNode.toString(), label.toString()),
    },
    relations: { registrant: true },
  });

  registration.domain = domain!;
  registration.registrationDate = BigInt(log.block.timestamp);
  registration.expiryDate = event.expires;
  registration.registrant = account;

  domain!.registrant = account;
  domain!.expiryDate = event.expires + GRACE_PERIOD_SECONDS;

  let labelName = await ctx.store.findOneBy(Domain, {
    labelName: uint8ArrayToHex(label),
  });

  if (labelName != undefined) {
    domain!.labelName = labelName.name;
    domain!.name = labelName! + ".eth";
    registration!.labelName = labelName.name;
  }

  EntityBuffer.add(domain!);
  EntityBuffer.add(registration);
  // await ctx.store.upsert(domain);
  // await ctx.store.upsert(registration);

  let registrationEvent = new NameRegistered({
    id: createEventID(log.block.height, log.logIndex),
  });
  registrationEvent.registration = registration;
  registrationEvent.blockNumber = log.block.height;
  registrationEvent.transactionID = decodeHex(log.transaction?.hash!);
  registrationEvent.registrant = account;
  registrationEvent.expiryDate = event.expires;

  // return registrationEvent;
  EntityBuffer.add(registrationEvent);
}

export async function handleNameRenewed(
  event: {
    id: bigint;
    expires: bigint;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
): Promise<void> {
  let label = byteArrayFromHex(event.id.toString());
  let registration = await ctx.store.get(Registration, {
    where: {
      id: uint8ArrayToHex(label),
    },
  })!;

  let domain = await ctx.store.get(Domain, {
    where: { id: makeSubnode(rootNode.toString(), label.toString()) },
  })!;

  registration!.expiryDate = event.expires;
  domain!.expiryDate = event.expires + GRACE_PERIOD_SECONDS;

  EntityBuffer.add(domain!);
  EntityBuffer.add(registration!);
  // await ctx.store.upsert(domain);
  // await ctx.store.upsert(registration);

  let registrationEvent = new NameRenewed({
    id: createEventID(log.block.height, log.logIndex),
  });
  registrationEvent.registration = registration!;
  registrationEvent.blockNumber = log.block.height;
  registrationEvent.transactionID = decodeHex(log.transaction?.hash!);
  registrationEvent.expiryDate = event.expires;

  EntityBuffer.add(registrationEvent);
}

export async function handleNameTransferred(
  event: {
    from: string;
    to: string;
    tokenId: bigint;
  },
  log: Log,
  ctx: DataHandlerContext<Store>
): Promise<void> {
  let account = new Account({ id: event.to });
  await ctx.store.upsert(account);

  let label = uint256ToByteArray(BigInt(event.tokenId));
  //   console.log("label", label);
  let registration = await ctx.store.get(Registration, {
    where: { id: byteArrayToHex(label) },
    relations: { registrant: true },
  });
  if (registration == undefined) return;

  let domain = await ctx.store.findOne(Domain, {
    where: {
      id: byteArrayToHex(concat(rootNode, label)),
    },
    relations: { registrant: true },
  })!;
  console.log("domain", domain);

  registration!.registrant = account;
  domain!.registrant = account;

  EntityBuffer.add(domain!);
  EntityBuffer.add(registration);
  // await ctx.store.upsert(domain);
  // await ctx.store.upsert(registration);

  let transferEvent = new NameTransferred({
    id: createEventID(log.block.height, log.logIndex),
  });
  console.log(byteArrayToHex(label), "byteArray from hex");
  transferEvent.registration = registration;
  transferEvent.blockNumber = log.block.height;
  transferEvent.transactionID = decodeHex(log.transaction?.hash!);
  transferEvent.newOwner = account;

  EntityBuffer.add(transferEvent);
  // return transferEvent;
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
  ctx: DataHandlerContext<Store>
) {
  await _setNamePreimage(
    event.name,
    event.label,
    event.baseCost + event.premium,
    ctx
  );
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
  await _setNamePreimage(event.name, event.label, event.cost, ctx);
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
): Promise<void> {
  await _setNamePreimage(event.name, event.label, event.cost, ctx);
}
