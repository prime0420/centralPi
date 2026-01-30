// Keep this module free of runtime/server deps so it can be imported from
// client-side code without bundler errors. We use a simple `any`-based type
// locally instead of importing `socket.io` types.

type SocketIOServer = any;

export function getSocketIO(): SocketIOServer | null {
  if (typeof global !== 'undefined' && (global as any).io) {
    return (global as any).io as SocketIOServer;
  }
  return null;
}

declare global {
  // eslint-disable-next-line no-var
  var io: SocketIOServer | undefined;
}

