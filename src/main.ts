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

// Import ABI definitions
import * as baseRegistrarAbi from "./abi/BaseRegistrar";
import * as ensRegistry from "./abi/Registry";
import * as resolver from "./abi/PublicResolver";
import * as ethRegistrarControllerAbi from "./abi/EthRegistrarController";
import * as ethRegistrarOldControllerAbi from "./abi/EthRegistrarControllerOld";
import * as nameWrapperAbi from "./abi/NameWrapper";

// Import event handlers
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
import { EntityBuffer } from "./entityBuffer";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  // Initialize arrays to store decoded events

  // Loop through blocks in the context
  for (let c of ctx.blocks) {
    for (let log of c.logs) {
      // Decode and handle events based on their topics
      if (log.topics[0] === resolver.events["ABIChanged"].topic) {
        console.log("abichange is running");
        const eventData = resolver.events["ABIChanged"].decode(log);
        await handleABIChanged(eventData, log, ctx);
      }
      if (log.topics[0] === resolver.events["AddrChanged"].topic) {
        console.log("addrchange is running");

        try {
          const eventData = resolver.events["AddrChanged"].decode(log);

          await handleAddrChanged(eventData, log, ctx);
        } catch (err) {
          ctx.log.error("range error from decoding Addrchanged");
        }
      }
      if (log.topics[0] === resolver.events["AddressChanged"].topic) {
        console.log("addresschange is running");
        const eventData = resolver.events["AddressChanged"].decode(log);
        await handleMulticoinAddrChanged(eventData, log, ctx);
      }
      if (log.topics[0] === resolver.events["AuthorisationChanged"].topic) {
        console.log("authorization is running");

        const eventData = resolver.events["AuthorisationChanged"].decode(log);
        await handleAuthorisationChanged(eventData, log, ctx);
      }
      if (log.topics[0] === resolver.events["ContenthashChanged"].topic) {
        console.log("contentHashChanged is running");

        const eventData = resolver.events["ContenthashChanged"].decode(log);
        await handleContentHashChanged(eventData, log, ctx);
      }
      if (log.topics[0] === resolver.events["InterfaceChanged"].topic) {
        console.log("interfaceChanged is running");

        const eventData = resolver.events["InterfaceChanged"].decode(log);
        await handleInterfaceChanged(eventData, log, ctx);
      }
      if (log.topics[0] === resolver.events["NameChanged"].topic) {
        console.log("name changed  is running");

        const eventData = resolver.events["NameChanged"].decode(log);
        await handleNameChanged(eventData, log, ctx);
      }
      if (log.topics[0] === resolver.events["PubkeyChanged"].topic) {
        console.log("pubkeychanged is running");

        const eventData = resolver.events["PubkeyChanged"].decode(log);
        await handlePubkeyChanged(eventData, log, ctx);
      }
      if (
        log.topics[0] ===
        resolver.events["TextChanged(bytes32,string,string)"].topic
      ) {
        console.log("textchanged without value is running");
        try {
          const eventData =
            resolver.events["TextChanged(bytes32,string,string)"].decode(log);
          await handleTextChanged(eventData, log, ctx);
        } catch (err) {
          ctx.log.error("reange error from decoding text without value");
        }
      }
      if (
        log.topics[0] ===
        resolver.events["TextChanged(bytes32,string,string,string)"].topic
      ) {
        console.log("textchanged with value is running");
        const eventData =
          resolver.events["TextChanged(bytes32,string,string,string)"].decode(
            log
          );
        await handleTextChangedWithValue(eventData, log, ctx);
      }

      if (log.topics[0] === resolver.events["VersionChanged"].topic) {
        console.log("version changed is running");
        const eventData = resolver.events["VersionChanged"].decode(log);
        await handleVersionChanged(eventData, log, ctx);
      }

      // Check the contract address and handle events accordingly
      if (log.address === REGISTRY_CONTRACT) {
        console.log("registry is running");
        if (log.topics[0] === ensRegistry.events["NewOwner"].topic) {
          const eventData = ensRegistry.events["NewOwner"].decode(log);
          await handleNewOwner(eventData, log, ctx);
        }
        if (log.topics[0] === ensRegistry.events["NewResolver"].topic) {
          console.log("handle new resolver");
          const eventData = ensRegistry.events["NewResolver"].decode(log);
          await handleNewResolver(eventData, log, ctx);
        }
        if (log.topics[0] === ensRegistry.events["NewTTL"].topic) {
          console.log("handle new ttl");
          const eventData = ensRegistry.events["NewTTL"].decode(log);
          await handleNewTTL(eventData, log, ctx);
        }
        if (log.topics[0] === ensRegistry.events["Transfer"].topic) {
          console.log("handle transfer");
          const eventData = ensRegistry.events["Transfer"].decode(log);
          await handleTransfer(eventData, log, ctx);
        }
      } else if (log.address === REGISTRY_OLD_CONTRACT) {
        // console.log("old registry running");
        if (log.topics[0] === ensRegistry.events["NewOwner"].topic) {
          console.log("handle owner");
          const eventData = ensRegistry.events["NewOwner"].decode(log);
          await handleNewOwnerOldRegistry(eventData, log, ctx);
        }
        if (log.topics[0] === ensRegistry.events["NewResolver"].topic) {
          console.log("handle new resolver in old");
          const eventData = ensRegistry.events["NewResolver"].decode(log);
          await handleNewResolverOldRegistry(eventData, log, ctx);
        }
        if (log.topics[0] === ensRegistry.events["NewTTL"].topic) {
          console.log("handle new ttl in old");
          const eventData = ensRegistry.events["NewTTL"].decode(log);
          await handleNewTTLOldRegistry(eventData, log, ctx);
        }
        if (log.topics[0] === ensRegistry.events["Transfer"].topic) {
          console.log("handle new ttl in old");
          const eventData = ensRegistry.events["Transfer"].decode(log);
          await handleTransferOldRegistry(eventData, log, ctx);
        }
      } else if (log.address === NAME_WRAPPER_CONTRACT) {
        if (log.topics[0] === nameWrapperAbi.events["NameWrapped"].topic) {
          console.log("name wrapper is running");
          const eventData = nameWrapperAbi.events["NameWrapped"].decode(log);
          await handleNameWrapped(eventData, log, ctx);
        }
        if (log.topics[0] === nameWrapperAbi.events["NameUnwrapped"].topic) {
          console.log("name unwrapper is running");
          const eventData = nameWrapperAbi.events["NameUnwrapped"].decode(log);
          await handleNameUnwrapped(eventData, log, ctx);
        }
        if (log.topics[0] === nameWrapperAbi.events["FusesSet"].topic) {
          console.log("fuseset is running");
          const eventData = nameWrapperAbi.events["FusesSet"].decode(log);
          await handleFusesSet(eventData, log, ctx);
        }
        if (log.topics[0] === nameWrapperAbi.events["ExpiryExtended"].topic) {
          console.log("expiryextended is running");
          const eventData = nameWrapperAbi.events["ExpiryExtended"].decode(log);
          await handleExpiryExtended(eventData, log, ctx);
        }
        if (log.topics[0] === nameWrapperAbi.events["TransferSingle"].topic) {
          console.log("transfer single is running");
          const eventData = nameWrapperAbi.events["TransferSingle"].decode(log);
          await handleTransferSingle(eventData, log, ctx);
        }
        if (log.topics[0] === nameWrapperAbi.events["TransferBatch"].topic) {
          console.log("transfer batch is running");
          const eventData = nameWrapperAbi.events["TransferBatch"].decode(log);
          await handleTransferBatch(eventData, log, ctx);
        }
      } else if (log.address === BASE_REGISTRAR_CONTRACT) {
        console.log("base registrar in baseregistr is running");

        if (log.topics[0] === baseRegistrarAbi.events["NameRegistered"].topic) {
          console.log("name registered in baseregistr is running");
          const eventData =
            baseRegistrarAbi.events["NameRegistered"].decode(log);
          await handleNameRegistered(eventData, log, ctx);
        }
        if (log.topics[0] === baseRegistrarAbi.events["NameRenewed"].topic) {
          console.log("name renewed in baseregistr is running");
          const eventData = baseRegistrarAbi.events["NameRenewed"].decode(log);
          await handleNameRenewed(eventData, log, ctx);
        }
        if (log.topics[0] === baseRegistrarAbi.events["Transfer"].topic) {
          console.log("transfer in baseregistr is running");
          const eventData = baseRegistrarAbi.events["Transfer"].decode(log);
          await handleNameTransferred(eventData, log, ctx);
        }
      } else if (log.address === REGIS_CONTROLLER_CONTRACT) {
        console.log("registration controller is running");

        if (
          log.topics[0] ===
          ethRegistrarControllerAbi.events["NameRenewed"].topic
        ) {
          console.log("name renewed isrunning controller");
          const eventData =
            ethRegistrarControllerAbi.events["NameRenewed"].decode(log);
          await handleNameRenewedByController(eventData, log, ctx);
        }
        if (
          log.topics[0] ===
          ethRegistrarControllerAbi.events["NameRegistered"].topic
        ) {
          console.log("name registered is running controller");
          const eventData =
            ethRegistrarControllerAbi.events["NameRegistered"].decode(log);
          await handleNameRegisteredByController(eventData, log, ctx);
        }
      } else if (log.address === REGIS_CONTROLLER_OLD_CONTRACT) {
        console.log("registration controller old is running");

        if (
          log.topics[0] ===
          ethRegistrarOldControllerAbi.events["NameRenewed"].topic
        ) {
          console.log("name renewed is running old controller");
          const eventData =
            ethRegistrarOldControllerAbi.events["NameRenewed"].decode(log);
          await handleNameRenewedByController(eventData, log, ctx);
        }
        if (
          log.topics[0] ===
          ethRegistrarOldControllerAbi.events["NameRegistered"].topic
        ) {
          console.log("name registered is running old controller");
          const eventData =
            ethRegistrarOldControllerAbi.events["NameRegistered"].decode(log);
          await handleNameRegisteredByControllerOld(eventData, log, ctx);
        }
      }

      for (let entities of EntityBuffer.flush()) {
        await ctx.store.upsert(entities);
      }
    }
  }

  const startBlock = ctx.blocks.at(0)?.header.height;
  const endBlock = ctx.blocks.at(-1)?.header.height;
  ctx.log.info(`running from ${startBlock} to ${endBlock}`);
});
