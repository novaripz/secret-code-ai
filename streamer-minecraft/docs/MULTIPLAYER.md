# Playing with friends (no server needed)

The simplest setup that works, in order:

1. **Streamer hosts.** Open the world → Settings → **Multiplayer**:
   - Multiplayer Game: **ON**
   - Microsoft Account Sign-in Required: ON
   - Visible to LAN Players: ON
   - Who can join: **Friends** (or Invite Only)
   - **Require players to accept resource packs: ON** ← this is the one that keeps everyone
     seeing the same textures on stream.
2. **Friends need Bedrock Edition and a Microsoft account**, and must be added as friends
   in-game (Play → Friends → Add Friend, by gamertag).
3. Friends join from **Play → Friends → the streamer's world**. The world must be open —
   if the streamer quits to the menu, the world closes.
4. **Packs transfer automatically.** Joining players are prompted to download the world's
   resource and behaviour packs. Nobody but the host installs anything by hand.
5. Someone gets "missing packs" or vanilla textures? Have them leave, clear the prompt, and
   rejoin accepting the download. If it still fails, send them the `.mcworld` from
   `7-EXPORT-MCWORLD.cmd` only as a last resort — that is a copy, not the live world.

Ethercraft's dimension takes 2–3 minutes to generate the first time someone goes through the
portal. That is normal; don't restart the world during it.

If the group ever outgrows "streamer must be online for anyone to play", the next step is a
Realm (subscription, zero setup) or the official Bedrock Dedicated Server. Not needed today.
