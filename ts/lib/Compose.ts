import {
    DataID,
    DisconnectID,
    DistanceID,
    LanguageID,
    MapID,
    MessageID,
    PacketID,
    PayloadID,
    RPCID,
    SpawnID,
    TaskBarUpdate
} from "./constants/Enums.js";

import {
    GameOptionsData,
    Packet
} from "./interfaces/Packets.js";

import { BufferWriter } from "./util/BufferWriter.js";

export function composeGameOptions(options: Partial<GameOptionsData>) {
    options.version = options.version ?? 3;

    const bwrite = new BufferWriter;
    bwrite.jump(0x02);
    bwrite.byte(options.version);
    bwrite.uint8(options.maxPlayers ?? 10);
    bwrite.uint32LE(options.language ?? LanguageID.English);
    bwrite.byte(options.mapID ?? MapID.TheSkeld);
    bwrite.floatLE(options.playerSpeed ?? 1.0);
    bwrite.floatLE(options.crewVision ?? 1.0);
    bwrite.floatLE(options.imposterVision ?? 1.25);
    bwrite.floatLE(options.killCooldown ?? 25);
    bwrite.uint8(options.commonTasks ?? 1);
    bwrite.uint8(options.longTasks ?? 1);
    bwrite.uint8(options.shortTasks ?? 2);
    bwrite.int32LE(options.emergencies ?? 1);
    bwrite.uint8(options.imposterCount ?? 2);
    bwrite.byte(options.killDistance ?? DistanceID.Medium);
    bwrite.int32LE(options.discussionTime ?? 15);
    bwrite.int32LE(options.votingTime ?? 120);
    bwrite.bool(options.isDefault ?? false);

    if (options.version === 1 || options.version === 2 || options.version === 3) {
        bwrite.uint8(options.emergencyCooldown ?? 15);
    }
    
    if (options.version === 2 || options.version === 3) {
        bwrite.bool(options.confirmEjects ?? true);
        bwrite.bool(options.visualTasks ?? true);
    }
    
    if (options.version === 3) {
        bwrite.bool(options.anonymousVoting ?? false);
        bwrite.uint8(options.taskBarUpdates ?? TaskBarUpdate.Always);
    }
    
    bwrite.goto(0x00);
    bwrite.packed(bwrite.size - 2);

    return bwrite;
}

export function composePacket(packet: Packet, bound: "server"|"client" = "server"): Buffer {
    packet.bound = bound;

    const writer = new BufferWriter;

    writer.uint8(packet.op);
    
    if (packet.op === PacketID.Reliable) {
        packet.reliable = true;
    }

    if (packet.op === PacketID.Unreliable) {
        packet.reliable = false;
    }

    switch (packet.op) {
        case PacketID.Unreliable:
        case PacketID.Reliable:
            if (packet.op === PacketID.Reliable) {
                writer.uint16BE(packet.nonce);
            }
            
            const lenpos = writer.offset;
            writer.jump(0x02); // Jump the length of the payload (will be written later).

            writer.uint8(packet.payloadid);

            switch (packet.payloadid) {
                case PayloadID.HostGame:
                    if (packet.bound === "server") {
                        writer.write(composeGameOptions(packet.options));
                    } else if (packet.bound === "client") {
                        writer.int32LE(packet.code);
                    }
                    break;
                case PayloadID.JoinGame:
                    if (packet.bound === "server") {
                        writer.int32LE(packet.code);
                        writer.byte(packet.mapOwnership);
                    } else if (packet.bound === "client") {
                        switch (packet.error) { // Typings don't work for if statements for some reason??
                            case true:
                                if (packet.reason) {
                                    writer.uint8(packet.reason);
                                    if (packet.reason === DisconnectID.Custom) {
                                        writer.string(packet.message, true);
                                    }
                                }
                                break;
                            case false:
                                writer.int32LE(packet.code);
                                writer.int32LE(packet.clientid);
                                writer.int32LE(packet.hostid);
                                break;
                        }
                    }
                    break;
                case PayloadID.StartGame:
                    writer.int32LE(packet.code);
                    break;
                case PayloadID.RemoveGame:
                    break;
                case PayloadID.RemovePlayer:
                    writer.int32LE(packet.code);
                    writer.uint32LE(packet.clientid);
                    writer.uint32LE(packet.hostid);
                    if (typeof packet.reason !== "undefined") {
                        writer.uint8(packet.reason);

                        if (packet.reason === DisconnectID.Custom) {
                            writer.string(packet.message, true);
                        }
                    }
                    break;
                case PayloadID.GameData:
                case PayloadID.GameDataTo:
                    writer.int32LE(packet.code);

                    if (packet.payloadid === PayloadID.GameDataTo) {
                        writer.packed(packet.recipient);
                    }

                    for (let i = 0; i < packet.parts.length; i++) {
                        const mwrite = new BufferWriter;
                        const part = packet.parts[i];

                        switch (part.type) {
                            case MessageID.Data:
                                mwrite.packed(part.netid);
                                mwrite.write(part.data);
                                break;
                            case MessageID.RPC:
                                mwrite.packed(part.handlerid);
                                mwrite.uint8(part.rpcid);

                                switch (part.rpcid) {
                                    case RPCID.PlayAnimation:
                                        mwrite.uint8(part.animation);
                                        break;
                                    case RPCID.CompleteTask:
                                        mwrite.uint8(part.taskid);
                                        break;
                                    case RPCID.SyncSettings:
                                        writer.write(composeGameOptions(part.options));
                                        break;
                                    case RPCID.SetInfected:
                                        mwrite.packed(part.count);
                                        mwrite.bytes(part.infected);
                                        break;
                                    case RPCID.Exiled:
                                        break;
                                    case RPCID.CheckName:
                                        mwrite.string(part.name, true);
                                        break;
                                    case RPCID.SetName:
                                        mwrite.string(part.name, true);
                                        break;
                                    case RPCID.CheckColour:
                                        mwrite.uint8(part.colour);
                                        break;
                                    case RPCID.SetColour:
                                        mwrite.uint8(part.colour);
                                        break;
                                    case RPCID.SetHat:
                                        mwrite.uint8(part.hat);
                                        break;
                                    case RPCID.SetSkin:
                                        mwrite.uint8(part.skin);
                                        break;
                                    case RPCID.ReportDeadBody:
                                        mwrite.uint8(part.player);
                                        break;
                                    case RPCID.MurderPlayer:
                                        mwrite.packed(part.targetnetid);
                                        break;
                                    case RPCID.SendChat:
                                        mwrite.string(part.text, true);
                                        break;
                                    case RPCID.StartMeeting:
                                        mwrite.uint8(part.player);
                                        break;
                                    case RPCID.SetScanner:
                                        mwrite.bool(part.scanning);
                                        mwrite.uint8(part.count);
                                        break;
                                    case RPCID.SendChatNote:
                                        mwrite.uint8(part.playerid);
                                        mwrite.uint8(part.notetype);
                                        break;
                                    case RPCID.SetPet:
                                        mwrite.uint8(part.pet);
                                        break;
                                    case RPCID.SetStartCounter:
                                        mwrite.packed(part.sequence);
                                        mwrite.int8(part.time);
                                        break;
                                    case RPCID.EnterVent:
                                        mwrite.packed(part.sequence);
                                        mwrite.packed(part.vent);
                                        break;
                                    case RPCID.ExitVent:
                                        mwrite.packed(part.vent);
                                        break;
                                    case RPCID.SnapTo:
                                        mwrite.floatLE(part.x);
                                        mwrite.floatLE(part.y);
                                        break;
                                    case RPCID.Close:
                                        break;
                                    case RPCID.VotingComplete:
                                        mwrite.packed(part.num_states);
                                        mwrite.bytes(part.states);
                                        mwrite.uint8(part.exiled);
                                        mwrite.bool(part.tie);
                                        break;
                                    case RPCID.CastVote:
                                        mwrite.uint8(part.playerid);
                                        mwrite.uint8(part.suspectid);
                                        break;
                                    case RPCID.ClearVote:
                                        break;
                                    case RPCID.AddVote:
                                        mwrite.uint8(part.playerid);
                                        break;
                                    case RPCID.CloseDoorsOfType:
                                        mwrite.uint8(part.systemtype);
                                        break;
                                    case RPCID.RepairSystem:
                                        mwrite.uint8(part.systemtype);
                                        mwrite.packed(part.handlerid);
                                        mwrite.uint8(part.amount);
                                        break;
                                    case RPCID.SetTasks:
                                        mwrite.uint8(part.playerid);
                                        mwrite.packed(part.num_tasks);
                                        mwrite.bytes(part.tasks);
                                        break;
                                    case RPCID.UpdateGameData:
                                        for (let i = 0; i < part.players.length; i++) {
                                            const player = part.players[i];

                                            const pwrite = new BufferWriter;
                                            pwrite.uint8(player.playerId);
                                            pwrite.string(player.name, true);
                                            pwrite.uint8(player.colour);
                                            pwrite.packed(player.hat);
                                            pwrite.packed(player.pet);
                                            pwrite.packed(player.skin);
                                            pwrite.byte(player.flags);
                                            pwrite.uint8(player.num_tasks);
                                            
                                            for (let i = 0; i < player.num_tasks; i++) {
                                                const task = player.tasks[i];

                                                pwrite.packed(task.taskid);
                                                pwrite.bool(task.completed);
                                            }

                                            mwrite.uint16LE(pwrite.size - 1);
                                            mwrite.write(pwrite);
                                        }
                                        break;
                                }
                                break;
                            case MessageID.Spawn: // WIP
                                mwrite.packed(part.spawnid);
                                mwrite.packed(part.ownerid);
                                mwrite.byte(part.flags);
                                mwrite.packed(part.num_components);

                                for (let i = 0; i < part.num_components; i++) {
                                    const component = part.components[i];

                                    mwrite.packed(component.netid);
                                    mwrite.uint16LE(component.datalen);
                                    mwrite.uint8(component.type);
                                    mwrite.write(component.data);
                                }
                                break;
                            case MessageID.Despawn:
                                mwrite.packed(part.netid);
                                break;
                            case MessageID.SceneChange:
                                mwrite.packed(part.clientid);
                                mwrite.string(part.location, true);
                                break;
                            case MessageID.Ready:
                                mwrite.packed(part.clientid);
                                break;
                            case MessageID.ChangeSettings:
                                break;
                        }

                        writer.uint16LE(mwrite.size);
                        writer.uint8(part.type);
                        writer.write(mwrite);
                    }
                    break;
                case PayloadID.JoinedGame:
                    writer.int32LE(packet.code);
                    writer.uint32LE(packet.clientid);
                    writer.uint32LE(packet.hostid);
                    writer.packed(packet.num_clients);
                    for (let i = 0; i < packet.num_clients; i++) {
                        writer.packed(packet.clients[i]);
                    }
                    break;
                case PayloadID.EndGame:
                    writer.int32LE(packet.code);
                    writer.uint8(packet.reason);
                    writer.bool(packet.show_ad);
                    break;
                case PayloadID.AlterGame:
                    writer.int32LE(packet.code);
                    writer.byte(packet.tag);
                    writer.bool(packet.is_public);
                    break;
                case PayloadID.Redirect:
                    writer.bytes(packet.ip.split(".").map(val => parseInt(val)));
                    writer.uint16LE(packet.port);
                    break;
                case PayloadID.MasterServerList:
                    writer.uint8(0x01);
                    writer.uint8(packet.num_servers);
                    
                    for (let i = 0; i < packet.servers.length; i++) {
                        const server = packet.servers[i];
                        const swrite = new BufferWriter;
                        swrite.byte(server.flag);
                        swrite.string(server.name, true);
                        swrite.bytes(server.ip.split(".").map(val => parseInt(val)));
                        swrite.uint16LE(server.port);
                        swrite.uint16LE(server.num_players);

                        writer.uint16LE(swrite.size);
                        writer.write(swrite);
                    }
                    break;
                case PayloadID.GetGameListV2:
                    if (packet.bound === "client") {
                        const glwrite = new BufferWriter;
                        
                        for (let i = 0; i < packet.games.length; i++) {
                            const game = packet.games[i];

                            const gwrite = new BufferWriter;
                            gwrite.bytes(game.ip.split(".").map(val => parseInt(val)));
                            gwrite.uint16LE(game.port);
                            gwrite.int32LE(game.code);
                            gwrite.string(game.name, true);
                            gwrite.uint8(game.num_players);
                            gwrite.packed(game.age);
                            gwrite.uint8(game.map);
                            gwrite.uint8(game.imposters);
                            gwrite.uint8(game.max_players);

                            glwrite.uint16LE(gwrite.size);
                            glwrite.uint8(0x00);
                            glwrite.write(gwrite);
                        }

                        writer.uint16LE(glwrite.size);
                        writer.uint8(0x00);
                        writer.write(glwrite);
                    } else if (packet.bound === "server") {
                        writer.uint8(0x00);
                        writer.write(composeGameOptions(packet.options));
                    }
                    break;
            }
            
            writer.goto(lenpos);
            writer.uint16LE(writer.buffer.slice(lenpos + 3).byteLength); // Length of the payload (not including the type).
            break;
        case PacketID.Hello:
            writer.uint16BE(packet.nonce);
            writer.byte(packet.hazelver || 0x00);
            writer.int32BE(packet.clientver || 0x46d20203);
            writer.string(packet.username, true);
            break;
        case PacketID.Disconnect:
            if (packet.bound === "client") {
                const dwrite = new BufferWriter;
                if (packet.reason) {
                    dwrite.uint8(packet.reason);
                    if (packet.reason === DisconnectID.Custom && packet.message) {
                        dwrite.string(packet.message, true);
                    }
                }
                writer.uint8(0x01);
                writer.uint16LE(dwrite.size);
                writer.uint8(0x00);
                writer.write(dwrite);
            }
            break;
        case PacketID.Acknowledge:
            writer.uint16BE(packet.nonce);
            writer.uint8(0xFF);
            break;
        case PacketID.Ping:
            writer.uint16BE(packet.nonce);
            break;
    }

    return writer.buffer;
}