import { TypeormDatabase } from "@subsquid/typeorm-store";
import {
  BASE_REGISTRAR_CONTRACT,
  NAME_WRAPPER_CONTRACT,
  REGISTRY_CONTRACT,
  REGISTRY_OLD_CONTRACT,
  REGIS_CONTROLLER_CONTRACT,
  REGIS_CONTROLLER_OLD_CONTRACT,
  processor,
} from "./processor";
import {
  ExpiryExtended,
  FusesSet,
  NameRegistered,
  NameRenewed,
  NameTransferred,
  NameUnwrapped,
  NameWrapped,
  NewOwner,
  NewResolver,
  NewTTL,
  Transfer,
  WrappedTransfer,
  Registration,
  Resolver,
  AbiChanged,
  AddrChanged,
  MulticoinAddrChanged,
  AuthorisationChanged,
  ContenthashChanged,
  InterfaceChanged,
  NameChanged,
  PubkeyChanged,
  TextChanged,
} from "./model";
import * as baseRegistrarAbi from "./abi/BaseRegistrar";
import * as ensRegistry from "./abi/Registry";
import * as resolver from "./abi/PublicResolver";
import * as ethRegistrarControllerAbi from "./abi/EthRegistrarController";
import * as ethRegistrarOldControllerAbi from "./abi/EthRegistrarControllerOld";
import * as nameWrapperAbi from "./abi/NameWrapper";
import {
  handleNewOwner,
  handleNewOwnerOldRegistry,
  handleNewResolver,
  handleNewResolverOldRegistry,
  handleNewTTL,
  handleNewTTLOldRegistry,
  handleTransfer,
  handleTransferOldRegistry,
} from "./handlers/registry";
import {
  handleExpiryExtended,
  handleFusesSet,
  handleNameUnwrapped,
  handleNameWrapped,
  handleTransferBatch,
  handleTransferSingle,
} from "./handlers/nameWrapper";
import {
  handleNameRegistered,
  handleNameRegisteredByController,
  handleNameRegisteredByControllerOld,
  handleNameRenewed,
  handleNameRenewedByController,
  handleNameTransferred,
} from "./handlers/baseRegistrar";
import {
  handleABIChanged,
  handleAddrChanged,
  handleAuthorisationChanged,
  handleContentHashChanged,
  handleInterfaceChanged,
  handleMulticoinAddrChanged,
  handleNameChanged,
  handlePubkeyChanged,
  handleTextChanged,
  handleTextChangedWithValue,
  handleVersionChanged,
} from "./handlers/resolver";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  let newOwners: NewOwner[] = [];
  let newResolvers: NewResolver[] = [];
  let newTTLs: NewTTL[] = [];
  let transfers: Transfer[] = [];
  let nameWraps: NameWrapped[] = [];
  let nameUnwraps: NameUnwrapped[] = [];
  let fusesSets: FusesSet[] = [];
  let expiries: ExpiryExtended[] = [];
  let wrappedTransfers: WrappedTransfer[] = [];
  let registeredNames: NameRegistered[] = [];
  let renewedNames: NameRenewed[] = [];
  let nameTransfers: NameTransferred[] = [];
  let registrations: Registration[] = [];
  let resolvers: AbiChanged[] = [];
  let addrChanges: AddrChanged[] = [];
  let multipleAddrChanges: MulticoinAddrChanged[] = [];
  let authorisationChanges: AuthorisationChanged[] = [];
  let contenthashChanges: ContenthashChanged[] = [];
  let interfaceChanges: InterfaceChanged[] = [];
  let nameChanges: NameChanged[] = [];
  let pubkeyChanges: PubkeyChanged[] = [];
  let textChanges: TextChanged[] = [];
  let textChangesWithValue: TextChanged[] = [];

  for (let c of ctx.blocks) {
    for (let log of c.logs) {
      // decode and normalize the tx data
      if (log.topics[0] === resolver.events["ABIChanged"].topic) {
        const eventData = resolver.events["ABIChanged"].decode(log);
        const resolverEvent = await handleABIChanged(eventData, log, ctx);
        resolvers.push(resolverEvent);
      }
      if (log.topics[0] === resolver.events["AddrChanged"].topic) {
        const eventData = resolver.events["AddrChanged"].decode(log);
        const addrEvent = await handleAddrChanged(eventData, log, ctx);
        addrChanges.push(addrEvent);
      }
      if (log.topics[0] === resolver.events["AddressChanged"].topic) {
        const eventData = resolver.events["AddressChanged"].decode(log);
        const multipleAddrChange = await handleMulticoinAddrChanged(
          eventData,
          log,
          ctx
        );
        multipleAddrChanges.push(multipleAddrChange);
      }
      if (log.topics[0] === resolver.events["AuthorisationChanged"].topic) {
        const eventData = resolver.events["AuthorisationChanged"].decode(log);
        const authorisationChange = handleAuthorisationChanged(eventData, log);
        authorisationChanges.push(authorisationChange);
      }
      if (log.topics[0] === resolver.events["ContenthashChanged"].topic) {
        const eventData = resolver.events["ContenthashChanged"].decode(log);
        const contenthashChange = await handleContentHashChanged(
          eventData,
          log,
          ctx
        );
        contenthashChanges.push(contenthashChange);
      }
      if (log.topics[0] === resolver.events["InterfaceChanged"].topic) {
        const eventData = resolver.events["InterfaceChanged"].decode(log);
        const interfaceChange = await handleInterfaceChanged(
          eventData,
          log,
          ctx
        );
        interfaceChanges.push(interfaceChange);
      }
      if (log.topics[0] === resolver.events["NameChanged"].topic) {
        const eventData = resolver.events["NameChanged"].decode(log);
        const nameChange = await handleNameChanged(eventData, log, ctx);
        if (nameChange) nameChanges.push(nameChange);
      }
      if (log.topics[0] === resolver.events["PubkeyChanged"].topic) {
        const eventData = resolver.events["PubkeyChanged"].decode(log);
        const pubkeyChange = await handlePubkeyChanged(eventData, log, ctx);
        pubkeyChanges.push(pubkeyChange);
      }
      if (
        log.topics[0] ===
        resolver.events["TextChanged(bytes32,string,string)"].topic
      ) {
        const eventData =
          resolver.events["TextChanged(bytes32,string,string)"].decode(log);
        const textChange = await handleTextChanged(eventData, log, ctx);
        textChanges.push(textChange);
      }
      if (
        log.topics[0] ===
        resolver.events["TextChanged(bytes32,string,string,string)"].topic
      ) {
        const eventData =
          resolver.events["TextChanged(bytes32,string,string,string)"].decode(
            log
          );
        const textChangeWithValue = await handleTextChangedWithValue(
          eventData,
          log,
          ctx
        );
        textChangesWithValue.push(textChangeWithValue);
      }

      if (log.topics[0] === resolver.events["VersionChanged"].topic) {
        const eventData = resolver.events["VersionChanged"].decode(log);
        await handleVersionChanged(eventData, log, ctx);
      }

      if (log.address === REGISTRY_CONTRACT) {
        console.log("registry is running");
        if (log.topics[0] === ensRegistry.events["NewOwner"].topic) {
          const eventData = ensRegistry.events["NewOwner"].decode(log);
          const newOwner = await handleNewOwner(eventData, log, ctx);
          newOwners.push(newOwner);
        }
        if (log.topics[0] === ensRegistry.events["NewResolver"].topic) {
          const eventData = ensRegistry.events["NewResolver"].decode(log);
          const newResolver = await handleNewResolver(eventData, log, ctx);
          newResolvers.push(newResolver);
        }
        if (log.topics[0] === ensRegistry.events["NewTTL"].topic) {
          const eventData = ensRegistry.events["NewTTL"].decode(log);
          const newTTL = await handleNewTTL(eventData, log, ctx);
          newTTLs.push(newTTL);
        }
        if (log.topics[0] === ensRegistry.events["Transfer"].topic) {
          const eventData = ensRegistry.events["Transfer"].decode(log);
          const transfer = await handleTransfer(eventData, log, ctx);
          transfers.push(transfer);
        }
      } else if (log.address === REGISTRY_OLD_CONTRACT) {
        console.log("old registry running");
        if (log.topics[0] === ensRegistry.events["NewOwner"].topic) {
          const eventData = ensRegistry.events["NewOwner"].decode(log);
          const newOwner = await handleNewOwnerOldRegistry(eventData, log, ctx);
          if (newOwner) newOwners.push(newOwner);
        }
        if (log.topics[0] === ensRegistry.events["NewResolver"].topic) {
          const eventData = ensRegistry.events["NewResolver"].decode(log);
          const newResolver = await handleNewResolverOldRegistry(
            eventData,
            log,
            ctx
          );
          if (newResolver) newResolvers.push(newResolver);
        }
        if (log.topics[0] === ensRegistry.events["NewTTL"].topic) {
          const eventData = ensRegistry.events["NewTTL"].decode(log);
          const newTTL = await handleNewTTLOldRegistry(eventData, log, ctx);
          if (newTTL) newTTLs.push(newTTL);
        }
        if (log.topics[0] === ensRegistry.events["Transfer"].topic) {
          const eventData = ensRegistry.events["Transfer"].decode(log);
          const transfer = await handleTransferOldRegistry(eventData, log, ctx);
          if (transfer) transfers.push(transfer);
        }
      } else if (log.address === NAME_WRAPPER_CONTRACT) {
        console.log("name wrapper is running");

        if (log.topics[0] === nameWrapperAbi.events["NameWrapped"].topic) {
          const eventData = nameWrapperAbi.events["NameWrapped"].decode(log);
          const nameWrapped = await handleNameWrapped(eventData, log, ctx);
          nameWraps.push(nameWrapped);
        }
        if (log.topics[0] === nameWrapperAbi.events["NameUnwrapped"].topic) {
          const eventData = nameWrapperAbi.events["NameUnwrapped"].decode(log);
          const NameUnwrapped = await handleNameUnwrapped(eventData, log, ctx);
          nameUnwraps.push(NameUnwrapped);
        }
        if (log.topics[0] === nameWrapperAbi.events["FusesSet"].topic) {
          const eventData = nameWrapperAbi.events["FusesSet"].decode(log);
          const fusesSet = await handleFusesSet(eventData, log, ctx);
          fusesSets.push(fusesSet);
        }
        if (log.topics[0] === nameWrapperAbi.events["ExpiryExtended"].topic) {
          const eventData = nameWrapperAbi.events["ExpiryExtended"].decode(log);
          const expiryExtendedEvent = await handleExpiryExtended(
            eventData,
            log,
            ctx
          );
          expiries.push(expiryExtendedEvent);
        }
        if (log.topics[0] === nameWrapperAbi.events["TransferSingle"].topic) {
          const eventData = nameWrapperAbi.events["TransferSingle"].decode(log);
          const transferSingle = await handleTransferSingle(
            eventData,
            log,
            ctx
          );
          wrappedTransfers.push(transferSingle);
        }
        if (log.topics[0] === nameWrapperAbi.events["TransferBatch"].topic) {
          const eventData = nameWrapperAbi.events["TransferBatch"].decode(log);
          const transferBatch = await handleTransferBatch(eventData, log, ctx);
          wrappedTransfers.push(...transferBatch);
        }
      } else if (log.address === BASE_REGISTRAR_CONTRACT) {
        console.log("base registrar is running");

        if (log.topics[0] === baseRegistrarAbi.events["NameRegistered"].topic) {
          const eventData =
            baseRegistrarAbi.events["NameRegistered"].decode(log);
          const registeredName = await handleNameRegistered(
            eventData,
            log,
            ctx
          );
          registeredNames.push(registeredName);
        }
        if (log.topics[0] === baseRegistrarAbi.events["NameRenewed"].topic) {
          const eventData = baseRegistrarAbi.events["NameRenewed"].decode(log);
          const renewedName = await handleNameRenewed(eventData, log, ctx);
          renewedNames.push(renewedName);
        }
        if (log.topics[0] === baseRegistrarAbi.events["Transfer"].topic) {
          const eventData = baseRegistrarAbi.events["Transfer"].decode(log);
          const nameTransfer = await handleNameTransferred(eventData, log, ctx);
          if (nameTransfer) nameTransfers.push(nameTransfer);
        }
      } else if (log.address === REGIS_CONTROLLER_CONTRACT) {
        console.log("registration controller is running");

        if (
          log.topics[0] ===
          ethRegistrarControllerAbi.events["NameRenewed"].topic
        ) {
          const eventData =
            ethRegistrarControllerAbi.events["NameRenewed"].decode(log);
          const registration = await handleNameRenewedByController(
            eventData,
            log,
            ctx
          );
          if (registration) registrations.push(registration);
        }
        if (
          log.topics[0] ===
          ethRegistrarControllerAbi.events["NameRegistered"].topic
        ) {
          const eventData =
            ethRegistrarControllerAbi.events["NameRegistered"].decode(log);
          const registration = await handleNameRegisteredByController(
            eventData,
            log,
            ctx
          );
          if (registration) registrations.push(registration);
        }
      } else if (log.address === REGIS_CONTROLLER_OLD_CONTRACT) {
        console.log("registration controller old is running");

        if (
          log.topics[0] ===
          ethRegistrarOldControllerAbi.events["NameRenewed"].topic
        ) {
          const eventData =
            ethRegistrarOldControllerAbi.events["NameRenewed"].decode(log);
          const registration = await handleNameRenewedByController(
            eventData,
            log,
            ctx
          );
          if (registration) registrations.push(registration);
        }
        if (
          log.topics[0] ===
          ethRegistrarOldControllerAbi.events["NameRegistered"].topic
        ) {
          const eventData =
            ethRegistrarOldControllerAbi.events["NameRegistered"].decode(log);
          const registration = await handleNameRegisteredByControllerOld(
            eventData,
            log,
            ctx
          );
          if (registration) registrations.push(registration);
        }
      }
    }
  }

  const startBlock = ctx.blocks.at(0)?.header.height;
  const endBlock = ctx.blocks.at(-1)?.header.height;
  ctx.log.info(`running from ${startBlock} to ${endBlock}`);

  newOwners.length > 0 && (await ctx.store.upsert(newOwners));
  newResolvers.length > 0 && (await ctx.store.upsert(newResolvers));
  newTTLs.length > 0 && (await ctx.store.upsert(newTTLs));
  transfers.length > 0 && (await ctx.store.upsert(transfers));
  nameWraps.length > 0 && (await ctx.store.upsert(nameWraps));
  nameUnwraps.length > 0 && (await ctx.store.upsert(nameUnwraps));
  fusesSets.length > 0 && (await ctx.store.upsert(fusesSets));
  expiries.length > 0 && (await ctx.store.upsert(expiries));
  wrappedTransfers.length > 0 && (await ctx.store.upsert(wrappedTransfers));
  registeredNames.length > 0 && (await ctx.store.upsert(registeredNames));
  renewedNames.length > 0 && (await ctx.store.upsert(renewedNames));
  nameTransfers.length > 0 && (await ctx.store.upsert(nameTransfers));
  registrations.length > 0 && (await ctx.store.upsert(registrations));
  resolvers.length > 0 && (await ctx.store.upsert(resolvers));
  addrChanges.length > 0 && (await ctx.store.upsert(addrChanges));
  multipleAddrChanges.length > 0 &&
    (await ctx.store.upsert(multipleAddrChanges));
  authorisationChanges.length > 0 &&
    (await ctx.store.upsert(authorisationChanges));
  contenthashChanges.length > 0 && (await ctx.store.upsert(contenthashChanges));
  interfaceChanges.length > 0 && (await ctx.store.upsert(interfaceChanges));
  nameChanges.length > 0 && (await ctx.store.upsert(nameChanges));
  pubkeyChanges.length > 0 && (await ctx.store.upsert(pubkeyChanges));
  textChanges.length > 0 && (await ctx.store.upsert(textChanges));
  textChangesWithValue.length > 0 &&
    (await ctx.store.upsert(textChangesWithValue));
  // await ctx.store.upsert(burns)
});
