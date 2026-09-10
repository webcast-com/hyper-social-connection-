/**
 * Build the WebRTC ICE server configuration from environment variables.
 *
 * STUN servers are always included for local network discovery. A TURN
 * server (set via TURN_SERVER_URL, TURN_SERVER_USERNAME,
 * TURN_SERVER_CREDENTIAL) is added when configured — it relays traffic when
 * a direct P2P path cannot be found, which is the difference between a call
 * that works behind a corporate firewall and one that never connects.
 *
 * Credentials stay server-side; the client receives the finished list only
 * after authenticating and joining a call.
 */
export type IceServerConfig = {
  urls: string;
  username?: string;
  credential?: string;
};

export function getIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = process.env.TURN_SERVER_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.TURN_SERVER_USERNAME,
      credential: process.env.TURN_SERVER_CREDENTIAL,
    });
  }

  return servers;
}
