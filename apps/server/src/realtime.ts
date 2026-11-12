import type { Server } from "socket.io";

let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
  server.on("connection", (socket) => {
    socket.on("watch", (matchId: unknown) => {
      if (typeof matchId !== "string" || !/^[0-9a-f-]{36}$/i.test(matchId)) return;
      for (const room of socket.rooms) if (room.startsWith("match:")) socket.leave(room);
      socket.join(`match:${matchId}`);
      emitToMatch(matchId, "spectators", spectatorCount(matchId));
    });
    socket.on("unwatch", (matchId: unknown) => {
      if (typeof matchId !== "string") return;
      socket.leave(`match:${matchId}`);
      emitToMatch(matchId, "spectators", spectatorCount(matchId));
    });
    // Closing the tab or losing the connection: keep the viewer count right for everyone else.
    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (!room.startsWith("match:")) continue;
        const id = room.slice(6);
        io?.to(room).emit("spectators", Math.max(0, spectatorCount(id) - 1));
      }
    });
    socket.on("lobby", () => socket.join("lobby"));
    socket.on("world", () => socket.join("world"));
  });
}

export function emitToMatch(matchId: string, event: string, payload: unknown) {
  io?.to(`match:${matchId}`).emit(event, payload);
}

export function emitLobby(event: string, payload: unknown) {
  io?.to("lobby").emit(event, payload);
}

export function emitWorld(event: string, payload: unknown) {
  io?.to("world").emit(event, payload);
}

export function spectatorCount(matchId: string): number {
  return io?.sockets.adapter.rooms.get(`match:${matchId}`)?.size ?? 0;
}
