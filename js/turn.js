// ============================================================
//  Online play is peer to peer. Most home networks connect fine with just STUN servers, but strict
//  networks (mobile data, university or work wifi, some routers / CGNAT) need a TURN relay server, otherwise
//  joining a room times out. Paste the servers from a free TURN account here (metered.ca "Open Relay",
//  Cloudflare Realtime TURN, ...) like this, then push / rebuild:
//
//    const TURN_SERVERS = [
//      { urls: 'turn:YOUR-HOST:80', username: 'USER', credential: 'PASSWORD' },
//      { urls: 'turn:YOUR-HOST:443?transport=tcp', username: 'USER', credential: 'PASSWORD' },
//      { urls: 'turns:YOUR-HOST:443?transport=tcp', username: 'USER', credential: 'PASSWORD' },
//    ];
//
//  (For a quick test on one machine you can also set localStorage 'np_turn' to the same list as JSON.)
// ============================================================
const TURN_SERVERS = [];
