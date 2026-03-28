import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const inputSchema = {
  type: z
    .enum(["private", "friends_only", "public", "invisible"])
    .describe("Lobby visibility type"),
  max_members: z
    .number()
    .int()
    .min(2)
    .max(250)
    .describe("Maximum number of players in the lobby"),
  metadata: z
    .record(z.string())
    .optional()
    .describe(
      "Key-value pairs for lobby metadata (e.g. map name, game mode)",
    ),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_createLobby",
    "Get code examples and documentation for creating Steam multiplayer lobbies. Lobby creation is a client-side SDK operation (ISteamMatchmaking) and cannot be done via HTTP API. This tool returns ready-to-use code for C++, C#, and GDScript.",
    inputSchema,
    async ({ type, max_members, metadata }) => {
      const lobbyTypeMap: Record<string, string> = {
        private: "k_ELobbyTypePrivate",
        friends_only: "k_ELobbyTypeFriendsOnly",
        public: "k_ELobbyTypePublic",
        invisible: "k_ELobbyTypeInvisible",
      };

      const enumValue = lobbyTypeMap[type];
      const metaEntries = Object.entries(metadata ?? {});
      const metaCpp = metaEntries
        .map(
          ([k, v]) =>
            `  SteamMatchmaking()->SetLobbyData(lobbyId, "${k}", "${v}");`,
        )
        .join("\n");
      const metaCs = metaEntries
        .map(
          ([k, v]) =>
            `  SteamMatchmaking.SetLobbyData(lobbyId, "${k}", "${v}");`,
        )
        .join("\n");
      const metaGd = metaEntries
        .map(
          ([k, v]) =>
            `  Steam.setLobbyData(lobby_id, "${k}", "${v}")`,
        )
        .join("\n");

      const guide = {
        note: "Lobby creation is a client-side Steamworks SDK operation. It cannot be performed via HTTP API. Use the code below in your game client.",
        lobby_type: type,
        lobby_type_enum: enumValue,
        max_members,
        metadata: metadata ?? {},
        cpp: [
          "// Include Steam headers",
          '#include "steam/steam_api.h"',
          "",
          `// Create lobby (async — result via CCallResult<LobbyCreated_t>)`,
          `SteamAPICall_t call = SteamMatchmaking()->CreateLobby(${enumValue}, ${max_members});`,
          "// Register callback for LobbyCreated_t",
          "",
          "// In callback handler:",
          "void OnLobbyCreated(LobbyCreated_t* pResult, bool bIOFailure) {",
          "  if (pResult->m_eResult != k_EResultOK) { /* handle error */ }",
          "  CSteamID lobbyId = pResult->m_ulSteamIDLobby;",
          metaCpp,
          "}",
        ].join("\n"),
        csharp: [
          "// Using Steamworks.NET",
          `var call = SteamMatchmaking.CreateLobby(ELobbyType.${enumValue.replace("k_ELobbyType", "")}, ${max_members});`,
          "// Use CallResult<LobbyCreated_t> to handle the result",
          "",
          "void OnLobbyCreated(LobbyCreated_t result, bool bIOFailure) {",
          "  if (result.m_eResult != EResult.k_EResultOK) { /* handle error */ }",
          "  var lobbyId = new CSteamID(result.m_ulSteamIDLobby);",
          metaCs,
          "}",
        ].join("\n"),
        gdscript: [
          "# Using GodotSteam",
          `var lobby_type = Steam.LOBBY_TYPE_${type.toUpperCase()}`,
          `Steam.createLobby(lobby_type, ${max_members})`,
          "# Connect to lobby_created signal",
          "",
          "func _on_lobby_created(connect: int, lobby_id: int) -> void:",
          "  if connect != 1:",
          "    print(\"Failed to create lobby\")",
          "    return",
          metaGd,
        ].join("\n"),
        references: [
          "https://partner.steamgames.com/doc/api/ISteamMatchmaking#CreateLobby",
          "https://partner.steamgames.com/doc/features/multiplayer/matchmaking",
        ],
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(guide, null, 2) },
        ],
      };
    },
  );
}
